# Security Model

## Desktop Security

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- Preload exposes only an allowlisted API.
- Renderer never receives raw secrets.

## Agent Security

- Agent runs as a child process.
- Agent loop has max steps, max runtime, and stop conditions.
- Tool arguments are validated before execution.
- Destructive tools require user approval.
- Logs redact secrets and tokens.

## Secret Handling

MVP may read local environment variables during development, but production should use:

- macOS Keychain;
- Windows Credential Manager;
- encrypted local settings metadata without raw secret values.

## High-Risk Actions

Require explicit confirmation:

- deleting files;
- force pushing;
- rebasing public branches;
- running install scripts from untrusted repos;
- modifying files outside selected repo;
- changing credentials or Git remotes.

## Prompt Injection

- Treat repo files and user-provided text as untrusted.
- Do not let retrieved or repository text override system instructions.
- Keep permissions in code, not prompts.
- Show tool calls before risky execution.

