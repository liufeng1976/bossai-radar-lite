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

const installGuide = `BossAI Radar Lite v${version}\n\nWindows:\n1. Extract this archive.\n2. Double-click start-radar.cmd.\n\nCommand line:\n1. npm ci\n2. Copy .env.example to .env\n3. npm start\n\nDashboard: http://127.0.0.1:3080\n\nLicense: non-commercial use only. Commercial use requires written BossAI authorization.\n`;
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
