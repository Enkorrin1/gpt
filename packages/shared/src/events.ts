export type AgentEventType =
  | "task.started"
  | "assistant.delta"
  | "tool.call"
  | "tool.result"
  | "command.output"
  | "file.changed"
  | "diff.ready"
  | "task.completed"
  | "task.failed";

export interface AgentEvent<TPayload = Record<string, unknown>> {
  id: string;
  runId: string;
  type: AgentEventType;
  ts: string;
  message?: string;
  payload?: TPayload;
}

export type TaskRecordStatus = "queued" | "running" | "review" | "done" | "failed";
export type AgentRunStatus = "running" | "completed" | "failed";

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  repoPath: string;
  repoName: string;
  model: string;
  status: TaskRecordStatus;
  activeRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  repoPath: string;
  repoName?: string;
  model: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  repoPath: string;
  repoName: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface UpsertProjectRequest {
  repoPath: string;
  name?: string;
  repoName?: string;
}

export interface AgentRunRecord {
  id: string;
  taskId: string;
  repoPath: string;
  model: string;
  prompt: string;
  status: AgentRunStatus;
  startedAt: string;
  endedAt?: string;
  events: AgentEvent[];
}

export interface StartAgentRunRequest {
  repoPath: string;
  task: string;
  model: string;
  taskId?: string;
  runTests?: boolean;
}

export interface StartAgentRunResponse {
  runId: string;
  taskId: string;
}

export type GitChangedFileStatus = "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted" | "unknown";

export interface GitChangedFile {
  path: string;
  oldPath?: string;
  status: GitChangedFileStatus;
  additions: number;
  deletions: number;
}

export interface GitRemoteSummary {
  name: string;
  url: string;
}

export interface GitStatusSummary {
  repoPath: string;
  rootPath: string;
  repoName: string;
  isGitRepo: boolean;
  branch: string;
  upstream?: string;
  isDirty: boolean;
  changedFiles: GitChangedFile[];
  remote?: GitRemoteSummary;
  ahead: number;
  behind: number;
  error?: string;
}

export type GitDiffLineTone = "meta" | "hunk" | "context" | "added" | "removed";

export interface GitDiffLine {
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
  tone: GitDiffLineTone;
}

export interface GitFileDiff {
  repoPath: string;
  filePath: string;
  oldPath?: string;
  isBinary: boolean;
  isTooLarge: boolean;
  raw: string;
  lines: GitDiffLine[];
  error?: string;
}

export type FileReviewStatus = "unreviewed" | "reviewed";

export interface FileReviewRecord {
  repoPath: string;
  filePath: string;
  status: FileReviewStatus;
  reviewedAt?: string;
  updatedAt: string;
}

export interface SetFileReviewRequest {
  repoPath: string;
  filePath: string;
  status: FileReviewStatus;
}

export interface CommitDraftRecord {
  taskId: string;
  repoPath: string;
  subject: string;
  body: string;
  updatedAt: string;
  isSaved: boolean;
}

export interface SaveCommitDraftRequest {
  taskId: string;
  repoPath: string;
  subject: string;
  body: string;
}

export interface CommitTaskRequest {
  taskId: string;
}

export interface CommitTaskResult {
  taskId: string;
  repoPath: string;
  commitSha: string;
  subject: string;
  body: string;
  committedFiles: string[];
  committedAt: string;
}

export interface GitHubRepositorySummary {
  host: string;
  owner: string;
  repo: string;
  remoteName: string;
  htmlUrl: string;
}

export type GitHubPullRequestBlocker =
  | "taskMissing"
  | "commitMissing"
  | "gitRepoMissing"
  | "remoteMissing"
  | "unsupportedRemote"
  | "authMissing"
  | "dirtyWorktree"
  | "detachedHead"
  | "defaultBranch"
  | "alreadyCreated";

export interface GitHubPullRequestReadiness {
  taskId: string;
  repoPath: string;
  owner?: string;
  repo?: string;
  host?: string;
  remoteName?: string;
  htmlUrl?: string;
  headBranch?: string;
  baseBranch?: string;
  commitSha?: string;
  title: string;
  body: string;
  authConfigured: boolean;
  isReady: boolean;
  blockers: GitHubPullRequestBlocker[];
}

export interface CreatePullRequestRequest {
  taskId: string;
}

export interface GitHubPullRequestRecord {
  taskId: string;
  repoPath: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: string;
  draft: boolean;
  headBranch: string;
  baseBranch: string;
  createdAt: string;
}

export const agentEventTypes: AgentEventType[] = [
  "task.started",
  "assistant.delta",
  "tool.call",
  "tool.result",
  "command.output",
  "file.changed",
  "diff.ready",
  "task.completed",
  "task.failed"
];

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<AgentEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.runId === "string" &&
    typeof event.ts === "string" &&
    typeof event.type === "string" &&
    agentEventTypes.includes(event.type as AgentEventType)
  );
}

export function parseAgentEventLine(line: string): AgentEvent | null {
  if (!line.trim()) {
    return null;
  }

  const parsed = JSON.parse(line) as unknown;
  if (!isAgentEvent(parsed)) {
    throw new Error(`Invalid agent event: ${line}`);
  }

  return parsed;
}
