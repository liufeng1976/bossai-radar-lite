import test from "node:test";
import assert from "node:assert/strict";

import { projectBossAiOwnerBusinessDecision, projectBossAiOwnerBusinessDecisionV2 } from "../src/owner-business-decision-projection.js";

function hasErrorCode(expectedCode: string) {
  return (error: unknown) => typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === expectedCode;
}

function decision(overrides: Record<string, unknown> = {}) {
  return {
    schema: "bossai.owner-business-decision.v1",
    id: "audit-1",
    decisionId: "radar-prospect-1-sales-authorization-v1",
    domain: "sales-prospect",
    subject: { type: "prospect", id: "prospect-1" },
    decisionType: "authorize-sales-qualification",
    reasonCode: "reviewed-intelligence-ready",
    decidedAt: "2026-08-20T09:00:00.000Z",
    authority: "bossai-os",
    actorType: "user",
    actorId: "owner-1",
    automaticExecutionAuthorized: false,
    externalActionsExecuted: false,
    ...overrides,
  };
}

test("Radar projects an explicit exact-subject BossAI OS business decision without becoming decision authority", () => {
  const projection = projectBossAiOwnerBusinessDecision(decision(), "prospect-1");
  assert.equal(projection.schema, "bossai.owner-decision-projection.v1");
  assert.equal(projection.decision.decisionType, "authorize-sales-qualification");
  assert.equal(projection.decision.radarCompatibilityDecision, "approve-sales");
  assert.equal(projection.authority.sourceOfDecisionTruth, "bossai-os");
  assert.equal(projection.authority.bossaiWorkCanonicalOwnerSurface, true);
  assert.equal(projection.authority.radarProjectionOnly, true);
  assert.equal(projection.authority.radarPersistenceAuthorized, false);
  assert.equal(projection.authority.radarOwnerDecisionAuthority, false);
  assert.equal(projection.authority.salesTaskCreationAuthorizedByProjectionAlone, false);
  assert.equal(projection.authority.externalActionsExecuted, false);
});

test("Radar accepts explicit prospect rejection but not generic task approval semantics", () => {
  const rejected = projectBossAiOwnerBusinessDecision(decision({
    decisionId: "radar-prospect-1-rejection-v1",
    decisionType: "reject-prospect",
    reasonCode: "not-a-fit",
  }), "prospect-1");
  assert.equal(rejected.decision.radarCompatibilityDecision, "reject-prospect");

  assert.throws(
    () => projectBossAiOwnerBusinessDecision({
      schema: "bossai.manager-owner-decision-memory.v1",
      id: "approval-1",
      kind: "approval",
      subject: { type: "task", ref: "sales-task-1" },
    }, "prospect-1"),
    hasErrorCode("OWNER_BUSINESS_DECISION_SOURCE_INVALID"),
  );
});

test("Radar v2 requires the exact current Intelligence Manager task and allows only a compatibility projection cache", () => {
  const value = {
    ...decision({ schema: "bossai.owner-business-decision.v2", decisionId: "work-prospect-1-intel-42-v2" }),
    context: { type: "intelligence-manager-task", id: "manager-task-42" },
  };
  const projection = projectBossAiOwnerBusinessDecisionV2(value, "prospect-1", "manager-task-42");
  assert.equal(projection.schema, "bossai.owner-decision-projection.v2");
  assert.equal(projection.decision.contextId, "manager-task-42");
  assert.equal(projection.authority.sourceOfDecisionTruth, "bossai-os");
  assert.equal(projection.authority.compatibilityProjectionCacheAuthorized, true);
  assert.equal(projection.authority.radarOwnerDecisionAuthority, false);
  assert.equal(projection.authority.salesQualificationRequiresSeparateExplicitAction, true);
  assert.equal(projection.authority.externalActionsExecuted, false);
});

test("Radar v2 rejects stale Intelligence context even when the prospect id matches", () => {
  const value = {
    ...decision({ schema: "bossai.owner-business-decision.v2", decisionId: "work-prospect-1-intel-41-v2" }),
    context: { type: "intelligence-manager-task", id: "manager-task-41" },
  };
  assert.throws(
    () => projectBossAiOwnerBusinessDecisionV2(value, "prospect-1", "manager-task-42"),
    hasErrorCode("OWNER_BUSINESS_DECISION_V2_INTELLIGENCE_CONTEXT_MISMATCH"),
  );
});

test("Radar rejects wrong prospect, wrong domain, unsupported decision type and automatic execution authority", () => {
  assert.throws(
    () => projectBossAiOwnerBusinessDecision(decision({ subject: { type: "prospect", id: "prospect-2" } }), "prospect-1"),
    hasErrorCode("OWNER_BUSINESS_DECISION_SUBJECT_MISMATCH"),
  );
  assert.throws(
    () => projectBossAiOwnerBusinessDecision(decision({ domain: "pricing" }), "prospect-1"),
    hasErrorCode("OWNER_BUSINESS_DECISION_SUBJECT_MISMATCH"),
  );
  assert.throws(
    () => projectBossAiOwnerBusinessDecision(decision({ decisionType: "approve-task" }), "prospect-1"),
    hasErrorCode("OWNER_BUSINESS_DECISION_TYPE_INVALID"),
  );
  assert.throws(
    () => projectBossAiOwnerBusinessDecision(decision({ automaticExecutionAuthorized: true }), "prospect-1"),
    hasErrorCode("OWNER_BUSINESS_DECISION_AUTOMATION_FORBIDDEN"),
  );
});
