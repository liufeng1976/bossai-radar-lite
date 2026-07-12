import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createRadarMcpServer } from "../src/mcp.js";
import type { RadarClient } from "../src/radar-api-client.js";
import type { FollowUpDraft, FollowUpQueue, Lead, LeadActivity, Opportunity } from "../src/types.js";

function sampleLead(): Lead {
  const now = new Date().toISOString();
  return {
    id: "lead-1",
    intent: "commercial",
    name: "刘风",
    company: "BossAI",
    contact: "liufeng@example.com",
    teamSize: "1",
    timeline: "now",
    deployment: "local",
    budget: "1000-5000",
    scenario: "Test lead",
    requirements: "MCP",
    language: "zh",
    source: "test",
    status: "NEW",
    priority: "HOT",
    score: 88,
    owner: "",
    quoteAmount: null,
    quoteCurrency: "CNY",
    nextFollowUpAt: null,
    consentAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function sampleOpportunity(): Opportunity {
  return {
    id: "opp-1",
    category: "analytics-research",
    title: "海外需求情报雷达",
    summary: "有公开证据支持。",
    targetCustomer: "电商老板",
    problem: "缺少连续需求情报",
    evidenceCount: 6,
    sourceCount: 2,
    avgEvidenceScore: 72,
    score: 84,
    decision: "BUILD",
    priceHint: "¥699–¥2,999/年",
    mvpPlan: ["验证", "交付", "成交"],
    evidenceIds: [1, 2],
    isDemo: false,
    createdAt: new Date().toISOString(),
  };
}

function fakeClient(): RadarClient & { updates: unknown[]; activities: unknown[]; scans: number } {
  const lead = sampleLead();
  const opportunity = sampleOpportunity();
  const activity: LeadActivity = {
    id: 1,
    leadId: lead.id,
    type: "NOTE",
    content: "test",
    createdAt: new Date().toISOString(),
  };
  const draft: FollowUpDraft = {
    language: "zh",
    subject: "跟进",
    message: "刘风，你好",
    recommendedAction: "确认预算",
    suggestedStatus: "QUALIFIED",
    suggestedFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
  const queue: FollowUpQueue = {
    generatedAt: new Date().toISOString(),
    windowDays: 7,
    stats: { total: 1, overdue: 0, today: 0, upcoming: 0, unscheduled: 1, hot: 1 },
    items: [{
      lead,
      bucket: "UNSCHEDULED",
      dueAt: null,
      daysDelta: null,
      urgencyScore: 80,
      reason: "HOT 线索尚未安排跟进。",
      recommendedAction: "确认预算",
      draft,
    }],
  };

  return {
    updates: [],
    activities: [],
    scans: 0,
    async health() { return { ok: true, service: "bossai-radar-lite", version: "0.6.0", time: new Date().toISOString(), running: false }; },
    async overview() { return { stats: { runs: 1, evidence: 6, opportunities: 1, reports: 1, sources: 2 }, config: {}, running: false, scheduler: {}, sourceStatus: [], latestRun: null, latestReport: null }; },
    async listOpportunities() { return [opportunity]; },
    async listEvidence() { return []; },
    async latestReport(language = "zh") { return language === "en" ? "# Radar Report" : "# 雷达日报"; },
    async runScan() { this.scans += 1; return { run: { id: 1, trigger: "manual", status: "success", startedAt: new Date().toISOString(), collectedCount: 1, evidenceCount: 1, opportunityCount: 1, errors: [] }, report: null, opportunities: [opportunity], sources: [] }; },
    async leadStats() { return { total: 1, active: 1, won: 0, lost: 0, waitlist: 0, hot: 1, quotedValue: 0, wonValue: 0, quotedByCurrency: {}, wonByCurrency: {}, byStatus: { NEW: 1, WAITLIST: 0, QUALIFIED: 0, CONTACTED: 0, PROPOSAL: 0, NEGOTIATION: 0, WON: 0, LOST: 0 }, byIntent: { commercial: 1, "pro-waitlist": 0, "white-label": 0, "managed-service": 0 } }; },
    async listLeads() { return [lead]; },
    async getLead() { return { lead, activities: [activity] }; },
    async followups() { return queue; },
    async followupDraft() { return draft; },
    async updateLead(id, patch) { this.updates.push({ id, patch }); return { lead: { ...lead, ...patch }, activities: [] }; },
    async addLeadActivity(id, type, content) { this.activities.push({ id, type, content }); return { activity: { ...activity, leadId: id, type, content }, lead }; },
  };
}

async function connect(options: { allowScan?: boolean; allowLeadWrite?: boolean } = {}) {
  const radar = fakeClient();
  const server = createRadarMcpServer(radar, { ...options, defaultLanguage: "zh" });
  const client = new Client({ name: "mcp-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    radar,
    server,
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

test("exposes nine read-only Radar tools and two prompts by default", async () => {
  const connection = await connect();
  try {
    const tools = await connection.client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    assert.equal(names.length, 9);
    assert.ok(names.includes("radar_health"));
    assert.ok(names.includes("radar_followups"));
    assert.equal(names.includes("radar_run_scan"), false);
    assert.equal(names.includes("radar_update_lead"), false);
    assert.ok(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true));

    const prompts = await connection.client.listPrompts();
    assert.deepEqual(prompts.prompts.map((prompt) => prompt.name).sort(), ["radar_daily_brief", "radar_opportunity_to_mvp"]);
  } finally {
    await connection.close();
  }
});

test("calls read-only tools through the official MCP client", async () => {
  const connection = await connect();
  try {
    const health = await connection.client.callTool({ name: "radar_health", arguments: {} });
    assert.equal(health.isError, undefined);
    assert.match(JSON.stringify(health.structuredContent), /bossai-radar-lite/);

    const opportunities = await connection.client.callTool({ name: "radar_list_opportunities", arguments: { limit: 5 } });
    assert.match(JSON.stringify(opportunities.structuredContent), /海外需求情报雷达/);

    const followups = await connection.client.callTool({ name: "radar_followups", arguments: { language: "zh", days: 7, includeUnscheduled: true } });
    assert.match(JSON.stringify(followups.structuredContent), /UNSCHEDULED/);
  } finally {
    await connection.close();
  }
});

test("optional scan and lead-write tools are gated and callable when enabled", async () => {
  const connection = await connect({ allowScan: true, allowLeadWrite: true });
  try {
    const tools = await connection.client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    assert.equal(names.length, 12);
    assert.ok(names.includes("radar_run_scan"));
    assert.ok(names.includes("radar_update_lead"));
    assert.ok(names.includes("radar_add_lead_activity"));

    const scan = await connection.client.callTool({ name: "radar_run_scan", arguments: {} });
    assert.equal(scan.isError, undefined);
    assert.equal(connection.radar.scans, 1);

    const update = await connection.client.callTool({
      name: "radar_update_lead",
      arguments: { leadId: "lead-1", status: "QUALIFIED", nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    assert.equal(update.isError, undefined);
    assert.equal(connection.radar.updates.length, 1);

    const activity = await connection.client.callTool({
      name: "radar_add_lead_activity",
      arguments: { leadId: "lead-1", type: "CALL", content: "Confirmed budget and decision maker." },
    });
    assert.equal(activity.isError, undefined);
    assert.equal(connection.radar.activities.length, 1);
  } finally {
    await connection.close();
  }
});
