import { contextBridge, ipcRenderer } from "electron";
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

export interface DesktopApi {
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

const api: DesktopApi = {
  isMac: process.platform === "darwin",
  selectRepository: () => ipcRenderer.invoke("repo:select"),
  getGitStatus: (repoPath) => ipcRenderer.invoke("git:status", repoPath),
  getGitFileDiff: (repoPath, filePath) => ipcRenderer.invoke("git:fileDiff", repoPath, filePath),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  upsertProject: (request) => ipcRenderer.invoke("projects:upsert", request),
  listTasks: () => ipcRenderer.invoke("tasks:list"),
  createTask: (request) => ipcRenderer.invoke("tasks:create", request),
  listRuns: (taskId) => ipcRenderer.invoke("runs:list", taskId),
  listFileReviews: (repoPath) => ipcRenderer.invoke("fileReviews:list", repoPath),
  setFileReview: (request) => ipcRenderer.invoke("fileReviews:set", request),
  approveTask: (taskId) => ipcRenderer.invoke("tasks:approve", taskId),
  getCommitDraft: (taskId) => ipcRenderer.invoke("commitDrafts:get", taskId),
  saveCommitDraft: (request) => ipcRenderer.invoke("commitDrafts:save", request),
  getTaskCommit: (taskId) => ipcRenderer.invoke("taskCommits:get", taskId),
  commitTask: (request) => ipcRenderer.invoke("tasks:commit", request),
  getPullRequest: (taskId) => ipcRenderer.invoke("pullRequests:get", taskId),
  getPullRequestReadiness: (taskId) => ipcRenderer.invoke("pullRequests:readiness", taskId),
  createPullRequest: (request) => ipcRenderer.invoke("pullRequests:create", request),
  startAgentRun: (request) => ipcRenderer.invoke("agent:start", request),
  stopAgentRun: () => ipcRenderer.invoke("agent:stop"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  onAgentEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentEvent) => callback(payload);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.off("agent:event", handler);
  },
  onTasksChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("tasks:changed", handler);
    return () => ipcRenderer.off("tasks:changed", handler);
  }
};

contextBridge.exposeInMainWorld("desktop", api);
