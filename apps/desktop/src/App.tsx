import {
  AtSign,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Code2,
  FileCode2,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitPullRequest,
  Lock,
  Minimize,
  MoreVertical,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Settings,
  Slash,
  Square,
  TerminalSquare,
  Workflow,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AgentEvent,
  AgentRunRecord,
  CommitDraftRecord,
  CommitTaskResult,
  CreateTaskRequest,
  FileReviewRecord,
  FileReviewStatus,
  GitDiffLine,
  GitFileDiff,
  GitStatusSummary,
  ProjectRecord,
  TaskRecord
} from "@ai-dev/shared";

type RightTab = "diff" | "github";

interface TimelineItem {
  id: string;
  time: string;
  kind: "agent" | "reasoning" | "read" | "edit" | "run" | "final";
  title: string;
  detail?: string;
  file?: string;
  additions?: number;
  deletions?: number;
  terminal?: string[];
}

interface UiChangedFile {
  path: string;
  additions: number;
  deletions: number;
  expanded?: boolean;
}

interface PendingTestApproval {
  eventId: string;
  command: string[];
}

const fallbackTaskTime = new Date().toISOString();

const fallbackTasks: TaskRecord[] = [
  {
    id: "oauth",
    title: "Add OAuth login with GitHub",
    description: "Implement OAuth flow, user model, and session handling.",
    repoPath: "~/Projects/acme/webapp",
    repoName: "acme/webapp",
    model: "gpt-4.1",
    status: "running",
    activeRunId: "run_seed",
    createdAt: fallbackTaskTime,
    updatedAt: fallbackTaskTime
  },
  {
    id: "auth-tests",
    title: "Add unit tests for auth service",
    repoPath: "~/Projects/acme/webapp",
    repoName: "acme/webapp",
    model: "gpt-4.1",
    status: "queued",
    createdAt: fallbackTaskTime,
    updatedAt: fallbackTaskTime
  },
  {
    id: "settings-api",
    title: "Refactor user settings API",
    repoPath: "~/Projects/acme/webapp",
    repoName: "acme/webapp",
    model: "gpt-4.1",
    status: "queued",
    createdAt: fallbackTaskTime,
    updatedAt: fallbackTaskTime
  },
  {
    id: "login-e2e",
    title: "Add E2E test for login flow",
    repoPath: "~/Projects/acme/webapp",
    repoName: "acme/webapp",
    model: "gpt-4.1",
    status: "queued",
    createdAt: fallbackTaskTime,
    updatedAt: fallbackTaskTime
  },
  {
    id: "auth-module",
    title: "Scaffold auth module",
    repoPath: "~/Projects/acme/webapp",
    repoName: "acme/webapp",
    model: "gpt-4.1",
    status: "done",
    createdAt: fallbackTaskTime,
    updatedAt: fallbackTaskTime
  },
  {
    id: "github-oauth-app",
    title: "Configure GitHub OAuth App",
    repoPath: "~/Projects/acme/webapp",
    repoName: "acme/webapp",
    model: "gpt-4.1",
    status: "done",
    createdAt: fallbackTaskTime,
    updatedAt: fallbackTaskTime
  },
  {
    id: "env-oauth",
    title: "Add env vars for OAuth",
    repoPath: "~/Projects/acme/webapp",
    repoName: "acme/webapp",
    model: "gpt-4.1",
    status: "done",
    createdAt: fallbackTaskTime,
    updatedAt: fallbackTaskTime
  }
];
let starterTaskPromise: Promise<TaskRecord> | null = null;

function createStarterTaskOnce(request: CreateTaskRequest): Promise<TaskRecord> {
  if (!window.desktop) {
    throw new Error("Desktop bridge is not available");
  }

  starterTaskPromise ??= window.desktop.createTask(request).catch((error: unknown) => {
    starterTaskPromise = null;
    throw error;
  });

  return starterTaskPromise;
}

const timeline: TimelineItem[] = [
  {
    id: "start",
    time: "10:42:11",
    kind: "agent",
    title: "Agent started task",
    detail: "Add OAuth login with GitHub"
  },
  {
    id: "reasoning",
    time: "10:42:12",
    kind: "reasoning",
    title: "Reasoning",
    detail: "I'll implement GitHub OAuth login. Plan:\n1. Add OAuth strategy and config\n2. Create/lookup user on callback\n3. Persist session and protect routes\n4. Add tests"
  },
  {
    id: "read",
    time: "10:42:14",
    kind: "read",
    title: "Read file",
    file: "src/config/env.example"
  },
  {
    id: "edit-auth",
    time: "10:42:15",
    kind: "edit",
    title: "Edit file",
    file: "src/config/auth.ts",
    additions: 24,
    deletions: 6
  },
  {
    id: "test",
    time: "10:42:16",
    kind: "run",
    title: "Run",
    file: "npm test -- auth",
    terminal: [
      "PASS  tests/auth/oauth.test.ts (12.4s)",
      "PASS  tests/auth/session.test.ts (8.7s)",
      "Test Suites: 2 passed, 2 total",
      "Tests:      18 passed, 18 total",
      "Snapshots:  0 total",
      "Time:       21.112s",
      "Ran all test suites matching /auth/i."
    ]
  },
  {
    id: "edit-callback",
    time: "10:42:38",
    kind: "edit",
    title: "Edit file",
    file: "src/routes/auth.callback.ts",
    additions: 38,
    deletions: 4
  },
  {
    id: "build",
    time: "10:42:40",
    kind: "run",
    title: "Run",
    file: "npm run build",
    terminal: ["> webapp@1.0.0 build", "> tsc -b && vite build", "Build completed in 3.21s"]
  },
  {
    id: "done",
    time: "10:42:45",
    kind: "final",
    title: "Agent",
    detail: "OAuth login implementation complete. Added tests and verified build."
  }
];

const mockChangedFiles: UiChangedFile[] = [
  { path: "src/config/auth.ts", additions: 24, deletions: 6, expanded: true },
  { path: "src/routes/auth.callback.ts", additions: 38, deletions: 4 },
  { path: "src/services/user.ts", additions: 22, deletions: 3 },
  { path: "tests/auth/oauth.test.ts", additions: 120, deletions: 0 },
  { path: "tests/auth/session.test.ts", additions: 64, deletions: 0 },
  { path: ".env.example", additions: 4, deletions: 0 }
];

const diffLines = [
  { n: "10", text: "export const authConfig = {", tone: "context" },
  { n: "11", text: "  providers: [", tone: "context" },
  { n: "12", text: "    // existing email provider", tone: "removed" },
  { n: "13", text: "    EmailProvider({", tone: "removed" },
  { n: "14", text: "      /* ... */", tone: "removed" },
  { n: "15", text: "    }),", tone: "removed" },
  { n: "12", text: "    GitHubProvider({", tone: "added" },
  { n: "13", text: "      clientId: env.GITHUB_CLIENT_ID,", tone: "added" },
  { n: "14", text: "      clientSecret: env.GITHUB_CLIENT_SECRET,", tone: "added" },
  { n: "15", text: "      callbackURL: env.GITHUB_CALLBACK_URL,", tone: "added" },
  { n: "16", text: "      scope: ['user:email'],", tone: "added" },
  { n: "17", text: "    }),", tone: "added" },
  { n: "18", text: "  ],", tone: "context" },
  { n: "19", text: "  session: {", tone: "context" }
];

function fallbackDiffLines(): GitDiffLine[] {
  return diffLines.map((line) => ({
    oldLineNumber: Number.parseInt(line.n, 10),
    newLineNumber: Number.parseInt(line.n, 10),
    text: line.text,
    tone: line.tone === "removed" ? "removed" : line.tone === "added" ? "added" : "context"
  }));
}

interface ProjectTreeItem {
  project: ProjectRecord;
  tasks: TaskRecord[];
}

function eventToTimelineItem(event: AgentEvent): TimelineItem {
  const date = new Date(event.ts);
  const time = Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString([], { hour12: false });
  const kind = event.type === "command.output" ? "run" : event.type === "assistant.delta" ? "reasoning" : event.type === "task.completed" ? "final" : "agent";

  return {
    id: event.id,
    time,
    kind,
    title: event.type,
    detail: event.message,
    terminal: event.type === "command.output" && event.message ? [event.message] : undefined
  };
}

function repoLabelFromPath(repoPath: string): string {
  if (repoPath.startsWith("~")) {
    return "acme/webapp";
  }

  const normalized = repoPath.replace(/\\/g, "/").replace(/\/$/, "");
  return normalized.split("/").pop() || normalized;
}

function toUiChangedFiles(status?: GitStatusSummary): UiChangedFile[] {
  if (!status?.isGitRepo || status.changedFiles.length === 0) {
    return mockChangedFiles;
  }

  return status.changedFiles.map((file, index) => ({
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    expanded: index === 0
  }));
}

function fallbackProjectsFromTasks(tasks: TaskRecord[]): ProjectRecord[] {
  const byRepoPath = new Map<string, ProjectRecord>();

  for (const task of tasks) {
    const existing = byRepoPath.get(task.repoPath);
    if (existing && existing.updatedAt >= task.updatedAt) {
      continue;
    }

    const timestamp = task.updatedAt || task.createdAt;
    byRepoPath.set(task.repoPath, {
      id: `project_fallback_${task.repoPath}`,
      name: task.repoName || repoLabelFromPath(task.repoPath),
      repoPath: task.repoPath,
      repoName: task.repoName || repoLabelFromPath(task.repoPath),
      createdAt: task.createdAt,
      updatedAt: timestamp,
      lastOpenedAt: timestamp
    });
  }

  return [...byRepoPath.values()];
}

function buildProjectTree(projects: ProjectRecord[], tasks: TaskRecord[]): ProjectTreeItem[] {
  const tasksByRepoPath = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    const repoTasks = tasksByRepoPath.get(task.repoPath) ?? [];
    repoTasks.push(task);
    tasksByRepoPath.set(task.repoPath, repoTasks);
  }

  const projectByRepoPath = new Map<string, ProjectRecord>();
  for (const project of [...fallbackProjectsFromTasks(tasks), ...projects]) {
    projectByRepoPath.set(project.repoPath, project);
  }

  return [...projectByRepoPath.values()]
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt) || left.name.localeCompare(right.name))
    .map((project) => ({
      project,
      tasks: (tasksByRepoPath.get(project.repoPath) ?? []).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    }));
}

function getTaskAgeParts(value: string): { key: string; count: number } {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return { key: "time.minutesShort", count: 0 };
  }

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) {
    return { key: "time.minutesShort", count: Math.max(1, minutes) };
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return { key: "time.hoursShort", count: hours };
  }

  return { key: "time.daysShort", count: Math.floor(hours / 24) };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function getPendingTestApproval(events: AgentEvent[]): PendingTestApproval | null {
  for (const event of [...events].reverse()) {
    if (event.type !== "tool.result") {
      continue;
    }

    const payload = asRecord(event.payload);
    if (payload?.name !== "tests.run") {
      continue;
    }

    const metadata = asRecord(payload.metadata);
    if (metadata?.skipped !== true) {
      return null;
    }

    const command = asStringArray(metadata.command);
    if (!command) {
      return null;
    }

    return { eventId: event.id, command };
  }

  return null;
}

function iconForTimeline(kind: TimelineItem["kind"]) {
  if (kind === "reasoning") {
    return <Workflow size={15} />;
  }
  if (kind === "read") {
    return <FileText size={15} />;
  }
  if (kind === "edit") {
    return <FileCode2 size={15} />;
  }
  if (kind === "run") {
    return <TerminalSquare size={15} />;
  }
  if (kind === "final") {
    return <Bot size={15} />;
  }
  return <Code2 size={15} />;
}

function WindowControls() {
  return (
    <div className="window-actions">
      <button type="button" aria-label="Minimize" onClick={() => void window.desktop?.minimizeWindow()}>
        <Minimize size={15} />
      </button>
      <button type="button" aria-label="Maximize" onClick={() => void window.desktop?.toggleMaximizeWindow()}>
        <Square size={13} />
      </button>
      <button type="button" aria-label="Close" onClick={() => void window.desktop?.closeWindow()}>
        <X size={16} />
      </button>
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  return (
    <article className={`timeline-row ${item.kind}`}>
      <time>{item.time}</time>
      <div className="timeline-marker">{iconForTimeline(item.kind)}</div>
      <div className="timeline-body">
        <div className="timeline-title">
          <strong>{item.title}</strong>
          {item.file ? <code>{item.file}</code> : null}
          {typeof item.additions === "number" ? <span className="change-add">+{item.additions}</span> : null}
          {typeof item.deletions === "number" ? <span className="change-del">-{item.deletions}</span> : null}
        </div>
        {item.detail ? <p>{item.detail}</p> : null}
        {item.terminal ? (
          <pre className="terminal-card">
            {item.terminal.map((line) => (
              <span key={line} className={line.startsWith("PASS") || line.startsWith("Build") ? "terminal-pass" : ""}>
                {line}
              </span>
            ))}
          </pre>
        ) : null}
      </div>
    </article>
  );
}

function TestApprovalCard({
  approval,
  disabled,
  approveLabel,
  runningLabel,
  onApprove
}: {
  approval: PendingTestApproval;
  disabled: boolean;
  approveLabel: string;
  runningLabel: string;
  onApprove: () => void;
}) {
  return (
    <section className="approval-card" aria-labelledby={`approval-${approval.eventId}`}>
      <div className="approval-icon">
        <TerminalSquare size={16} />
      </div>
      <div className="approval-content">
        <strong id={`approval-${approval.eventId}`}>tests.run</strong>
        <span>{approval.command.join(" ")}</span>
      </div>
      <button className="approval-button" type="button" disabled={disabled} onClick={onApprove}>
        <Play size={14} />
        {disabled ? runningLabel : approveLabel}
      </button>
    </section>
  );
}

export function App() {
  const { t } = useTranslation();
  const [repoPath, setRepoPath] = useState("~/Projects/acme/webapp");
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | undefined>();
  const [projects, setProjects] = useState<ProjectRecord[]>(fallbackProjectsFromTasks(fallbackTasks));
  const [tasks, setTasks] = useState<TaskRecord[]>(fallbackTasks);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>("oauth");
  const [expandedProjectPaths, setExpandedProjectPaths] = useState<Set<string>>(() => new Set(fallbackProjectsFromTasks(fallbackTasks).map((project) => project.repoPath)));
  const [runs, setRuns] = useState<AgentRunRecord[]>([]);
  const [rightTab, setRightTab] = useState<RightTab>("diff");
  const [prompt, setPrompt] = useState("");
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | undefined>();
  const [fileDiff, setFileDiff] = useState<GitFileDiff | undefined>();
  const [fileReviews, setFileReviews] = useState<FileReviewRecord[]>([]);
  const [commitDraft, setCommitDraft] = useState<CommitDraftRecord | undefined>();
  const [taskCommit, setTaskCommit] = useState<CommitTaskResult | undefined>();
  const [commitSubject, setCommitSubject] = useState("");
  const [commitBody, setCommitBody] = useState("");
  const [isCommitDraftSaving, setIsCommitDraftSaving] = useState(false);
  const [isCommittingTask, setIsCommittingTask] = useState(false);
  const [commitDraftError, setCommitDraftError] = useState<string | undefined>();
  const [commitTaskError, setCommitTaskError] = useState<string | undefined>();
  const [commitDraftSavedAt, setCommitDraftSavedAt] = useState<string | undefined>();
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [isApprovingResult, setIsApprovingResult] = useState(false);
  const [resultApprovalError, setResultApprovalError] = useState<string | undefined>();
  const [showSearch, setShowSearch] = useState(false);
  const [prStatus, setPrStatus] = useState<"idle" | "created">("idle");

  const loadRuns = useCallback(async (taskId = activeTaskId) => {
    if (!window.desktop || !taskId) {
      setRuns([]);
      return;
    }

    const nextRuns = await window.desktop.listRuns(taskId);
    setRuns(nextRuns);
  }, [activeTaskId]);

  const loadFileReviews = useCallback(async (repoRoot?: string) => {
    if (!window.desktop || !repoRoot) {
      setFileReviews([]);
      return;
    }

    const reviews = await window.desktop.listFileReviews(repoRoot);
    setFileReviews(reviews);
  }, []);

  const loadCommitDraft = useCallback(async (taskId?: string) => {
    if (!window.desktop || !taskId) {
      setCommitDraft(undefined);
      setCommitSubject("");
      setCommitBody("");
      setCommitDraftError(undefined);
      setCommitDraftSavedAt(undefined);
      return;
    }

    const draft = await window.desktop.getCommitDraft(taskId);
    setCommitDraft(draft ?? undefined);
    setCommitSubject(draft?.subject ?? "");
    setCommitBody(draft?.body ?? "");
    setCommitDraftError(undefined);
    setCommitDraftSavedAt(undefined);
  }, []);

  const loadTaskCommit = useCallback(async (taskId?: string) => {
    if (!window.desktop || !taskId) {
      setTaskCommit(undefined);
      setCommitTaskError(undefined);
      return;
    }

    const result = await window.desktop.getTaskCommit(taskId);
    setTaskCommit(result ?? undefined);
    setCommitTaskError(undefined);
  }, []);

  const loadProjects = useCallback(async () => {
    if (!window.desktop) {
      setProjects(fallbackProjectsFromTasks(tasks));
      return;
    }

    const nextProjects = await window.desktop.listProjects();
    setProjects(nextProjects.length > 0 ? nextProjects : fallbackProjectsFromTasks(tasks));
  }, [tasks]);

  const loadTasks = useCallback(async () => {
    if (!window.desktop) {
      return;
    }

    let nextTasks = await window.desktop.listTasks();
    if (nextTasks.length === 0) {
      const starterTask = await createStarterTaskOnce({
        title: t("tasks.defaultTitle"),
        description: t("tasks.defaultDescription"),
        repoPath,
        repoName: repoLabelFromPath(repoPath),
        model: "gpt-4.1"
      });
      nextTasks = await window.desktop.listTasks();
      if (nextTasks.length === 0) {
        nextTasks = [starterTask];
      }
    }

    setTasks(nextTasks);
    setActiveTaskId((current) => {
      if (current && nextTasks.some((task) => task.id === current)) {
        return current;
      }

      return nextTasks[0]?.id;
    });
  }, [repoPath, t]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!window.desktop) {
      return;
    }

    const offAgentEvent = window.desktop.onAgentEvent((event) => {
      setLiveEvents((current) => {
        if (current.some((item) => item.id === event.id)) {
          return current;
        }

        return [...current, event];
      });
      if (event.type === "task.completed" || event.type === "task.failed") {
        setIsRunning(false);
      }
    });
    const offTasksChanged = window.desktop.onTasksChanged(() => {
      void loadTasks();
      void loadProjects();
      void loadRuns();
      void loadFileReviews(gitStatus?.isGitRepo ? gitStatus.rootPath : undefined);
    });

    return () => {
      offAgentEvent();
      offTasksChanged();
    };
  }, [gitStatus?.isGitRepo, gitStatus?.rootPath, loadFileReviews, loadProjects, loadRuns, loadTasks]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    void loadFileReviews(gitStatus?.isGitRepo ? gitStatus.rootPath : undefined);
  }, [gitStatus?.isGitRepo, gitStatus?.rootPath, loadFileReviews]);

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId), [activeTaskId, tasks]);
  const activeProjectPath = activeTask?.repoPath ?? gitStatus?.rootPath ?? repoPath;
  const projectTree = useMemo(() => buildProjectTree(projects, tasks), [projects, tasks]);

  useEffect(() => {
    void loadCommitDraft(activeTask?.id);
    void loadTaskCommit(activeTask?.id);
  }, [activeTask?.id, loadCommitDraft, loadTaskCommit]);

  const storedRunEvents = useMemo(() => runs.flatMap((run) => run.events), [runs]);
  const activeRunEvents = useMemo(() => {
    const storedEventIds = new Set(storedRunEvents.map((event) => event.id));
    return [
      ...storedRunEvents,
      ...liveEvents.filter((event) => !storedEventIds.has(event.id) && (!activeTask?.activeRunId || event.runId === activeTask.activeRunId))
    ];
  }, [activeTask?.activeRunId, liveEvents, storedRunEvents]);
  const renderedTimeline = useMemo(() => {
    if (activeRunEvents.length > 0) {
      return activeRunEvents.map(eventToTimelineItem);
    }

    return activeTask?.id === "oauth" ? timeline : [];
  }, [activeRunEvents, activeTask?.id]);
  const pendingTestApproval = useMemo(() => getPendingTestApproval(activeRunEvents), [activeRunEvents]);
  const repoLabel = gitStatus?.isGitRepo ? gitStatus.repoName : repoLabelFromPath(repoPath);
  const branchLabel = gitStatus?.isGitRepo ? gitStatus.branch : "feature/enable-oauth";
  const visibleChangedFiles = useMemo(() => toUiChangedFiles(gitStatus), [gitStatus]);
  const selectedDiffFile = useMemo(
    () => visibleChangedFiles.find((file) => file.path === selectedDiffPath) ?? visibleChangedFiles[0] ?? mockChangedFiles[0],
    [selectedDiffPath, visibleChangedFiles]
  );
  const reviewByPath = useMemo(() => new Map(fileReviews.map((review) => [review.filePath, review])), [fileReviews]);
  const selectedReviewStatus: FileReviewStatus = reviewByPath.get(selectedDiffFile.path)?.status ?? "unreviewed";
  const totalChangedFiles = visibleChangedFiles.length;
  const reviewedChangedCount = useMemo(
    () => visibleChangedFiles.filter((file) => reviewByPath.get(file.path)?.status === "reviewed").length,
    [reviewByPath, visibleChangedFiles]
  );
  const allChangedFilesReviewed = totalChangedFiles > 0 && reviewedChangedCount === totalChangedFiles;
  const canApproveResult = Boolean(
    window.desktop &&
      gitStatus?.isGitRepo &&
      activeTask?.status === "review" &&
      allChangedFilesReviewed &&
      !isApprovingResult
  );
  const trimmedCommitSubject = commitSubject.trim();
  const commitDraftDirty =
    trimmedCommitSubject !== (commitDraft?.subject ?? "") || commitBody.trimEnd() !== (commitDraft?.body ?? "");
  const canSaveCommitDraft = Boolean(window.desktop && activeTask && trimmedCommitSubject && !taskCommit && !isCommitDraftSaving);
  const isCommitDraftSaved = Boolean(commitDraft?.isSaved && !commitDraftDirty);
  const canCommitTask = Boolean(
    window.desktop &&
      activeTask?.status === "done" &&
      gitStatus?.isGitRepo &&
      isCommitDraftSaved &&
      allChangedFilesReviewed &&
      !taskCommit &&
      !isCommittingTask
  );
  const canCreatePr = Boolean(activeTask?.status === "done" && isCommitDraftSaved && taskCommit);
  const displayedDiffLines = gitStatus?.isGitRepo ? fileDiff?.lines ?? [] : fallbackDiffLines();
  const aheadBehindLabel = gitStatus?.isGitRepo
    ? `${gitStatus.ahead} commits ahead, ${gitStatus.behind} behind`
    : "2 commits ahead of main";
  const repoConnectionLabel = gitStatus?.isGitRepo === false ? t("repo.notGit") : t("repo.connectedTo");
  const repoPathForAgent = gitStatus?.rootPath ?? (repoPath.startsWith("~") ? "D:/Project/GPT" : repoPath);
  const taskAgeLabel = useCallback((task: TaskRecord) => {
    const age = getTaskAgeParts(task.updatedAt);
    return t(age.key, { count: age.count });
  }, [t]);

  useEffect(() => {
    const firstPath = visibleChangedFiles[0]?.path;
    if (!firstPath) {
      setSelectedDiffPath(undefined);
      setFileDiff(undefined);
      return;
    }

    setSelectedDiffPath((current) => (current && visibleChangedFiles.some((file) => file.path === current) ? current : firstPath));
  }, [visibleChangedFiles]);

  useEffect(() => {
    if (!window.desktop || !gitStatus?.isGitRepo || !selectedDiffPath) {
      setFileDiff(undefined);
      return;
    }

    let cancelled = false;
    setIsDiffLoading(true);
    window.desktop
      .getGitFileDiff(gitStatus.rootPath, selectedDiffPath)
      .then((diff) => {
        if (!cancelled) {
          setFileDiff(diff);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFileDiff({
            repoPath: gitStatus.rootPath,
            filePath: selectedDiffPath,
            isBinary: false,
            isTooLarge: false,
            raw: "",
            lines: [],
            error: error instanceof Error ? error.message : t("diff.loadFailed")
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsDiffLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gitStatus?.isGitRepo, gitStatus?.rootPath, selectedDiffPath, t]);

  async function activateRepository(nextRepoPath: string, nextTaskId?: string) {
    setRepoPath(nextRepoPath);
    const status = await window.desktop?.getGitStatus(nextRepoPath);
    setGitStatus(status);

    const normalizedRepoPath = status?.isGitRepo ? status.rootPath : nextRepoPath;
    const normalizedRepoName = status?.isGitRepo ? status.repoName : repoLabelFromPath(nextRepoPath);
    if (window.desktop) {
      const project = await window.desktop.upsertProject({
        repoPath: normalizedRepoPath,
        repoName: normalizedRepoName,
        name: normalizedRepoName
      });
      setProjects((current) => [project, ...current.filter((item) => item.repoPath !== project.repoPath)]);
      setExpandedProjectPaths((current) => new Set([...current, project.repoPath]));
    }

    const preferredTask = nextTaskId ? tasks.find((task) => task.id === nextTaskId) : undefined;
    const firstTaskInProject = tasks.find((task) => task.repoPath === normalizedRepoPath || task.repoPath === nextRepoPath);
    setActiveTaskId(preferredTask?.id ?? firstTaskInProject?.id);
  }

  async function selectRepository() {
    const selected = await window.desktop?.selectRepository();
    if (selected) {
      await activateRepository(selected);
    }
  }

  async function selectTask(task: TaskRecord) {
    setActiveTaskId(task.id);
    if (task.repoPath !== activeProjectPath) {
      await activateRepository(task.repoPath, task.id);
    }
  }

  async function addTask() {
    const title = prompt.trim() || t("tasks.defaultTitle");

    if (!window.desktop) {
      const nextTask: TaskRecord = {
        id: `task_${Date.now()}`,
        title,
        repoPath,
        repoName: repoLabel,
        model: "gpt-4.1",
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setTasks((current) => [nextTask, ...current]);
      setActiveTaskId(nextTask.id);
      setPrompt("");
      return;
    }

    const task = await window.desktop.createTask({
      title,
      repoPath: repoPathForAgent,
      repoName: repoLabel,
      model: "gpt-4.1"
    });
    setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
    setActiveTaskId(task.id);
    setExpandedProjectPaths((current) => new Set([...current, task.repoPath]));
    await loadProjects();
    setPrompt("");
  }

  async function startRun() {
    setIsRunning(true);
    setPrStatus("idle");

    if (!window.desktop) {
      setLiveEvents((current) => [
        ...current,
        {
          id: `evt_browser_${Date.now()}`,
          runId: "run_browser",
          type: "task.started",
          ts: new Date().toISOString(),
          message: t("feed.browserFallback")
        }
      ]);
      setIsRunning(false);
      return;
    }

    try {
      let taskId = activeTask?.id;
      let taskTitle = prompt.trim() || activeTask?.title || t("tasks.defaultTitle");

      if (!taskId) {
        const task = await window.desktop.createTask({
          title: taskTitle,
          repoPath: repoPathForAgent,
          repoName: repoLabel,
          model: "gpt-4.1"
        });
        taskId = task.id;
        taskTitle = task.title;
        setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
        setActiveTaskId(task.id);
        setExpandedProjectPaths((current) => new Set([...current, task.repoPath]));
      }

      const response = await window.desktop.startAgentRun({
        repoPath: repoPathForAgent,
        task: taskTitle,
        model: "gpt-4.1",
        taskId
      });
      setPrompt("");
      await loadTasks();
      await loadRuns(response.taskId);
    } catch (error) {
      setIsRunning(false);
      setLiveEvents((current) => [
        ...current,
        {
          id: `evt_start_failed_${Date.now()}`,
          runId: "run_start_failed",
          type: "task.failed",
          ts: new Date().toISOString(),
          message: error instanceof Error ? error.message : t("feed.startFailed")
        }
      ]);
    }
  }

  async function approveTestRun() {
    if (!window.desktop || !activeTask || !pendingTestApproval) {
      return;
    }

    setIsRunning(true);
    setPrStatus("idle");

    try {
      const response = await window.desktop.startAgentRun({
        repoPath: repoPathForAgent,
        task: activeTask.title,
        model: activeTask.model,
        taskId: activeTask.id,
        runTests: true
      });
      await loadTasks();
      await loadRuns(response.taskId);
    } catch (error) {
      setIsRunning(false);
      setLiveEvents((current) => [
        ...current,
        {
          id: `evt_approval_failed_${Date.now()}`,
          runId: "run_approval_failed",
          type: "task.failed",
          ts: new Date().toISOString(),
          message: error instanceof Error ? error.message : t("feed.startFailed")
        }
      ]);
    }
  }

  async function setSelectedFileReviewStatus(status: FileReviewStatus) {
    setResultApprovalError(undefined);

    if (!window.desktop || !gitStatus?.isGitRepo || !selectedDiffFile.path) {
      return;
    }

    try {
      const review = await window.desktop.setFileReview({
        repoPath: gitStatus.rootPath,
        filePath: selectedDiffFile.path,
        status
      });
      setFileReviews((current) => [
        review,
        ...current.filter((item) => !(item.repoPath === review.repoPath && item.filePath === review.filePath))
      ]);
    } catch (error) {
      setResultApprovalError(error instanceof Error ? error.message : t("review.updateFailed"));
    }
  }

  async function approveResult() {
    setResultApprovalError(undefined);

    if (!window.desktop || !activeTask || !canApproveResult) {
      return;
    }

    setIsApprovingResult(true);
    try {
      const task = await window.desktop.approveTask(activeTask.id);
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      setActiveTaskId(task.id);
      await loadTasks();
    } catch (error) {
      setResultApprovalError(error instanceof Error ? error.message : t("review.approveFailed"));
    } finally {
      setIsApprovingResult(false);
    }
  }

  async function saveCommitDraft() {
    setCommitDraftError(undefined);
    setCommitDraftSavedAt(undefined);

    if (!window.desktop || !activeTask) {
      return;
    }

    const subject = commitSubject.trim();
    if (!subject) {
      setCommitDraftError(t("commit.subjectRequired"));
      return;
    }

    setIsCommitDraftSaving(true);
    try {
      const draft = await window.desktop.saveCommitDraft({
        taskId: activeTask.id,
        repoPath: gitStatus?.isGitRepo ? gitStatus.rootPath : activeTask.repoPath,
        subject,
        body: commitBody.trimEnd()
      });
      setCommitDraft(draft);
      setCommitSubject(draft.subject);
      setCommitBody(draft.body);
      setCommitDraftSavedAt(draft.updatedAt);
    } catch (error) {
      setCommitDraftError(error instanceof Error ? error.message : t("commit.saveFailed"));
    } finally {
      setIsCommitDraftSaving(false);
    }
  }

  async function commitReviewedChanges() {
    setCommitTaskError(undefined);

    if (!window.desktop || !activeTask || !canCommitTask) {
      return;
    }

    setIsCommittingTask(true);
    try {
      const result = await window.desktop.commitTask({ taskId: activeTask.id });
      setTaskCommit(result);
      setShowCommitDialog(false);
      setPrStatus("idle");
      setRepoPath(result.repoPath);

      const status = await window.desktop.getGitStatus(result.repoPath);
      setGitStatus(status);
      await loadTasks();
      await loadProjects();
    } catch (error) {
      setCommitTaskError(error instanceof Error ? error.message : t("commit.commitFailed"));
    } finally {
      setIsCommittingTask(false);
    }
  }

  async function stopRun() {
    await window.desktop?.stopAgentRun();
    setIsRunning(false);
  }

  return (
    <main className="app-frame">
      <header className="titlebar">
        <div className="titlebar-left">
          {window.desktop?.isMac ? (
            <div className="traffic-lights" aria-hidden="true">
              <span className="traffic red" />
              <span className="traffic yellow" />
              <span className="traffic green" />
            </div>
          ) : null}
          <strong>AI Developer Desktop</strong>
        </div>

        <div className="titlebar-center">
          <button className="select-chip" type="button" onClick={selectRepository}>
            <span>{t("chrome.repository")}</span>
            <strong>{repoLabel}</strong>
            <ChevronDown size={14} />
          </button>
          <button className="select-chip wide" type="button">
            <span>{t("chrome.branch")}</span>
            <strong>{branchLabel}</strong>
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="titlebar-right">
          <span className="model-label">{t("workspace.model")}</span>
          <button className="model-select" type="button">
            GPT-4.1
            <ChevronDown size={15} />
          </button>
          <button className="square-button" type="button" aria-label={t("settings.title")}>
            <Settings size={18} />
          </button>
          <button className="create-pr-top" type="button" disabled={!canCreatePr} onClick={() => setPrStatus("created")}>
            {t("actions.createPr")}
          </button>
          <WindowControls />
        </div>
      </header>

      <section className="repo-strip">
        <span className={`connection-dot ${gitStatus?.isGitRepo === false ? "disconnected" : ""}`} />
        <span>{repoConnectionLabel}</span>
        <button className="repo-path" type="button" onClick={selectRepository}>
          {repoPath}
        </button>
        <GitBranch size={15} />
        <span>{gitStatus?.isGitRepo ? gitStatus.branch : "main"}</span>
        {gitStatus?.error ? <span className="repo-error">{gitStatus.error}</span> : null}
      </section>

      <section className="main-grid">
        <aside className="tasks-panel panel">
          <div className="panel-header">
            <h2>{t("projects.title")}</h2>
            <div className="header-actions">
              <button className="small-button text-button" type="button" onClick={addTask}>
                <Plus size={16} />
                {t("tasks.new")}
              </button>
              <button className="small-button" type="button" aria-label={t("projects.add")} onClick={selectRepository}>
                <FolderPlus size={16} />
              </button>
              <button className="small-button" type="button" aria-label={t("tasks.filter")}>
                <Filter size={16} />
              </button>
              <button className="small-button" type="button" aria-label={t("tasks.search")} onClick={() => setShowSearch((value) => !value)}>
                <Search size={16} />
              </button>
            </div>
          </div>

          {showSearch ? <input className="task-search" autoFocus placeholder={t("tasks.searchPlaceholder")} /> : null}

          <div className="project-tree">
            {projectTree.length > 0 ? (
              projectTree.map(({ project, tasks: projectTasks }) => {
                const expanded = expandedProjectPaths.has(project.repoPath);
                const visibleProjectTasks = expanded ? projectTasks : projectTasks.slice(0, 5);
                const hiddenTaskCount = Math.max(0, projectTasks.length - visibleProjectTasks.length);
                const activeProject = project.repoPath === activeProjectPath;

                return (
                  <section key={project.repoPath} className={`project-group ${activeProject ? "active" : ""}`}>
                    <button className="project-row" type="button" onClick={() => void activateRepository(project.repoPath)}>
                      {activeProject ? <FolderOpen size={17} /> : <Folder size={17} />}
                      <span>{project.name}</span>
                      <small>{projectTasks.length}</small>
                    </button>

                    <div className="project-task-list">
                      {visibleProjectTasks.length > 0 ? (
                        visibleProjectTasks.map((task) => (
                          <button
                            key={task.id}
                            className={`project-task-row ${task.id === activeTaskId ? "active" : ""} ${task.status}`}
                            type="button"
                            onClick={() => void selectTask(task)}
                          >
                            <span>{task.title}</span>
                            <time>{taskAgeLabel(task)}</time>
                          </button>
                        ))
                      ) : (
                        <div className="project-empty">{t("projects.noTasks")}</div>
                      )}

                      {hiddenTaskCount > 0 ? (
                        <button
                          className="project-more"
                          type="button"
                          onClick={() => setExpandedProjectPaths((current) => new Set([...current, project.repoPath]))}
                        >
                          {t("projects.showMore", { count: hiddenTaskCount })}
                        </button>
                      ) : null}
                    </div>
                  </section>
                );
              })
            ) : (
              <div className="project-empty-panel">
                <strong>{t("projects.emptyTitle")}</strong>
                <span>{t("projects.emptyDescription")}</span>
                <button className="small-button text-button" type="button" onClick={selectRepository}>
                  <FolderPlus size={16} />
                  {t("projects.add")}
                </button>
              </div>
            )}
          </div>
        </aside>

        <section className="execution-panel panel">
          <div className="panel-header execution-header">
            <h2>{t("feed.title")}</h2>
            <div className="header-actions">
              <span className="live-pill">
                <span />
                {t("feed.live")}
              </span>
              <button className="small-button text-only" type="button" onClick={() => setLiveEvents([])}>
                {t("feed.clear")}
              </button>
              <button className="small-button" type="button" aria-label="More">
                <MoreVertical size={16} />
              </button>
            </div>
          </div>

          <div className="timeline">
            {renderedTimeline.length > 0 ? (
              renderedTimeline.map((item) => <TimelineRow key={item.id} item={item} />)
            ) : (
              <div className="timeline-empty">{t("feed.noEvents")}</div>
            )}
            {pendingTestApproval ? (
              <TestApprovalCard
                approval={pendingTestApproval}
                disabled={isRunning}
                approveLabel={t("approval.approve")}
                runningLabel={t("approval.running")}
                onApprove={() => void approveTestRun()}
              />
            ) : null}
          </div>

          <div className="agent-composer">
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t("composer.askPlaceholder")} />
            <button type="button" aria-label="@ mention">
              <AtSign size={15} />
            </button>
            <button type="button" aria-label="Slash command">
              <Slash size={15} />
            </button>
            <button className="send-button" type="button" onClick={isRunning ? stopRun : startRun}>
              {isRunning ? <Square size={14} /> : <Send size={15} />}
            </button>
          </div>
        </section>

        <aside className="inspector-panel panel">
          <div className="tabs">
            <button className={rightTab === "diff" ? "active" : ""} type="button" onClick={() => setRightTab("diff")}>
              {t("diff.title")}
            </button>
            <button className={rightTab === "github" ? "active" : ""} type="button" onClick={() => setRightTab("github")}>
              GitHub
            </button>
          </div>

          <div className="inspector-scroll">
            {rightTab === "diff" ? (
              <>
                <h3>{t("diff.changes", { count: visibleChangedFiles.length })}</h3>
                <div className="diff-card">
                  <div className="diff-file-header">
                    <FileCode2 size={15} />
                    <strong>{selectedDiffFile.path}</strong>
                    <button
                      className={`review-toggle ${selectedReviewStatus}`}
                      type="button"
                      disabled={!gitStatus?.isGitRepo}
                      onClick={() => void setSelectedFileReviewStatus(selectedReviewStatus === "reviewed" ? "unreviewed" : "reviewed")}
                    >
                      {selectedReviewStatus === "reviewed" ? <Check size={13} /> : <Circle size={13} />}
                      {selectedReviewStatus === "reviewed" ? t("review.markUnreviewed") : t("review.markReviewed")}
                    </button>
                    <ChevronDown size={15} />
                  </div>
                  {isDiffLoading ? <div className="diff-state">{t("diff.loading")}</div> : null}
                  {fileDiff?.error ? <div className="diff-state error">{fileDiff.error}</div> : null}
                  {fileDiff?.isBinary ? <div className="diff-state">{t("diff.binary")}</div> : null}
                  {fileDiff?.isTooLarge ? <div className="diff-state">{t("diff.truncated")}</div> : null}
                  {!isDiffLoading && !fileDiff?.error && !fileDiff?.isBinary && displayedDiffLines.length === 0 ? (
                    <div className="diff-state">{t("diff.empty")}</div>
                  ) : null}
                  <div className="code-diff">
                    {displayedDiffLines.map((line, index) => (
                      <div key={`${line.oldLineNumber ?? ""}-${line.newLineNumber ?? ""}-${index}`} className={`code-line ${line.tone}`}>
                        <span>{line.tone === "meta" || line.tone === "hunk" ? "" : line.oldLineNumber ?? ""}</span>
                        <span>{line.tone === "meta" || line.tone === "hunk" ? "" : line.newLineNumber ?? ""}</span>
                        <code>{line.text}</code>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="changed-file-list">
                  {visibleChangedFiles.map((file) => {
                    const reviewStatus = reviewByPath.get(file.path)?.status ?? "unreviewed";

                    return (
                      <button
                        key={file.path}
                        className={`changed-file-row ${file.path === selectedDiffFile.path ? "active" : ""}`}
                        type="button"
                        onClick={() => setSelectedDiffPath(file.path)}
                      >
                        <span>
                          <FileText size={14} />
                          {file.path}
                        </span>
                        <small>
                          <span className={`file-review-pill ${reviewStatus}`}>
                            {reviewStatus === "reviewed" ? <Check size={12} /> : <Circle size={12} />}
                            {t(`review.${reviewStatus}`)}
                          </span>
                          <span className="change-add">+{file.additions}</span>
                          <span className="change-del">-{file.deletions}</span>
                          <ChevronDown size={14} />
                        </small>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <section className="github-section">
              <h3>GitHub</h3>
              <div className="branch-line">
                <GitBranch size={22} />
                <div>
                  <span>{t("github.branch")} {branchLabel}</span>
                  <small>{aheadBehindLabel}</small>
                </div>
              </div>

              <div className="check-card">
                <CheckCircle2 size={20} />
                <div>
                  <strong>{t("github.checksPassing")}</strong>
                  <span>{t("github.allChecksPassed")}</span>
                </div>
                <button type="button">{t("github.details")}</button>
              </div>

              <div className="check-card">
                <CheckCircle2 size={20} />
                <div>
                  <strong>{t("github.noConflicts")}</strong>
                  <span>{t("github.lastFetched")}</span>
                </div>
                <button type="button">{t("github.refresh")}</button>
              </div>

              <div className={`check-card review-gate ${allChangedFilesReviewed ? "ready" : "blocked"}`}>
                {allChangedFilesReviewed ? <CheckCircle2 size={20} /> : <CircleDot size={20} />}
                <div>
                  <strong>{allChangedFilesReviewed ? t("review.allReviewed") : t("review.needsReview")}</strong>
                  <span>{t("review.progress", { reviewed: reviewedChangedCount, total: totalChangedFiles })}</span>
                </div>
              </div>

              {resultApprovalError ? <div className="review-error">{resultApprovalError}</div> : null}

              <button className="approve-result-main" type="button" disabled={!canApproveResult} onClick={() => void approveResult()}>
                <CheckCircle2 size={17} />
                {isApprovingResult ? t("review.approving") : t("review.approveResult")}
              </button>
              {activeTask?.status === "review" && !canApproveResult ? <div className="review-hint">{t("review.approveBlocked")}</div> : null}

              <div className="commit-preview">
                <div className="commit-preview-header">
                  <div>
                    <strong>{t("commit.title")}</strong>
                    <span>{t("commit.subtitle")}</span>
                  </div>
                  <span className={`commit-state ${isCommitDraftSaved ? "saved" : "draft"}`}>
                    {isCommitDraftSaved ? t("commit.saved") : t("commit.draft")}
                  </span>
                </div>

                <label className="commit-field">
                  <span>{t("commit.subject")}</span>
                  <input
                    value={commitSubject}
                    maxLength={160}
                    disabled={Boolean(taskCommit)}
                    onChange={(event) => {
                      setCommitSubject(event.target.value);
                      setCommitDraftError(undefined);
                      setCommitDraftSavedAt(undefined);
                    }}
                    placeholder={t("commit.subjectPlaceholder")}
                  />
                </label>

                <label className="commit-field">
                  <span>{t("commit.body")}</span>
                  <textarea
                    value={commitBody}
                    rows={8}
                    disabled={Boolean(taskCommit)}
                    onChange={(event) => {
                      setCommitBody(event.target.value);
                      setCommitDraftError(undefined);
                      setCommitDraftSavedAt(undefined);
                    }}
                    placeholder={t("commit.bodyPlaceholder")}
                  />
                </label>

                <div className="commit-actions">
                  <button className="save-draft-button" type="button" disabled={!canSaveCommitDraft} onClick={() => void saveCommitDraft()}>
                    <Save size={15} />
                    {isCommitDraftSaving ? t("commit.saving") : t("commit.saveDraft")}
                  </button>
                  <button
                    className={`commit-locked-button ${canCommitTask ? "ready" : ""} ${taskCommit ? "committed" : ""}`}
                    type="button"
                    disabled={!canCommitTask}
                    onClick={() => setShowCommitDialog(true)}
                  >
                    {taskCommit ? <CheckCircle2 size={15} /> : canCommitTask ? <GitBranch size={15} /> : <Lock size={15} />}
                    {taskCommit ? t("commit.committed") : canCommitTask ? t("commit.commitChanges") : t("commit.commitLocked")}
                  </button>
                </div>

                {commitDraftError ? <div className="commit-error">{commitDraftError}</div> : null}
                {commitTaskError ? <div className="commit-error">{commitTaskError}</div> : null}
                {commitDraftSavedAt ? <div className="commit-success">{t("commit.savedAt")}</div> : null}
                {taskCommit ? <div className="commit-success">{t("commit.committedSha", { sha: taskCommit.commitSha.slice(0, 7) })}</div> : null}
                <div className="commit-hint">
                  {taskCommit ? t("commit.committedHint") : activeTask?.status === "done" ? t("commit.readyHint") : t("commit.reviewHint")}
                </div>
              </div>

              {prStatus === "created" ? <div className="pr-created">{t("github.prReady")}</div> : null}

              <button className="create-pr-main" type="button" disabled={!canCreatePr} onClick={() => setPrStatus("created")}>
                <GitPullRequest size={17} />
                {t("actions.createPr")}
              </button>
            </section>
          </div>
        </aside>
      </section>

      <footer className="statusbar">
        <div>
          <span>
            <Play size={13} /> 3 {t("status.running")}
          </span>
          <span>
            <CircleDot size={13} /> 0 {t("status.blocked")}
          </span>
        </div>
        <div>
          <span>UTF-8</span>
          <span>LF</span>
          <span>TypeScript</span>
          <span>
            <Check size={14} /> Prettier
          </span>
          <MoreVertical size={15} />
        </div>
      </footer>

      {showCommitDialog ? (
        <div className="modal-backdrop" role="presentation">
          <section className="commit-dialog" role="dialog" aria-modal="true" aria-labelledby="commit-dialog-title">
            <div className="commit-dialog-header">
              <div>
                <h2 id="commit-dialog-title">{t("commit.confirmTitle")}</h2>
                <p>{t("commit.confirmDescription", { count: totalChangedFiles })}</p>
              </div>
              <button className="dialog-icon-button" type="button" aria-label={t("commit.cancel")} onClick={() => setShowCommitDialog(false)}>
                <X size={17} />
              </button>
            </div>

            <div className="commit-dialog-summary">
              <span>{t("commit.subject")}</span>
              <strong>{trimmedCommitSubject}</strong>
            </div>

            {commitTaskError ? <div className="commit-error">{commitTaskError}</div> : null}

            <div className="dialog-actions">
              <button className="dialog-secondary" type="button" disabled={isCommittingTask} onClick={() => setShowCommitDialog(false)}>
                {t("commit.cancel")}
              </button>
              <button className="dialog-primary" type="button" disabled={isCommittingTask} onClick={() => void commitReviewedChanges()}>
                <GitBranch size={16} />
                {isCommittingTask ? t("commit.committing") : t("commit.confirmCommit")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
