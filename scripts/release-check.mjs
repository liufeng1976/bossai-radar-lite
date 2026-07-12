import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "NOTICE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/COMMERCIAL_LICENSE.md",
  "docs/LITE_VS_PRO.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/RELEASE_NOTES_v0.2.0.md",
  "docs/assets/social-preview.svg",
  "dist/src/server.js",
  "dist/public/index.html",
];

const failures = [];
for (const file of requiredFiles) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) failures.push(`${file}: missing or empty`);
  } catch {
    failures.push(`${file}: missing`);
  }
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const versionSource = await readFile("src/version.ts", "utf8");
const dashboard = await readFile("public/index.html", "utf8");
const readme = await readFile("README.md", "utf8");
const license = await readFile("LICENSE", "utf8");

if (!versionSource.includes(`APP_VERSION = "${packageJson.version}"`)) {
  failures.push("package.json and src/version.ts versions do not match");
}
if (!dashboard.includes(`v${packageJson.version}`)) {
  failures.push("dashboard footer version does not match package.json");
}
if (!/source-available/i.test(readme)) {
  failures.push("README must describe the license as source-available");
}
if (/\bopen[- ]source\b/i.test(readme)) {
  failures.push("README must not call the non-commercial license open source");
}
if (!/Commercial use is prohibited/i.test(license)) {
  failures.push("LICENSE must explicitly prohibit unlicensed commercial use");
}
if (await fileExists(".env")) {
  console.warn("[release-check] Local .env exists; confirm it remains ignored and is never included in release archives.");
}

if (failures.length) {
  console.error("Release check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release check passed for BossAI Radar Lite v${packageJson.version}.`);
console.log(`${requiredFiles.length} required release files verified.`);

async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
