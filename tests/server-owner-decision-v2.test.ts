import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RadarDatabase } from "../src/database.js";

const ADMIN_KEY = "bossai-v2-admin-key-1234567890123456";
const EMPLOYEE_JWT = "bossai-os-employee-jwt-v2-test";
const WORKBENCH_KEY = "bossai_live_workbench_read_v2_test";
const PROSPECT_ID = "prospect-os-v2-e2e";
const INTELLIGENCE_TASK_ID = "manager-intelligence-os-v2";
const SALES_TASK_ID = "manager-sales-os-v2";
const DECISION_ID = "work-prospect-os-v2-intel-sales-v2";

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
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
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function seedProspect(dataDir: string) {
  const db = new RadarDatabase(dataDir);
  try {
    const prospect = db.saveProspectCandidate({
      id: PROSPECT_ID,
      domain: "os-v2.example",
      websiteUrl: "https://os-v2.example/",
      companyName: "OS V2 Industrial",
      description: "Verified industrial supplier.",
      discoverySourceUrl: "https://directory.example/os-v2",
      discoverySourceTitle: "Verified directory",
      discoveryQuery: "industrial supplier",
      publicEmails: ["sales@os-v2.example"],
      publicPhones: [],
      contactUrls: ["https://os-v2.example/contact"],
      officialProfileUrls: [],
      publicMessagingUrls: [],
      companyContactChannels: [],
      productSignals: ["industrial supplier"],
      evidenceUrls: ["https://os-v2.example/"],
      websiteEvidenceStatus: "verified",
      websiteEvidenceSource: "static-http",
      websiteVerifiedAt: "2026-08-20T08:00:00.000Z",
      score: 71,
      reasons: ["verified official website"],
      fitScore: 70,
      fitTerms: ["industrial"],
      fitMatches: ["industrial"],
      discoveredAt: "2026-08-20T07:00:00.000Z",
    });
    db.updateProspectStatus(prospect.id, "REVIEW_REQUIRED");
    db.saveBossAiDelegation({
      sourceType: "prospect",
      sourceRecordId: prospect.id,
      sourceOperationId: "radar-intelligence-os-v2",
      bossaiRunId: INTELLIGENCE_TASK_ID,
      bossaiAgentId: "bossai-intelligence-agent",
      status: "completed",
      reviewStatus: "approved",
      submittedAt: "2026-08-20T08:30:00.000Z",
      updatedAt: "2026-08-20T08:45:00.000Z",
    });
  } finally {
    db.close();
  }
}

test("Radar qualifies Sales from exact BossAI OS v2 owner decision without creating a local owner-decision journal", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-owner-decision-v2-"));
  seedProspect(dataDir);
  const radarPort = await findFreePort();
  const bossAiPort = await findFreePort();
  const calls: Array<{ method: string; url: string; authorization: string }> = [];
  const capturedSalesManagerBody: { current?: Record<string, unknown> } = {};

  const bossAiServer = createServer(async (req, res) => {
    try {
      const authorization = String(req.headers.authorization || "");
      calls.push({ method: req.method || "", url: req.url || "", authorization });
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, {
          optionalContracts: {
            ownerBusinessDecisionsV2: {
              schemaVersion: "bossai.owner-business-decision-list.v2",
              method: "GET",
              path: "/api/owner/business-decisions/v2",
            },
          },
        });
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/api/owner/business-decisions/v2?")) {
        if (authorization !== `Bearer ${WORKBENCH_KEY}`) return sendJson(res, 401, { code: "WORKBENCH_KEY_REQUIRED" });
        const url = new URL(req.url, `http://127.0.0.1:${bossAiPort}`);
        assert.equal(url.searchParams.get("subjectId"), PROSPECT_ID);
        assert.equal(url.searchParams.get("contextId"), INTELLIGENCE_TASK_ID);
        sendJson(res, 200, { success: true, data: {
          schema: "bossai.owner-business-decision-list.v2",
          generatedAt: "2026-08-20T09:00:00.000Z",
          authority: "bossai-os",
          decisions: [{
            schema: "bossai.owner-business-decision.v2",
            id: "audit-os-v2-1",
            decisionId: DECISION_ID,
            domain: "sales-prospect",
            subject: { type: "prospect", id: PROSPECT_ID },
            context: { type: "intelligence-manager-task", id: INTELLIGENCE_TASK_ID },
            decisionType: "authorize-sales-qualification",
            reasonCode: "evidence-sufficient",
            decidedAt: "2026-08-20T08:55:00.000Z",
            authority: "bossai-os",
            actorType: "user",
            actorId: "owner-1",
            automaticExecutionAuthorized: false,
            externalActionsExecuted: false,
          }],
          inferredDecisionsIncluded: false,
          automaticExecutionAuthorized: false,
          externalActionsExecuted: false,
        } });
        return;
      }
      if (authorization !== `Bearer ${EMPLOYEE_JWT}`) return sendJson(res, 401, { code: "EMPLOYEE_JWT_REQUIRED" });
      if (req.method === "GET" && req.url === `/api/manager/tasks/${INTELLIGENCE_TASK_ID}`) {
        sendJson(res, 200, { success: true, data: {
          schema: "bossai.manager-task-detail.v1",
          phase: "completed",
          task: {
            id: INTELLIGENCE_TASK_ID,
            status: "done",
            requiresApproval: true,
            createdAt: "2026-08-20T08:30:00.000Z",
            updatedAt: "2026-08-20T08:45:00.000Z",
          },
          result: { summary: "Verified intelligence review\nREADY_FOR_SALES_QUALIFICATION_REVIEW" },
          events: [],
        } });
        return;
      }
      if (req.method === "GET" && req.url === "/api/agents/bossai-sales-agent") {
        sendJson(res, 200, { success: true, data: {
          status: "enabled",
          signatureStatus: "verified",
          healthStatus: "healthy",
          manifest: {
            id: "bossai-sales-agent",
            version: "0.2.0",
            permissions: ["runtime.run", "events.subscribe", "events.publish", "storage.read", "storage.write"],
          },
        } });
        return;
      }
      if (req.method === "POST" && req.url === "/api/manager/tasks") {
        capturedSalesManagerBody.current = JSON.parse(await readBody(req)) as Record<string, unknown>;
        sendJson(res, 202, { success: true, data: {
          schema: "bossai.manager-task.v1",
          task: {
            id: SALES_TASK_ID,
            status: "pending",
            riskLevel: "L2",
            requiresApproval: true,
            createdAt: "2026-08-20T09:01:00.000Z",
            updatedAt: "2026-08-20T09:01:00.000Z",
          },
          routing: { status: "matched", agentId: "bossai-sales-agent" },
          executionStarted: false,
          offerEventId: "offer-sales-os-v2",
        } });
        return;
      }
      sendJson(res, 404, { code: "NOT_FOUND", url: req.url });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise<void>((resolve, reject) => {
    bossAiServer.once("error", reject);
    bossAiServer.listen(bossAiPort, "127.0.0.1", () => resolve());
  });

  const radar = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(radarPort),
      HOST: "0.0.0.0",
      DATA_DIR: dataDir,
      RADAR_AUTO_SCAN: "false",
      RADAR_RUN_ON_STARTUP: "false",
      RADAR_DEMO_ENABLED: "false",
      RADAR_ADMIN_API_KEY: ADMIN_KEY,
      COMMERCIAL_LEAD_ADMIN_ENABLED: "true",
      BOSSAI_OS_URL: `http://127.0.0.1:${bossAiPort}`,
      BOSSAI_OS_JWT: EMPLOYEE_JWT,
      BOSSAI_OS_WORKBENCH_KEY: WORKBENCH_KEY,
      AI_PROVIDER: "deterministic",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  radar.stdout?.on("data", (chunk) => { output += chunk.toString(); });
  radar.stderr?.on("data", (chunk) => { output += chunk.toString(); });

  context.after(async () => {
    await stopChild(radar);
    await new Promise<void>((resolve) => bossAiServer.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${radarPort}`;
  await waitForHealth(baseUrl, radar, () => output);
  const response = await fetch(`${baseUrl}/api/admin/prospects/${PROSPECT_ID}/qualify`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "content-type": "application/json" },
    body: JSON.stringify({ objective: "对已由老板明确批准的机会执行销售资格判断；不外联、不创建 CRM。" }),
  });
  const text = await response.text();
  assert.equal(response.status, 202, `${text}\n${output}`);
  const payload = JSON.parse(text) as {
    ownerDecisionId: string;
    salesAuthorization: { status: string; ownerDecisionId: string; decisionIntelligenceManagerTaskId: string; salesTaskBoundToApproval: boolean };
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(payload.ownerDecisionId, DECISION_ID);
  assert.equal(payload.salesAuthorization.status, "sales-bound");
  assert.equal(payload.salesAuthorization.ownerDecisionId, DECISION_ID);
  assert.equal(payload.salesAuthorization.decisionIntelligenceManagerTaskId, INTELLIGENCE_TASK_ID);
  assert.equal(payload.salesAuthorization.salesTaskBoundToApproval, true);
  assert.equal(payload.crmRecordCreated, false);
  assert.equal(payload.externalActionsExecuted, false);

  const journalResponse = await fetch(`${baseUrl}/api/admin/prospects/${PROSPECT_ID}/owner-decisions`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  assert.equal(journalResponse.status, 200);
  const journal = await journalResponse.json() as { items: unknown[] };
  assert.deepEqual(journal.items, []);

  const legacyDecisionWrite = await fetch(`${baseUrl}/api/admin/prospects/${PROSPECT_ID}/owner-decision`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "content-type": "application/json" },
    body: JSON.stringify({ decision: "reject-prospect", reasonCode: "low-fit", note: "Must be rejected by modern OS authority boundary." }),
  });
  const legacyDecisionPayload = await legacyDecisionWrite.json() as { code: string; radarOwnerDecisionJournalWriteAuthorized: boolean; historicalRadarOwnerDecisionsRemainReadable: boolean };
  assert.equal(legacyDecisionWrite.status, 409);
  assert.equal(legacyDecisionPayload.code, "PROSPECT_OWNER_DECISION_AUTHORITY_IS_BOSSAI_OS");
  assert.equal(legacyDecisionPayload.radarOwnerDecisionJournalWriteAuthorized, false);
  assert.equal(legacyDecisionPayload.historicalRadarOwnerDecisionsRemainReadable, true);

  const legacyOutcomeWrite = await fetch(`${baseUrl}/api/admin/prospects/${PROSPECT_ID}/outcome-review`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "content-type": "application/json" },
    body: JSON.stringify({ decision: "observe", summary: "Must be reviewed through BossAI Work on modern authority." }),
  });
  const legacyOutcomePayload = await legacyOutcomeWrite.json() as { code: string; radarOutcomeJournalWriteAuthorized: boolean; historicalRadarOutcomeReviewsRemainReadable: boolean };
  assert.equal(legacyOutcomeWrite.status, 409);
  assert.equal(legacyOutcomePayload.code, "PROSPECT_OUTCOME_AUTHORITY_IS_BOSSAI_OS");
  assert.equal(legacyOutcomePayload.radarOutcomeJournalWriteAuthorized, false);
  assert.equal(legacyOutcomePayload.historicalRadarOutcomeReviewsRemainReadable, true);

  const outcomeJournalResponse = await fetch(`${baseUrl}/api/admin/prospects/${PROSPECT_ID}/outcome-reviews`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  assert.equal(outcomeJournalResponse.status, 200);
  const outcomeJournal = await outcomeJournalResponse.json() as { items: unknown[] };
  assert.deepEqual(outcomeJournal.items, []);

  assert.ok(capturedSalesManagerBody.current);
  const objective = String(capturedSalesManagerBody.current?.objective || "");
  assert.match(objective, new RegExp(INTELLIGENCE_TASK_ID));
  assert.match(objective, new RegExp(DECISION_ID));
  assert.match(objective, /指定能力：sales\.lead\.qualify/u);

  const healthCalls = calls.filter((call) => call.url === "/health");
  const decisionCalls = calls.filter((call) => call.url.startsWith("/api/owner/business-decisions/v2?"));
  const employeeCalls = calls.filter((call) => call.url === `/api/manager/tasks/${INTELLIGENCE_TASK_ID}` || call.url === "/api/agents/bossai-sales-agent" || call.url === "/api/manager/tasks");
  assert.ok(healthCalls.length >= 1);
  assert.ok(healthCalls.every((call) => call.authorization === ""));
  assert.equal(decisionCalls.length, 1);
  assert.equal(decisionCalls[0]?.authorization, `Bearer ${WORKBENCH_KEY}`);
  assert.ok(employeeCalls.length >= 3);
  assert.ok(employeeCalls.every((call) => call.authorization === `Bearer ${EMPLOYEE_JWT}`));
  assert.ok(calls.every((call) => call.authorization !== `Bearer owner-session-secret`));
});
