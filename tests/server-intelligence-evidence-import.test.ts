import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RadarDatabase } from "../src/database.js";

const ADMIN_KEY = "intelligence-import-admin-key-1234567890";

async function freePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess, output: () => string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Radar exited early: ${child.exitCode}\n${output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Radar health timeout\n${output()}`);
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function proposal() {
  return {
    schema: "bossai.intelligence-evidence-import.v1",
    producer: {
      project: "bossai-intelligence-agent",
      taskId: "manager-task-real-entry-1",
      operationId: "prospect-web-real-entry-1",
      producedAt: "2026-08-20T09:10:00.000Z",
    },
    consumer: { project: "bossai-radar-lite" },
    authority: {
      proposalOnly: true,
      persistenceAuthorized: false,
      scoringAuthorized: false,
      sourceOfRecordAfterAcceptedImport: "bossai-radar-lite",
      deterministicScoringAuthority: "bossai-radar-lite",
      ownerApprovalAuthority: "none",
      externalActionAuthority: "none",
    },
    records: [{
      schema: "bossai.intelligence-evidence-record.v1",
      externalId: "intel-http-001",
      source: "website",
      title: "Acme reviewed public evidence",
      body: "Acme has a manual workflow problem and public budget evidence for a reviewed market need.",
      url: "https://acme.example/about",
      publishedAt: "2026-08-20T09:09:00.000Z",
      query: "https://acme.example/about",
      provenance: {
        sourceUrl: "https://acme.example/about",
        canonicalUrl: "https://acme.example/about",
        retrievedAt: "2026-08-20T09:09:00.000Z",
        provider: "native-web-acquisition",
        operation: "prospect-web",
        requestId: "request-real-entry-1",
        providerJobId: "",
        factClass: "observed-public-source",
        sourceContentTrust: "untrusted-public-evidence",
        instructionAuthority: "none",
        toolAuthority: "none",
        approvalAuthority: "none",
        promptInjectionSignals: [],
      },
    }],
  };
}

test("protected Radar real entry imports only explicitly reviewed Intelligence evidence and recomputes Radar score", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-intelligence-import-http-"));
  const port = await freePort();
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "0.0.0.0",
      DATA_DIR: dataDir,
      RADAR_AUTO_SCAN: "false",
      RADAR_RUN_ON_STARTUP: "false",
      RADAR_DEMO_ENABLED: "false",
      RADAR_ADMIN_API_KEY: ADMIN_KEY,
      COMMERCIAL_LEAD_ADMIN_ENABLED: "true",
      AI_PROVIDER: "deterministic",
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

  const unauthorized = await fetch(`${baseUrl}/api/admin/intelligence-evidence-imports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmation: "IMPORT REVIEWED INTELLIGENCE EVIDENCE", reviewedBy: "owner-review", proposal: proposal() }),
  });
  assert.equal(unauthorized.status, 401);

  const unconfirmed = await fetch(`${baseUrl}/api/admin/intelligence-evidence-imports`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-radar-key": ADMIN_KEY },
    body: JSON.stringify({ reviewedBy: "owner-review", proposal: proposal() }),
  });
  assert.equal(unconfirmed.status, 400);
  assert.equal((await unconfirmed.json() as { persistencePerformed: boolean }).persistencePerformed, false);

  const response = await fetch(`${baseUrl}/api/admin/intelligence-evidence-imports`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-radar-key": ADMIN_KEY },
    body: JSON.stringify({
      confirmation: "IMPORT REVIEWED INTELLIGENCE EVIDENCE",
      reviewedBy: "owner-review",
      proposal: proposal(),
    }),
  });
  const text = await response.text();
  assert.equal(response.status, 201, `${text}\n${output}`);
  const payload = JSON.parse(text) as {
    receipt: { imported: Array<{ totalScore: number; websiteContext?: { intelligenceImport?: { taskId?: string } } }>; reviewedBy: string; scoringAuthority: string; sourceOfRecord: string; externalActionsExecuted: boolean };
    persistedBy: string;
    deterministicScoringAuthority: string;
    opportunityRebuildExecuted: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(payload.receipt.reviewedBy, "owner-review");
  assert.equal(payload.receipt.scoringAuthority, "bossai-radar-lite");
  assert.equal(payload.receipt.sourceOfRecord, "bossai-radar-lite");
  assert.equal(payload.receipt.imported.length, 1);
  assert.ok(payload.receipt.imported[0]!.totalScore > 0);
  assert.equal(payload.receipt.imported[0]!.websiteContext?.intelligenceImport?.taskId, "manager-task-real-entry-1");
  assert.equal(payload.persistedBy, "bossai-radar-lite");
  assert.equal(payload.deterministicScoringAuthority, "bossai-radar-lite");
  assert.equal(payload.opportunityRebuildExecuted, false);
  assert.equal(payload.externalActionsExecuted, false);

  const readDb = new RadarDatabase(dataDir);
  try {
    const saved = readDb.listEvidence(10);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.externalId, "intel-http-001");
    assert.ok((saved[0]?.totalScore ?? 0) > 0);
  } finally {
    readDb.close();
  }
});
