# Release Checklist

## Before Every Release

- `npm run typecheck`
- `npm run test`
- `npm run i18n:check`
- `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest agent/tests`
- Manual smoke test on macOS.
- Manual smoke test on Windows.

## Required Gates

- All delivered UI strings localized to `ru/en/es/pt-BR`.
- No real secrets in source files.
- Desktop security flags enabled.
- Agent risky actions require confirmation.
- Installer generated for both target platforms.

## Packaging

```bash
npm run package
```

Code signing and notarization are required before public beta.
