import type {
  CommitDraftRecord,
  CommitTaskResult,
  GitHubPullRequestBlocker,
  GitHubPullRequestReadiness,
  GitHubPullRequestRecord,
  GitHubRepositorySummary,
  GitStatusSummary,
  TaskRecord
} from "@ai-dev/shared";

const GITHUB_API_VERSION = "2026-03-10";

interface CreateDraftPullRequestInput {
  repository: GitHubRepositorySummary;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
}

interface GitHubPullRequestResponse {
  number?: unknown;
  html_url?: unknown;
  state?: unknown;
  draft?: unknown;
  title?: unknown;
}

function normalizeRepoName(repo: string): string {
  return repo.replace(/\.git$/i, "");
}

function parseRemoteUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    const sshMatch = /^git@([^:]+):([^/]+)\/(.+)$/.exec(url);
    if (sshMatch) {
      return new URL(`ssh://git@${sshMatch[1]}/${sshMatch[2]}/${sshMatch[3]}`);
    }

    return null;
  }
}

export function parseGitHubRepository(gitStatus?: GitStatusSummary): GitHubRepositorySummary | null {
  if (!gitStatus?.remote?.url) {
    return null;
  }

  const parsed = parseRemoteUrl(gitStatus.remote.url);
  if (!parsed) {
    return null;
  }

  const [owner, repoWithSuffix] = parsed.pathname.replace(/^\/+/, "").split("/");
  if (!owner || !repoWithSuffix) {
    return null;
  }

  const repo = normalizeRepoName(repoWithSuffix);
  return {
    host: parsed.hostname,
    owner,
    repo,
    remoteName: gitStatus.remote.name,
    htmlUrl: `https://${parsed.hostname}/${owner}/${repo}`
  };
}

export function getGitHubTokenConfigured(): boolean {
  return Boolean((process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim());
}

function getGitHubToken(): string {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (!token) {
    throw new Error("GitHub token is not configured.");
  }

  return token;
}

function buildPullRequestBody(task: TaskRecord, taskCommit: CommitTaskResult, draft: CommitDraftRecord | null, runId?: string): string {
  const draftBody = draft?.body.trim() || taskCommit.body.trim();
  const lines = [
    "## Summary",
    "",
    draftBody || `- ${task.title}`,
    "",
    "## Verification",
    "",
    "- Reviewed changed files in AI Developer Desktop.",
    `- Commit: ${taskCommit.commitSha.slice(0, 12)}`,
    "",
    "## Agent Trace",
    "",
    `Task: ${task.id}`,
    `Run ID: ${runId || "not recorded"}`,
    `Model: ${task.model}`
  ];

  return lines.join("\n");
}

export function buildPullRequestReadiness(input: {
  task: TaskRecord | null;
  gitStatus: GitStatusSummary;
  taskCommit: CommitTaskResult | null;
  draft: CommitDraftRecord | null;
  baseBranch?: string;
  headSha?: string;
  existingPullRequest?: GitHubPullRequestRecord | null;
  runId?: string;
}): GitHubPullRequestReadiness {
  const blockers: GitHubPullRequestBlocker[] = [];
  const repository = parseGitHubRepository(input.gitStatus);
  const taskId = input.task?.id ?? "";
  const repoPath = input.gitStatus.isGitRepo ? input.gitStatus.rootPath : input.gitStatus.repoPath;
  const title = input.draft?.subject || input.taskCommit?.subject || input.task?.title || "";
  const body = input.task && input.taskCommit ? buildPullRequestBody(input.task, input.taskCommit, input.draft, input.runId) : "";

  if (!input.task) {
    blockers.push("taskMissing");
  }
  if (!input.gitStatus.isGitRepo) {
    blockers.push("gitRepoMissing");
  }
  if (!input.taskCommit) {
    blockers.push("commitMissing");
  }
  if (!input.gitStatus.remote?.url) {
    blockers.push("remoteMissing");
  }
  if (input.gitStatus.remote?.url && !repository) {
    blockers.push("unsupportedRemote");
  }
  if (repository && repository.host !== "github.com") {
    blockers.push("unsupportedRemote");
  }
  if (!getGitHubTokenConfigured()) {
    blockers.push("authMissing");
  }
  if (input.gitStatus.changedFiles.length > 0) {
    blockers.push("dirtyWorktree");
  }
  if (!input.gitStatus.branch || input.gitStatus.branch === "detached") {
    blockers.push("detachedHead");
  }
  if (input.baseBranch && input.gitStatus.branch === input.baseBranch) {
    blockers.push("defaultBranch");
  }
  if (input.existingPullRequest) {
    blockers.push("alreadyCreated");
  }

  return {
    taskId,
    repoPath,
    owner: repository?.owner,
    repo: repository?.repo,
    host: repository?.host,
    remoteName: repository?.remoteName,
    htmlUrl: repository?.htmlUrl,
    headBranch: input.gitStatus.branch,
    baseBranch: input.baseBranch,
    commitSha: input.headSha || input.taskCommit?.commitSha,
    title,
    body,
    authConfigured: getGitHubTokenConfigured(),
    isReady: blockers.length === 0,
    blockers
  };
}

export async function createGitHubDraftPullRequest(input: CreateDraftPullRequestInput): Promise<GitHubPullRequestRecord> {
  if (input.repository.host !== "github.com") {
    throw new Error("Only github.com remotes are supported in the MVP.");
  }

  const response = await fetch(`https://api.github.com/repos/${input.repository.owner}/${input.repository.repo}/pulls`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${getGitHubToken()}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.headBranch,
      base: input.baseBranch,
      draft: true,
      maintainer_can_modify: true
    })
  });

  const payload = (await response.json().catch(() => ({}))) as GitHubPullRequestResponse & { message?: string };
  if (!response.ok) {
    throw new Error(typeof payload.message === "string" ? payload.message : `GitHub API returned ${response.status}`);
  }

  if (typeof payload.number !== "number" || typeof payload.html_url !== "string") {
    throw new Error("GitHub API returned an invalid pull request response.");
  }

  return {
    taskId: "",
    repoPath: "",
    owner: input.repository.owner,
    repo: input.repository.repo,
    number: payload.number,
    title: typeof payload.title === "string" ? payload.title : input.title,
    url: payload.html_url,
    state: typeof payload.state === "string" ? payload.state : "open",
    draft: typeof payload.draft === "boolean" ? payload.draft : true,
    headBranch: input.headBranch,
    baseBranch: input.baseBranch,
    createdAt: new Date().toISOString()
  };
}
