#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filename) => readFileSync(path.join(root, filename), "utf8");

const requiredFiles = [
  "src/bossai-os-client.ts",
  "docs/BOSSAI_OS_MIGRATION.md",
  "tests/bossai-os-client.test.ts",
  "tests/server-bossai-delegation.test.ts",
  "governance/current-batch.preflight.json",
  "release/constitutional-evidence.json",
];
for (const filename of requiredFiles) {
  assert.equal(existsSync(path.join(root, filename)), true, `Missing migration file: ${filename}`);
}

const config = read("src/config.ts");
const ai = read("src/ai.ts");
const client = read("src/bossai-os-client.ts");
const server = read("src/server.ts");
const collectors = read("src/collectors.ts");
const database = read("src/database.ts");
const ui = read("public/app.js");
const envExample = read(".env.example");
const migrationDoc = read("docs/BOSSAI_OS_MIGRATION.md");
const activeSource = [config, ai, client, server, collectors, database, ui].join("\n");

const forbiddenDirectProviderPatterns = [
  ["AI_API_KEY", /\bAI_API_KEY\b/],
  ["AI_BASE_URL", /\bAI_BASE_URL\b/],
  ["openai-compatible provider mode", /openai-compatible/],
  ["direct DeepSeek endpoint", /https:\/\/api\.deepseek\.com/i],
  ["direct DeepSeek model default", /deepseek-chat/],
];
for (const [label, pattern] of forbiddenDirectProviderPatterns) {
  assert.equal(pattern.test([config, ai, client, server, database].join("\n")), false, `Forbidden direct Provider path remains: ${label}`);
}

assert.match(client, /\/v1\/chat\/completions/);
assert.match(client, /x-bossai-api-key/);
assert.match(client, /Authorization:\s*`Bearer \$\{this\.jwt\}`/);
assert.match(client, /\/api\/agents\/\$\{encodeURIComponent\(agentId\)\}/);
assert.match(client, /\/api\/manager\/tasks/);
assert.match(client, /bossai\.manager-task\.v1/);
assert.match(client, /bossai\.manager-task-detail\.v1/);
assert.match(client, /queueManagerTask/);
assert.match(client, /getAgentInstallation/);
assert.match(client, /externalActionsExecuted:\s*false/);

assert.match(server, /INTELLIGENCE_AGENT_ID = "bossai-intelligence-agent"/);
assert.match(server, /INTELLIGENCE_AGENT_VERSION = "0\.3\.0"/);
assert.match(server, /\/api\/admin\/opportunities\/:id\/delegate/);
assert.match(server, /DEMO_OPPORTUNITY_DELEGATION_BLOCKED/);
assert.match(server, /sourceOperationId/);
assert.match(server, /getAgentInstallation\(agentId\)/);
assert.match(server, /assertIntelligenceAgentReady/);
assert.match(server, /signatureStatus !== "verified"/);
assert.match(server, /installation\.status !== "enabled"/);
assert.match(server, /installation\.healthStatus !== "healthy"/);
assert.match(server, /events\.subscribe/);
assert.match(server, /events\.publish/);
assert.match(server, /queueManagerTask\(agentId, managerObjective\)/);
assert.match(server, /Radar 确定性得分/);
assert.match(server, /Radar 确定性决策/);
assert.match(server, /不得启动扫描/);
assert.match(server, /EVIDENCE_JSON/);
assert.match(server, /bossai\.intelligence-handoff\.v1/);
assert.match(server, /redditCommunityFromUrl/);
assert.match(server, /communityContext:\s*item\.sourceContext/);
assert.match(collectors, /bossai\.reddit-community-context\.v1/);
assert.match(collectors, /about\/rules\.json/);
assert.match(collectors, /hot\.json/);
assert.match(database, /source_context_json/);
assert.match(server, /sourceProduct:\s*"bossai-radar-lite"|sourceProduct.*bossai-radar-lite/s);

assert.match(database, /CREATE TABLE IF NOT EXISTS bossai_delegations/);
assert.match(database, /source_operation_id TEXT NOT NULL UNIQUE/);
assert.match(ui, /data-delegate-opportunity/);
assert.match(ui, /data-delegate-reddit-geo/);
assert.match(ui, /employee\.delegateRedditGeo/);
assert.match(ui, /bossai\.intelligence-handoff\.v1/);
assert.match(ui, /BossAI Intelligence Agent/);
assert.match(ui, /BUILD \/ SELL_SERVICE \/ WATCH \/ IGNORE/);
assert.doesNotMatch(ui, /agent-content-employee|agent-private-domain-employee|agent-exposure-employee/);

const retiredActivePatterns = [
  ["legacy direct Agent Run endpoint", /\/api\/agents\/[^\n]{0,120}\/run/],
  ["legacy Workforce Run endpoint", /\/api\/workforce\/runs/],
  ["legacy queueAgentRun client", /queueAgentRun/],
  ["legacy content employee ID", /agent-content-employee/],
  ["legacy private-domain employee ID", /agent-private-domain-employee/],
  ["legacy exposure employee ID", /agent-exposure-employee/],
];
for (const [label, pattern] of retiredActivePatterns) {
  assert.equal(pattern.test(activeSource), false, `Retired architecture returned to active Radar source: ${label}`);
}

assert.match(migrationDoc, /bossai-intelligence-agent@0\.3\.0/);
assert.match(migrationDoc, /POST `\/api\/manager\/tasks`/);
assert.match(migrationDoc, /Radar deterministic scores|Radar Lite remains authoritative|Radar deterministic/);
assert.match(migrationDoc, /formal Agent registration/);

assert.match(envExample, /BOSSAI_OS_API_KEY=/);
assert.match(envExample, /BOSSAI_OS_JWT=/);
assert.doesNotMatch(envExample, /AI_API_KEY=/);
assert.doesNotMatch(envExample, /AI_BASE_URL=/);

process.stdout.write(`${JSON.stringify({
  ok: true,
  project: "bossai-radar-lite",
  classification: "ai-assistant",
  aiFeatureGateway: "bossai-os",
  employeePlatform: "bossai-os",
  employeeHarness: "hermes",
  employeeProfile: "bossaiworkforce",
  managerContract: "bossai.manager-task.v1",
  employeePlugin: "bossai-intelligence-agent@0.3.0",
  exactPluginReadinessRequired: true,
  localSecondRuntime: false,
  directProviderAccess: false,
  legacyAgentRunActive: false,
  legacyWorkforceRunActive: false,
  demoDelegationBlocked: true,
  unsignedPluginBlocked: true,
  localStateOwnership: "Radar domain records plus BossAI Manager task references only",
}, null, 2)}\n`);
