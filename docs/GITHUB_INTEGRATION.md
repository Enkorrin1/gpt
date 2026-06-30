# GitHub Integration

## MVP

Use a local token/OAuth flow to:

- identify the remote repository;
- list recent PRs later;
- push a task branch;
- create a draft PR;
- show PR URL and status.

## Post-MVP

Move from token-only auth to a GitHub App:

- least-privilege repo permissions;
- better organization installation flow;
- webhooks for checks and PR updates;
- cleaner enterprise story.

## Branch Flow

1. Detect default branch.
2. Create task branch:
   `ai-dev/<task-slug>`
3. Commit approved changes.
4. Push branch.
5. Open draft PR.
6. Store PR URL in local task run.

## PR Body Template

```md
## Summary

- ...

## Verification

- ...

## Agent Trace

Run ID: ...
Model: ...
```

