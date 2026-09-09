import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";
import type { ProspectDiscoveryCandidate } from "../src/types.js";

const ADMIN_KEY = "bossai-retry-admin-key-1234567890";
const BOSSAI_JWT = "bossai-os-jwt-for-retry-test";
const INTELLIGENCE_AGENT_ID = "bossai-intelligence-agent";
const SALES_AGENT_ID = "bossai-sales-agent";

function prospectInput(id: string): ProspectDiscoveryCandidate {
  return {
    id,
    domain: `${id}.example`,
    websiteUrl: `https://${id}.example/`,
    companyName: id,
    description: "Industrial distributor with a verified public company website.",
    discoverySourceUrl: "https://expo.example/exhibitors",
    discoverySourceTitle: "Expo exhibitors",
    discoveryQuery: "industrial distributor",
    publicEmails: [`sales@${id}.example`],
    publicPhones: [],
    contactUrls: [`https://${id}.example/contact`],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [],
    productSignals: ["Industrial equipment"],
    evidenceUrls: [`https://${id}.example/`],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T10:00:00.000Z",
    score: 70,
    reasons: ["verified official website"],
    discoveredAt: "2026-08-18T09:00:00.000Z",
  };
}

test("owner manually retries only the latest failed Intelligence task and repeated retry is idempotent", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-intelligence-retry-"));
  const radarPort = await findFreePort();
  const bossAiPort = await findFreePort();
  const db = new RadarDatabase(dataDir);
  const prospect = db.saveProspectCandidate(prospectInput("intel-retry"));
  db.updateProspectStatus(prospect.id, "REVIEW_REQUIRED");
  db.saveBossAiDelegation({
    sourceType: "prospect",
    sourceRecordId: prospect.id,
    sourceOperationId: "intel-retry-original-operation",
    bossaiRunId: "manager-intelligence-failed-1",
    bossaiAgentId: INTELLIGENCE_AGENT_ID,
    status: "failed",
    reviewStatus: "pending",
    submittedAt: "2026-08-18T10:10:00.000Z",
    updatedAt: "2026-08-18T10:20:00.000Z",
    errorCode: "INTELLIGENCE_RUNTIME_FAILED",
    errorMessage: "workspace.read failed in governed runtime",
  });
  db.close();

  let managerCreateCalls = 0;
  let managerDetailCalls = 0;
  const managerObjectives: string[] = [];
  const bossAiServer = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${BOSSAI_JWT}`) {
        sendJson(res, 401, { code: "AUTH_REQUIRED" });
        return;
      }
      if (req.method === "GET" && req.url === `/api/agents/${INTELLIGENCE_AGENT_ID}`) {
        sendJson(res, 200, installation(INTELLIGENCE_AGENT_ID, "0.3.0"));
        return;
      }
      if (req.method === "POST" && req.url === "/api/manager/tasks") {
        managerCreateCalls += 1;
        const body = JSON.parse(await readBody(req)) as { objective?: string };
        managerObjectives.push(String(body.objective || ""));
        sendJson(res, 202, managerSubmission(INTELLIGENCE_AGENT_ID, "manager-intelligence-retry-1", "offer-intelligence-retry-1"));
        return;
      }
      if (req.method === "GET" && req.url === "/api/manager/tasks/manager-intelligence-retry-1") {
        managerDetailCalls += 1;
        sendJson(res, 200, managerDetail(INTELLIGENCE_AGENT_ID, "manager-intelligence-retry-1", "intelligence.prospect.brief"));
        return;
      }
      sendJson(res, 404, { code: "NOT_FOUND" });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  await listen(bossAiServer, bossAiPort);

  const radar = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: radarEnv(dataDir, radarPort, bossAiPort),
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
  const headers = adminHeaders();

  const before = await fetch(`${baseUrl}/api/admin/prospects/account-review-queue?attention=execution-exception`, { headers });
  assert.equal(before.status, 200);
  const beforeBody = await before.json() as {
    queue: {
      items: Array<{
        prospectId: string;
        attention: string;
        handlingPriority: string;
        primaryAction: string;
        executionException: { runId: string; errorCode: string; errorMessage: string; retryAction: string };
      }>;
      summary: { executionExceptions: number };
      truthBoundary: { automaticRetryExecuted: boolean };
    };
  };
  assert.equal(beforeBody.queue.items.length, 1);
  assert.equal(beforeBody.queue.items[0]?.prospectId, prospect.id);
  assert.equal(beforeBody.queue.items[0]?.attention, "execution-exception");
  assert.equal(beforeBody.queue.items[0]?.handlingPriority, "P1_EXECUTION_EXCEPTION");
  assert.equal(beforeBody.queue.items[0]?.primaryAction, "retry-intelligence");
  assert.equal(beforeBody.queue.items[0]?.executionException.runId, "manager-intelligence-failed-1");
  assert.equal(beforeBody.queue.items[0]?.executionException.errorCode, "INTELLIGENCE_RUNTIME_FAILED");
  assert.match(beforeBody.queue.items[0]?.executionException.errorMessage || "", /workspace\.read/);
  assert.equal(beforeBody.queue.items[0]?.executionException.retryAction, "retry-intelligence");
  assert.equal(beforeBody.queue.summary.executionExceptions, 1);
  assert.equal(beforeBody.queue.truthBoundary.automaticRetryExecuted, false);

  const accountReview = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/account-review`, { headers });
  const accountReviewBody = await accountReview.json() as {
    review: {
      actions: string[];
      blockers: string[];
      workflow: { intelligence: { status: string; errorCode: string; errorMessage: string } };
    };
  };
  assert.equal(accountReview.status, 200);
  assert.equal(accountReviewBody.review.actions[0], "retry-intelligence");
  assert.ok(accountReviewBody.review.actions.includes("refresh-intelligence"));
  assert.ok(accountReviewBody.review.blockers.includes("intelligence-execution-failed"));
  assert.equal(accountReviewBody.review.workflow.intelligence.errorCode, "INTELLIGENCE_RUNTIME_FAILED");
  assert.match(accountReviewBody.review.workflow.intelligence.errorMessage, /workspace\.read/);

  const body = {
    objective: "Retry the governed Intelligence prospect review from the current verified account evidence without outreach or CRM mutation.",
    retryFailedRunId: "manager-intelligence-failed-1",
  };
  const firstRetry = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/delegate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const firstText = await firstRetry.text();
  assert.equal(firstRetry.status, 202, firstText);
  const first = JSON.parse(firstText) as {
    deduplicated: boolean;
    sourceOperationId: string;
    delegation: { bossaiRunId: string; status: string };
    retryOfRunId: string;
    automaticRetryExecuted: boolean;
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(first.deduplicated, false);
  assert.equal(first.delegation.bossaiRunId, "manager-intelligence-retry-1");
  assert.equal(first.delegation.status, "queued");
  assert.equal(first.retryOfRunId, "manager-intelligence-failed-1");
  assert.equal(first.automaticRetryExecuted, false);
  assert.equal(first.crmRecordCreated, false);
  assert.equal(first.externalActionsExecuted, false);
  assert.match(first.sourceOperationId, /^radar:/u);
  assert.equal(managerCreateCalls, 1);
  assert.ok((managerObjectives[0] || "").includes(first.sourceOperationId));

  const repeatedRetry = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/delegate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const repeatedText = await repeatedRetry.text();
  assert.equal(repeatedRetry.status, 200, repeatedText);
  const repeated = JSON.parse(repeatedText) as {
    deduplicated: boolean;
    sourceOperationId: string;
    retryOfRunId: string;
    automaticRetryExecuted: boolean;
  };
  assert.equal(repeated.deduplicated, true);
  assert.equal(repeated.sourceOperationId, first.sourceOperationId);
  assert.equal(repeated.retryOfRunId, "manager-intelligence-failed-1");
  assert.equal(repeated.automaticRetryExecuted, false);
  assert.equal(managerCreateCalls, 1);
  assert.equal(managerDetailCalls, 1);

  const callerManagedOperation = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/delegate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, sourceOperationId: "caller-controlled-retry-operation" }),
  });
  assert.equal(callerManagedOperation.status, 400);
  assert.equal((await callerManagedOperation.json() as { code: string }).code, "PROSPECT_RETRY_OPERATION_ID_MANAGED");

  const after = await fetch(`${baseUrl}/api/admin/prospects/account-review-queue?attention=execution-exception`, { headers });
  const afterBody = await after.json() as { queue: { items: unknown[]; truthBoundary: { automaticRetryExecuted: boolean } } };
  assert.equal(after.status, 200);
  assert.equal(afterBody.queue.items.length, 0);
  assert.equal(afterBody.queue.truthBoundary.automaticRetryExecuted, false);
});

test("owner manually retries failed Sales qualification without bypassing READY_FOR_SALES or creating CRM state", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-sales-retry-"));
  const radarPort = await findFreePort();
  const bossAiPort = await findFreePort();
  const db = new RadarDatabase(dataDir);
  const prospect = db.saveProspectCandidate(prospectInput("sales-retry"));
  db.updateProspectStatus(prospect.id, "REVIEW_REQUIRED");
  db.saveBossAiDelegation({
    sourceType: "prospect",
    sourceRecordId: prospect.id,
    sourceOperationId: "sales-retry-intelligence-complete",
    bossaiRunId: "manager-intelligence-complete-for-sales-retry",
    bossaiAgentId: INTELLIGENCE_AGENT_ID,
    status: "completed",
    reviewStatus: "approved",
    submittedAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:30:00.000Z",
  });
  const approval = db.recordProspectOwnerDecision({
    prospectId: prospect.id,
    decision: "approve-sales",
    reasonCode: "intelligence-ready",
    note: "Owner approved Sales qualification after reviewing Intelligence.",
    expectedStatus: "REVIEW_REQUIRED",
    targetStatus: "READY_FOR_SALES",
    decidedAt: "2026-08-18T10:45:00.000Z",
    snapshot: {
      schema: "bossai.prospect-owner-decision-snapshot.v1",
      generatedAt: "2026-08-18T10:45:00.000Z",
      accountReviewStage: "owner-decision",
      prospectStatusBefore: "REVIEW_REQUIRED",
      websiteEvidenceStatus: "verified",
      websiteEvidenceSource: "static-http",
      evidenceCompleted: 4,
      evidenceTotal: 6,
      businessChannelCount: 0,
      linkedTradeRecordCount: 0,
      tradeReviewPriority: null,
      candidateScore: 74,
      intelligenceManagerTaskId: "manager-intelligence-complete-for-sales-retry",
      intelligenceStatus: "completed",
      salesManagerTaskId: "",
      salesStatus: "not-started",
      blockers: ["owner-sales-decision-required"],
    },
  });
  assert.ok(approval);
  db.saveBossAiDelegation({
    sourceType: "prospect-sales",
    sourceRecordId: prospect.id,
    sourceOperationId: "sales-retry-original-operation",
    bossaiRunId: "manager-sales-failed-1",
    bossaiAgentId: SALES_AGENT_ID,
    status: "failed",
    reviewStatus: "approved",
    submittedAt: "2026-08-18T11:00:00.000Z",
    updatedAt: "2026-08-18T11:20:00.000Z",
    errorCode: "SALES_RUNTIME_FAILED",
    errorMessage: "governed sales runtime stopped before artifact delivery",
    ownerDecisionId: approval.decision.id,
  });
  db.close();

  let managerCreateCalls = 0;
  let managerDetailCalls = 0;
  const bossAiServer = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${BOSSAI_JWT}`) {
        sendJson(res, 401, { code: "AUTH_REQUIRED" });
        return;
      }
      if (req.method === "GET" && req.url === `/api/agents/${SALES_AGENT_ID}`) {
        sendJson(res, 200, installation(SALES_AGENT_ID, "0.2.0"));
        return;
      }
      if (req.method === "POST" && req.url === "/api/manager/tasks") {
        managerCreateCalls += 1;
        sendJson(res, 202, managerSubmission(SALES_AGENT_ID, "manager-sales-retry-1", "offer-sales-retry-1"));
        return;
      }
      if (req.method === "GET" && req.url === "/api/manager/tasks/manager-sales-retry-1") {
        managerDetailCalls += 1;
        sendJson(res, 200, managerDetail(SALES_AGENT_ID, "manager-sales-retry-1", "sales.lead.qualify"));
        return;
      }
      sendJson(res, 404, { code: "NOT_FOUND" });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  await listen(bossAiServer, bossAiPort);

  const radar = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: radarEnv(dataDir, radarPort, bossAiPort),
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
  const headers = adminHeaders();

  const before = await fetch(`${baseUrl}/api/admin/prospects/account-review-queue?attention=execution-exception`, { headers });
  const beforeBody = await before.json() as { queue: { items: Array<{ prospectId: string; primaryAction: string; executionException: { employee: string; status: string } }> } };
  assert.equal(before.status, 200);
  assert.equal(beforeBody.queue.items[0]?.prospectId, prospect.id);
  assert.equal(beforeBody.queue.items[0]?.primaryAction, "retry-sales");
  assert.equal(beforeBody.queue.items[0]?.executionException.employee, "sales");
  assert.equal(beforeBody.queue.items[0]?.executionException.status, "failed");

  const accountReview = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/account-review`, { headers });
  const accountReviewBody = await accountReview.json() as { review: { actions: string[]; blockers: string[] } };
  assert.equal(accountReview.status, 200);
  assert.equal(accountReviewBody.review.actions[0], "retry-sales");
  assert.ok(accountReviewBody.review.actions.includes("refresh-sales"));
  assert.ok(accountReviewBody.review.blockers.includes("sales-execution-failed"));

  const body = {
    objective: "Retry sales.lead.qualify for this human-approved prospect using only current reviewed public facts; do not contact the prospect or create CRM state.",
    retryFailedRunId: "manager-sales-failed-1",
  };
  const firstRetry = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/qualify`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const firstText = await firstRetry.text();
  assert.equal(firstRetry.status, 202, firstText);
  const first = JSON.parse(firstText) as {
    deduplicated: boolean;
    sourceOperationId: string;
    delegation: { bossaiRunId: string; ownerDecisionId?: string };
    ownerDecisionId: string;
    salesAuthorization: { status: string; ownerDecisionId: string; salesTaskBoundToApproval: boolean };
    retryOfRunId: string;
    automaticRetryExecuted: boolean;
    capabilityRequested: string;
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(first.deduplicated, false);
  assert.equal(first.delegation.bossaiRunId, "manager-sales-retry-1");
  assert.equal(first.delegation.ownerDecisionId, approval.decision.id);
  assert.equal(first.ownerDecisionId, approval.decision.id);
  assert.equal(first.salesAuthorization.status, "sales-bound");
  assert.equal(first.salesAuthorization.ownerDecisionId, approval.decision.id);
  assert.equal(first.salesAuthorization.salesTaskBoundToApproval, true);
  assert.equal(first.retryOfRunId, "manager-sales-failed-1");
  assert.equal(first.automaticRetryExecuted, false);
  assert.equal(first.capabilityRequested, "sales.lead.qualify");
  assert.equal(first.crmRecordCreated, false);
  assert.equal(first.externalActionsExecuted, false);
  assert.equal(managerCreateCalls, 1);

  const repeatedRetry = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/qualify`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const repeatedText = await repeatedRetry.text();
  assert.equal(repeatedRetry.status, 200, repeatedText);
  const repeated = JSON.parse(repeatedText) as { deduplicated: boolean; sourceOperationId: string; retryOfRunId: string };
  assert.equal(repeated.deduplicated, true);
  assert.equal(repeated.sourceOperationId, first.sourceOperationId);
  assert.equal(repeated.retryOfRunId, "manager-sales-failed-1");
  assert.equal(managerCreateCalls, 1);
  assert.equal(managerDetailCalls, 1);

  const leads = await fetch(`${baseUrl}/api/admin/leads`, { headers });
  assert.equal(leads.status, 200);
  assert.equal((await leads.json() as { items: unknown[] }).items.length, 0);
});

function installation(agentId: string, version: string) {
  return {
    installationId: `installation-${agentId}`,
    status: "enabled",
    signatureStatus: "verified",
    healthStatus: "healthy",
    manifest: {
      id: agentId,
      version,
      permissions: ["runtime.run", "events.subscribe", "events.publish", "storage.read", "storage.write"],
      productStatus: {
        completionLevel: 2,
        productionReady: false,
        actuallyLaunched: false,
        realUserValidated: false,
        formalAIEmployeeRegistered: false,
      },
    },
  };
}

function managerSubmission(agentId: string, taskId: string, offerEventId: string) {
  return {
    schema: "bossai.manager-task.v1",
    task: {
      id: taskId,
      status: "pending",
      riskLevel: "L2",
      requiresApproval: true,
      createdAt: "2026-08-18T12:00:00.000Z",
      updatedAt: "2026-08-18T12:00:00.000Z",
    },
    routing: { status: "matched", agentId },
    executionStarted: false,
    offerEventId,
  };
}

function managerDetail(agentId: string, taskId: string, capability: string) {
  return {
    schema: "bossai.manager-task-detail.v1",
    phase: "created",
    task: {
      id: taskId,
      status: "pending",
      riskLevel: "L2",
      requiresApproval: true,
      createdAt: "2026-08-18T12:00:00.000Z",
      updatedAt: "2026-08-18T12:01:00.000Z",
    },
    run: { agentId, capability },
    progress: { progress: 0 },
    result: null,
    events: [],
  };
}

function radarEnv(dataDir: string, radarPort: number, bossAiPort: number): NodeJS.ProcessEnv {
  return {
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
    BOSSAI_OS_JWT: BOSSAI_JWT,
    AI_PROVIDER: "deterministic",
  };
}

function adminHeaders(): Record<string, string> {
  return { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk.toString();
  return body;
}

async function listen(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
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
