import type { BossAiManagerRun } from "./bossai-os-client.js";

export const BOSSAI_OUTCOME_PROJECTION_SCHEMA = "bossai.outcome-projection.v1" as const;

export class BossAiOutcomeProjectionError extends Error {
  readonly code: string;

  constructor(message: string, code = "BOSSAI_OUTCOME_PROJECTION_INVALID") {
    super(message);
    this.name = "BossAiOutcomeProjectionError";
    this.code = code;
  }
}

export function buildBossAiOutcomeProjection(input: {
  prospectId: string;
  salesManagerTaskId: string;
  salesRun: BossAiManagerRun | null;
  generatedAt?: string;
}) {
  const prospectId = String(input.prospectId || "").trim();
  const salesManagerTaskId = String(input.salesManagerTaskId || "").trim();
  if (!prospectId) throw new BossAiOutcomeProjectionError("prospectId is required.");

  if (!salesManagerTaskId || !input.salesRun) {
    return {
      schema: BOSSAI_OUTCOME_PROJECTION_SCHEMA,
      status: "not-ready" as const,
      generatedAt: input.generatedAt || new Date().toISOString(),
      source: {
        project: "bossai-os" as const,
        contract: "bossai.manager-outcome-attribution.v1" as const,
        taskId: salesManagerTaskId,
      },
      target: { project: "bossai-radar-lite" as const, prospectId },
      attribution: null,
      authority: authorityBoundary(),
    };
  }

  if (input.salesRun.id !== salesManagerTaskId) {
    throw new BossAiOutcomeProjectionError(
      "BossAI OS outcome projection must be bound to the exact current Sales Manager task.",
      "BOSSAI_OUTCOME_PROJECTION_TASK_MISMATCH",
    );
  }

  const attribution = input.salesRun.outcomeAttribution;
  if (!attribution) {
    return {
      schema: BOSSAI_OUTCOME_PROJECTION_SCHEMA,
      status: "not-attributed-by-bossai-os" as const,
      generatedAt: input.generatedAt || new Date().toISOString(),
      source: {
        project: "bossai-os" as const,
        contract: "bossai.manager-outcome-attribution.v1" as const,
        taskId: salesManagerTaskId,
      },
      target: { project: "bossai-radar-lite" as const, prospectId },
      attribution: null,
      authority: authorityBoundary(),
    };
  }

  if (attribution.taskId !== salesManagerTaskId) {
    throw new BossAiOutcomeProjectionError(
      "BossAI OS attribution task does not match the exact Sales Manager task.",
      "BOSSAI_OUTCOME_PROJECTION_ATTRIBUTION_TASK_MISMATCH",
    );
  }

  return {
    schema: BOSSAI_OUTCOME_PROJECTION_SCHEMA,
    status: "available" as const,
    generatedAt: attribution.generatedAt,
    source: {
      project: "bossai-os" as const,
      contract: attribution.schema,
      taskId: attribution.taskId,
      resultRevision: attribution.resultRevision,
    },
    target: { project: "bossai-radar-lite" as const, prospectId },
    attribution: {
      kpiImpacts: attribution.kpiImpacts,
      businessValue: attribution.businessValue,
      evidenceRefs: attribution.evidenceRefs,
    },
    authority: authorityBoundary(),
  };
}

function authorityBoundary() {
  return {
    readOnlyProjection: true as const,
    radarPersistenceAuthorized: false as const,
    radarOwnerReviewAuthority: false as const,
    radarCompatibilityOutcomeValueIsCompanyAuthority: false as const,
    bossaiOsExecutionLineageAuthority: true as const,
    bossaiWorkCanonicalOwnerSurface: true as const,
    realizedBusinessValueRequiresBossAiOsObservedEvidence: true as const,
    externalActionsExecuted: false as const,
  };
}
