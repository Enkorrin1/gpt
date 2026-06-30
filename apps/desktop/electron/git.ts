import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, normalize, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { GitChangedFile, GitChangedFileStatus, GitDiffLine, GitFileDiff, GitStatusSummary } from "@ai-dev/shared";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 1024 * 1024;
const MAX_RENDERED_DIFF_BYTES = 256 * 1024;
const SAFE_REMOTE_NAME_RE = /^[A-Za-z0-9._-]+$/;

async function runGit(repoPath: string, args: string[]): Promise<string> {
  let stdout: string;
  try {
    const result = await execFileAsync("git", args, {
      cwd: repoPath,
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: GIT_MAX_BUFFER
    });
    stdout = result.stdout;
  } catch (error) {
    const details = error as { stderr?: string | Buffer; stdout?: string | Buffer; message?: string };
    const stderr = typeof details.stderr === "string" ? details.stderr : details.stderr?.toString("utf8");
    const output = typeof details.stdout === "string" ? details.stdout : details.stdout?.toString("utf8");
    const message = (stderr || output || details.message || "Git command failed").trim();
    throw new Error(message);
  }

  return stdout.trim();
}

function emptyStatus(repoPath: string, error?: string): GitStatusSummary {
  return {
    repoPath,
    rootPath: repoPath,
    repoName: basename(repoPath) || repoPath,
    isGitRepo: false,
    branch: "unknown",
    isDirty: false,
    changedFiles: [],
    ahead: 0,
    behind: 0,
    error
  };
}

function parseAheadBehind(value: string): { ahead: number; behind: number } {
  const [behindRaw, aheadRaw] = value.split(/\s+/);
  const behind = Number.parseInt(behindRaw || "0", 10);
  const ahead = Number.parseInt(aheadRaw || "0", 10);

  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0
  };
}

function normalizeStatus(indexStatus: string, workingTreeStatus: string): GitChangedFileStatus {
  const status = `${indexStatus}${workingTreeStatus}`;

  if (status.includes("U") || status === "AA" || status === "DD") {
    return "conflicted";
  }

  if (status.includes("?")) {
    return "untracked";
  }

  if (status.includes("R")) {
    return "renamed";
  }

  if (status.includes("D")) {
    return "deleted";
  }

  if (status.includes("A")) {
    return "added";
  }

  if (status.includes("M")) {
    return "modified";
  }

  return "unknown";
}

function parsePorcelainStatus(value: string): GitChangedFile[] {
  if (!value.trim()) {
    return [];
  }

  return value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const indexStatus = line[0] || " ";
      const workingTreeStatus = line[1] || " ";
      const rawPath = line.slice(3).trim();
      const [oldPath, newPath] = rawPath.includes(" -> ") ? rawPath.split(" -> ") : [undefined, rawPath];

      return {
        path: newPath || rawPath,
        oldPath,
        status: normalizeStatus(indexStatus, workingTreeStatus),
        additions: 0,
        deletions: 0
      };
    });
}

function parseNumstat(value: string): Map<string, Pick<GitChangedFile, "additions" | "deletions">> {
  const stats = new Map<string, Pick<GitChangedFile, "additions" | "deletions">>();

  for (const line of value.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const [additionsRaw, deletionsRaw, ...pathParts] = line.split(/\s+/);
    const path = pathParts.join(" ");
    const additions = Number.parseInt(additionsRaw, 10);
    const deletions = Number.parseInt(deletionsRaw, 10);

    stats.set(path, {
      additions: Number.isFinite(additions) ? additions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0
    });
  }

  return stats;
}

function mergeFileStats(files: GitChangedFile[], stats: Map<string, Pick<GitChangedFile, "additions" | "deletions">>): GitChangedFile[] {
  return files.map((file) => {
    const fileStats = stats.get(file.path);
    if (!fileStats) {
      return file;
    }

    return {
      ...file,
      ...fileStats
    };
  });
}

function emptyFileDiff(repoPath: string, filePath: string, error?: string): GitFileDiff {
  return {
    repoPath,
    filePath,
    isBinary: false,
    isTooLarge: false,
    raw: "",
    lines: [],
    error
  };
}

function validateRelativeFilePath(rootPath: string, filePath: string): { relativePath: string; absolutePath: string } {
  if (!filePath || filePath.includes("\0") || isAbsolute(filePath)) {
    throw new Error("Invalid diff file path.");
  }

  const relativePath = normalize(filePath).replace(/\\/g, "/");
  const absolutePath = resolve(rootPath, relativePath);
  const backToRoot = relative(rootPath, absolutePath);
  if (backToRoot.startsWith("..") || isAbsolute(backToRoot)) {
    throw new Error("Diff file path is outside the repository.");
  }

  return { relativePath, absolutePath };
}

function parseDiffHeader(raw: string): { oldPath?: string; isBinary: boolean } {
  const lines = raw.split(/\r?\n/);
  const renameFrom = lines.find((line) => line.startsWith("rename from "))?.slice("rename from ".length);
  const isBinary = lines.some((line) => line.startsWith("Binary files ") || line.startsWith("GIT binary patch"));
  return { oldPath: renameFrom, isBinary };
}

function parseHunkStart(line: string): { oldLine: number; newLine: number } | null {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  if (!match) {
    return null;
  }

  return {
    oldLine: Number.parseInt(match[1], 10),
    newLine: Number.parseInt(match[2], 10)
  };
}

function parseDiffLines(raw: string): GitDiffLine[] {
  const parsed: GitDiffLine[] = [];
  let oldLineNumber: number | undefined;
  let newLineNumber: number | undefined;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      const hunk = parseHunkStart(line);
      oldLineNumber = hunk?.oldLine;
      newLineNumber = hunk?.newLine;
      parsed.push({ text: line, tone: "hunk" });
      continue;
    }

    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("rename from ") ||
      line.startsWith("rename to ") ||
      line.startsWith("Binary files ")
    ) {
      parsed.push({ text: line, tone: "meta" });
      continue;
    }

    if (line.startsWith("+")) {
      parsed.push({ newLineNumber, text: line.slice(1), tone: "added" });
      newLineNumber = typeof newLineNumber === "number" ? newLineNumber + 1 : undefined;
      continue;
    }

    if (line.startsWith("-")) {
      parsed.push({ oldLineNumber, text: line.slice(1), tone: "removed" });
      oldLineNumber = typeof oldLineNumber === "number" ? oldLineNumber + 1 : undefined;
      continue;
    }

    parsed.push({ oldLineNumber, newLineNumber, text: line.startsWith(" ") ? line.slice(1) : line, tone: "context" });
    oldLineNumber = typeof oldLineNumber === "number" ? oldLineNumber + 1 : undefined;
    newLineNumber = typeof newLineNumber === "number" ? newLineNumber + 1 : undefined;
  }

  return parsed;
}

function truncateDiff(raw: string): { raw: string; isTooLarge: boolean } {
  if (Buffer.byteLength(raw, "utf8") <= MAX_RENDERED_DIFF_BYTES) {
    return { raw, isTooLarge: false };
  }

  return {
    raw: raw.slice(0, MAX_RENDERED_DIFF_BYTES),
    isTooLarge: true
  };
}

async function getUntrackedFileDiff(rootPath: string, relativePath: string, absolutePath: string): Promise<string> {
  const contents = await readFile(absolutePath, "utf8");
  const lines = contents.split(/\r?\n/);
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`)
  ].join("\n");
}

async function optionalGit(repoPath: string, args: string[]): Promise<string | undefined> {
  try {
    return await runGit(repoPath, args);
  } catch {
    return undefined;
  }
}

function validateRemoteName(remoteName: string): string {
  if (!SAFE_REMOTE_NAME_RE.test(remoteName) || remoteName.startsWith("-")) {
    throw new Error("Invalid Git remote name.");
  }

  return remoteName;
}

function validateBranchName(branchName: string): string {
  if (
    !branchName ||
    branchName.startsWith("-") ||
    branchName.includes("..") ||
    branchName.includes("\\") ||
    branchName.includes("\0") ||
    branchName.endsWith(".lock")
  ) {
    throw new Error("Invalid Git branch name.");
  }

  return branchName;
}

export async function getGitStatusSummary(repoPath: string): Promise<GitStatusSummary> {
  let rootPath: string;

  try {
    rootPath = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  } catch {
    return emptyStatus(repoPath, "Selected folder is not a Git repository.");
  }

  const [branchRaw, upstream, remoteUrl, statusRaw, numstatRaw] = await Promise.all([
    optionalGit(rootPath, ["branch", "--show-current"]),
    optionalGit(rootPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    optionalGit(rootPath, ["remote", "get-url", "origin"]),
    optionalGit(rootPath, ["status", "--porcelain=v1"]),
    optionalGit(rootPath, ["diff", "--numstat"])
  ]);

  const branch = branchRaw || (await optionalGit(rootPath, ["rev-parse", "--short", "HEAD"])) || "detached";
  const files = mergeFileStats(parsePorcelainStatus(statusRaw || ""), parseNumstat(numstatRaw || ""));
  const aheadBehindRaw = upstream ? await optionalGit(rootPath, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]) : undefined;
  const { ahead, behind } = parseAheadBehind(aheadBehindRaw || "0 0");

  return {
    repoPath,
    rootPath,
    repoName: basename(rootPath) || rootPath,
    isGitRepo: true,
    branch,
    upstream,
    isDirty: files.length > 0,
    changedFiles: files,
    remote: remoteUrl ? { name: "origin", url: remoteUrl } : undefined,
    ahead,
    behind
  };
}

export async function getGitFileDiff(repoPath: string, filePath: string): Promise<GitFileDiff> {
  let rootPath: string;
  try {
    rootPath = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  } catch {
    return emptyFileDiff(repoPath, filePath, "Selected folder is not a Git repository.");
  }

  let relativePath: string;
  let absolutePath: string;
  try {
    const validated = validateRelativeFilePath(rootPath, filePath);
    relativePath = validated.relativePath;
    absolutePath = validated.absolutePath;
  } catch (error) {
    return emptyFileDiff(repoPath, filePath, error instanceof Error ? error.message : "Invalid diff file path.");
  }

  try {
    const status = await optionalGit(rootPath, ["status", "--porcelain=v1", "--", relativePath]);
    const isUntracked = status?.split(/\r?\n/).some((line) => line.startsWith("??"));
    const unstagedRaw = await optionalGit(rootPath, ["diff", "--no-ext-diff", "--unified=80", "--", relativePath]);
    const stagedRaw = await optionalGit(rootPath, ["diff", "--cached", "--no-ext-diff", "--unified=80", "--", relativePath]);
    const raw = unstagedRaw || stagedRaw || (isUntracked ? await getUntrackedFileDiff(rootPath, relativePath, absolutePath) : "");
    const truncated = truncateDiff(raw);
    const header = parseDiffHeader(truncated.raw);

    return {
      repoPath,
      filePath: relativePath,
      oldPath: header.oldPath,
      isBinary: header.isBinary,
      isTooLarge: truncated.isTooLarge,
      raw: truncated.raw,
      lines: header.isBinary ? [] : parseDiffLines(truncated.raw)
    };
  } catch (error) {
    return emptyFileDiff(repoPath, relativePath, error instanceof Error ? error.message : "Could not read file diff.");
  }
}

export async function getGitHeadSha(repoPath: string): Promise<string> {
  const rootPath = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  return runGit(rootPath, ["rev-parse", "HEAD"]);
}

export async function getGitDefaultBranch(repoPath: string, remoteName: string): Promise<string> {
  const rootPath = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  const safeRemoteName = validateRemoteName(remoteName);
  const remoteHead = await optionalGit(rootPath, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${safeRemoteName}/HEAD`]);
  if (remoteHead?.startsWith(`${safeRemoteName}/`)) {
    return remoteHead.slice(safeRemoteName.length + 1);
  }

  const remoteBranches = await optionalGit(rootPath, ["branch", "-r", "--format=%(refname:short)"]);
  const branchNames = new Set((remoteBranches || "").split(/\r?\n/).map((branch) => branch.trim()).filter(Boolean));
  if (branchNames.has(`${safeRemoteName}/main`)) {
    return "main";
  }
  if (branchNames.has(`${safeRemoteName}/master`)) {
    return "master";
  }

  return "main";
}

export async function pushGitBranch(repoPath: string, remoteName: string, branchName: string): Promise<void> {
  const rootPath = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  const safeRemoteName = validateRemoteName(remoteName);
  const safeBranchName = validateBranchName(branchName);
  await runGit(rootPath, ["check-ref-format", "--branch", safeBranchName]);
  await runGit(rootPath, ["push", "-u", safeRemoteName, `HEAD:refs/heads/${safeBranchName}`]);
}

export async function commitGitChangedFiles(
  repoPath: string,
  files: GitChangedFile[],
  subject: string,
  body: string
): Promise<{ repoPath: string; commitSha: string; committedFiles: string[] }> {
  const rootPath = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  const normalizedSubject = subject.replace(/\s+/g, " ").trim();
  if (!normalizedSubject) {
    throw new Error("Commit subject is required.");
  }

  const committedFiles = [
    ...new Set(
      files.flatMap((file) => [file.oldPath, file.path]).filter((filePath): filePath is string => Boolean(filePath))
    )
  ].map((filePath) => validateRelativeFilePath(rootPath, filePath).relativePath);

  if (committedFiles.length === 0) {
    throw new Error("There are no reviewed files to commit.");
  }

  await runGit(rootPath, ["add", "--all", "--", ...committedFiles]);
  const stagedFiles = await runGit(rootPath, ["diff", "--cached", "--name-only", "--", ...committedFiles]);
  if (!stagedFiles.trim()) {
    throw new Error("There are no staged changes for the reviewed files.");
  }

  const commitArgs = ["commit", "-m", normalizedSubject];
  const normalizedBody = body.trim();
  if (normalizedBody) {
    commitArgs.push("-m", normalizedBody);
  }
  commitArgs.push("--", ...committedFiles);

  await runGit(rootPath, commitArgs);
  const commitSha = await runGit(rootPath, ["rev-parse", "HEAD"]);

  return {
    repoPath: rootPath,
    commitSha,
    committedFiles
  };
}
