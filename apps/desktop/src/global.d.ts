import type {
  AgentEvent,
  AgentRunRecord,
  CommitDraftRecord,
  CommitTaskRequest,
  CommitTaskResult,
  CreatePullRequestRequest,
  CreateTaskRequest,
  FileReviewRecord,
  GitFileDiff,
  GitHubPullRequestReadiness,
  GitHubPullRequestRecord,
  GitStatusSummary,
  ProjectRecord,
  SaveCommitDraftRequest,
  SetFileReviewRequest,
  StartAgentRunRequest,
  StartAgentRunResponse,
  TaskRecord,
  UpsertProjectRequest
} from "@ai-dev/shared";

interface DesktopApi {
  isMac: boolean;
  selectRepository: () => Promise<string | null>;
  getGitStatus: (repoPath: string) => Promise<GitStatusSummary>;
  getGitFileDiff: (repoPath: string, filePath: string) => Promise<GitFileDiff>;
  listProjects: () => Promise<ProjectRecord[]>;
  upsertProject: (request: UpsertProjectRequest) => Promise<ProjectRecord>;
  listTasks: () => Promise<TaskRecord[]>;
  createTask: (request: CreateTaskRequest) => Promise<TaskRecord>;
  listRuns: (taskId?: string) => Promise<AgentRunRecord[]>;
  listFileReviews: (repoPath: string) => Promise<FileReviewRecord[]>;
  setFileReview: (request: SetFileReviewRequest) => Promise<FileReviewRecord>;
  approveTask: (taskId: string) => Promise<TaskRecord>;
  getCommitDraft: (taskId: string) => Promise<CommitDraftRecord | null>;
  saveCommitDraft: (request: SaveCommitDraftRequest) => Promise<CommitDraftRecord>;
  getTaskCommit: (taskId: string) => Promise<CommitTaskResult | null>;
  commitTask: (request: CommitTaskRequest) => Promise<CommitTaskResult>;
  getPullRequest: (taskId: string) => Promise<GitHubPullRequestRecord | null>;
  getPullRequestReadiness: (taskId: string) => Promise<GitHubPullRequestReadiness>;
  createPullRequest: (request: CreatePullRequestRequest) => Promise<GitHubPullRequestRecord>;
  startAgentRun: (request: StartAgentRunRequest) => Promise<StartAgentRunResponse>;
  stopAgentRun: () => Promise<boolean>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void;
  onTasksChanged: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}

export {};
