# AI Developer Desktop Spec

## 1. Product Summary

`AI Developer Desktop` is a desktop AI coding application for macOS and Windows. It wraps a local Python agent runtime with a polished desktop UI where users can connect a local repository, create coding tasks, watch live execution, inspect file changes, and push results to GitHub.

The goal is to compete with Claude Code and Codex by focusing on a local-first execution cockpit rather than a plain chat wrapper.

## 2. Target User

- Solo developers who want an AI agent to work inside local repositories.
- Small product teams that need visible task progress, diffs, and GitHub PRs.
- Technical founders who want a desktop coding agent without managing a terminal-first workflow.

## 3. Positioning

One sentence:

> A local-first desktop AI coding cockpit that turns tasks into traceable code changes and GitHub pull requests.

Core promise:

- Not just chat.
- Not just terminal output.
- A full loop: task -> agent run -> live trace -> file diff -> tests -> GitHub PR.

## 4. MVP User Journey

1. User opens the desktop app.
2. User selects a local Git repository.
3. User connects an AI provider and GitHub account.
4. User creates a coding task.
5. App starts the local Python agent.
6. Agent streams structured execution events to the UI.
7. User watches logs, tool calls, file changes, and status.
8. User reviews the final diff.
9. User commits changes and creates a GitHub draft PR.

## 5. MVP Functional Requirements

### Repository Connection

- Select a local folder.
- Validate that it is a Git repository.
- Show current branch, dirty status, remote URL, and changed files.
- Block destructive operations unless explicitly approved by the user.

### Task Management

- Create a new task with title, prompt, target repo, model, and priority.
- Show tasks in states: `queued`, `running`, `review`, `done`, `failed`.
- Persist task metadata locally.
- Allow opening the latest run for each task.

### Local Agent Runtime

- Start the Python agent from Electron.
- Pass repo path, task prompt, model route, and run ID.
- Receive newline-delimited JSON events.
- Surface stdout/stderr safely in the UI.
- Stop/cancel an active run.

### Live Execution Feed

- Stream events in real time.
- Support event types:
  - `task.started`
  - `assistant.delta`
  - `tool.call`
  - `tool.result`
  - `command.output`
  - `file.changed`
  - `diff.ready`
  - `task.completed`
  - `task.failed`
- Show timestamps, status, tool names, and compact output previews.

### Diff Review

- Show changed files.
- Show file-level and side-by-side diff.
- Mark files as reviewed.
- Show generated summary and test result.
- Keep user approval separate from agent output.

### GitHub Integration

- Connect GitHub with OAuth/PAT in MVP.
- Detect remote repository.
- Create a branch.
- Commit approved changes.
- Push branch.
- Create a draft PR with generated title/body.
- Show PR URL and basic status.

### Model Routing

- Store provider config outside UI components.
- Support provider adapter interface:
  - OpenAI
  - Anthropic
  - local/Ollama later
- Show active model per task.
- Add cost/latency hooks for later instrumentation.

### Localization

- UI supports `ru`, `en`, `es`, and `pt-BR`.
- Delivered features must include all locale keys.
- Missing keys block release.

## 6. MVP Screens

### Onboarding

- Choose local repo.
- Connect GitHub.
- Configure AI provider.
- Choose language.

### Workspace

- Left: repositories and tasks.
- Center: active execution feed.
- Right: diff/result inspector.
- Top: repo branch, dirty state, active model, run controls.

### Task Composer

- Task title.
- Prompt/details.
- Model selection.
- Safety mode.
- Start button.

### Diff Review

- Changed file list.
- Diff viewer.
- Test result panel.
- Commit message preview.
- Create PR button.

### Settings

- Providers and models.
- GitHub account.
- Agent permissions.
- Locale.
- Storage path.

## 7. Non-Goals For MVP

- Cloud-hosted agents.
- IDE extension.
- Multi-agent orchestration.
- Team collaboration and shared workspaces.
- Enterprise SSO.
- Marketplace plugins.
- Full remote sandbox.
- Automatic production deployment.

## 8. Success Metrics

- User can complete the MVP flow in under 5 minutes after setup.
- Agent run events appear with less than 250 ms UI delay after receipt.
- User can identify changed files without opening terminal.
- User can create a draft PR from the app.
- Localization check passes for every shipped UI string.

## 9. Product Principles

- Local-first: code stays on the user's machine unless explicitly pushed.
- Transparent: every agent action is visible as an event.
- Approval-based: risky actions require user confirmation.
- Provider-flexible: model vendors are adapters, not hard-coded assumptions.
- Practical: optimize for developer workflows, not marketing spectacle.

## 10. Visual Direction

The UI should feel like a high-end desktop developer tool:

- dark neutral editor-inspired base;
- high contrast text;
- compact but readable multi-panel layout;
- calm accent color;
- restrained motion;
- no fake hero sections;
- no product-clone branding;
- clear execution trace and diff-first workflows.

Reference concept: [docs/assets/ui-concept.png](docs/assets/ui-concept.png).

