import type { AgentEvent } from "@ai-dev/shared";
import type { ChangedFile, TaskCard } from "../types";

export const seedTasks: TaskCard[] = [
  {
    id: "task_1",
    title: "Scaffold Electron desktop shell",
    repo: "ai-developer-desktop",
    status: "running",
    model: "gpt-5-codex",
    updatedAt: "2 min ago"
  },
  {
    id: "task_2",
    title: "Add GitHub draft PR flow",
    repo: "ai-developer-desktop",
    status: "queued",
    model: "claude-sonnet",
    updatedAt: "12 min ago"
  },
  {
    id: "task_3",
    title: "Check localization coverage",
    repo: "ai-developer-desktop",
    status: "review",
    model: "gpt-5-mini",
    updatedAt: "34 min ago"
  }
];

export const seedEvents: AgentEvent[] = [
  {
    id: "evt_seed_1",
    runId: "run_seed",
    type: "task.started",
    ts: new Date().toISOString(),
    message: "Connected local repository and prepared agent workspace."
  },
  {
    id: "evt_seed_2",
    runId: "run_seed",
    type: "tool.call",
    ts: new Date().toISOString(),
    message: "git status --short",
    payload: { tool: "shell", risk: "read-only" }
  },
  {
    id: "evt_seed_3",
    runId: "run_seed",
    type: "assistant.delta",
    ts: new Date().toISOString(),
    message: "Planning desktop MVP files, agent bridge, and localization gate."
  }
];

export const seedChangedFiles: ChangedFile[] = [
  { path: "apps/desktop/src/App.tsx", status: "modified", additions: 184, deletions: 0 },
  { path: "agent/ai_dev_agent/runtime.py", status: "added", additions: 91, deletions: 0 },
  { path: "docs/ARCHITECTURE.md", status: "added", additions: 120, deletions: 0 }
];

