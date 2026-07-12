import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import test from "node:test";

const ADMIN_KEY = "agent-cli-admin";

test("agent CLI returns JSON and keeps scan/write permissions disabled by default", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-agent-cli-"));
  const port = await findFreePort();
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "0.0.0.0",
      DATA_DIR: dataDir,
      RADAR_AUTO_SCAN: "false",
      RADAR_RUN_ON_STARTUP: "false",
      RADAR_ADMIN_API_KEY: ADMIN_KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { output += chunk.toString(); });

  context.after(async () => {
    await stopChild(child);
    rmSync(dataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, child, () => output);
  const env = {
    ...process.env,
    RADAR_API_URL: baseUrl,
    RADAR_ADMIN_API_KEY: ADMIN_KEY,
    RADAR_SKILL_ALLOW_SCAN: "false",
    RADAR_SKILL_ALLOW_LEAD_WRITE: "false",
  };

  const health = runCli(["health"], env);
  assert.equal(health.status, 0, health.stderr);
  const healthPayload = JSON.parse(health.stdout) as { ok: boolean; data: { service: string } };
  assert.equal(healthPayload.ok, true);
  assert.equal(healthPayload.data.service, "bossai-radar-lite");

  const overview = runCli(["overview"], env);
  assert.equal(overview.status, 0, overview.stderr);
  assert.equal((JSON.parse(overview.stdout) as { command: string }).command, "overview");

  const followups = runCli(["followups", "--lang", "en", "--days", "7"], env);
  assert.equal(followups.status, 0, followups.stderr);
  const followupPayload = JSON.parse(followups.stdout) as { data: { stats: { total: number } } };
  assert.equal(followupPayload.data.stats.total, 0);

  const scan = runCli(["scan"], env);
  assert.equal(scan.status, 1);
  assert.match(scan.stderr, /RADAR_SKILL_ALLOW_SCAN=true/);

  const update = runCli(["update-lead", "--lead-id", "missing", "--status", "QUALIFIED"], env);
  assert.equal(update.status, 1);
  assert.match(update.stderr, /RADAR_SKILL_ALLOW_LEAD_WRITE=true/);
});

function runCli(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/agent-cli.ts", ...args], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
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

async function waitForHealth(baseUrl: string, child: ChildProcess, output: () => string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited before health check:\n${output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server:\n${output()}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
