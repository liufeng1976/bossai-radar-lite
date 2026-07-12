import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const version = packageJson.version;
const releaseDir = path.resolve("release");
const stageDir = path.join(releaseDir, ".staging");
const packageName = `bossai-radar-lite-v${version}`;
const packageRoot = path.join(stageDir, packageName);

await rm(releaseDir, { recursive: true, force: true });
await mkdir(packageRoot, { recursive: true });

const includePaths = [
  "dist",
  "docs/COMMERCIAL_LICENSE.md",
  "docs/COMMERCIAL_LICENSE_EN.md",
  "docs/LITE_VS_PRO.md",
  "docs/LITE_VS_PRO_EN.md",
  "docs/LEAD_PRIVACY.md",
  "docs/LEAD_PRIVACY_EN.md",
  "docs/FOLLOWUP_GUIDE.md",
  "docs/FOLLOWUP_GUIDE_EN.md",
  "docs/AGENT_INTEGRATION.md",
  "docs/AGENT_INTEGRATION_EN.md",
  "docs/RELEASE_NOTES_v0.7.0.md",
  "integrations",
  "skills",
  "scripts/install-agent-skill.mjs",
  "scripts/agent-bootstrap.mjs",
  "scripts/radar-service.mjs",
  "AGENT_INSTALL.md",
  "AGENTS.md",
  "CLAUDE.md",
  "agent-install.json",
  ".env.example",
  "CHANGELOG.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "README_EN.md",
  "SECURITY.md",
  "package.json",
  "package-lock.json",
  "start-radar.cmd",
];

for (const source of includePaths) {
  await cp(source, path.join(packageRoot, source), { recursive: true, force: true });
}

const installGuide = `BossAI Radar Lite v${version}\n\nAgent self-install:\n- Give the GitHub repository to OpenClaw, Hermes, Claude Code, or Codex.\n- Read AGENT_INSTALL.md and agent-install.json.\n- From this extracted package: node scripts/agent-bootstrap.mjs --agent <agent>\n\nWindows manual start:\n1. Extract this archive.\n2. Double-click start-radar.cmd.\n\nService management:\n- npm run service:status\n- npm run service:start\n- npm run service:restart\n- npm run service:stop\n\nDashboard: http://127.0.0.1:3080\nCommercial application: http://127.0.0.1:3080/commercial.html\nLead workspace: http://127.0.0.1:3080/leads.html\n\nAgent access:\n- MCP: node dist/src/mcp-server.js\n- JSON CLI: node dist/src/agent-cli.js overview\n- Self-install guide: AGENT_INSTALL.md\n- Integration guide: docs/AGENT_INTEGRATION.md\n\nLead data is stored in data/radar-lite.sqlite. Protect the file and RADAR_ADMIN_API_KEY.\n\nLicense: non-commercial use only. Commercial use requires written BossAI authorization.\n`;
await writeFile(path.join(packageRoot, "INSTALL.txt"), installGuide, "utf8");

const tarName = `${packageName}-runtime.tar.gz`;
const tarPath = path.join(releaseDir, tarName);
run("tar", ["-czf", tarName, "-C", ".staging", packageName], { cwd: releaseDir });

const assets = [tarPath];
const zipPath = path.join(releaseDir, `${packageName}-windows.zip`);
if (process.platform === "win32") {
  const sourceGlob = path.join(packageRoot, "*");
  const command = `Compress-Archive -Path '${escapePowerShell(sourceGlob)}' -DestinationPath '${escapePowerShell(zipPath)}' -Force`;
  run("powershell.exe", ["-NoProfile", "-Command", command]);
  assets.push(zipPath);
} else {
  run("zip", ["-qr", zipPath, packageName], { cwd: stageDir });
  assets.push(zipPath);
}

const checksumLines = [];
for (const asset of assets) {
  const bytes = await readFile(asset);
  checksumLines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${path.basename(asset)}`);
}
await writeFile(path.join(releaseDir, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`, "utf8");
await rm(stageDir, { recursive: true, force: true });

console.log(`Release packages created for v${version}:`);
for (const asset of assets) console.log(`- ${path.relative(process.cwd(), asset)}`);
console.log("- release/SHA256SUMS.txt");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function escapePowerShell(value) {
  return value.replaceAll("'", "''");
}
