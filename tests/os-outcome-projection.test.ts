import test from "node:test";
import assert from "node:assert/strict";

import type { BossAiManagerRun } from "../src/bossai-os-client.js";
import { buildBossAiOutcomeProjection } from "../src/os-outcome-projection.js";

function run(overrides: Partial<BossAiManagerRun> = {}): BossAiManagerRun {
  return {
    id: "sales-task-1",
    status: "completed",
    reviewStatus: "approved",
    requiresHumanReview: true,
    externalActionsExecuted: false,
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-20T08:30:00.000Z",
    completedAt: "2026-08-20T08:30:00.000Z",
    outcomeAttribution: {
      schema: "bossai.manager-outcome-attribution.v1",
      taskId: "sales-task-1",
      resultRevision: 3,
      generatedAt: "2026-08-20T08:31:00.000Z",
      authority: "bossai-os",
      kpiImpacts: [{
        kpiRef: "goal-1",
        label: "Closed orders",
        direction: "increase",
        delta: 1,
        unit: "orders",
        sourceRef: "goal-observation:obs-1",
      }],
      businessValue: {
        valueType: "realized_revenue",
        amount: 6800,
        currency: "USD",
        method: "observed_source_system",
        sourceRef: "business-system:order:order-1",
      },
      evidenceRefs: ["business-system:order:order-1", "goal-observation:obs-1"],
      readOnly: true,
      mutationPerformed: false,
      persistedByBossAIWork: false,
    },
    ...overrides,
  };
}

test("Radar exposes BossAI OS outcome attribution only as a read-only exact-task projection", () => {
  const projection = buildBossAiOutcomeProjection({
    prospectId: "prospect-1",
    salesManagerTaskId: "sales-task-1",
    salesRun: run(),
  });

  assert.equal(projection.schema, "bossai.outcome-projection.v1");
  assert.equal(projection.status, "available");
  assert.equal(projection.source.project, "bossai-os");
  assert.equal(projection.source.taskId, "sales-task-1");
  assert.equal(projection.attribution?.businessValue?.amount, 6800);
  assert.equal(projection.authority.readOnlyProjection, true);
  assert.equal(projection.authority.radarPersistenceAuthorized, false);
  assert.equal(projection.authority.radarOwnerReviewAuthority, false);
  assert.equal(projection.authority.radarCompatibilityOutcomeValueIsCompanyAuthority, false);
  assert.equal(projection.authority.bossaiOsExecutionLineageAuthority, true);
  assert.equal(projection.authority.bossaiWorkCanonicalOwnerSurface, true);
  assert.equal(projection.authority.externalActionsExecuted, false);
});

test("Radar does not fabricate an outcome when BossAI OS has not attributed one", () => {
  const projection = buildBossAiOutcomeProjection({
    prospectId: "prospect-1",
    salesManagerTaskId: "sales-task-1",
    salesRun: run({ outcomeAttribution: undefined }),
  });
  assert.equal(projection.status, "not-attributed-by-bossai-os");
  assert.equal(projection.attribution, null);
  assert.equal(projection.authority.radarPersistenceAuthorized, false);
});

test("Radar rejects an outcome projection from any task other than the current Sales task", () => {
  assert.throws(
    () => buildBossAiOutcomeProjection({
      prospectId: "prospect-1",
      salesManagerTaskId: "sales-task-current",
      salesRun: run({ id: "sales-task-old" }),
    }),
    /exact current Sales Manager task/u,
  );
});
