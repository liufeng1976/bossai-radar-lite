#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bossAiOs = path.resolve(root, "../bossai-os");
const outputDir = path.join(root, "outputs", "constitution");
const checks = [
  nodeCheck("constitution-integrity", path.join(bossAiOs, "scripts", "constitution-harness.mjs"), ["verify"], bossAiOs),
  pnpmCheck("agent-portfolio", "verify:agent-portfolio", bossAiOs),
  pnpmCheck("merge-boundaries", "verify:merge-boundaries", bossAiOs),
  pnpmCheck("ai-gateway-boundary", "verify:ai-gateway-boundary", bossAiOs),
  pnpmCheck("openapi", "verify:openapi", bossAiOs),
  pnpmCheck("typecheck", "typecheck", bossAiOs),
  nodeCheck("constitutional-preflight", path.join(bossAiOs, "scripts", "constitution-harness.mjs"), [
    "preflight",
    "--file",
    "../bossai-radar-lite/governance/current-batch.preflight.json",
  ], bossAiOs),
  nodeCheck("constitutional-evidence", path.join(bossAiOs, "scripts", "constitution-harness.mjs"), [
    "evidence",
    "--file",
    "../bossai-radar-lite/release/constitutional-evidence.json",
  ], bossAiOs),
  npmCheck("radar-build", "build"),
  npmCheck("radar-tests", "test"),
  npmCheck("frontend-syntax", "check:frontend"),
  npmCheck("i18n", "check:i18n"),
  nodeCheck("bossai-migration-boundary", path.join(root, "scripts", "verify-bossai-migration.mjs"), [], root),
  commandCheck("intelligence-agent-manager-integration", process.env.ComSpec || "cmd.exe", [
    "/d",
    "/s",
    "/c",
    "npm run verify:agent-manager",
  ], path.resolve(root, "../bossai-intelligence-agent")),
  commandCheck("real-entry:radar-intelligence-manager-plugin-v0.1.0", process.execPath, [
    "--import",
    "tsx",
    "--test",
    "tests/server-bossai-delegation.test.ts",
  ], root),
];

const attestations = [];
for (const check of checks) {
  const startedAt = Date.now();
  const result = spawnSync(check.command, check.args, {
    cwd: check.cwd,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      CI: "1",
      RADAR_AUTO_SCAN: "false",
      RADAR_RUN_ON_STARTUP: "false",
    },
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  const attestation = {
    checkId: check.id,
    command: check.display,
    status: result.status === 0 && !result.error ? "passed" : "failed",
    exitCode: result.status ?? 1,
    executedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    error: result.error?.message || "",
  };
  attestations.push(attestation);
  process.stdout.write(`\n[radar-constitutional-check] ${check.id}: ${attestation.status}\n`);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (attestation.status !== "passed") {
    process.stderr.write(`${JSON.stringify({ ok: false, project: "bossai-radar-lite", failed: attestation }, null, 2)}\n`);
    process.exit(result.status ?? 1);
  }
}

const evidencePack = {
  schemaVersion: 1,
  projectId: "bossai-radar-lite",
  batchId: "bossai-radar-intelligence-manager-plugin-v0.1.0-2026-08-05",
  generatedAt: new Date().toISOString(),
  completionLevel: 2,
  completionLabel: "functional_mvp",
  releaseScope: "technical_baseline",
  classification: "ai_assistant",
  employeeExecution: {
    platform: "bossai-os",
    harness: "hermes",
    profile: "bossaiworkforce",
    gateway: "bossai-central-ai-gateway",
    managerContract: "bossai.manager-task.v1",
    employeePlugin: "bossai-intelligence-agent@0.3.0",
  },
  selfReportedStatusesAccepted: false,
  externalActionsExecuted: false,
  machineAttestations: attestations,
  unresolvedGaps: [
    "The Intelligence Agent package has no production release signature and is not formally registered.",
    "Production deployment and external user validation are not claimed.",
  ],
};
mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "radar-migration-latest.json");
writeFileSync(outputPath, `${JSON.stringify(evidencePack, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  project: evidencePack.projectId,
  completionLevel: evidencePack.completionLevel,
  completionLabel: evidencePack.completionLabel,
  evidencePack: path.relative(root, outputPath),
  checks: attestations.map(({ checkId, status, exitCode, stdoutSha256, stderrSha256 }) => ({
    checkId,
    status,
    exitCode,
    stdoutSha256,
    stderrSha256,
  })),
}, null, 2)}\n`);

function npmCheck(id, script) {
  if (process.platform === "win32") {
    return commandCheck(id, process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npm run ${script}`], root);
  }
  return commandCheck(id, "npm", ["run", script], root);
}

function pnpmCheck(id, script, cwd) {
  if (process.platform === "win32") {
    return commandCheck(id, process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `pnpm ${script}`], cwd);
  }
  return commandCheck(id, "pnpm", [script], cwd);
}

function nodeCheck(id, script, args, cwd) {
  return commandCheck(id, process.execPath, [script, ...args], cwd);
}

function commandCheck(id, command, args, cwd) {
  return { id, command, args, cwd, display: [command, ...args].join(" ") };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
