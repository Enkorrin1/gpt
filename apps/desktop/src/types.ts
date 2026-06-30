import type { AgentEvent } from "@ai-dev/shared";

export type TaskStatus = "queued" | "running" | "review" | "done" | "failed";

export interface TaskCard {
  id: string;
  title: string;
  repo: string;
  status: TaskStatus;
  model: string;
  updatedAt: string;
}

export interface ChangedFile {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
}

export interface RunState {
  runId?: string;
  events: AgentEvent[];
  isRunning: boolean;
}

