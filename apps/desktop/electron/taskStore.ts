import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AgentEvent,
  AgentRunRecord,
  AgentRunStatus,
  CommitDraftRecord,
  CommitTaskResult,
  CreateTaskRequest,
  FileReviewRecord,
  FileReviewStatus,
  GitHubPullRequestRecord,
  ProjectRecord,
  SaveCommitDraftRequest,
  SetFileReviewRequest,
  StartAgentRunRequest,
  TaskRecord,
  TaskRecordStatus,
  UpsertProjectRequest
} from "@ai-dev/shared";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  repo_path: string;
  repo_name: string;
  model: string;
  status: TaskRecordStatus;
  active_run_id: string | null;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  task_id: string;
  repo_path: string;
  model: string;
  prompt: string;
  status: AgentRunStatus;
  started_at: string;
  ended_at: string | null;
  events_json: string;
}

interface ProjectRow {
  id: string;
  name: string;
  repo_path: string;
  repo_name: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
}

interface ProjectSeedRow {
  repo_path: string;
  repo_name: string;
  created_at: string;
  updated_at: string;
}

interface FileReviewRow {
  repo_path: string;
  file_path: string;
  status: FileReviewStatus;
  reviewed_at: string | null;
  updated_at: string;
}

interface CommitDraftRow {
  task_id: string;
  repo_path: string;
  subject: string;
  body: string;
  updated_at: string;
}

interface TaskCommitRow {
  task_id: string;
  repo_path: string;
  commit_sha: string;
  subject: string;
  body: string;
  committed_files_json: string;
  committed_at: string;
}

interface PullRequestRow {
  task_id: string;
  repo_path: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: string;
  draft: number;
  head_branch: string;
  base_branch: string;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, maxLength);
}

function repoNameFromPath(repoPath: string): string {
  const normalized = repoPath.replace(/\\/g, "/").replace(/\/$/, "");
  return normalized.split("/").pop() || "Repository";
}

function parseEvents(eventsJson: string, runId: string): AgentEvent[] {
  try {
    const parsed = JSON.parse(eventsJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((event): event is AgentEvent => {
      return Boolean(
        event &&
          typeof event === "object" &&
          "id" in event &&
          "runId" in event &&
          "type" in event &&
          "ts" in event &&
          (event as AgentEvent).runId === runId
      );
    });
  } catch {
    return [];
  }
}

function taskFromRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    repoPath: row.repo_path,
    repoName: row.repo_name,
    model: row.model,
    status: row.status,
    activeRunId: row.active_run_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function runFromRow(row: RunRow): AgentRunRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    repoPath: row.repo_path,
    model: row.model,
    prompt: row.prompt,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    events: parseEvents(row.events_json, row.id)
  };
}

function projectFromRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    repoName: row.repo_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at
  };
}

function fileReviewFromRow(row: FileReviewRow): FileReviewRecord {
  return {
    repoPath: row.repo_path,
    filePath: row.file_path,
    status: row.status,
    reviewedAt: row.reviewed_at ?? undefined,
    updatedAt: row.updated_at
  };
}

function commitDraftFromRow(row: CommitDraftRow): CommitDraftRecord {
  return {
    taskId: row.task_id,
    repoPath: row.repo_path,
    subject: row.subject,
    body: row.body,
    updatedAt: row.updated_at,
    isSaved: true
  };
}

function taskCommitFromRow(row: TaskCommitRow): CommitTaskResult {
  let committedFiles: string[] = [];
  try {
    const parsed = JSON.parse(row.committed_files_json) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      committedFiles = parsed;
    }
  } catch {
    committedFiles = [];
  }

  return {
    taskId: row.task_id,
    repoPath: row.repo_path,
    commitSha: row.commit_sha,
    subject: row.subject,
    body: row.body,
    committedFiles,
    committedAt: row.committed_at
  };
}

function pullRequestFromRow(row: PullRequestRow): GitHubPullRequestRecord {
  return {
    taskId: row.task_id,
    repoPath: row.repo_path,
    owner: row.owner,
    repo: row.repo,
    number: row.number,
    title: row.title,
    url: row.url,
    state: row.state,
    draft: row.draft === 1,
    headBranch: row.head_branch,
    baseBranch: row.base_branch,
    createdAt: row.created_at
  };
}

export class TaskStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.migrate();
    this.backfillProjectsFromTasks();
  }

  listProjects(): ProjectRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM projects ORDER BY last_opened_at DESC, name ASC")
      .all() as unknown as ProjectRow[];

    return rows.map(projectFromRow);
  }

  upsertProject(request: UpsertProjectRequest): ProjectRecord {
    const repoPath = sanitizeText(request.repoPath, "", 2048);
    if (!repoPath) {
      throw new Error("Repository path is required");
    }

    const repoName = sanitizeText(request.repoName, repoNameFromPath(repoPath), 180);
    const name = sanitizeText(request.name, repoName, 180);
    const timestamp = nowIso();

    this.database
      .prepare(
        `INSERT INTO projects
          (id, name, repo_path, repo_name, created_at, updated_at, last_opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(repo_path) DO UPDATE SET
          name = excluded.name,
          repo_name = excluded.repo_name,
          updated_at = excluded.updated_at,
          last_opened_at = excluded.last_opened_at`
      )
      .run(`project_${randomUUID()}`, name, repoPath, repoName, timestamp, timestamp, timestamp);

    const row = this.database
      .prepare("SELECT * FROM projects WHERE repo_path = ?")
      .get(repoPath) as ProjectRow | undefined;

    if (!row) {
      throw new Error("Project was not saved");
    }

    return projectFromRow(row);
  }

  listTasks(): TaskRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM tasks ORDER BY updated_at DESC")
      .all() as unknown as TaskRow[];

    return rows.map(taskFromRow);
  }

  getTask(taskId: string): TaskRecord | null {
    const row = this.database
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get(taskId) as TaskRow | undefined;

    return row ? taskFromRow(row) : null;
  }

  createTask(request: CreateTaskRequest): TaskRecord {
    const id = `task_${randomUUID()}`;
    const createdAt = nowIso();
    const repoPath = sanitizeText(request.repoPath, "", 2048);
    const title = sanitizeText(request.title, "New task", 180);
    const description = request.description ? sanitizeText(request.description, "", 1000) : undefined;
    const repoName = sanitizeText(request.repoName, repoNameFromPath(repoPath), 180);
    const model = sanitizeText(request.model, "gpt-4.1", 80);
    this.upsertProject({ repoPath, repoName, name: repoName });

    this.database
      .prepare(
        `INSERT INTO tasks
          (id, title, description, repo_path, repo_name, model, status, active_run_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, ?, ?)`
      )
      .run(id, title, description ?? null, repoPath, repoName, model, createdAt, createdAt);

    const task = this.getTask(id);
    if (!task) {
      throw new Error("Task was not created");
    }

    return task;
  }

  startRun(request: StartAgentRunRequest): { task: TaskRecord; run: AgentRunRecord } {
    let task = request.taskId ? this.getTask(request.taskId) : null;
    if (!task) {
      task = this.createTask({
        title: request.task,
        repoPath: request.repoPath,
        repoName: repoNameFromPath(request.repoPath),
        model: request.model
      });
    }

    const runId = `run_${randomUUID()}`;
    const startedAt = nowIso();
    const prompt = sanitizeText(request.task, task.title, 8000);
    const model = sanitizeText(request.model, task.model, 80);
    const repoPath = sanitizeText(request.repoPath, task.repoPath, 2048);
    this.upsertProject({ repoPath, repoName: repoNameFromPath(repoPath), name: repoNameFromPath(repoPath) });

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO runs
            (id, task_id, repo_path, model, prompt, status, started_at, ended_at, events_json)
           VALUES (?, ?, ?, ?, ?, 'running', ?, NULL, '[]')`
        )
        .run(runId, task.id, repoPath, model, prompt, startedAt);

      this.database
        .prepare("UPDATE tasks SET status = 'running', active_run_id = ?, updated_at = ? WHERE id = ?")
        .run(runId, startedAt, task.id);

      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    const updatedTask = this.getTask(task.id);
    const run = this.getRun(runId);
    if (!updatedTask || !run) {
      throw new Error("Run was not created");
    }

    return { task: updatedTask, run };
  }

  getRun(runId: string): AgentRunRecord | null {
    const row = this.database
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get(runId) as RunRow | undefined;

    return row ? runFromRow(row) : null;
  }

  listRuns(taskId?: string): AgentRunRecord[] {
    const rows = taskId
      ? (this.database
          .prepare("SELECT * FROM runs WHERE task_id = ? ORDER BY started_at ASC")
          .all(taskId) as unknown as RunRow[])
      : (this.database.prepare("SELECT * FROM runs ORDER BY started_at DESC").all() as unknown as RunRow[]);

    return rows.map(runFromRow);
  }

  listFileReviews(repoPath: string): FileReviewRecord[] {
    const normalizedRepoPath = sanitizeText(repoPath, "", 2048);
    if (!normalizedRepoPath) {
      return [];
    }

    const rows = this.database
      .prepare("SELECT * FROM file_reviews WHERE repo_path = ? ORDER BY file_path ASC")
      .all(normalizedRepoPath) as unknown as FileReviewRow[];

    return rows.map(fileReviewFromRow);
  }

  setFileReview(request: SetFileReviewRequest): FileReviewRecord {
    const repoPath = sanitizeText(request.repoPath, "", 2048);
    const filePath = sanitizeText(request.filePath, "", 2048);
    const status: FileReviewStatus = request.status === "reviewed" ? "reviewed" : "unreviewed";
    const updatedAt = nowIso();
    const reviewedAt = status === "reviewed" ? updatedAt : null;

    if (!repoPath || !filePath) {
      throw new Error("Repository path and file path are required");
    }

    this.database
      .prepare(
        `INSERT INTO file_reviews
          (repo_path, file_path, status, reviewed_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(repo_path, file_path) DO UPDATE SET
          status = excluded.status,
          reviewed_at = excluded.reviewed_at,
          updated_at = excluded.updated_at`
      )
      .run(repoPath, filePath, status, reviewedAt, updatedAt);

    const row = this.database
      .prepare("SELECT * FROM file_reviews WHERE repo_path = ? AND file_path = ?")
      .get(repoPath, filePath) as FileReviewRow | undefined;

    if (!row) {
      throw new Error("File review status was not saved");
    }

    return fileReviewFromRow(row);
  }

  approveTask(taskId: string): TaskRecord {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error("Task was not found");
    }

    if (task.status !== "review" && task.status !== "done") {
      throw new Error("Only tasks ready for review can be approved");
    }

    const updatedAt = nowIso();
    this.database
      .prepare("UPDATE tasks SET status = 'done', active_run_id = NULL, updated_at = ? WHERE id = ?")
      .run(updatedAt, task.id);

    const updatedTask = this.getTask(task.id);
    if (!updatedTask) {
      throw new Error("Task approval was not saved");
    }

    return updatedTask;
  }

  getCommitDraft(taskId: string): CommitDraftRecord | null {
    const row = this.database
      .prepare("SELECT * FROM commit_drafts WHERE task_id = ?")
      .get(taskId) as CommitDraftRow | undefined;

    return row ? commitDraftFromRow(row) : null;
  }

  saveCommitDraft(request: SaveCommitDraftRequest): CommitDraftRecord {
    const task = this.getTask(request.taskId);
    if (!task) {
      throw new Error("Task was not found");
    }

    const repoPath = sanitizeText(request.repoPath, task.repoPath, 2048);
    const subject = sanitizeText(request.subject, "", 160);
    const body = sanitizeText(request.body, "", 8000);
    const updatedAt = nowIso();

    if (!subject) {
      throw new Error("Commit subject is required");
    }

    this.database
      .prepare(
        `INSERT INTO commit_drafts
          (task_id, repo_path, subject, body, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
          repo_path = excluded.repo_path,
          subject = excluded.subject,
          body = excluded.body,
          updated_at = excluded.updated_at`
      )
      .run(task.id, repoPath, subject, body, updatedAt);

    const draft = this.getCommitDraft(task.id);
    if (!draft) {
      throw new Error("Commit draft was not saved");
    }

    return draft;
  }

  getTaskCommit(taskId: string): CommitTaskResult | null {
    const row = this.database
      .prepare("SELECT * FROM task_commits WHERE task_id = ?")
      .get(taskId) as TaskCommitRow | undefined;

    return row ? taskCommitFromRow(row) : null;
  }

  saveTaskCommit(result: CommitTaskResult): CommitTaskResult {
    const task = this.getTask(result.taskId);
    if (!task) {
      throw new Error("Task was not found");
    }

    this.database
      .prepare(
        `INSERT INTO task_commits
          (task_id, repo_path, commit_sha, subject, body, committed_files_json, committed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
          repo_path = excluded.repo_path,
          commit_sha = excluded.commit_sha,
          subject = excluded.subject,
          body = excluded.body,
          committed_files_json = excluded.committed_files_json,
          committed_at = excluded.committed_at`
      )
      .run(
        result.taskId,
        result.repoPath,
        result.commitSha,
        result.subject,
        result.body,
        JSON.stringify(result.committedFiles),
        result.committedAt
      );

    const saved = this.getTaskCommit(result.taskId);
    if (!saved) {
      throw new Error("Task commit result was not saved");
    }

    return saved;
  }

  getPullRequest(taskId: string): GitHubPullRequestRecord | null {
    const row = this.database
      .prepare("SELECT * FROM pull_requests WHERE task_id = ?")
      .get(taskId) as PullRequestRow | undefined;

    return row ? pullRequestFromRow(row) : null;
  }

  savePullRequest(record: GitHubPullRequestRecord): GitHubPullRequestRecord {
    const task = this.getTask(record.taskId);
    if (!task) {
      throw new Error("Task was not found");
    }

    this.database
      .prepare(
        `INSERT INTO pull_requests
          (task_id, repo_path, owner, repo, number, title, url, state, draft, head_branch, base_branch, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(task_id) DO UPDATE SET
          repo_path = excluded.repo_path,
          owner = excluded.owner,
          repo = excluded.repo,
          number = excluded.number,
          title = excluded.title,
          url = excluded.url,
          state = excluded.state,
          draft = excluded.draft,
          head_branch = excluded.head_branch,
          base_branch = excluded.base_branch,
          created_at = excluded.created_at`
      )
      .run(
        record.taskId,
        record.repoPath,
        record.owner,
        record.repo,
        record.number,
        record.title,
        record.url,
        record.state,
        record.draft ? 1 : 0,
        record.headBranch,
        record.baseBranch,
        record.createdAt
      );

    const saved = this.getPullRequest(record.taskId);
    if (!saved) {
      throw new Error("Pull request result was not saved");
    }

    return saved;
  }

  appendRunEvent(runId: string, event: AgentEvent): void {
    const run = this.getRun(runId);
    if (!run) {
      return;
    }

    const eventsJson = JSON.stringify([...run.events, event]);
    this.database
      .prepare("UPDATE runs SET events_json = ? WHERE id = ?")
      .run(eventsJson, runId);
  }

  finishRun(runId: string, status: AgentRunStatus): void {
    const run = this.getRun(runId);
    if (!run) {
      return;
    }

    const endedAt = nowIso();
    const taskStatus: TaskRecordStatus = status === "completed" ? "review" : "failed";

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?")
        .run(status, endedAt, runId);
      this.database
        .prepare("UPDATE tasks SET status = ?, active_run_id = NULL, updated_at = ? WHERE id = ?")
        .run(taskStatus, endedAt, run.taskId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private migrate(): void {
    this.database.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        repo_path TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'review', 'done', 'failed')),
        active_run_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_repo_path ON tasks(repo_path);

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        events_json TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_runs_task_id ON runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_path TEXT NOT NULL UNIQUE,
        repo_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_last_opened_at ON projects(last_opened_at DESC);

      CREATE TABLE IF NOT EXISTS file_reviews (
        repo_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('unreviewed', 'reviewed')),
        reviewed_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(repo_path, file_path)
      );

      CREATE INDEX IF NOT EXISTS idx_file_reviews_repo_path ON file_reviews(repo_path);

      CREATE TABLE IF NOT EXISTS commit_drafts (
        task_id TEXT PRIMARY KEY,
        repo_path TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_commit_drafts_repo_path ON commit_drafts(repo_path);

      CREATE TABLE IF NOT EXISTS task_commits (
        task_id TEXT PRIMARY KEY,
        repo_path TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        committed_files_json TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_task_commits_repo_path ON task_commits(repo_path);

      CREATE TABLE IF NOT EXISTS pull_requests (
        task_id TEXT PRIMARY KEY,
        repo_path TEXT NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        state TEXT NOT NULL,
        draft INTEGER NOT NULL DEFAULT 1,
        head_branch TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_pull_requests_repo_path ON pull_requests(repo_path);
    `);
  }

  private backfillProjectsFromTasks(): void {
    const rows = this.database
      .prepare(
        `SELECT
          repo_path,
          repo_name,
          MIN(created_at) AS created_at,
          MAX(updated_at) AS updated_at
         FROM tasks
         GROUP BY repo_path, repo_name`
      )
      .all() as unknown as ProjectSeedRow[];

    for (const row of rows) {
      if (!row.repo_path) {
        continue;
      }

      const createdAt = row.created_at || nowIso();
      const updatedAt = row.updated_at || createdAt;
      this.database
        .prepare(
          `INSERT INTO projects
            (id, name, repo_path, repo_name, created_at, updated_at, last_opened_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(repo_path) DO NOTHING`
        )
        .run(`project_${randomUUID()}`, row.repo_name || repoNameFromPath(row.repo_path), row.repo_path, row.repo_name, createdAt, updatedAt, updatedAt);
    }
  }
}
