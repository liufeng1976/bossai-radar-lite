import assert from "node:assert/strict";
import test from "node:test";
import { BossAiOsClient, BossAiOsClientError } from "../src/bossai-os-client.js";

const INTELLIGENCE_AGENT_ID = "bossai-intelligence-agent";

test("bounded AI features use the BossAI Central AI Gateway public model alias", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const captured: { current?: { url: string; init: RequestInit } } = {};
  globalThis.fetch = async (input, init) => {
    captured.current = { url: String(input), init: init || {} };
    return new Response(JSON.stringify({
      choices: [{ message: { content: "{\"title\":\"ok\"}" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = new BossAiOsClient({
    baseUrl: "http://127.0.0.1:3001/",
    apiKey: "bossai_test_customer_key",
    model: "bossai-balanced",
  });
  const output = await client.chatCompletion({
    messages: [{ role: "user", content: "analyze" }],
    responseFormat: { type: "json_object" },
  });

  assert.equal(output, "{\"title\":\"ok\"}");
  assert.equal(captured.current?.url, "http://127.0.0.1:3001/v1/chat/completions");
  const headers = new Headers(captured.current?.init.headers);
  assert.equal(headers.get("x-bossai-api-key"), "bossai_test_customer_key");
  assert.equal(headers.has("authorization"), false);
  const body = JSON.parse(String(captured.current?.init.body)) as { model: string };
  assert.equal(body.model, "bossai-balanced");
});

test("employee delegation requires BossAI OS JWT and creates a governed Manager task", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const captured: { url?: string; authorization?: string; body?: Record<string, unknown> } = {};
  globalThis.fetch = async (input, init) => {
    captured.url = String(input);
    captured.authorization = new Headers(init?.headers).get("authorization") || "";
    captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      schema: "bossai.manager-task.v1",
      task: {
        id: "manager-task-1",
        status: "pending",
        riskLevel: "L2",
        requiresApproval: true,
        createdAt: "2026-08-05T00:00:00.000Z",
        updatedAt: "2026-08-05T00:00:00.000Z",
      },
      routing: { status: "matched", agentId: INTELLIGENCE_AGENT_ID },
      executionStarted: false,
      offerEventId: "offer-1",
    }), { status: 202, headers: { "Content-Type": "application/json" } });
  };

  const client = new BossAiOsClient({ baseUrl: "http://bossai.local", jwt: "test-jwt" });
  const submission = await client.queueManagerTask(INTELLIGENCE_AGENT_ID, "Assess verified intelligence evidence.");
  assert.equal(captured.url, "http://bossai.local/api/manager/tasks");
  assert.equal(captured.authorization, "Bearer test-jwt");
  assert.equal(captured.body?.requiresApproval, true);
  assert.equal(captured.body?.riskLevel, "L2");
  assert.equal(submission.runtime.harness, "hermes");
  assert.equal(submission.runtime.profile, "bossaiworkforce");
  assert.equal(submission.runtime.managerContract, "bossai.manager-task.v1");
  assert.equal(submission.agent.id, INTELLIGENCE_AGENT_ID);
  assert.equal(submission.run.id, "manager-task-1");
  assert.equal(submission.run.status, "queued");
  assert.equal(submission.requiresHumanReview, true);
  assert.equal(submission.externalActionsExecuted, false);

  const missing = new BossAiOsClient({ baseUrl: "http://bossai.local" });
  await assert.rejects(
    () => missing.queueManagerTask(INTELLIGENCE_AGENT_ID, "work"),
    (error) => error instanceof BossAiOsClientError && error.code === "BOSSAI_EMPLOYEE_AUTH_NOT_CONFIGURED",
  );
});

test("Manager detail maps execution and review state without fabricating external actions", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    schema: "bossai.manager-task-detail.v1",
    phase: "running",
    task: {
      id: "manager-task-2",
      status: "in_progress",
      requiresApproval: true,
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:01:00.000Z",
    },
    run: { agentId: INTELLIGENCE_AGENT_ID, capability: "intelligence.opportunity.assess" },
    progress: { progress: 65 },
    result: null,
    outcomeAttribution: {
      schema: "bossai.manager-outcome-attribution.v1",
      taskId: "manager-task-2",
      resultRevision: 2,
      generatedAt: "2026-08-05T00:01:00.000Z",
      authority: "bossai-os",
      kpiImpacts: [{
        kpiRef: "goal-1",
        label: "Qualified pipeline",
        direction: "increase",
        delta: 3,
        unit: "leads",
        sourceRef: "goal-observation:obs-1",
      }],
      businessValue: {
        valueType: "realized_revenue",
        amount: 1200,
        currency: "USD",
        method: "observed_source_system",
        sourceRef: "business-system:order:order-1",
      },
      evidenceRefs: ["business-system:order:order-1", "goal-observation:obs-1"],
      readOnly: true,
      mutationPerformed: false,
      persistedByBossAIWork: false,
    },
    events: [{ type: "bossai.manager.task.progress" }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const client = new BossAiOsClient({ baseUrl: "http://bossai.local", jwt: "test-jwt" });
  const run = await client.getRun("manager-task-2");
  assert.equal(run.status, "running");
  assert.equal(run.reviewStatus, "approved");
  assert.equal(run.progress, 65);
  assert.equal(run.requiresHumanReview, true);
  assert.equal(run.externalActionsExecuted, false);
  assert.equal(run.outcomeAttribution?.schema, "bossai.manager-outcome-attribution.v1");
  assert.equal(run.outcomeAttribution?.taskId, "manager-task-2");
  assert.equal(run.outcomeAttribution?.businessValue?.amount, 1200);
  assert.equal(run.outcomeAttribution?.readOnly, true);
  assert.deepEqual(await client.getRunEvents("manager-task-2"), {
    success: true,
    data: [{ type: "bossai.manager.task.progress" }],
  });
});

test("owner business-decision v2 support is declared publicly and exact reads use the separate read-only Workbench key", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const calls: Array<{ url: string; authorization: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, authorization: new Headers(init?.headers).get("authorization") || "" });
    if (url.endsWith("/health")) {
      return new Response(JSON.stringify({
        optionalContracts: {
          ownerBusinessDecisionsV2: {
            schemaVersion: "bossai.owner-business-decision-list.v2",
            method: "GET",
            path: "/api/owner/business-decisions/v2",
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, data: {
      schema: "bossai.owner-business-decision-list.v2",
      generatedAt: "2026-08-20T09:00:00.000Z",
      authority: "bossai-os",
      decisions: [],
      inferredDecisionsIncluded: false,
      automaticExecutionAuthorized: false,
      externalActionsExecuted: false,
    } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = new BossAiOsClient({ baseUrl: "http://bossai.local", jwt: "employee-jwt", workbenchKey: "bossai_live_workbench_read" });
  assert.equal(await client.ownerBusinessDecisionV2Supported(), true);
  assert.deepEqual(await client.listOwnerBusinessDecisionsV2({
    prospectId: "prospect-1",
    intelligenceManagerTaskId: "manager-task-42",
  }), []);
  assert.equal(calls.length, 2);
  const healthCall = calls[0]!;
  const decisionCall = calls[1]!;
  assert.equal(healthCall.authorization, "");
  assert.equal(decisionCall.authorization, "Bearer bossai_live_workbench_read");
  assert.notEqual(decisionCall.authorization, "Bearer employee-jwt");
  assert.match(decisionCall.url, /subjectId=prospect-1/u);
  assert.match(decisionCall.url, /contextId=manager-task-42/u);
});

test("employee delegation rejects wrong routing or a fake Manager response", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    schema: "bossai.manager-task.v1",
    task: {
      id: "fake-task",
      status: "done",
      riskLevel: "L1",
      requiresApproval: false,
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    },
    routing: { status: "matched", agentId: "agent-content-employee" },
    executionStarted: true,
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const client = new BossAiOsClient({ baseUrl: "http://bossai.local", jwt: "test-jwt" });
  await assert.rejects(
    () => client.queueManagerTask(INTELLIGENCE_AGENT_ID, "work"),
    (error) => error instanceof BossAiOsClientError && error.code === "BOSSAI_MANAGER_ROUTING_INVALID",
  );
});
