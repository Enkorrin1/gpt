import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
import { parseAgentEventLine } from "@ai-dev/shared";
import {
  commitGitChangedFiles,
  getGitDefaultBranch,
  getGitFileDiff,
  getGitHeadSha,
  getGitStatusSummary,
  pushGitBranch
} from "./git";
import { buildPullRequestReadiness, createGitHubDraftPullRequest, parseGitHubRepository } from "./github";
import { TaskStore } from "./taskStore";

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let taskStore: TaskStore | null = null;

interface ActiveAgent {
  process: ChildProcessWithoutNullStreams;
  runId: string;
  taskId: string;
  stopRequested: boolean;
  terminalEventReceived: boolean;
}

let activeAgent: ActiveAgent | null = null;

function getTaskStore(): TaskStore {
  taskStore ??= new TaskStore(join(app.getPath("userData"), "state", "ai-developer-desktop.sqlite"));
  return taskStore;
}

function getRepoRootFromMainProcess(): string {
  const candidates = [
    resolve(__dirname, "../../../.."),
    process.cwd(),
    app.getAppPath()
  ];

  const root = candidates.find((candidate) => existsSync(join(candidate, "agent", "pyproject.toml")));
  if (!root) {
    throw new Error("Could not locate workspace root with agent/pyproject.toml");
  }

  return root;
}

function truncateLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}

function generateCommitDraft(task: TaskRecord, gitStatus?: GitStatusSummary): CommitDraftRecord {
  const changedFiles = gitStatus?.isGitRepo ? gitStatus.changedFiles : [];
  const subject = truncateLine(task.title || "Update project files", 72);
  const fileLines = changedFiles.slice(0, 12).map((file) => {
    const churn = `+${file.additions} -${file.deletions}`;
    return `- ${file.path} (${file.status}, ${churn})`;
  });
  const remainingCount = Math.max(0, changedFiles.length - fileLines.length);
  const bodyLines = [
    "Summary:",
    `- ${task.title}`,
    `- Updated ${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"} in ${task.repoName}`,
    "",
    "Changed files:",
    ...(fileLines.length > 0 ? fileLines : ["- No changed files detected yet"]),
    ...(remainingCount > 0 ? [`- ${remainingCount} more file${remainingCount === 1 ? "" : "s"} not shown`] : []),
    "",
    `Task: ${task.id}`,
    `Model: ${task.model}`
  ];

  return {
    taskId: task.id,
    repoPath: gitStatus?.isGitRepo ? gitStatus.rootPath : task.repoPath,
    subject,
    body: bodyLines.join("\n"),
    updatedAt: new Date().toISOString(),
    isSaved: false
  };
}

async function getPullRequestReadiness(taskId: string): Promise<GitHubPullRequestReadiness> {
  const store = getTaskStore();
  const task = store.getTask(taskId);
  if (!task) {
    return {
      taskId,
      repoPath: "",
      title: "",
      body: "",
      authConfigured: false,
      isReady: false,
      blockers: ["taskMissing"]
    };
  }

  const gitStatus = await getGitStatusSummary(task.repoPath);
  const taskCommit = store.getTaskCommit(task.id);
  const draft = store.getCommitDraft(task.id);
  const existingPullRequest = store.getPullRequest(task.id);
  const latestRun = store.listRuns(task.id).at(-1);
  const remoteName = gitStatus.remote?.name;
  const baseBranch = gitStatus.isGitRepo && remoteName ? await getGitDefaultBranch(gitStatus.rootPath, remoteName).catch(() => undefined) : undefined;
  const headSha = gitStatus.isGitRepo ? await getGitHeadSha(gitStatus.rootPath).catch(() => taskCommit?.commitSha) : taskCommit?.commitSha;

  return buildPullRequestReadiness({
    task,
    gitStatus,
    taskCommit,
    draft,
    baseBranch,
    headSha,
    existingPullRequest,
    runId: latestRun?.id
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1240,
    minHeight: 760,
    title: "AI Developer Desktop",
    backgroundColor: "#090b10",
    frame: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.once("did-finish-load", () => {
    void mainWindow?.webContents
      .executeJavaScript("Boolean(window.desktop?.listTasks)")
      .then((isBridgeReady) => {
        console.info(`[desktop] preload bridge ready=${Boolean(isBridgeReady)}`);
      })
      .catch((error: unknown) => {
        console.warn("[desktop] preload bridge check failed", error instanceof Error ? error.message : error);
      });
  });
}

function sendAgentEvent(event: AgentEvent): void {
  mainWindow?.webContents.send("agent:event", event);
}

function sendTasksChanged(): void {
  mainWindow?.webContents.send("tasks:changed");
}

function persistAndSendAgentEvent(runId: string, event: AgentEvent): void {
  getTaskStore().appendRunEvent(runId, event);
  sendAgentEvent(event);
}

ipcMain.handle("repo:select", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select a Git repository",
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("git:status", async (_event, repoPath: string): Promise<GitStatusSummary> => {
  return getGitStatusSummary(repoPath);
});

ipcMain.handle("git:fileDiff", async (_event, repoPath: string, filePath: string): Promise<GitFileDiff> => {
  return getGitFileDiff(repoPath, filePath);
});

ipcMain.handle("tasks:list", async (): Promise<TaskRecord[]> => {
  return getTaskStore().listTasks();
});

ipcMain.handle("projects:list", async (): Promise<ProjectRecord[]> => {
  return getTaskStore().listProjects();
});

ipcMain.handle("projects:upsert", async (_event, request: UpsertProjectRequest): Promise<ProjectRecord> => {
  const project = getTaskStore().upsertProject(request);
  sendTasksChanged();
  return project;
});

ipcMain.handle("tasks:create", async (_event, request: CreateTaskRequest): Promise<TaskRecord> => {
  const task = getTaskStore().createTask(request);
  sendTasksChanged();
  return task;
});

ipcMain.handle("runs:list", async (_event, taskId?: string): Promise<AgentRunRecord[]> => {
  return getTaskStore().listRuns(taskId);
});

ipcMain.handle("fileReviews:list", async (_event, repoPath: string): Promise<FileReviewRecord[]> => {
  return getTaskStore().listFileReviews(repoPath);
});

ipcMain.handle("fileReviews:set", async (_event, request: SetFileReviewRequest): Promise<FileReviewRecord> => {
  const review = getTaskStore().setFileReview(request);
  sendTasksChanged();
  return review;
});

ipcMain.handle("tasks:approve", async (_event, taskId: string): Promise<TaskRecord> => {
  const store = getTaskStore();
  const existingTask = store.getTask(taskId);
  if (!existingTask) {
    throw new Error("Task was not found");
  }

  const gitStatus = await getGitStatusSummary(existingTask.repoPath);
  if (!gitStatus.isGitRepo) {
    throw new Error("Task result can only be approved inside a Git repository");
  }

  if (gitStatus.changedFiles.length === 0) {
    throw new Error("There are no changed files to approve");
  }

  const reviewedFiles = new Set(
    store
      .listFileReviews(gitStatus.rootPath)
      .filter((review) => review.status === "reviewed")
      .map((review) => review.filePath)
  );
  const unreviewedFiles = gitStatus.changedFiles.filter((file) => !reviewedFiles.has(file.path));
  if (unreviewedFiles.length > 0) {
    throw new Error("All changed files must be reviewed before approving the task result");
  }

  const task = store.approveTask(taskId);
  sendTasksChanged();
  return task;
});

ipcMain.handle("commitDrafts:get", async (_event, taskId: string): Promise<CommitDraftRecord | null> => {
  const store = getTaskStore();
  const task = store.getTask(taskId);
  if (!task) {
    return null;
  }

  const savedDraft = store.getCommitDraft(task.id);
  if (savedDraft) {
    return savedDraft;
  }

  const gitStatus = await getGitStatusSummary(task.repoPath);
  return generateCommitDraft(task, gitStatus);
});

ipcMain.handle("commitDrafts:save", async (_event, request: SaveCommitDraftRequest): Promise<CommitDraftRecord> => {
  return getTaskStore().saveCommitDraft(request);
});

ipcMain.handle("taskCommits:get", async (_event, taskId: string): Promise<CommitTaskResult | null> => {
  return getTaskStore().getTaskCommit(taskId);
});

ipcMain.handle("tasks:commit", async (_event, request: CommitTaskRequest): Promise<CommitTaskResult> => {
  const store = getTaskStore();
  const task = store.getTask(request.taskId);
  if (!task) {
    throw new Error("Task was not found");
  }

  if (task.status !== "done") {
    throw new Error("Approve the task result before committing changes");
  }

  if (store.getTaskCommit(task.id)) {
    throw new Error("This task has already been committed");
  }

  const draft = store.getCommitDraft(task.id);
  if (!draft) {
    throw new Error("Save the commit draft before committing changes");
  }

  const gitStatus = await getGitStatusSummary(task.repoPath);
  if (!gitStatus.isGitRepo) {
    throw new Error("Task changes can only be committed inside a Git repository");
  }

  if (draft.repoPath !== gitStatus.rootPath) {
    throw new Error("Save the commit draft again for the current repository");
  }

  if (gitStatus.changedFiles.length === 0) {
    throw new Error("There are no changed files to commit");
  }

  const conflictedFile = gitStatus.changedFiles.find((file) => file.status === "conflicted");
  if (conflictedFile) {
    throw new Error(`Resolve conflicts before committing: ${conflictedFile.path}`);
  }

  const reviewedFiles = new Set(
    store
      .listFileReviews(gitStatus.rootPath)
      .filter((review) => review.status === "reviewed")
      .map((review) => review.filePath)
  );
  const unreviewedFiles = gitStatus.changedFiles.filter((file) => !reviewedFiles.has(file.path));
  if (unreviewedFiles.length > 0) {
    throw new Error("All changed files must be reviewed before committing");
  }

  const gitCommit = await commitGitChangedFiles(gitStatus.rootPath, gitStatus.changedFiles, draft.subject, draft.body);
  const result = store.saveTaskCommit({
    taskId: task.id,
    repoPath: gitCommit.repoPath,
    commitSha: gitCommit.commitSha,
    subject: draft.subject,
    body: draft.body,
    committedFiles: gitCommit.committedFiles,
    committedAt: new Date().toISOString()
  });
  sendTasksChanged();
  return result;
});

ipcMain.handle("pullRequests:get", async (_event, taskId: string): Promise<GitHubPullRequestRecord | null> => {
  return getTaskStore().getPullRequest(taskId);
});

ipcMain.handle("pullRequests:readiness", async (_event, taskId: string): Promise<GitHubPullRequestReadiness> => {
  return getPullRequestReadiness(taskId);
});

ipcMain.handle("pullRequests:create", async (_event, request: CreatePullRequestRequest): Promise<GitHubPullRequestRecord> => {
  const store = getTaskStore();
  const existingPullRequest = store.getPullRequest(request.taskId);
  if (existingPullRequest) {
    return existingPullRequest;
  }

  const readiness = await getPullRequestReadiness(request.taskId);
  if (!readiness.isReady) {
    throw new Error(`Pull request is not ready: ${readiness.blockers.join(", ")}`);
  }

  const task = store.getTask(request.taskId);
  if (!task || !readiness.remoteName || !readiness.headBranch || !readiness.baseBranch) {
    throw new Error("Pull request context is incomplete");
  }

  const gitStatus = await getGitStatusSummary(task.repoPath);
  const repository = parseGitHubRepository(gitStatus);
  if (!repository) {
    throw new Error("GitHub repository was not detected");
  }

  await pushGitBranch(readiness.repoPath, readiness.remoteName, readiness.headBranch);
  const createdPullRequest = await createGitHubDraftPullRequest({
    repository,
    title: readiness.title,
    body: readiness.body,
    headBranch: readiness.headBranch,
    baseBranch: readiness.baseBranch
  });

  const record = store.savePullRequest({
    ...createdPullRequest,
    taskId: task.id,
    repoPath: readiness.repoPath
  });
  sendTasksChanged();
  return record;
});

ipcMain.handle("agent:start", async (_event, request: StartAgentRunRequest): Promise<StartAgentRunResponse> => {
  if (activeAgent) {
    throw new Error("Agent run is already active");
  }

  const { task, run } = getTaskStore().startRun(request);
  const runId = run.id;
  const repoRoot = getRepoRootFromMainProcess();
  const agentRoot = resolve(repoRoot, "agent");
  const python = process.env.AI_DEV_AGENT_PYTHON || "python";
  const agentArgs = [
    "-m",
    "ai_dev_agent.cli",
    "--repo",
    request.repoPath,
    "--task",
    request.task,
    "--model",
    request.model,
    "--run-id",
    runId,
    "--max-steps",
    "8",
    "--test-timeout-seconds",
    "25"
  ];
  if (request.runTests) {
    agentArgs.push("--run-tests");
  }

  const child = spawn(
    python,
    agentArgs,
    {
      cwd: agentRoot,
      env: {
        ...process.env,
        PYTHONPATH: agentRoot
      }
    }
  );
  activeAgent = { process: child, runId, taskId: task.id, stopRequested: false, terminalEventReceived: false };
  sendTasksChanged();

  child.stdout.on("data", (chunk: Buffer) => {
    const lines = chunk.toString("utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const event = parseAgentEventLine(line);
        if (event) {
          if (event.type === "task.completed" || event.type === "task.failed") {
            if (activeAgent?.runId === runId) {
              activeAgent.terminalEventReceived = true;
            }
            getTaskStore().finishRun(runId, event.type === "task.completed" ? "completed" : "failed");
            sendTasksChanged();
          }
          persistAndSendAgentEvent(runId, event);
        }
      } catch {
        persistAndSendAgentEvent(runId, {
          id: `evt_${randomUUID()}`,
          runId,
          type: "command.output",
          ts: new Date().toISOString(),
          message: line,
          payload: { stream: "stdout" }
        });
      }
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    persistAndSendAgentEvent(runId, {
      id: `evt_${randomUUID()}`,
      runId,
      type: "command.output",
      ts: new Date().toISOString(),
      message: chunk.toString("utf8"),
      payload: { stream: "stderr" }
    });
  });

  child.on("error", (error) => {
    persistAndSendAgentEvent(runId, {
      id: `evt_${randomUUID()}`,
      runId,
      type: "task.failed",
      ts: new Date().toISOString(),
      message: error.message,
      payload: { code: "spawn_error" }
    });
    getTaskStore().finishRun(runId, "failed");
    activeAgent = null;
    sendTasksChanged();
  });

  child.on("exit", (code) => {
    if (!activeAgent || activeAgent.runId !== runId) {
      return;
    }

    const wasStopped = activeAgent?.runId === runId && activeAgent.stopRequested;
    const terminalEventReceived = activeAgent.terminalEventReceived;
    const completed = code === 0 && !wasStopped;
    if (!terminalEventReceived) {
      persistAndSendAgentEvent(runId, {
        id: `evt_${randomUUID()}`,
        runId,
        type: completed ? "task.completed" : "task.failed",
        ts: new Date().toISOString(),
        message: wasStopped ? "Agent run stopped" : completed ? "Agent run completed" : `Agent run exited with code ${code}`,
        payload: { code }
      });
      getTaskStore().finishRun(runId, completed ? "completed" : "failed");
    }
    activeAgent = null;
    sendTasksChanged();
  });

  return { runId, taskId: task.id };
});

ipcMain.handle("agent:stop", async () => {
  if (!activeAgent) {
    return false;
  }

  activeAgent.stopRequested = true;
  activeAgent.process.kill();
  return true;
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return;
  }

  mainWindow.maximize();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

app.whenReady().then(() => {
  getTaskStore();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
