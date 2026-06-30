# Parallel Team Tasks

Current master roadmap: `docs/FINAL_PRODUCT_PLAN.md`.

## Active Phase: GitHub Integration

- Current stage: GitHub Integration.
- Completed stage: Git commit flow is implemented and verified by local build/type/i18n/test checks.
- Add persistent per-file review state for changed files.
- Gate task approval on reviewed files.
- Persist editable commit draft preview.
- Keep multiple local projects open in the left workspace rail.
- Add reject/revert proposal UI behind explicit approval.
- Add GitHub auth MVP.
- Detect remote repository and current branch push target.
- Push approved commit to GitHub.
- Create draft PR with task summary, verification, run ID, and model metadata.
- Keep commit and PR actions behind explicit approval.
- Keep the approved desktop cockpit design intact.
- Preserve localization coverage for `ru/en/es/pt-BR`.

## Track A: Desktop Shell

- Build app layout: sidebar, task board, execution feed, diff inspector.
- Add repo picker and settings panel.
- Add keyboard-friendly task composer.
- Add local state persistence.

## Track B: Agent Runtime

- Implement Python event emitter.
- Add provider adapter interface.
- Add shell command tool with allow/deny policy.
- Add Git diff and test execution tools.

## Track C: Git/GitHub

- Detect repo remote, branch, dirty state.
- Implement branch creation and commit flow.
- Add GitHub auth MVP.
- Create draft PR from approved diff.

## Track D: Localization

- Maintain `ru/en/es/pt-BR` dictionaries.
- Run missing-key checks in CI.
- Review copy quality before release.

## Track E: Packaging

- Configure electron-builder.
- Produce macOS and Windows dev builds.
- Prepare signing/notarization checklist.
- Add auto-update research after MVP.

## Track F: Safety And QA

- Define command approval policy.
- Add event schema tests.
- Add UI smoke tests.
- Add prompt injection and destructive-operation eval cases.
