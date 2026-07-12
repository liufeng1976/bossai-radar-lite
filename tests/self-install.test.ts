import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = process.cwd();

test("self-installer creates a safe OpenClaw installation without exposing the administrator key", async (context) => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "radar-self-install-"));
  const installDir = path.join(temp, "radar");
  const workspace = path.join(temp, "openclaw-workspace");
  context.after(() => rmSync(temp, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [
    path.join(root, "scripts", "agent-bootstrap.mjs"),
    "--agent", "openclaw",
    "--install-dir", installDir,
    "--workspace", workspace,
    "--skip-deps",
    "--skip-service",
    "--skip-verify",
  ], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    permissions: { scan: boolean; leadWrite: boolean; delete: boolean };
    steps: Array<{ step: string; status: string }>;
  };
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.permissions, { scan: false, leadWrite: false, delete: false });
  assert.ok(payload.steps.some((step) => step.step === "openclaw-skill" && step.status === "ok"));

  const envText = readFileSync(path.join(installDir, ".env"), "utf8");
  const adminKey = /^RADAR_ADMIN_API_KEY=(.+)$/m.exec(envText)?.[1] || "";
  assert.ok(adminKey.length >= 48);
  assert.notEqual(adminKey, "change-this-before-public-deployment");
  assert.match(envText, /^RADAR_AUTO_SCAN=false$/m);
  assert.match(envText, /^RADAR_RUN_ON_STARTUP=false$/m);
  assert.match(envText, /^RADAR_MCP_ALLOW_SCAN=false$/m);
  assert.match(envText, /^RADAR_MCP_ALLOW_LEAD_WRITE=false$/m);
  assert.equal(result.stdout.includes(adminKey), false);

  const skillDir = path.join(workspace, "skills", "bossai-radar");
  const skillConfig = JSON.parse(readFileSync(path.join(skillDir, "config.json"), "utf8")) as {
    radarHome: string;
    apiUrl: string;
    permissions: { scan: boolean; leadWrite: boolean; delete: boolean };
  };
  assert.equal(path.resolve(skillConfig.radarHome), path.resolve(installDir));
  assert.equal(skillConfig.apiUrl, "http://127.0.0.1:3080");
  assert.deepEqual(skillConfig.permissions, { scan: false, leadWrite: false, delete: false });
  assert.equal(readFileSync(path.join(skillDir, "RADAR_HOME.txt"), "utf8").trim(), installDir);
  assert.equal(readFileSync(path.join(skillDir, "SKILL.md"), "utf8").includes("config.json"), true);
  assert.equal(existsSync(path.join(installDir, ".agents")), false);
  assert.equal(existsSync(path.join(installDir, "nul")), false);
  assert.equal(existsSync(path.join(installDir, ".radar")), false);
});

test("self-installer dry-run does not create the installation directory", (context) => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "radar-self-plan-"));
  const installDir = path.join(temp, "planned-install");
  context.after(() => rmSync(temp, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [
    path.join(root, "scripts", "agent-bootstrap.mjs"),
    "--agent", "codex",
    "--install-dir", installDir,
    "--dry-run",
  ], { cwd: root, encoding: "utf8", windowsHide: true });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as { ok: boolean; dryRun: boolean; steps: Array<{ step: string }> };
  assert.equal(payload.ok, true);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.steps[0]?.step, "plan");
  assert.throws(() => readFileSync(path.join(installDir, ".env"), "utf8"));
});

test("installed CLI loads .env from the Radar home even when invoked from another working directory", (context) => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "radar-local-env-"));
  const installDir = path.join(temp, "radar");
  const otherCwd = path.join(temp, "other");
  context.after(() => rmSync(temp, { recursive: true, force: true }));

  const install = spawnSync(process.execPath, [
    path.join(root, "scripts", "agent-bootstrap.mjs"),
    "--agent", "openclaw",
    "--install-dir", installDir,
    "--workspace", path.join(temp, "workspace"),
    "--skip-deps",
    "--skip-service",
    "--skip-verify",
  ], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(install.status, 0, install.stderr || install.stdout);

  symlinkSync(path.join(root, "node_modules"), path.join(installDir, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  writeFileSync(path.join(installDir, ".env"), `${readFileSync(path.join(installDir, ".env"), "utf8")}RADAR_TEST_SENTINEL=loaded-from-install\n`, "utf8");
  writeFileSync(path.join(temp, "probe.mjs"), [
    `const mod = await import(${JSON.stringify(pathToFileUrl(path.join(installDir, "dist", "src", "local-env.js")))});`,
    `process.stdout.write(JSON.stringify({ path: mod.loadedEnvPath, sentinel: process.env.RADAR_TEST_SENTINEL }));`,
  ].join("\n"), "utf8");
  mkdirSync(otherCwd, { recursive: true });
  writeFileSync(path.join(otherCwd, ".keep"), "", "utf8");

  const probe = spawnSync(process.execPath, [path.join(temp, "probe.mjs")], {
    cwd: otherCwd,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(probe.status, 0, probe.stderr || probe.stdout);
  const payload = JSON.parse(probe.stdout) as { path: string; sentinel: string };
  assert.equal(path.resolve(payload.path), path.resolve(path.join(installDir, ".env")));
  assert.equal(payload.sentinel, "loaded-from-install");
});

test("service manager starts, reports and stops Radar with isolated runtime state", async (context) => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "radar-service-manager-"));
  const stateDir = path.join(temp, "state");
  const dataDir = path.join(temp, "data");
  const port = await findFreePort();
  const apiUrl = `http://127.0.0.1:${port}`;
  const serviceScript = path.join(root, "scripts", "radar-service.mjs");
  context.after(() => rmSync(temp, { recursive: true, force: true }));
  context.after(() => {
    spawnSync(process.execPath, [serviceScript, "stop", "--api-url", apiUrl, "--state-dir", stateDir], {
      cwd: root,
      env: { ...process.env, RADAR_AUTO_SCAN: "false", RADAR_RUN_ON_STARTUP: "false" },
      windowsHide: true,
    });
  });

  const common = ["--api-url", apiUrl, "--state-dir", stateDir, "--data-dir", dataDir];
  const env = { ...process.env, RADAR_AUTO_SCAN: "false", RADAR_RUN_ON_STARTUP: "false" };
  const start = runJson(serviceScript, ["start", ...common], root, env);
  assert.equal(start.ok, true);
  assert.equal(start.running, true);

  const status = runJson(serviceScript, ["status", ...common], root, env);
  assert.equal(status.ok, true);
  assert.equal(status.running, true);
  const health = await fetch(`${apiUrl}/api/health`);
  assert.equal(health.status, 200);

  const stop = runJson(serviceScript, ["stop", ...common], root, env);
  assert.equal(stop.ok, true);
  assert.equal(stop.running, false);
});

function runJson(script: string, args: string[], cwd: string, env = process.env): Record<string, unknown> {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function pathToFileUrl(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  return process.platform === "win32" ? `file:///${normalized}` : `file://${normalized}`;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a test port"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
