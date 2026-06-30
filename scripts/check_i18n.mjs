import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const locales = ["en", "ru", "es", "pt-BR"];
const localeDir = resolve("apps/desktop/src/locales");

function flatten(value, prefix = "") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return flatten(nested, next);
  });
}

const keysByLocale = new Map();

for (const locale of locales) {
  const file = resolve(localeDir, `${locale}.json`);
  const content = JSON.parse(readFileSync(file, "utf8"));
  keysByLocale.set(locale, new Set(flatten(content)));
}

const allKeys = new Set([...keysByLocale.values()].flatMap((keys) => [...keys]));
let failed = false;

for (const locale of locales) {
  const keys = keysByLocale.get(locale);
  const missing = [...allKeys].filter((key) => !keys.has(key));

  if (missing.length > 0) {
    failed = true;
    console.error(`Missing ${missing.length} keys in ${locale}:`);
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(`i18n ok: ${allKeys.size} keys across ${locales.length} locales`);

