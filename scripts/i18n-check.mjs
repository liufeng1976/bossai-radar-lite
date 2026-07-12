import { readFile } from "node:fs/promises";
import { dictionaries } from "../public/i18n.js";

const files = [
  "public/index.html",
  "public/commercial.html",
  "public/leads.html",
  "public/app.js",
  "public/commercial.js",
  "public/leads.js",
];

const usedKeys = new Set();
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const pattern of [
    /data-i18n="([^"]+)"/g,
    /data-i18n-placeholder="([^"]+)"/g,
    /data-i18n-aria-label="([^"]+)"/g,
    /\bt\("([^"]+)"/g,
  ]) {
    for (const match of content.matchAll(pattern)) usedKeys.add(match[1]);
  }
}

const languages = ["zh", "en"];
const errors = [];
for (const language of languages) {
  const dictionary = dictionaries[language];
  if (!dictionary) {
    errors.push(`Missing dictionary: ${language}`);
    continue;
  }
  for (const key of usedKeys) {
    if (!(key in dictionary)) errors.push(`Missing ${language} translation: ${key}`);
  }
}

const zhKeys = new Set(Object.keys(dictionaries.zh || {}));
const enKeys = new Set(Object.keys(dictionaries.en || {}));
for (const key of zhKeys) if (!enKeys.has(key)) errors.push(`English dictionary missing key: ${key}`);
for (const key of enKeys) if (!zhKeys.has(key)) errors.push(`Chinese dictionary missing key: ${key}`);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`i18n check passed: ${usedKeys.size} used keys, ${zhKeys.size} bilingual dictionary entries.`);
