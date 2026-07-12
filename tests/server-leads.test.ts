import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";

const ADMIN_KEY = "integration-admin-key";

test("protects commercial lead administration while keeping public applications available", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-lead-api-"));
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
      COMMERCIAL_LEAD_CAPTURE_ENABLED: "true",
      COMMERCIAL_LEAD_ADMIN_ENABLED: "true",
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

  const honeypot = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ website: "https://spam.example" }),
  });
  assert.equal(honeypot.status, 202);

  const noKey = await fetch(`${baseUrl}/api/admin/leads/stats`);
  assert.equal(noKey.status, 401);

  const wrongKey = await fetch(`${baseUrl}/api/admin/leads/stats`, {
    headers: { "x-radar-key": "wrong-key" },
  });
  assert.equal(wrongKey.status, 401);

  const submission = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "commercial",
      name: "API Buyer",
      company: "Example Co",
      contact: "api-buyer@example.com",
      teamSize: "6-20",
      timeline: "30-days",
      deployment: "own-cloud",
      budget: "5000-20000",
      scenario: "We need a bilingual commercial opportunity radar for an ecommerce operations team.",
      requirements: "Private deployment, CRM export and scheduled reports.",
      language: "en",
      consent: true,
      website: "",
    }),
  });
  assert.equal(submission.status, 201);
  const publicPayload = await submission.json() as Record<string, unknown>;
  assert.equal(typeof publicPayload.id, "string");
  const leadId = String(publicPayload.id);
  assert.equal("priority" in publicPayload, false);
  assert.equal("status" in publicPayload, false);

  const authorized = await fetch(`${baseUrl}/api/admin/leads/stats`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  assert.equal(authorized.status, 200);
  const stats = await authorized.json() as { total: number };
  assert.equal(stats.total, 1);

  const csvWithoutKey = await fetch(`${baseUrl}/api/admin/leads/export.csv`);
  assert.equal(csvWithoutKey.status, 401);
  const csvWithKey = await fetch(`${baseUrl}/api/admin/leads/export.csv`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  assert.equal(csvWithKey.status, 200);
  assert.match(csvWithKey.headers.get("content-type") || "", /text\/csv/);

  const deleteWithoutKey = await fetch(`${baseUrl}/api/admin/leads/${leadId}`, { method: "DELETE" });
  assert.equal(deleteWithoutKey.status, 401);
  const deleteWithKey = await fetch(`${baseUrl}/api/admin/leads/${leadId}`, {
    method: "DELETE",
    headers: { "x-radar-key": ADMIN_KEY },
  });
  assert.equal(deleteWithKey.status, 204);
  const missingAfterDelete = await fetch(`${baseUrl}/api/admin/leads/${leadId}`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  assert.equal(missingAfterDelete.status, 404);
});

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
