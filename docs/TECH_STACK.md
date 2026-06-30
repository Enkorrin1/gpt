# Tech Stack

## Recommended MVP Stack

```txt
Desktop shell: Electron + React + Vite + TypeScript
Agent runtime: Python 3.12+
Event stream: JSONL over local sidecar stdout
Local DB: SQLite
Git: native git CLI
GitHub: OAuth/PAT for MVP, GitHub App later
Diff/code: Monaco Editor later, text diff in first skeleton
Packaging: electron-builder
Tests: Vitest, Playwright, pytest
Localization: i18next-compatible JSON dictionaries
```

## Why Electron First

Electron is the fastest path for a rich cross-platform MVP:

- one UI codebase for macOS and Windows;
- mature local process handling;
- easy integration with Node APIs, Git, Python sidecar, file dialogs, and installers;
- large ecosystem for updates, code signing, keychain, and desktop UX.

Tauri remains a possible post-MVP option if app size and memory become the main constraint.

## Platform Notes

### macOS

- `.app` and `.dmg` builds.
- Code signing and notarization before beta.
- Keychain storage for provider and GitHub secrets.
- Extra care around filesystem permissions.

### Windows

- `.exe` installer.
- Code signing to reduce SmartScreen friction.
- PowerShell and Git path compatibility.
- Credential Manager storage for secrets.

