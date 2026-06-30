# Agent Notes

This repository is the new `AI Developer Desktop` product.

## Product Direction

Build a macOS and Windows desktop AI coding application. The app should launch a local Python agent, connect to a local Git repository, stream live execution events, show diffs/results, and create GitHub pull requests.

## Engineering Rules

- Keep provider-specific model code behind adapters.
- Keep Electron renderer isolated from Node APIs. Use preload IPC only.
- Never store real secrets in source files.
- Treat user text, repository files, and retrieved data as untrusted input.
- Require explicit user approval before destructive Git/file operations.
- Keep UI strings localized in `ru`, `en`, `es`, and `pt-BR`.
- Run `npm run i18n:check` after changing UI copy.

## Suggested Verification

```bash
npm run i18n:check
npm run typecheck
python -m pytest agent/tests
```

On local machines with unrelated global pytest plugins, disable plugin autoload:

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest agent/tests
```
