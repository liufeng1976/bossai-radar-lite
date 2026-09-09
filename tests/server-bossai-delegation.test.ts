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
import { parseTradeRecordImport } from "../src/trade-records.js";
import type { Opportunity } from "../src/types.js";

const ADMIN_KEY = "bossai-delegation-admin-key-1234567890";
const BOSSAI_JWT = "bossai-os-jwt-for-radar-test";
const INTELLIGENCE_AGENT_ID = "bossai-intelligence-agent";
const SALES_AGENT_ID = "bossai-sales-agent";

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
    totalCount: number;
    truncated: boolean;
  };
  assert.equal(listed.integration.harness, "hermes");
  assert.equal(listed.integration.agentId, INTELLIGENCE_AGENT_ID);
  assert.equal(listed.integration.managerContract, "bossai.manager-task.v1");
  assert.equal(listed.integration.configured, true);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.totalCount, 1);
  assert.equal(listed.truncated, false);
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

test("delegates a discovered prospect for Intelligence review without creating a CRM lead", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-prospect-manager-delegation-"));
  const radarPort = await findFreePort();
  const bossAiPort = await findFreePort();
  const database = new RadarDatabase(dataDir);
  const prospect = database.saveProspectCandidate({
    id: "prospect-acme-export",
    domain: "acme.example",
    websiteUrl: "https://acme.example/",
    companyName: "Acme Export",
    description: "Industrial pumps for global distributors.",
    discoverySourceUrl: "https://expo.example/exhibitors",
    discoverySourceTitle: "Global Pump Expo exhibitors",
    discoveryQuery: "https://expo.example/exhibitors",
    publicEmails: ["sales@acme.example"],
    publicPhones: ["+1 555 0100"],
    contactUrls: ["https://acme.example/contact"],
    companyContactChannels: [
      {
        type: "email",
        value: "sales@acme.example",
        url: "mailto:sales@acme.example",
        sourcePageUrl: "https://acme.example/contact",
        sourceKind: "mailto",
        businessRole: "sales",
        confidence: "high",
        verificationStatus: "official-site-observed",
      },
      {
        type: "email",
        value: "procurement@acme.example",
        url: "mailto:procurement@acme.example",
        sourcePageUrl: "https://acme.example/contact",
        sourceKind: "visible-text",
        businessRole: "procurement",
        confidence: "medium",
        verificationStatus: "official-site-observed",
      },
    ],
    productSignals: ["Industrial pumps"],
    evidenceUrls: ["https://expo.example/exhibitors", "https://acme.example/"],
    websiteEvidenceStatus: "verified",
    websiteVerifiedAt: "2026-08-16T12:00:00.000Z",
    score: 84,
    reasons: ["directory source", "official website exposes public contacts"],
    discoveredAt: "2026-08-16T12:00:00.000Z",
  });
  const tradeImport = parseTradeRecordImport([
    "Buyer,Country,Product,HS Code,Date,Quantity,Amount,Currency,Website",
    "Acme Export,US,Industrial pumps,841370,2026-06-10,20,18000,USD,acme.example",
  ].join("\n"), "authorized-customs.csv", Date.parse("2026-08-16T12:05:00.000Z"));
  database.saveTradeRecords(tradeImport.records);
  assert.ok(tradeImport.records[0]);
  database.linkProspectTradeEvidence(prospect.id, tradeImport.records[0].id, "2026-08-16T12:06:00.000Z");
  const unverifiedProspect = database.saveProspectCandidate({
    id: "prospect-search-only",
    domain: "search-only.example",
    websiteUrl: "https://search-only.example/",
    companyName: "Search Only Co",
    description: "Search result snippet only",
    discoverySourceUrl: "https://search.example/result",
    discoverySourceTitle: "Search result",
    discoveryQuery: "industrial distributors",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    productSignals: [],
    evidenceUrls: ["https://search.example/result"],
    websiteEvidenceStatus: "unverified",
    score: 60,
    reasons: ["search discovery only"],
    discoveredAt: "2026-08-16T12:10:00.000Z",
  });
  database.close();

  let managerCreateCalls = 0;
  const capturedManagerBody: { current?: Record<string, unknown> } = {};
  const bossAiServer = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${BOSSAI_JWT}`) {
        sendJson(res, 401, { code: "AUTH_REQUIRED" });
        return;
      }
      if (req.method === "GET" && req.url === `/api/agents/${INTELLIGENCE_AGENT_ID}`) {
        sendJson(res, 200, intelligenceInstallation("verified"));
        return;
      }
      if (req.method === "POST" && req.url === "/api/manager/tasks") {
        managerCreateCalls += 1;
        capturedManagerBody.current = JSON.parse(await readBody(req)) as Record<string, unknown>;
        sendJson(res, 202, managerSubmission());
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
  const searchNotConfigured = await fetch(`${baseUrl}/api/admin/prospects/discover`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: "US pet supplies distributors" }),
  });
  assert.equal(searchNotConfigured.status, 503);
  assert.equal((await searchNotConfigured.json() as { code: string }).code, "PROSPECT_SEARCH_NOT_CONFIGURED");

  const unverifiedResponse = await fetch(`${baseUrl}/api/admin/prospects/${unverifiedProspect.id}/delegate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ objective: "Review search-only prospect evidence." }),
  });
  const unverifiedBody = await unverifiedResponse.json() as { code: string; websiteEvidenceStatus: string; crmRecordCreated: boolean };
  assert.equal(unverifiedResponse.status, 409);
  assert.equal(unverifiedBody.code, "PROSPECT_WEBSITE_EVIDENCE_REQUIRED");
  assert.equal(unverifiedBody.websiteEvidenceStatus, "unverified");
  assert.equal(unverifiedBody.crmRecordCreated, false);
  assert.equal(managerCreateCalls, 0);

  const response = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/delegate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ objective: "Review this public prospect evidence and decide whether it deserves Sales Employee qualification without outreach or CRM creation." }),
  });
  const bodyText = await response.text();
  assert.equal(response.status, 202, bodyText);
  const body = JSON.parse(bodyText) as {
    delegation: { sourceType: string; sourceRecordId: string; status: string };
    prospect: { status: string };
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(body.delegation.sourceType, "prospect");
  assert.equal(body.delegation.sourceRecordId, prospect.id);
  assert.equal(body.delegation.status, "queued");
  assert.equal(body.prospect.status, "REVIEW_REQUIRED");
  assert.equal(body.crmRecordCreated, false);
  assert.equal(body.externalActionsExecuted, false);
  assert.equal(managerCreateCalls, 1);
  const objective = String(capturedManagerBody.current?.objective || "");
  assert.match(objective, /潜客候选证据复核任务/);
  assert.match(objective, /sales\.lead\.qualify/);
  assert.match(objective, /sales@acme\.example/);
  assert.match(objective, /companyContactChannels/);
  assert.match(objective, /procurement@acme\.example/);
  assert.match(objective, /confidence.*购买意图|confidence.*采购概率/u);
  assert.match(objective, /businessRole=procurement.*不表示/u);
  assert.match(objective, /historicalTradeEvidence/);
  assert.match(objective, /authorized-customs\.csv/);
  assert.match(objective, /841370/);
  assert.match(objective, /18000/);
  assert.match(objective, /不得发送邮件|不得.*外联/);
  assert.match(objective, /不得.*CRM/);

  const prospectsResponse = await fetch(`${baseUrl}/api/prospects?limit=10`);
  const prospects = await prospectsResponse.json() as { items: Array<{ id: string; status: string }> };
  assert.equal(prospects.items.find((item) => item.id === prospect.id)?.status, "REVIEW_REQUIRED");
  const leadsResponse = await fetch(`${baseUrl}/api/admin/leads`, { headers: { "x-radar-key": ADMIN_KEY } });
  const leads = await leadsResponse.json() as { items: unknown[] };
  assert.equal(leads.items.length, 0);
});

test("requires completed Intelligence review and explicit human gate before Sales qualification, without CRM creation", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-prospect-sales-gate-"));
  const radarPort = await findFreePort();
  const bossAiPort = await findFreePort();
  const database = new RadarDatabase(dataDir);
  const prospect = database.saveProspectCandidate({
    id: "prospect-acme-sales",
    domain: "acme-sales.example",
    websiteUrl: "https://acme-sales.example/",
    companyName: "Acme Export Sales Candidate",
    description: "Industrial pump exporter for distributors.",
    discoverySourceUrl: "https://expo.example/exhibitors",
    discoverySourceTitle: "Global Pump Expo exhibitors",
    discoveryQuery: "https://expo.example/exhibitors",
    publicEmails: ["sales@acme-sales.example"],
    publicPhones: [],
    contactUrls: ["https://acme-sales.example/contact"],
    companyContactChannels: [
      {
        type: "email",
        value: "sales@acme-sales.example",
        url: "mailto:sales@acme-sales.example",
        sourcePageUrl: "https://acme-sales.example/contact",
        sourceKind: "jsonld-contact-point",
        businessRole: "sales",
        confidence: "high",
        verificationStatus: "official-site-structured",
      },
      {
        type: "contact-page",
        value: "https://acme-sales.example/procurement",
        url: "https://acme-sales.example/procurement",
        sourcePageUrl: "https://acme-sales.example/contact",
        sourceKind: "contact-link",
        businessRole: "procurement",
        confidence: "high",
        verificationStatus: "official-site-observed",
      },
    ],
    productSignals: ["Industrial pumps"],
    evidenceUrls: ["https://expo.example/exhibitors", "https://acme-sales.example/"],
    websiteEvidenceStatus: "verified",
    websiteVerifiedAt: "2026-08-16T12:00:00.000Z",
    score: 86,
    reasons: ["directory source", "official website exposes offering evidence"],
    discoveredAt: "2026-08-16T12:00:00.000Z",
  });
  const salesTradeImport = parseTradeRecordImport([
    "Buyer,Country,Product,HS Code,Date,Quantity,Amount,Currency,Website",
    "Acme Export Sales Candidate,US,Industrial pumps,841370,2026-05-20,40,36000,USD,acme-sales.example",
  ].join("\n"), "authorized-sales-trade.csv", Date.parse("2026-08-16T12:00:30.000Z"));
  database.saveTradeRecords(salesTradeImport.records);
  assert.ok(salesTradeImport.records[0]);
  database.linkProspectTradeEvidence(prospect.id, salesTradeImport.records[0].id, "2026-08-16T12:00:40.000Z");
  database.updateProspectStatus(prospect.id, "REVIEW_REQUIRED");
  database.saveBossAiDelegation({
    sourceType: "prospect",
    sourceRecordId: prospect.id,
    sourceOperationId: "prospect-acme-sales-intelligence-review-v1",
    bossaiRunId: "manager-intel-prospect-complete",
    bossaiAgentId: INTELLIGENCE_AGENT_ID,
    status: "completed",
    reviewStatus: "approved",
    submittedAt: "2026-08-16T12:01:00.000Z",
    updatedAt: "2026-08-16T12:02:00.000Z",
    errorCode: "",
    errorMessage: "",
  });
  database.saveBossAiDelegation({
    sourceType: "opportunity",
    sourceRecordId: "delegation-coverage-fixture",
    sourceOperationId: "delegation-coverage-operation",
    bossaiRunId: "delegation-coverage-run",
    bossaiAgentId: INTELLIGENCE_AGENT_ID,
    status: "completed",
    reviewStatus: "approved",
    submittedAt: "2026-08-16T11:00:00.000Z",
    updatedAt: "2026-08-16T11:01:00.000Z",
    errorCode: "",
    errorMessage: "",
  });
  database.close();

  let salesInstallationCalls = 0;
  let managerCreateCalls = 0;
  let intelligenceResultStatus = "BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE";
  let salesResultCompleted = false;
  const capturedManagerBody: { current?: Record<string, unknown> } = {};
  const bossAiServer = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${BOSSAI_JWT}`) {
        sendJson(res, 401, { code: "AUTH_REQUIRED" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/manager/tasks/manager-intel-prospect-complete") {
        sendJson(res, 200, {
          schema: "bossai.manager-task-detail.v1",
          phase: "completed",
          task: {
            id: "manager-intel-prospect-complete",
            status: "done",
            riskLevel: "L2",
            requiresApproval: true,
            createdAt: "2026-08-16T12:01:00.000Z",
            updatedAt: "2026-08-16T12:02:00.000Z",
          },
          run: { agentId: INTELLIGENCE_AGENT_ID, capability: "intelligence.prospect.brief" },
          progress: { progress: 100 },
          result: { summary: `BossAI prospect review\nstatus: ${intelligenceResultStatus}` },
          events: [],
        });
        return;
      }
      if (req.method === "GET" && req.url === "/api/manager/tasks/manager-sales-prospect-1") {
        sendJson(res, 200, {
          schema: "bossai.manager-task-detail.v1",
          phase: salesResultCompleted ? "completed" : "offered",
          task: {
            id: "manager-sales-prospect-1",
            status: salesResultCompleted ? "done" : "pending",
            riskLevel: "L2",
            requiresApproval: true,
            createdAt: "2026-08-16T12:10:00.000Z",
            updatedAt: "2026-08-16T12:11:00.000Z",
          },
          run: { agentId: SALES_AGENT_ID, capability: "sales.lead.qualify" },
          progress: { progress: salesResultCompleted ? 100 : 0 },
          result: salesResultCompleted ? {
            summary: [
              "销售数字员工｜冷潜客资格判断（待人工审核）",
              "证据边界：",
              "- 官网证据状态：verified；采集来源：static-http；核验时间：2026-08-16T11:50:00.000Z。",
              "资格判断：",
              "- 处置状态：HUMAN_REVIEWED_QUALIFICATION_ALLOWED；",
              "- 真实需求：未知，必须等待真实客户信号或经批准外联后的回应；",
              "- 决策权：未知；",
              "- 采购时间：未知；",
              "- 预算：未知；",
              "业务价值：Sales 员工报告这条线索可能创造 100000 USD；该表述未经老板确认。",
              "人工控制的下一步：由负责人另行决定是否允许外联。",
              "已执行外部动作：无。未联系潜客，未创建或修改 CRM 记录。",
            ].join("\n"),
          } : null,
          events: [],
        });
        return;
      }
      if (req.method === "GET" && req.url === `/api/agents/${SALES_AGENT_ID}`) {
        salesInstallationCalls += 1;
        sendJson(res, 200, salesInstallation("verified"));
        return;
      }
      if (req.method === "POST" && req.url === "/api/manager/tasks") {
        managerCreateCalls += 1;
        capturedManagerBody.current = JSON.parse(await readBody(req)) as Record<string, unknown>;
        sendJson(res, 202, managerSubmissionFor(SALES_AGENT_ID, "manager-sales-prospect-1", "offer-sales-prospect-1"));
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

  const truncatedDelegationsResponse = await fetch(`${baseUrl}/api/admin/bossai/delegations?limit=1`, { headers });
  const truncatedDelegations = await truncatedDelegationsResponse.json() as {
    items: Array<{ bossaiRunId: string }>;
    totalCount: number;
    truncated: boolean;
  };
  assert.equal(truncatedDelegationsResponse.status, 200);
  assert.equal(truncatedDelegations.items.length, 1);
  assert.equal(truncatedDelegations.totalCount, 2);
  assert.equal(truncatedDelegations.truncated, true);

  const premature = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/qualify`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  assert.equal(premature.status, 409);
  assert.equal((await premature.json() as { code: string }).code, "PROSPECT_SALES_APPROVAL_REQUIRED");

  const blockedApprove = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/owner-decision`, {
    method: "POST",
    headers,
    body: JSON.stringify({ decision: "approve-sales", reasonCode: "intelligence-ready", note: "Reviewed Intelligence result." }),
  });
  const blockedApproveBody = await blockedApprove.json() as { code: string; intelligenceHandoffStatus: string };
  assert.equal(blockedApprove.status, 409);
  assert.equal(blockedApproveBody.code, "PROSPECT_BROWSER_EVIDENCE_REQUIRED");
  assert.equal(blockedApproveBody.intelligenceHandoffStatus, "BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE");

  intelligenceResultStatus = "READY_FOR_SALES_QUALIFICATION_REVIEW";
  const directPatch = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "READY_FOR_SALES" }),
  });
  assert.equal(directPatch.status, 409);
  assert.equal((await directPatch.json() as { code: string }).code, "PROSPECT_OWNER_DECISION_REQUIRED");

  const approve = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/owner-decision`, {
    method: "POST",
    headers,
    body: JSON.stringify({ decision: "approve-sales", reasonCode: "intelligence-ready", note: "老板已阅读情报复核结果，同意进入 Sales 资格判断。" }),
  });
  const approveText = await approve.text();
  assert.equal(approve.status, 200, approveText);
  const approved = JSON.parse(approveText) as {
    prospect: { status: string };
    decision: {
      id: string;
      decision: string;
      reasonCode: string;
      previousStatus: string;
      targetStatus: string;
      snapshot: { intelligenceManagerTaskId: string; linkedTradeRecordCount: number; candidateScore: number };
      truthBoundary: { decisionIsSalesProbability: boolean };
    };
    crmRecordCreated: boolean;
  };
  assert.equal(approved.prospect.status, "READY_FOR_SALES");
  assert.match(approved.decision.id, /^owner-decision-/u);
  assert.equal(approved.decision.decision, "approve-sales");
  assert.equal(approved.decision.reasonCode, "intelligence-ready");
  assert.equal(approved.decision.previousStatus, "REVIEW_REQUIRED");
  assert.equal(approved.decision.targetStatus, "READY_FOR_SALES");
  assert.equal(approved.decision.snapshot.intelligenceManagerTaskId, "manager-intel-prospect-complete");
  assert.equal(approved.decision.snapshot.linkedTradeRecordCount, 1);
  assert.equal(approved.decision.truthBoundary.decisionIsSalesProbability, false);
  assert.equal(approved.crmRecordCreated, false);

  const decisionJournal = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/owner-decisions`, { headers });
  const decisionJournalBody = await decisionJournal.json() as { items: Array<{ decision: string; note: string }> };
  assert.equal(decisionJournal.status, 200);
  assert.equal(decisionJournalBody.items.length, 1);
  assert.equal(decisionJournalBody.items[0]?.decision, "approve-sales");
  assert.match(decisionJournalBody.items[0]?.note || "", /老板已阅读/);

  const qualify = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/qualify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ objective: "对已批准潜客执行 sales.lead.qualify，只判断资格与未知项；不得联系潜客或创建 CRM 正式线索。" }),
  });
  const qualifyText = await qualify.text();
  assert.equal(qualify.status, 202, qualifyText);
  const qualified = JSON.parse(qualifyText) as {
    delegation: { sourceType: string; sourceRecordId: string; bossaiAgentId: string; ownerDecisionId: string };
    ownerDecisionId: string;
    salesAuthorization: { status: string; ownerDecisionId: string; salesTaskBoundToApproval: boolean };
    capabilityRequested: string;
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(qualified.delegation.sourceType, "prospect-sales");
  assert.equal(qualified.delegation.sourceRecordId, prospect.id);
  assert.equal(qualified.delegation.bossaiAgentId, SALES_AGENT_ID);
  assert.equal(qualified.delegation.ownerDecisionId, approved.decision.id);
  assert.equal(qualified.ownerDecisionId, approved.decision.id);
  assert.equal(qualified.salesAuthorization.status, "sales-bound");
  assert.equal(qualified.salesAuthorization.ownerDecisionId, approved.decision.id);
  assert.equal(qualified.salesAuthorization.salesTaskBoundToApproval, true);
  assert.equal(qualified.capabilityRequested, "sales.lead.qualify");
  assert.equal(qualified.crmRecordCreated, false);
  assert.equal(qualified.externalActionsExecuted, false);
  assert.equal(salesInstallationCalls, 1);
  assert.equal(managerCreateCalls, 1);
  const managerObjective = String(capturedManagerBody.current?.objective || "");
  assert.match(managerObjective, /指定能力：sales\.lead\.qualify/);
  assert.match(managerObjective, /companyContactChannels/);
  assert.match(managerObjective, /sales@acme-sales\.example/);
  assert.match(managerObjective, /businessRole=procurement.*不能据此判断/u);
  assert.match(managerObjective, /confidence.*不是购买意图/u);
  assert.match(managerObjective, /historicalTradeEvidence/);
  assert.match(managerObjective, /authorized-sales-trade\.csv/);
  assert.match(managerObjective, /841370/);
  assert.match(managerObjective, /36000/);
  assert.match(managerObjective, /历史交易只证明.*不能自动证明当前需求/);
  assert.match(managerObjective, /manager-intel-prospect-complete/);
  assert.match(managerObjective, new RegExp(approved.decision.id));
  assert.match(managerObjective, /ownerDecisionId/);
  assert.match(managerObjective, /ownerDecisionAt/);
  assert.match(managerObjective, /ownerDecisionReasonCode/);
  assert.doesNotMatch(managerObjective, /老板已阅读情报复核结果/u);
  assert.match(managerObjective, /READY_FOR_SALES/);
  assert.match(managerObjective, /不得发送邮件|不得.*外联|不得联系/);
  assert.match(managerObjective, /不得创建或修改 CRM/);

  const salesAccountReviewResponse = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/account-review`, { headers });
  const salesAccountReview = await salesAccountReviewResponse.json() as {
    review: { workflow: { salesAuthorization: { status: string; ownerDecisionId: string; salesTaskBoundToApproval: boolean } } };
  };
  assert.equal(salesAccountReviewResponse.status, 200);
  assert.equal(salesAccountReview.review.workflow.salesAuthorization.status, "sales-bound");
  assert.equal(salesAccountReview.review.workflow.salesAuthorization.ownerDecisionId, approved.decision.id);
  assert.equal(salesAccountReview.review.workflow.salesAuthorization.salesTaskBoundToApproval, true);

  const pendingHandoff = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/sales-handoff-brief`, { headers });
  const pendingHandoffBody = await pendingHandoff.json() as { code: string; managerStatus: string };
  assert.equal(pendingHandoff.status, 409);
  assert.equal(pendingHandoffBody.code, "PROSPECT_SALES_QUALIFICATION_NOT_COMPLETED");
  assert.equal(pendingHandoffBody.managerStatus, "queued");

  const prematureOutcome = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/outcome-review`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      decision: "confirm-outcome",
      summary: "This must remain blocked until Sales is actually completed.",
    }),
  });
  assert.equal(prematureOutcome.status, 409);
  assert.equal((await prematureOutcome.json() as { code: string }).code, "PROSPECT_OUTCOME_SALES_RESULT_REQUIRED");

  salesResultCompleted = true;
  const handoffResponse = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/sales-handoff-brief`, { headers });
  const handoffText = await handoffResponse.text();
  assert.equal(handoffResponse.status, 200, handoffText);
  const handoff = JSON.parse(handoffText) as {
    brief: {
      schema: string;
      managerTaskId: string;
      managerStatus: string;
      disposition: string;
      dispositionMarker: string;
      sourceReportedWebsiteEvidence: { status: string; source: string };
      qualificationFields: Array<{ key: string; state: string; source: string }>;
      ownerApproval: { id: string; reasonCode: string; note: string } | null;
      nextOwnerAction: string;
      authoritativeOutput: string;
      truthBoundary: {
        handoffBriefIsOwnerApproval: boolean;
        qualificationIsCloseProbability: boolean;
        outreachAuthorized: boolean;
        crmWriteAuthorized: boolean;
      };
    };
    briefPersisted: boolean;
    sourceAuthority: string;
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(handoff.brief.schema, "bossai.prospect-sales-handoff-brief.v1");
  assert.equal(handoff.brief.managerTaskId, "manager-sales-prospect-1");
  assert.equal(handoff.brief.managerStatus, "completed");
  assert.equal(handoff.brief.disposition, "qualification-allowed");
  assert.equal(handoff.brief.dispositionMarker, "HUMAN_REVIEWED_QUALIFICATION_ALLOWED");
  assert.deepEqual(handoff.brief.sourceReportedWebsiteEvidence, { status: "verified", source: "static-http" });
  assert.ok(handoff.brief.qualificationFields.every((field) => field.state === "unknown"));
  assert.equal(handoff.brief.ownerApproval?.id, approved.decision.id);
  assert.equal(handoff.brief.ownerApproval?.reasonCode, "intelligence-ready");
  assert.match(handoff.brief.ownerApproval?.note || "", /老板已阅读/);
  assert.equal(handoff.brief.nextOwnerAction, "decide-outreach-separately");
  assert.match(handoff.brief.authoritativeOutput, /未联系潜客/);
  assert.equal(handoff.brief.truthBoundary.handoffBriefIsOwnerApproval, false);
  assert.equal(handoff.brief.truthBoundary.qualificationIsCloseProbability, false);
  assert.equal(handoff.brief.truthBoundary.outreachAuthorized, false);
  assert.equal(handoff.brief.truthBoundary.crmWriteAuthorized, false);
  assert.equal(handoff.briefPersisted, false);
  assert.equal(handoff.sourceAuthority, "bossai-manager");
  assert.equal(handoff.crmRecordCreated, false);
  assert.equal(handoff.externalActionsExecuted, false);

  const outcomeBeforeResponse = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/outcome-attribution`, { headers });
  const outcomeBeforeText = await outcomeBeforeResponse.text();
  assert.equal(outcomeBeforeResponse.status, 200, outcomeBeforeText);
  const outcomeBefore = JSON.parse(outcomeBeforeText) as {
    attribution: {
      schema: string;
      status: string;
      lineage: { ownerDecisionId: string; salesManagerTaskId: string; valid: boolean };
      salesResultEvidence: { state: string; employeeReportedValueClaim: string };
      ownerReview: unknown;
      businessValue: unknown;
      truthBoundary: { salesCompletionIsRevenue: boolean; employeeReportedValueIsConfirmed: boolean; businessValueAutoEstimated: boolean };
    };
  };
  assert.equal(outcomeBefore.attribution.schema, "bossai.prospect-outcome-attribution.v1");
  assert.equal(outcomeBefore.attribution.status, "awaiting-owner-review");
  assert.equal(outcomeBefore.attribution.lineage.ownerDecisionId, approved.decision.id);
  assert.equal(outcomeBefore.attribution.lineage.salesManagerTaskId, "manager-sales-prospect-1");
  assert.equal(outcomeBefore.attribution.lineage.valid, true);
  assert.equal(outcomeBefore.attribution.salesResultEvidence.state, "REPORTED");
  assert.match(outcomeBefore.attribution.salesResultEvidence.employeeReportedValueClaim, /100000 USD/u);
  assert.equal(outcomeBefore.attribution.ownerReview, null);
  assert.equal(outcomeBefore.attribution.businessValue, null);
  assert.equal(outcomeBefore.attribution.truthBoundary.salesCompletionIsRevenue, false);
  assert.equal(outcomeBefore.attribution.truthBoundary.employeeReportedValueIsConfirmed, false);
  assert.equal(outcomeBefore.attribution.truthBoundary.businessValueAutoEstimated, false);

  const outcomeSummaryBeforeResponse = await fetch(`${baseUrl}/api/admin/prospects/outcome-summary`, { headers });
  const outcomeSummaryBefore = await outcomeSummaryBeforeResponse.json() as {
    summary: { completedSalesTasks: number; awaitingOwnerReview: number; confirmedOutcomes: number; ownerEnteredValueByCurrency: Record<string, number> };
  };
  assert.equal(outcomeSummaryBeforeResponse.status, 200);
  assert.equal(outcomeSummaryBefore.summary.completedSalesTasks, 1);
  assert.equal(outcomeSummaryBefore.summary.awaitingOwnerReview, 1);
  assert.equal(outcomeSummaryBefore.summary.confirmedOutcomes, 0);
  assert.deepEqual(outcomeSummaryBefore.summary.ownerEnteredValueByCurrency, {});

  const resultReviewQueueResponse = await fetch(`${baseUrl}/api/admin/prospects/account-review-queue?attention=result-review&limit=100`, { headers });
  const resultReviewQueue = await resultReviewQueueResponse.json() as {
    queue: { items: Array<{ prospectId: string; attention: string; primaryAction: string | null }>; summary: { resultReviewRequired: number } };
    filter: { attention: string | null; limit: number };
  };
  assert.equal(resultReviewQueueResponse.status, 200);
  assert.equal(resultReviewQueue.filter.attention, "result-review");
  assert.equal(resultReviewQueue.queue.items.length, 1);
  assert.equal(resultReviewQueue.queue.items[0]?.prospectId, prospect.id);
  assert.equal(resultReviewQueue.queue.items[0]?.attention, "result-review");
  assert.equal(resultReviewQueue.queue.items[0]?.primaryAction, "review-outcome");
  assert.equal(resultReviewQueue.queue.summary.resultReviewRequired, 1);

  const invalidObservedValue = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/outcome-review`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      decision: "observe",
      summary: "Need another confirmed business signal.",
      businessValueAmount: 100000,
      businessValueCurrency: "USD",
    }),
  });
  assert.equal(invalidObservedValue.status, 400);
  assert.equal((await invalidObservedValue.json() as { code: string }).code, "PROSPECT_OUTCOME_VALUE_NOT_ALLOWED");

  const confirmOutcomeResponse = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/outcome-review`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      decision: "confirm-outcome",
      summary: "老板在外部经营记录中确认了实际结果；此处只记录已知价值，不把 Sales 报告当收入。",
      businessValueAmount: 4200,
      businessValueCurrency: "USD",
    }),
  });
  const confirmOutcomeText = await confirmOutcomeResponse.text();
  assert.equal(confirmOutcomeResponse.status, 200, confirmOutcomeText);
  const confirmedOutcome = JSON.parse(confirmOutcomeText) as {
    review: {
      salesManagerTaskId: string;
      ownerDecisionId: string;
      decision: string;
      evidenceState: string;
      businessValueAmount: number | null;
      businessValueCurrency: string;
      businessValueBasis: string;
      snapshot: { employeeReportedValueClaim: string };
      truthBoundary: { employeeReportedValueIsConfirmed: boolean; businessValueAutoEstimated: boolean };
    };
    attribution: { status: string; businessValue: { amount: number; currency: string; basis: string } | null };
    businessValueAutoEstimated: boolean;
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(confirmedOutcome.review.salesManagerTaskId, "manager-sales-prospect-1");
  assert.equal(confirmedOutcome.review.ownerDecisionId, approved.decision.id);
  assert.equal(confirmedOutcome.review.decision, "confirm-outcome");
  assert.equal(confirmedOutcome.review.evidenceState, "CONFIRMED");
  assert.equal(confirmedOutcome.review.businessValueAmount, 4200);
  assert.equal(confirmedOutcome.review.businessValueCurrency, "USD");
  assert.equal(confirmedOutcome.review.businessValueBasis, "owner-entered");
  assert.match(confirmedOutcome.review.snapshot.employeeReportedValueClaim, /100000 USD/u);
  assert.equal(confirmedOutcome.review.truthBoundary.employeeReportedValueIsConfirmed, false);
  assert.equal(confirmedOutcome.review.truthBoundary.businessValueAutoEstimated, false);
  assert.equal(confirmedOutcome.attribution.status, "confirmed-outcome");
  assert.deepEqual(confirmedOutcome.attribution.businessValue, { amount: 4200, currency: "USD", basis: "owner-entered" });
  assert.equal(confirmedOutcome.businessValueAutoEstimated, false);
  assert.equal(confirmedOutcome.crmRecordCreated, false);
  assert.equal(confirmedOutcome.externalActionsExecuted, false);

  const outcomeJournalResponse = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/outcome-reviews`, { headers });
  const outcomeJournal = await outcomeJournalResponse.json() as { items: Array<{ summary: string; businessValueAmount: number | null }> };
  assert.equal(outcomeJournalResponse.status, 200);
  assert.equal(outcomeJournal.items.length, 1);
  assert.match(outcomeJournal.items[0]?.summary || "", /外部经营记录/u);
  assert.equal(outcomeJournal.items[0]?.businessValueAmount, 4200);

  const outcomeSummaryAfterResponse = await fetch(`${baseUrl}/api/admin/prospects/outcome-summary`, { headers });
  const outcomeSummaryAfter = await outcomeSummaryAfterResponse.json() as {
    summary: { confirmedOutcomes: number; awaitingOwnerReview: number; ownerEnteredValueByCurrency: Record<string, number>; truthBoundary: { employeeReportedValueIncluded: boolean } };
  };
  assert.equal(outcomeSummaryAfterResponse.status, 200);
  assert.equal(outcomeSummaryAfter.summary.confirmedOutcomes, 1);
  assert.equal(outcomeSummaryAfter.summary.awaitingOwnerReview, 0);
  assert.deepEqual(outcomeSummaryAfter.summary.ownerEnteredValueByCurrency, { USD: 4200 });
  assert.equal(outcomeSummaryAfter.summary.truthBoundary.employeeReportedValueIncluded, false);

  const outcomeLearningResponse = await fetch(`${baseUrl}/api/admin/prospects/outcome-learning`, { headers });
  const outcomeLearningText = await outcomeLearningResponse.text();
  assert.equal(outcomeLearningResponse.status, 200, outcomeLearningText);
  const outcomeLearning = JSON.parse(outcomeLearningText) as {
    learning: {
      schema: string;
      sampleCount: number;
      status: string;
      dimensions: Array<{ key: string; cohorts: Array<{ key: string; confirmedCount: number; ownerEnteredValueByCurrency: Record<string, number> }> }>;
      truthBoundary: Record<string, boolean>;
    };
    businessValueAutoEstimated: boolean;
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
    managerTasksCreated: number;
    modelsCalled: number;
  };
  assert.equal(outcomeLearning.learning.schema, "bossai.prospect-outcome-learning.v1");
  assert.equal(outcomeLearning.learning.sampleCount, 1);
  assert.equal(outcomeLearning.learning.status, "insufficient-sample");
  const sourceLearning = outcomeLearning.learning.dimensions.find((item) => item.key === "discovery-source")?.cohorts[0];
  assert.equal(sourceLearning?.confirmedCount, 1);
  assert.deepEqual(sourceLearning?.ownerEnteredValueByCurrency, { USD: 4200 });
  assert.equal(outcomeLearningText.includes("100000 USD"), false);
  assert.equal(outcomeLearning.learning.truthBoundary.causalityInferred, false);
  assert.equal(outcomeLearning.learning.truthBoundary.closeProbabilityInferred, false);
  assert.equal(outcomeLearning.learning.truthBoundary.purchaseIntentInferred, false);
  assert.equal(outcomeLearning.learning.truthBoundary.nextPurchaseDatePredicted, false);
  assert.equal(outcomeLearning.learning.truthBoundary.scoreMutationPerformed, false);
  assert.equal(outcomeLearning.businessValueAutoEstimated, false);
  assert.equal(outcomeLearning.crmRecordCreated, false);
  assert.equal(outcomeLearning.externalActionsExecuted, false);
  assert.equal(outcomeLearning.managerTasksCreated, 0);
  assert.equal(outcomeLearning.modelsCalled, 0);

  const sourceCohortKey = sourceLearning?.key || "";
  assert.ok(sourceCohortKey);
  const drilldownResponse = await fetch(`${baseUrl}/api/admin/prospects/outcome-learning/drilldown?dimension=discovery-source&cohort=${encodeURIComponent(sourceCohortKey)}`, { headers });
  const drilldownText = await drilldownResponse.text();
  assert.equal(drilldownResponse.status, 200, drilldownText);
  const drilldownPayload = JSON.parse(drilldownText) as {
    drilldown: {
      schema: string;
      dimension: string;
      cohortKey: string;
      outcomeStateFilter: string | null;
      cohortSampleCount: number;
      sampleCount: number;
      items: Array<{ prospectId: string; companyName: string; contributionState: string }>;
      truthBoundary: { currentEligibleSamplesOnly: boolean; alphabeticalOrderingOnly: boolean; rankingPerformed: boolean; businessValueIncluded: boolean; ownerReviewNoteIncluded: boolean };
    };
    businessValueIncluded: boolean;
    ownerReviewNoteIncluded: boolean;
    rankingPerformed: boolean;
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
    managerTasksCreated: number;
    modelsCalled: number;
  };
  assert.equal(drilldownPayload.drilldown.schema, "bossai.prospect-outcome-learning-drilldown.v1");
  assert.equal(drilldownPayload.drilldown.dimension, "discovery-source");
  assert.equal(drilldownPayload.drilldown.cohortKey, sourceCohortKey);
  assert.equal(drilldownPayload.drilldown.outcomeStateFilter, null);
  assert.equal(drilldownPayload.drilldown.cohortSampleCount, 1);
  assert.equal(drilldownPayload.drilldown.sampleCount, 1);
  assert.equal(drilldownPayload.drilldown.items[0]?.prospectId, prospect.id);
  assert.equal(drilldownPayload.drilldown.items[0]?.contributionState, "confirmed");
  assert.equal(drilldownPayload.drilldown.truthBoundary.currentEligibleSamplesOnly, true);
  assert.equal(drilldownPayload.drilldown.truthBoundary.alphabeticalOrderingOnly, true);
  assert.equal(drilldownPayload.drilldown.truthBoundary.rankingPerformed, false);
  assert.equal(drilldownPayload.drilldown.truthBoundary.businessValueIncluded, false);
  assert.equal(drilldownPayload.drilldown.truthBoundary.ownerReviewNoteIncluded, false);
  assert.equal(drilldownPayload.businessValueIncluded, false);
  assert.equal(drilldownPayload.ownerReviewNoteIncluded, false);
  assert.equal(drilldownPayload.rankingPerformed, false);
  assert.equal(drilldownPayload.crmRecordCreated, false);
  assert.equal(drilldownPayload.externalActionsExecuted, false);
  assert.equal(drilldownPayload.managerTasksCreated, 0);
  assert.equal(drilldownPayload.modelsCalled, 0);
  assert.equal(drilldownText.includes("4200"), false);
  assert.equal(drilldownText.includes("外部经营记录"), false);
  assert.equal(drilldownText.includes("100000 USD"), false);

  const confirmedDrilldownResponse = await fetch(`${baseUrl}/api/admin/prospects/outcome-learning/drilldown?dimension=discovery-source&cohort=${encodeURIComponent(sourceCohortKey)}&state=confirmed`, { headers });
  const confirmedDrilldown = await confirmedDrilldownResponse.json() as { drilldown: { outcomeStateFilter: string | null; cohortSampleCount: number; sampleCount: number; items: Array<{ prospectId: string; contributionState: string }> } };
  assert.equal(confirmedDrilldownResponse.status, 200);
  assert.equal(confirmedDrilldown.drilldown.outcomeStateFilter, "confirmed");
  assert.equal(confirmedDrilldown.drilldown.cohortSampleCount, 1);
  assert.equal(confirmedDrilldown.drilldown.sampleCount, 1);
  assert.equal(confirmedDrilldown.drilldown.items[0]?.prospectId, prospect.id);
  assert.equal(confirmedDrilldown.drilldown.items[0]?.contributionState, "confirmed");

  const observingDrilldownResponse = await fetch(`${baseUrl}/api/admin/prospects/outcome-learning/drilldown?dimension=discovery-source&cohort=${encodeURIComponent(sourceCohortKey)}&state=observing`, { headers });
  const observingDrilldown = await observingDrilldownResponse.json() as { drilldown: { outcomeStateFilter: string | null; cohortSampleCount: number; sampleCount: number; items: unknown[] } };
  assert.equal(observingDrilldownResponse.status, 200);
  assert.equal(observingDrilldown.drilldown.outcomeStateFilter, "observing");
  assert.equal(observingDrilldown.drilldown.cohortSampleCount, 1);
  assert.equal(observingDrilldown.drilldown.sampleCount, 0);
  assert.equal(observingDrilldown.drilldown.items.length, 0);

  const invalidStateDrilldown = await fetch(`${baseUrl}/api/admin/prospects/outcome-learning/drilldown?dimension=discovery-source&cohort=${encodeURIComponent(sourceCohortKey)}&state=winner`, { headers });
  assert.equal(invalidStateDrilldown.status, 400);
  assert.equal((await invalidStateDrilldown.json() as { code: string }).code, "OUTCOME_LEARNING_STATE_INVALID");

  const invalidDrilldown = await fetch(`${baseUrl}/api/admin/prospects/outcome-learning/drilldown?dimension=winner&cohort=${encodeURIComponent(sourceCohortKey)}`, { headers });
  assert.equal(invalidDrilldown.status, 400);
  assert.equal((await invalidDrilldown.json() as { code: string }).code, "OUTCOME_LEARNING_DIMENSION_INVALID");

  const postOutcomeAccountReviewResponse = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/account-review`, { headers });
  const postOutcomeAccountReview = await postOutcomeAccountReviewResponse.json() as {
    review: {
      outcomeLearningMembership: {
        eligible: boolean;
        sampleContributionState: string;
        truthBoundary: { cohortMembershipIsNotRanking: boolean; closeProbabilityInferred: boolean };
      };
    };
  };
  assert.equal(postOutcomeAccountReviewResponse.status, 200);
  assert.equal(postOutcomeAccountReview.review.outcomeLearningMembership.eligible, true);
  assert.equal(postOutcomeAccountReview.review.outcomeLearningMembership.sampleContributionState, "confirmed");
  assert.equal(postOutcomeAccountReview.review.outcomeLearningMembership.truthBoundary.cohortMembershipIsNotRanking, true);
  assert.equal(postOutcomeAccountReview.review.outcomeLearningMembership.truthBoundary.closeProbabilityInferred, false);

  const closedQueueResponse = await fetch(`${baseUrl}/api/admin/prospects/account-review-queue`, { headers });
  const closedQueue = await closedQueueResponse.json() as { queue: { items: Array<{ prospectId: string; attention: string; primaryAction: string | null }>; summary: { closed: number } } };
  const closedItem = closedQueue.queue.items.find((item) => item.prospectId === prospect.id);
  assert.equal(closedItem?.attention, "closed");
  assert.equal(closedQueue.queue.summary.closed, 1);

  const publicProspectsResponse = await fetch(`${baseUrl}/api/prospects?limit=10`);
  const publicProspectsPayload = await publicProspectsResponse.json() as { items: unknown[] };
  assert.equal(JSON.stringify(publicProspectsPayload).includes("36000"), false);
  assert.equal(JSON.stringify(publicProspectsPayload).includes("authorized-sales-trade.csv"), false);
  assert.equal(JSON.stringify(publicProspectsPayload).includes("4200"), false);
  assert.equal(JSON.stringify(publicProspectsPayload).includes("外部经营记录"), false);
  assert.equal(JSON.stringify(publicProspectsPayload).includes("100000 USD"), false);
  assert.equal(JSON.stringify(publicProspectsPayload).includes("bossai.prospect-outcome-learning.v1"), false);
  assert.equal(JSON.stringify(publicProspectsPayload).includes("ownerEnteredValueByCurrency"), false);

  const leadsResponse = await fetch(`${baseUrl}/api/admin/leads`, { headers: { "x-radar-key": ADMIN_KEY } });
  const leads = await leadsResponse.json() as { items: unknown[] };
  assert.equal(leads.items.length, 0);
});

test("legacy READY_FOR_SALES without an owner approval fails closed until the owner explicitly reconfirms the current Intelligence lineage", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-prospect-sales-lineage-legacy-"));
  const radarPort = await findFreePort();
  const bossAiPort = await findFreePort();
  const database = new RadarDatabase(dataDir);
  const legacyProspect = database.saveProspectCandidate({
    id: "prospect-legacy-ready-without-decision",
    domain: "legacy-ready.example",
    websiteUrl: "https://legacy-ready.example/",
    companyName: "Legacy Ready Industrial",
    description: "Industrial valve exporter.",
    discoverySourceUrl: "https://expo.example/legacy-ready",
    discoverySourceTitle: "Expo",
    discoveryQuery: "industrial valve exporter",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    companyContactChannels: [],
    productSignals: ["Industrial valves"],
    evidenceUrls: ["https://legacy-ready.example/"],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T08:00:00.000Z",
    score: 74,
    reasons: ["verified official website"],
    discoveredAt: "2026-08-18T07:00:00.000Z",
  });
  database.updateProspectStatus(legacyProspect.id, "REVIEW_REQUIRED");
  database.saveBossAiDelegation({
    sourceType: "prospect",
    sourceRecordId: legacyProspect.id,
    sourceOperationId: "legacy-ready-intelligence-review",
    bossaiRunId: "manager-intel-legacy-ready",
    bossaiAgentId: INTELLIGENCE_AGENT_ID,
    status: "completed",
    reviewStatus: "approved",
    submittedAt: "2026-08-18T08:10:00.000Z",
    updatedAt: "2026-08-18T08:20:00.000Z",
  });
  // Simulate a legacy/pre-P5 row whose status was already READY_FOR_SALES but has no owner-decision journal.
  database.updateProspectStatus(legacyProspect.id, "READY_FOR_SALES");
  database.close();

  let managerCreateCalls = 0;
  const capturedManagerBody: { current?: Record<string, unknown> } = {};
  const bossAiServer = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${BOSSAI_JWT}`) {
        sendJson(res, 401, { code: "AUTH_REQUIRED" });
        return;
      }
      if (req.method === "GET" && req.url === "/api/manager/tasks/manager-intel-legacy-ready") {
        sendJson(res, 200, {
          schema: "bossai.manager-task-detail.v1",
          phase: "completed",
          task: {
            id: "manager-intel-legacy-ready",
            status: "done",
            riskLevel: "L2",
            requiresApproval: true,
            createdAt: "2026-08-18T08:10:00.000Z",
            updatedAt: "2026-08-18T08:20:00.000Z",
          },
          run: { agentId: INTELLIGENCE_AGENT_ID, capability: "intelligence.prospect.brief" },
          progress: { progress: 100 },
          result: { summary: "Verified legacy prospect review\nstatus: READY_FOR_SALES_QUALIFICATION_REVIEW" },
          events: [],
        });
        return;
      }
      if (req.method === "GET" && req.url === `/api/agents/${SALES_AGENT_ID}`) {
        sendJson(res, 200, salesInstallation("verified"));
        return;
      }
      if (req.method === "POST" && req.url === "/api/manager/tasks") {
        managerCreateCalls += 1;
        capturedManagerBody.current = JSON.parse(await readBody(req)) as Record<string, unknown>;
        sendJson(res, 202, managerSubmissionFor(SALES_AGENT_ID, "manager-sales-after-reconfirm", "offer-sales-after-reconfirm"));
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

  const blocked = await fetch(`${baseUrl}/api/admin/prospects/${legacyProspect.id}/qualify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ objective: "Qualify this legacy READY account without outreach or CRM mutation." }),
  });
  const blockedBody = await blocked.json() as {
    code: string;
    reconfirmSalesAuthorization: boolean;
    salesAuthorization: { status: string; validForSalesQualification: boolean; requiresOwnerReconfirmation: boolean };
  };
  assert.equal(blocked.status, 409);
  assert.equal(blockedBody.code, "PROSPECT_OWNER_APPROVAL_LINEAGE_REQUIRED");
  assert.equal(blockedBody.reconfirmSalesAuthorization, true);
  assert.equal(blockedBody.salesAuthorization.status, "missing-owner-approval");
  assert.equal(blockedBody.salesAuthorization.validForSalesQualification, false);
  assert.equal(blockedBody.salesAuthorization.requiresOwnerReconfirmation, true);
  assert.equal(managerCreateCalls, 0);

  const beforeReview = await fetch(`${baseUrl}/api/admin/prospects/${legacyProspect.id}/account-review`, { headers });
  const beforeReviewBody = await beforeReview.json() as {
    review: {
      stage: string;
      actions: string[];
      blockers: string[];
      workflow: { salesAuthorization: { status: string } };
    };
  };
  assert.equal(beforeReview.status, 200);
  assert.equal(beforeReviewBody.review.stage, "sales-authorization");
  assert.equal(beforeReviewBody.review.workflow.salesAuthorization.status, "missing-owner-approval");
  assert.equal(beforeReviewBody.review.actions[0], "reconfirm-sales-authorization");
  assert.ok(beforeReviewBody.review.blockers.includes("sales-owner-approval-lineage-required"));

  const privateReconfirmNote = "Legacy READY row reviewed again by owner; private authorization repair note.";
  const reconfirm = await fetch(`${baseUrl}/api/admin/prospects/${legacyProspect.id}/owner-decision`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      decision: "approve-sales",
      reasonCode: "intelligence-ready",
      note: privateReconfirmNote,
      reconfirmSalesAuthorization: true,
    }),
  });
  const reconfirmText = await reconfirm.text();
  assert.equal(reconfirm.status, 200, reconfirmText);
  const reconfirmed = JSON.parse(reconfirmText) as {
    prospect: { status: string };
    decision: { id: string; previousStatus: string; targetStatus: string; snapshot: { intelligenceManagerTaskId: string } };
    salesAuthorizationReconfirmed: boolean;
    review: { stage: string; workflow: { salesAuthorization: { status: string; ownerDecisionId: string } } };
  };
  assert.equal(reconfirmed.prospect.status, "READY_FOR_SALES");
  assert.equal(reconfirmed.decision.previousStatus, "READY_FOR_SALES");
  assert.equal(reconfirmed.decision.targetStatus, "READY_FOR_SALES");
  assert.equal(reconfirmed.decision.snapshot.intelligenceManagerTaskId, "manager-intel-legacy-ready");
  assert.equal(reconfirmed.salesAuthorizationReconfirmed, true);
  assert.equal(reconfirmed.review.stage, "sales-qualification");
  assert.equal(reconfirmed.review.workflow.salesAuthorization.status, "approved");
  assert.equal(reconfirmed.review.workflow.salesAuthorization.ownerDecisionId, reconfirmed.decision.id);

  const qualify = await fetch(`${baseUrl}/api/admin/prospects/${legacyProspect.id}/qualify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ objective: "Qualify this explicitly reconfirmed account; do not contact it or create CRM state." }),
  });
  const qualifyText = await qualify.text();
  assert.equal(qualify.status, 202, qualifyText);
  const qualified = JSON.parse(qualifyText) as {
    ownerDecisionId: string;
    delegation: { ownerDecisionId: string; bossaiRunId: string };
    salesAuthorization: { status: string; salesTaskBoundToApproval: boolean };
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(qualified.ownerDecisionId, reconfirmed.decision.id);
  assert.equal(qualified.delegation.ownerDecisionId, reconfirmed.decision.id);
  assert.equal(qualified.delegation.bossaiRunId, "manager-sales-after-reconfirm");
  assert.equal(qualified.salesAuthorization.status, "sales-bound");
  assert.equal(qualified.salesAuthorization.salesTaskBoundToApproval, true);
  assert.equal(qualified.crmRecordCreated, false);
  assert.equal(qualified.externalActionsExecuted, false);
  assert.equal(managerCreateCalls, 1);
  const managerObjective = String(capturedManagerBody.current?.objective || "");
  assert.match(managerObjective, new RegExp(reconfirmed.decision.id));
  assert.match(managerObjective, /manager-intel-legacy-ready/u);
  assert.doesNotMatch(managerObjective, new RegExp(privateReconfirmNote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const duplicateReconfirm = await fetch(`${baseUrl}/api/admin/prospects/${legacyProspect.id}/owner-decision`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      decision: "approve-sales",
      reasonCode: "intelligence-ready",
      note: "No second repair should be necessary.",
      reconfirmSalesAuthorization: true,
    }),
  });
  assert.equal(duplicateReconfirm.status, 409);
  assert.equal((await duplicateReconfirm.json() as { code: string }).code, "PROSPECT_SALES_AUTHORIZATION_ALREADY_VALID");
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

function salesInstallation(signatureStatus: "verified" | "unverified") {
  return {
    installationId: "installation-sales-test",
    status: signatureStatus === "verified" ? "enabled" : "installed",
    signatureStatus,
    healthStatus: signatureStatus === "verified" ? "healthy" : "unknown",
    manifest: {
      id: SALES_AGENT_ID,
      version: "0.2.0",
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

function managerSubmissionFor(agentId: string, taskId: string, offerEventId: string) {
  return {
    schema: "bossai.manager-task.v1",
    task: {
      id: taskId,
      status: "pending",
      riskLevel: "L2",
      requiresApproval: true,
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    },
    routing: { status: "matched", agentId },
    executionStarted: false,
    offerEventId,
  };
}

function managerSubmission() {
  return managerSubmissionFor(INTELLIGENCE_AGENT_ID, "manager-radar-1", "offer-radar-1");
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
