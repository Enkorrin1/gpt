# Localization

Supported locales:

- `ru`
- `en`
- `es`
- `pt-BR`

## Rule

Every delivered UI feature must include strings in all supported locales before release.

## Files

```txt
apps/desktop/src/locales/en.json
apps/desktop/src/locales/ru.json
apps/desktop/src/locales/es.json
apps/desktop/src/locales/pt-BR.json
```

## Check

```bash
npm run i18n:check
```

The check fails when:

- a key exists in one locale but not another;
- a locale file is missing;
- JSON is invalid.

## Copy Guidelines

- Keep developer UI concise.
- Prefer action verbs for buttons.
- Do not expose implementation jargon unless useful to developers.
- Avoid changing keys without updating all locales.

