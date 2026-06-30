# Final Product Development Plan

## Product Target

AI Developer Desktop is a macOS and Windows desktop coding agent app. The final product should let a developer connect a local repository, create coding tasks, run a local AI agent, inspect every action in a live execution feed, review diffs, run tests, and publish approved work to GitHub as a draft pull request.

The core product loop:

```txt
Connect repo -> create task -> agent plans -> tools run -> files change -> tests run -> diff review -> commit -> GitHub PR
```

## Design Target

The approved visual direction is the desktop cockpit in `docs/assets/desktop-cockpit-reference.png`.

Final UI quality bar:

- Dense, calm developer-tool workspace.
- Three persistent work regions: tasks, execution, diff/GitHub inspector.
- No marketing pages inside the product shell.
- Every visible control has a real state or a clear disabled/loading state.
- Dark editor-inspired visual system with restrained blue, green, red, yellow, and purple status colors.
- macOS and Windows window controls feel native enough for MVP while remaining custom-branded.

## Architecture Target

```txt
React renderer
  -> typed preload bridge
  -> Electron main local backend
    -> Git service
    -> Task/run persistence
    -> Python agent sidecar
    -> GitHub service
    -> Provider/secret settings
Python agent
  -> model provider adapters
  -> tool registry
  -> command/file/git/test tools
  -> JSONL event stream
```

## Phase 1: Local Workspace Foundation

Goal: Replace static cockpit chrome with real local repository state.

Deliverables:

- Real Git repository detection.
- Branch, upstream, dirty state, ahead/behind, changed files.
- Repo picker updates app state.
- UI preserves approved visual design while showing real repo data.
- Typed shared contracts between renderer, preload, and main.

Acceptance criteria:

- Selecting a repo updates repository name/path, branch, connection state, and changed files.
- Non-Git folders show a friendly invalid state.
- `npm run build`, `npm run test`, `npm run i18n:check`, and `npm audit` pass.

## Phase 2: Task And Run Backend

Goal: Tasks become durable local product objects instead of mock cards.

Deliverables:

- SQLite local store.
- Task CRUD.
- Run records.
- Run event persistence.
- Task states: queued, running, review, completed, failed, blocked.
- UI task list backed by local data.

Acceptance criteria:

- App restart keeps repositories, tasks, selected task, and run history.
- Creating a task writes to local DB and appears in the task rail.
- Run events can be replayed from storage.

## Phase 3: Agent Execution MVP

Goal: The Python agent performs bounded, observable local work.

Deliverables:

- Agent command contract with task, repo, model route, permissions, and run ID.
- Tool registry with strict schemas.
- Read-only repo inspection tools.
- Shell command tool with risk classification.
- File edit tool with diff generation.
- Test command runner.
- Stop/cancel support.

Acceptance criteria:

- User can start a task and watch live JSONL events.
- Agent cannot execute destructive operations without explicit approval.
- Final run produces a diff summary and test result.

## Phase 4: Diff Review And Approval

Goal: User can confidently inspect and approve agent changes.

Deliverables:

- Changed files list backed by Git diff.
- Side-by-side or unified diff viewer.
- File review status.
- Revert individual file.
- Commit message generation and editing.
- Approve/reject task result.

Acceptance criteria:

- User can inspect all changed files before committing.
- User can reject or revert changes without terminal use.
- Commit is impossible while the repo is in an unsafe/unreviewed state.

## Phase 5: GitHub Integration

Goal: Approved local changes can become GitHub pull requests.

Deliverables:

- GitHub token/OAuth MVP auth.
- Remote repository detection.
- Branch creation.
- Commit and push.
- Draft PR creation.
- PR URL and status display.
- Checks/conflict refresh.

Acceptance criteria:

- User can create a draft PR from an approved task.
- PR body includes summary, verification, run ID, and model.
- Failed GitHub operations show recoverable errors.

## Phase 6: Provider Routing And Secrets

Goal: Model providers are configurable and safe.

Deliverables:

- Provider adapter interface.
- OpenAI provider.
- Anthropic provider.
- Local/Ollama provider placeholder.
- OS keychain/credential manager integration.
- Model selection UI.
- Cost/latency metadata hooks.

Acceptance criteria:

- Real keys are never stored in source or raw logs.
- User can choose provider/model per task.
- Provider failures appear as recoverable run events.

## Phase 7: Production Hardening

Goal: The app is safe enough for beta users.

Deliverables:

- Command approval policy.
- Prompt injection safety cases.
- Structured eval fixtures for agent behavior.
- Log redaction.
- Crash/error reporting hook.
- App update strategy.
- macOS and Windows packaging.

Acceptance criteria:

- Risky actions require confirmation.
- Agent loop has max steps, max time, and max tool calls.
- Installers build for macOS and Windows.

## Phase 8: Final Visual And UX Completion

Goal: The whole product feels complete, not prototype-like.

Deliverables:

- Onboarding flow.
- Settings screens.
- Empty/loading/error states.
- Keyboard shortcuts and command palette.
- Responsive/narrow-window states.
- Motion polish for panels and execution events.
- Accessibility pass.

Acceptance criteria:

- New user can complete setup without reading docs.
- Every primary control has hover/focus/disabled/loading state.
- Visual QA passes against the approved cockpit direction.

## Team Tracks

- Desktop shell and UI system.
- Electron local backend.
- Python agent runtime.
- Git and diff engine.
- GitHub integration.
- Provider routing and secrets.
- Safety/evals/QA.
- Packaging/release.

## MVP Execution Plan

### Stage 1: Git Commit Flow

Goal: close the local review loop after the user approves agent changes.

Status: implemented for the desktop MVP. Manual end-to-end commit smoke should be run inside a real Git repository before release.

Deliverables:

- Explicit commit approval dialog.
- Backend Git commit execution in Electron main.
- Gate commit on reviewed files, approved task result, and saved commit draft.
- Commit only the reviewed changed files for the active task repository.
- Persist commit result in the local task/run state.
- Recoverable UI errors for missing Git identity, empty commit, conflicts, or unsafe repo state.

### Stage 2: GitHub Integration

Goal: turn approved local commits into draft pull requests.

Status: next stage.

Deliverables:

- GitHub OAuth/token setup.
- Remote repository detection.
- Branch creation and push.
- Draft PR creation with run summary, verification, model, and task metadata.
- PR URL, checks, and conflict status in the inspector.

### Stage 3: Multi-Project Task Workflow

Goal: make work across several repositories first-class.

Deliverables:

- Per-project queue and run history.
- Start, stop, retry, and rerun-with-tests per task.
- Clear blocked/failed/review/done states per project.
- Search/filter across projects and tasks.

### Stage 4: Agent Permissions

Goal: make local automation safe enough for real repositories.

Deliverables:

- Approval cards for risky operations.
- Policy groups for read, write, shell, git, and network actions.
- Revert proposals for changed files.
- Prompt-injection safety handling for repository and retrieved text.

### Stage 5: Settings And Provider Routing

Goal: make model/runtime choices configurable without leaking secrets.

Deliverables:

- Provider adapters for OpenAI, Anthropic, and local/Ollama placeholder.
- API keys stored in OS keychain or credential manager.
- Python runtime diagnostics.
- Default model per project.

### Stage 6: UX Completion

Goal: make the MVP usable by a new developer without reading docs.

Deliverables:

- Onboarding for first project, model setup, and agent runtime check.
- Empty/loading/error states for every primary workflow.
- Command palette and keyboard shortcuts.
- Platform-specific window chrome for macOS and Windows.

### Stage 7: Packaging

Goal: ship installable desktop builds.

Deliverables:

- Windows NSIS installer.
- macOS DMG.
- Signing/notarization checklist.
- Auto-update research after MVP.

## Current Starting Slice

Phase 1 is implemented. Phase 2 has local SQLite task/run storage. Phase 3 has bounded agent inspection and test approval. Phase 4 now has read-only unified diff review, persistent per-file review state, and editable commit draft preparation. The desktop shell also supports a multi-project workspace rail so several local repositories can be kept open side by side.

Completed in Phase 4:

1. Typed file diff contracts.
2. Read-only `git:fileDiff` IPC.
3. Inspector connected to real unified diffs.
4. Persistent file review records for changed files.
5. Approve-result flow that moves reviewed tasks to completed state.
6. Persistent editable commit draft preview generated from the task and changed files.
7. Persistent projects list with tasks grouped by local repository in the left rail.

Continue Phase 4 with:

1. Per-file reject/revert proposal UI behind explicit approval.
2. Explicit commit approval dialog and backend Git commit execution.
3. Commit gating that requires every changed file to be reviewed and the commit draft saved.
4. Verification coverage for the desktop store and approval flow.
5. Keep revert, commit, and PR creation behind explicit approvals.
