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
    events: [{ type: "bossai.manager.task.progress" }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const client = new BossAiOsClient({ baseUrl: "http://bossai.local", jwt: "test-jwt" });
  const run = await client.getRun("manager-task-2");
  assert.equal(run.status, "running");
  assert.equal(run.reviewStatus, "approved");
  assert.equal(run.progress, 65);
  assert.equal(run.requiresHumanReview, true);
  assert.equal(run.externalActionsExecuted, false);
  assert.deepEqual(await client.getRunEvents("manager-task-2"), {
    success: true,
    data: [{ type: "bossai.manager.task.progress" }],
  });
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
