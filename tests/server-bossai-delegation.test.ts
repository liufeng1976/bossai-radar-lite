import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";
import { scoreEvidence } from "../src/scoring.js";
import type { Opportunity } from "../src/types.js";

const ADMIN_KEY = "bossai-delegation-admin-key-1234567890";
const BOSSAI_JWT = "bossai-os-jwt-for-radar-test";
const INTELLIGENCE_AGENT_ID = "bossai-intelligence-agent";

const opportunity: Opportunity = {
  id: "opportunity-real-1",
  category: "content-automation",
  title: "Verified content automation opportunity",
  summary: "Evidence-backed opportunity for a reviewable content workflow.",
  targetCustomer: "Small ecommerce teams",
  problem: "Teams cannot turn market signals into consistent reviewable content.",
  evidenceCount: 2,
  sourceCount: 2,
  avgEvidenceScore: 78,
  score: 82,
  decision: "BUILD",
  priceHint: "Validate before pricing",
  mvpPlan: ["Verify demand", "Draft content", "Human review"],
  evidenceIds: [],
  isDemo: false,
  createdAt: "2026-08-01T00:00:00.000Z",
};

test("delegates a verified Radar opportunity to the independent Intelligence Agent through BossAI Manager", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-bossai-manager-delegation-"));
  const radarPort = await findFreePort();
  const bossAiPort = await findFreePort();
  const database = new RadarDatabase(dataDir);
  const redditEvidence = database.saveEvidence(scoreEvidence({
    source: "reddit",
    externalId: "t3-reddit-geo-1",
    title: "Looking for a reliable smart feeder after mine stopped working",
    body: "Would pay more for offline alerts and reliable feeding history.",
    url: "https://www.reddit.com/r/Pets/comments/reddit_geo_1/smart_feeder/",
    author: "example-user",
    publishedAt: "2026-08-09T00:00:00.000Z",
    engagement: 96,
    query: "smart pet feeder",
    community: "Pets",
    sourceContext: {
      schema: "bossai.reddit-community-context.v1",
      community: "Pets",
      status: "available",
      aboutStatus: "available",
      rulesStatus: "available",
      pinnedPostsStatus: "available",
      aboutUrl: "https://www.reddit.com/r/Pets/about/",
      rulesUrl: "https://www.reddit.com/r/Pets/about/rules",
      description: "A community for pet owners.",
      rules: [{ shortName: "No spam", description: "Disclose commercial affiliation." }],
      pinnedPosts: [{ title: "Community guide", url: "https://www.reddit.com/r/Pets/comments/guide/" }],
      fetchedAt: "2026-08-10T00:00:00.000Z",
    },
  }));
  database.replaceOpportunities([{ ...opportunity, evidenceIds: [redditEvidence.id] }]);
  database.close();

  let installationCalls = 0;
  let managerCreateCalls = 0;
  let managerDetailCalls = 0;
  const capturedManagerBody: { current?: Record<string, unknown> } = {};
  const bossAiServer = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${BOSSAI_JWT}`) {
        sendJson(res, 401, { code: "AUTH_REQUIRED", message: "auth required" });
        return;
      }
      if (req.method === "GET" && req.url === `/api/agents/${INTELLIGENCE_AGENT_ID}`) {
        installationCalls += 1;
        sendJson(res, 200, intelligenceInstallation("verified"));
        return;
      }
      if (req.method === "POST" && req.url === "/api/manager/tasks") {
        managerCreateCalls += 1;
        capturedManagerBody.current = JSON.parse(await readBody(req)) as Record<string, unknown>;
        sendJson(res, 202, managerSubmission());
        return;
      }
      if (req.method === "GET" && req.url === "/api/manager/tasks/manager-radar-1") {
        managerDetailCalls += 1;
        sendJson(res, 200, managerDetail("running"));
        return;
      }
      if (req.url?.includes("/api/workforce/") || req.url?.includes("/run")) {
        sendJson(res, 500, { code: "LEGACY_WORKFORCE_PATH_CALLED" });
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
      BOSSAI_OS_JWT: BOSSAI_JWT,
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
  const headers = { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" };

  const submission = await fetch(`${baseUrl}/api/admin/opportunities/${opportunity.id}/delegate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      objective: "Assess this verified Reddit opportunity and produce a reviewable GEO intelligence decision framework.",
      sourceOperationId: "radar-opportunity-real-1-intelligence-v1",
    }),
  });
  const submissionBody = await submission.text();
  assert.equal(submission.status, 202, submissionBody);
  const submitted = JSON.parse(submissionBody) as {
    runtime: { platform: string; harness: string; profile: string; modelGateway: string; managerContract: string };
    delegation: { bossaiRunId: string; bossaiAgentId: string; sourceOperationId: string; status: string; reviewStatus: string };
    requiresHumanReview: boolean;
    externalActionsExecuted: boolean;
  };
  assert.deepEqual(submitted.runtime, {
    platform: "bossai-os",
    harness: "hermes",
    profile: "bossaiworkforce",
    modelGateway: "bossai-os",
    managerContract: "bossai.manager-task.v1",
  });
  assert.equal(submitted.delegation.bossaiRunId, "manager-radar-1");
  assert.equal(submitted.delegation.bossaiAgentId, INTELLIGENCE_AGENT_ID);
  assert.equal(submitted.delegation.status, "queued");
  assert.equal(submitted.delegation.reviewStatus, "pending");
  assert.equal(submitted.requiresHumanReview, true);
  assert.equal(submitted.externalActionsExecuted, false);
  assert.equal(installationCalls, 1);
  assert.equal(managerCreateCalls, 1);
  assert.equal(capturedManagerBody.current?.requiresApproval, true);
  assert.equal(capturedManagerBody.current?.riskLevel, "L2");
  const managerObjective = String(capturedManagerBody.current?.objective || "");
  assert.match(managerObjective, /BossAI Intelligence Agent/);
  assert.match(managerObjective, /radar-opportunity-real-1-intelligence-v1/);
  assert.match(managerObjective, /Radar 确定性得分：82/);
  assert.match(managerObjective, /Radar 确定性决策：BUILD/);
  assert.match(managerObjective, /EVIDENCE_JSON/);
  assert.match(managerObjective, /\"community\":\"r\/Pets\"/);
  assert.match(managerObjective, /\"engagement\":96/);
  assert.match(managerObjective, /\"rulesStatus\":\"available\"/);
  assert.match(managerObjective, /\"shortName\":\"No spam\"/);
  assert.match(managerObjective, /bossai\.intelligence-handoff\.v1/);
  assert.match(managerObjective, /不得启动扫描/);

  const duplicate = await fetch(`${baseUrl}/api/admin/opportunities/${opportunity.id}/delegate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      objective: "Assess this verified Reddit opportunity and produce a reviewable GEO intelligence decision framework.",
      sourceOperationId: "radar-opportunity-real-1-intelligence-v1",
    }),
  });
  assert.equal(duplicate.status, 200);
  const duplicatePayload = await duplicate.json() as { deduplicated: boolean; run: { status: string; reviewStatus: string } };
  assert.equal(duplicatePayload.deduplicated, true);
  assert.equal(duplicatePayload.run.status, "running");
  assert.equal(duplicatePayload.run.reviewStatus, "approved");
  assert.equal(managerCreateCalls, 1);

  const listing = await fetch(`${baseUrl}/api/admin/bossai/delegations`, { headers: { "x-radar-key": ADMIN_KEY } });
  assert.equal(listing.status, 200);
  const listed = await listing.json() as {
    integration: { harness: string; configured: boolean; agentId: string; managerContract: string };
    items: Array<{ bossaiRunId: string; status: string }>;
  };
  assert.equal(listed.integration.harness, "hermes");
  assert.equal(listed.integration.agentId, INTELLIGENCE_AGENT_ID);
  assert.equal(listed.integration.managerContract, "bossai.manager-task.v1");
  assert.equal(listed.integration.configured, true);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0]?.bossaiRunId, "manager-radar-1");
  assert.equal(listed.items[0]?.status, "running");

  const run = await fetch(`${baseUrl}/api/admin/bossai/runs/manager-radar-1`, { headers: { "x-radar-key": ADMIN_KEY } });
  assert.equal(run.status, 200);
  const runPayload = await run.json() as { run: { status: string; reviewStatus: string; externalActionsExecuted: boolean } };
  assert.equal(runPayload.run.status, "running");
  assert.equal(runPayload.run.reviewStatus, "approved");
  assert.equal(runPayload.run.externalActionsExecuted, false);

  const events = await fetch(`${baseUrl}/api/admin/bossai/runs/manager-radar-1/events`, { headers: { "x-radar-key": ADMIN_KEY } });
  assert.equal(events.status, 200);
  assert.deepEqual(await events.json(), {
    success: true,
    data: [{ type: "bossai.manager.task.progress" }],
  });
  assert.equal(managerDetailCalls, 3);
});

test("blocks Demo opportunities and separately fails closed when employee authentication is missing", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-bossai-fail-closed-"));
  const radarPort = await findFreePort();
  const database = new RadarDatabase(dataDir);
  database.replaceOpportunities([
    { ...opportunity, id: "demo-opportunity", isDemo: true },
    { ...opportunity, id: "real-opportunity-without-auth", isDemo: false },
  ]);
  database.close();

  const radar = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(radarPort),
      HOST: "0.0.0.0",
      DATA_DIR: dataDir,
      RADAR_AUTO_SCAN: "false",
      RADAR_RUN_ON_STARTUP: "false",
      RADAR_ADMIN_API_KEY: ADMIN_KEY,
      COMMERCIAL_LEAD_ADMIN_ENABLED: "true",
      BOSSAI_OS_URL: "http://127.0.0.1:1",
      BOSSAI_OS_JWT: "",
      AI_PROVIDER: "deterministic",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  radar.stdout?.on("data", (chunk) => { output += chunk.toString(); });
  radar.stderr?.on("data", (chunk) => { output += chunk.toString(); });
  context.after(async () => {
    await stopChild(radar);
    rmSync(dataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${radarPort}`;
  await waitForHealth(baseUrl, radar, () => output);
  const demoResponse = await fetch(`${baseUrl}/api/admin/opportunities/demo-opportunity/delegate`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ objective: "Create real work from demo data." }),
  });
  assert.equal(demoResponse.status, 409);
  const demoPayload = await demoResponse.json() as { code: string };
  assert.equal(demoPayload.code, "DEMO_OPPORTUNITY_DELEGATION_BLOCKED");

  const authResponse = await fetch(`${baseUrl}/api/admin/opportunities/real-opportunity-without-auth/delegate`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ objective: "Create a reviewable intelligence assessment from this verified opportunity." }),
  });
  assert.equal(authResponse.status, 503);
  const authPayload = await authResponse.json() as { code: string };
  assert.equal(authPayload.code, "BOSSAI_EMPLOYEE_AUTH_NOT_CONFIGURED");
});

test("blocks an unsigned Intelligence Agent before creating a Manager task", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-bossai-unsigned-agent-"));
  const radarPort = await findFreePort();
  const bossAiPort = await findFreePort();
  const database = new RadarDatabase(dataDir);
  database.replaceOpportunities([opportunity]);
  database.close();
  let managerCreateCalls = 0;

  const bossAiServer = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${BOSSAI_JWT}`) return sendJson(res, 401, { code: "AUTH_REQUIRED" });
    if (req.method === "GET" && req.url === `/api/agents/${INTELLIGENCE_AGENT_ID}`) {
      return sendJson(res, 200, intelligenceInstallation("unverified"));
    }
    if (req.method === "POST" && req.url === "/api/manager/tasks") managerCreateCalls += 1;
    return sendJson(res, 404, { code: "NOT_FOUND" });
  });
  await listen(bossAiServer, bossAiPort);

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
      BOSSAI_OS_JWT: BOSSAI_JWT,
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
  const response = await fetch(`${baseUrl}/api/admin/opportunities/${opportunity.id}/delegate`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ objective: "Assess this verified intelligence opportunity." }),
  });
  assert.equal(response.status, 409);
  const payload = await response.json() as { code: string };
  assert.equal(payload.code, "INTELLIGENCE_AGENT_SIGNATURE_REQUIRED");
  assert.equal(managerCreateCalls, 0);
});

function intelligenceInstallation(signatureStatus: "verified" | "unverified") {
  return {
    installationId: "installation-intelligence-test",
    status: signatureStatus === "verified" ? "enabled" : "installed",
    signatureStatus,
    healthStatus: signatureStatus === "verified" ? "healthy" : "unknown",
    manifest: {
      id: INTELLIGENCE_AGENT_ID,
      version: "0.3.0",
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

function managerSubmission() {
  return {
    schema: "bossai.manager-task.v1",
    task: {
      id: "manager-radar-1",
      status: "pending",
      riskLevel: "L2",
      requiresApproval: true,
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    },
    routing: { status: "matched", agentId: INTELLIGENCE_AGENT_ID },
    executionStarted: false,
    offerEventId: "offer-radar-1",
  };
}

function managerDetail(phase: "running") {
  return {
    schema: "bossai.manager-task-detail.v1",
    phase,
    task: {
      id: "manager-radar-1",
      status: "in_progress",
      riskLevel: "L2",
      requiresApproval: true,
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:01:00.000Z",
    },
    run: { agentId: INTELLIGENCE_AGENT_ID, capability: "intelligence.opportunity.assess" },
    progress: { progress: 65 },
    result: null,
    events: [{ type: "bossai.manager.task.progress" }],
  };
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
