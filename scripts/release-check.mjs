import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "LICENSE",
  ".npmignore",
  "README.md",
  "README_EN.md",
  "CHANGELOG.md",
  "NOTICE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "AGENT_INSTALL.md",
  "AGENTS.md",
  "CLAUDE.md",
  "agent-install.json",
  "docs/COMMERCIAL_LICENSE.md",
  "docs/COMMERCIAL_LICENSE_EN.md",
  "docs/LITE_VS_PRO.md",
  "docs/LITE_VS_PRO_EN.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/LEAD_PRIVACY.md",
  "docs/LEAD_PRIVACY_EN.md",
  "docs/FOLLOWUP_GUIDE.md",
  "docs/FOLLOWUP_GUIDE_EN.md",
  "docs/AGENT_INTEGRATION.md",
  "docs/AGENT_INTEGRATION_EN.md",
  "docs/RELEASE_NOTES_v0.7.1.md",
  "docs/assets/social-preview.svg",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  "public/commercial.html",
  "public/leads.html",
  "public/leads.js",
  "public/i18n.js",
  "skills/bossai-radar/SKILL.md",
  "skills/bossai-radar/agents/openai.yaml",
  "skills/openclaw/bossai-radar/SKILL.md",
  "skills/hermes/bossai-radar/SKILL.md",
  "integrations/mcp/stdio-config.json.example",
  "integrations/mcp/codex-config.toml.example",
  "scripts/install-agent-skill.mjs",
  "scripts/agent-bootstrap.mjs",
  "scripts/radar-service.mjs",
  "src/leads.ts",
  "src/followups.ts",
  "src/radar-api-client.ts",
  "src/mcp.ts",
  "src/mcp-server.ts",
  "src/agent-cli.ts",
  "src/local-env.ts",
  "dist/src/server.js",
  "dist/src/followups.js",
  "dist/src/radar-api-client.js",
  "dist/src/mcp.js",
  "dist/src/mcp-server.js",
  "dist/src/agent-cli.js",
  "dist/src/local-env.js",
  "dist/public/index.html",
  "dist/public/commercial.html",
  "dist/public/leads.html",
  "dist/public/leads.js",
  "dist/public/i18n.js",
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
const commercialPage = await readFile("public/commercial.html", "utf8");
const readme = await readFile("README.md", "utf8");
const readmeEnglish = await readFile("README_EN.md", "utf8");
const license = await readFile("LICENSE", "utf8");
const installManifest = JSON.parse(await readFile("agent-install.json", "utf8"));

if (installManifest.version !== packageJson.version) {
  failures.push("agent-install.json and package.json versions do not match");
}
if (packageJson.bin?.["bossai-radar-install"] !== "scripts/agent-bootstrap.mjs") {
  failures.push("package.json must expose the bossai-radar-install bin");
}
if (!readme.includes("npx -y github:liufeng1976/bossai-radar-lite") || !readmeEnglish.includes("npx -y github:liufeng1976/bossai-radar-lite")) {
  failures.push("Chinese and English READMEs must expose the GitHub self-install command");
}
if (!versionSource.includes(`APP_VERSION = "${packageJson.version}"`)) {
  failures.push("package.json and src/version.ts versions do not match");
}
if (!dashboard.includes(`v${packageJson.version}`)) {
  failures.push("dashboard footer version does not match package.json");
}
if (!commercialPage.includes(`v${packageJson.version}`)) {
  failures.push("commercial page version does not match package.json");
}
if (!readme.includes("README_EN.md") || !readmeEnglish.includes("README.md")) {
  failures.push("Chinese and English READMEs must link to each other");
}
if (!/source-available/i.test(readme)) {
  failures.push("README must describe the license as source-available");
}
if (/\bopen[- ]source\b/i.test(readme)) {
  failures.push("README must not call the non-commercial license open source");
}
if (!/source-available non-commercial/i.test(readmeEnglish)) {
  failures.push("English README must describe the source-available non-commercial license");
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
