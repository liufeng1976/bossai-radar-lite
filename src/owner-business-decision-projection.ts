export const OWNER_BUSINESS_DECISION_SCHEMA = "bossai.owner-business-decision.v1" as const;
export const OWNER_BUSINESS_DECISION_V2_SCHEMA = "bossai.owner-business-decision.v2" as const;
export const OWNER_DECISION_PROJECTION_SCHEMA = "bossai.owner-decision-projection.v1" as const;
export const OWNER_DECISION_V2_PROJECTION_SCHEMA = "bossai.owner-decision-projection.v2" as const;

export type ProjectedProspectOwnerDecision = {
  schema: typeof OWNER_DECISION_PROJECTION_SCHEMA;
  status: "projected";
  prospectId: string;
  source: {
    project: "bossai-os";
    contract: typeof OWNER_BUSINESS_DECISION_SCHEMA;
    decisionId: string;
    auditId: string;
    decidedAt: string;
    actorType: string;
    actorId: string;
  };
  decision: {
    domain: "sales-prospect";
    subjectType: "prospect";
    subjectId: string;
    decisionType: "authorize-sales-qualification" | "reject-prospect";
    radarCompatibilityDecision: "approve-sales" | "reject-prospect";
    reasonCode: string;
  };
  authority: {
    sourceOfDecisionTruth: "bossai-os";
    bossaiWorkCanonicalOwnerSurface: true;
    radarProjectionOnly: true;
    radarPersistenceAuthorized: false;
    radarOwnerDecisionAuthority: false;
    salesTaskCreationAuthorizedByProjectionAlone: false;
    externalActionsExecuted: false;
  };
};

export type ProjectedProspectOwnerDecisionV2 = {
  schema: typeof OWNER_DECISION_V2_PROJECTION_SCHEMA;
  status: "projected";
  prospectId: string;
  intelligenceManagerTaskId: string;
  source: {
    project: "bossai-os";
    contract: typeof OWNER_BUSINESS_DECISION_V2_SCHEMA;
    decisionId: string;
    auditId: string;
    decidedAt: string;
    actorType: string;
    actorId: string;
  };
  decision: {
    domain: "sales-prospect";
    subjectType: "prospect";
    subjectId: string;
    decisionType: "authorize-sales-qualification" | "reject-prospect";
    radarCompatibilityDecision: "approve-sales" | "reject-prospect";
    reasonCode: string;
    contextType: "intelligence-manager-task";
    contextId: string;
  };
  authority: {
    sourceOfDecisionTruth: "bossai-os";
    bossaiWorkCanonicalOwnerSurface: true;
    radarProjectionOnly: true;
    radarPersistenceAuthorized: false;
    compatibilityProjectionCacheAuthorized: true;
    radarOwnerDecisionAuthority: false;
    salesQualificationRequiresSeparateExplicitAction: true;
    externalActionsExecuted: false;
  };
};

export class OwnerBusinessDecisionProjectionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = "OWNER_BUSINESS_DECISION_PROJECTION_INVALID", status = 400) {
    super(message);
    this.name = "OwnerBusinessDecisionProjectionError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function token(value: unknown, maximum: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maximum || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) return "";
  return normalized;
}

function timestamp(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && normalized.length <= 64 && Number.isFinite(Date.parse(normalized)) ? normalized : "";
}

export function projectBossAiOwnerBusinessDecision(value: unknown, expectedProspectId: string): ProjectedProspectOwnerDecision {
  const prospectId = token(expectedProspectId, 160);
  if (!prospectId) {
    throw new OwnerBusinessDecisionProjectionError("Expected prospect id is invalid.", "OWNER_BUSINESS_DECISION_PROSPECT_ID_INVALID");
  }
  if (!isRecord(value) || value.schema !== OWNER_BUSINESS_DECISION_SCHEMA || value.authority !== "bossai-os") {
    throw new OwnerBusinessDecisionProjectionError(
      "Only an explicit BossAI OS owner business decision may be projected.",
      "OWNER_BUSINESS_DECISION_SOURCE_INVALID",
    );
  }
  if (value.automaticExecutionAuthorized !== false || value.externalActionsExecuted !== false) {
    throw new OwnerBusinessDecisionProjectionError(
      "Owner business decision projection must not carry automatic execution authority.",
      "OWNER_BUSINESS_DECISION_AUTOMATION_FORBIDDEN",
    );
  }
  if (!isRecord(value.subject)) {
    throw new OwnerBusinessDecisionProjectionError("Owner business decision subject is invalid.", "OWNER_BUSINESS_DECISION_SUBJECT_INVALID");
  }

  const auditId = token(value.id, 120);
  const decisionId = token(value.decisionId, 120);
  const domain = token(value.domain, 64);
  const subjectType = token(value.subject.type, 64);
  const subjectId = token(value.subject.id, 160);
  const decisionType = token(value.decisionType, 80);
  const reasonCode = token(value.reasonCode, 80);
  const decidedAt = timestamp(value.decidedAt);
  const actorType = token(value.actorType, 64);
  const actorId = token(value.actorId, 120);
  if (!auditId || !decisionId || !reasonCode || !decidedAt || !actorType || !actorId) {
    throw new OwnerBusinessDecisionProjectionError("Owner business decision identity is invalid.", "OWNER_BUSINESS_DECISION_IDENTITY_INVALID");
  }
  if (domain !== "sales-prospect" || subjectType !== "prospect" || subjectId !== prospectId) {
    throw new OwnerBusinessDecisionProjectionError(
      "Owner business decision is not bound to this exact sales prospect.",
      "OWNER_BUSINESS_DECISION_SUBJECT_MISMATCH",
      409,
    );
  }
  if (!(["authorize-sales-qualification", "reject-prospect"] as string[]).includes(decisionType)) {
    throw new OwnerBusinessDecisionProjectionError(
      "Owner business decision type is not supported for Radar prospect projection.",
      "OWNER_BUSINESS_DECISION_TYPE_INVALID",
    );
  }

  const typedDecision = decisionType as "authorize-sales-qualification" | "reject-prospect";
  return {
    schema: OWNER_DECISION_PROJECTION_SCHEMA,
    status: "projected",
    prospectId,
    source: {
      project: "bossai-os",
      contract: OWNER_BUSINESS_DECISION_SCHEMA,
      decisionId,
      auditId,
      decidedAt,
      actorType,
      actorId,
    },
    decision: {
      domain: "sales-prospect",
      subjectType: "prospect",
      subjectId,
      decisionType: typedDecision,
      radarCompatibilityDecision: typedDecision === "authorize-sales-qualification" ? "approve-sales" : "reject-prospect",
      reasonCode,
    },
    authority: {
      sourceOfDecisionTruth: "bossai-os",
      bossaiWorkCanonicalOwnerSurface: true,
      radarProjectionOnly: true,
      radarPersistenceAuthorized: false,
      radarOwnerDecisionAuthority: false,
      salesTaskCreationAuthorizedByProjectionAlone: false,
      externalActionsExecuted: false,
    },
  };
}

export function projectBossAiOwnerBusinessDecisionV2(
  value: unknown,
  expectedProspectId: string,
  expectedIntelligenceManagerTaskId: string,
): ProjectedProspectOwnerDecisionV2 {
  const prospectId = token(expectedProspectId, 160);
  const intelligenceManagerTaskId = token(expectedIntelligenceManagerTaskId, 160);
  if (!prospectId || !intelligenceManagerTaskId) {
    throw new OwnerBusinessDecisionProjectionError(
      "Expected prospect or Intelligence Manager task id is invalid.",
      "OWNER_BUSINESS_DECISION_V2_EXPECTED_CONTEXT_INVALID",
    );
  }
  if (!isRecord(value) || value.schema !== OWNER_BUSINESS_DECISION_V2_SCHEMA || value.authority !== "bossai-os") {
    throw new OwnerBusinessDecisionProjectionError(
      "Only an explicit BossAI OS v2 owner business decision may be projected.",
      "OWNER_BUSINESS_DECISION_V2_SOURCE_INVALID",
    );
  }
  if (value.automaticExecutionAuthorized !== false || value.externalActionsExecuted !== false) {
    throw new OwnerBusinessDecisionProjectionError(
      "Owner business decision v2 projection must not carry automatic execution authority.",
      "OWNER_BUSINESS_DECISION_V2_AUTOMATION_FORBIDDEN",
    );
  }
  if (!isRecord(value.subject) || !isRecord(value.context)) {
    throw new OwnerBusinessDecisionProjectionError(
      "Owner business decision v2 subject/context is invalid.",
      "OWNER_BUSINESS_DECISION_V2_CONTEXT_INVALID",
    );
  }
  const auditId = token(value.id, 120);
  const decisionId = token(value.decisionId, 120);
  const domain = token(value.domain, 64);
  const subjectType = token(value.subject.type, 64);
  const subjectId = token(value.subject.id, 160);
  const decisionType = token(value.decisionType, 80);
  const reasonCode = token(value.reasonCode, 80);
  const contextType = token(value.context.type, 64);
  const contextId = token(value.context.id, 160);
  const decidedAt = timestamp(value.decidedAt);
  const actorType = token(value.actorType, 64);
  const actorId = token(value.actorId, 120);
  if (!auditId || !decisionId || !reasonCode || !decidedAt || !actorType || !actorId) {
    throw new OwnerBusinessDecisionProjectionError(
      "Owner business decision v2 identity is invalid.",
      "OWNER_BUSINESS_DECISION_V2_IDENTITY_INVALID",
    );
  }
  if (domain !== "sales-prospect" || subjectType !== "prospect" || subjectId !== prospectId) {
    throw new OwnerBusinessDecisionProjectionError(
      "Owner business decision v2 is not bound to this exact sales prospect.",
      "OWNER_BUSINESS_DECISION_V2_SUBJECT_MISMATCH",
      409,
    );
  }
  if (contextType !== "intelligence-manager-task" || contextId !== intelligenceManagerTaskId) {
    throw new OwnerBusinessDecisionProjectionError(
      "Owner business decision v2 is not bound to the exact current Intelligence Manager task.",
      "OWNER_BUSINESS_DECISION_V2_INTELLIGENCE_CONTEXT_MISMATCH",
      409,
    );
  }
  if (!(["authorize-sales-qualification", "reject-prospect"] as string[]).includes(decisionType)) {
    throw new OwnerBusinessDecisionProjectionError(
      "Owner business decision v2 type is not supported for Radar prospect projection.",
      "OWNER_BUSINESS_DECISION_V2_TYPE_INVALID",
    );
  }
  const typedDecision = decisionType as "authorize-sales-qualification" | "reject-prospect";
  return {
    schema: OWNER_DECISION_V2_PROJECTION_SCHEMA,
    status: "projected",
    prospectId,
    intelligenceManagerTaskId,
    source: {
      project: "bossai-os",
      contract: OWNER_BUSINESS_DECISION_V2_SCHEMA,
      decisionId,
      auditId,
      decidedAt,
      actorType,
      actorId,
    },
    decision: {
      domain: "sales-prospect",
      subjectType: "prospect",
      subjectId,
      decisionType: typedDecision,
      radarCompatibilityDecision: typedDecision === "authorize-sales-qualification" ? "approve-sales" : "reject-prospect",
      reasonCode,
      contextType: "intelligence-manager-task",
      contextId,
    },
    authority: {
      sourceOfDecisionTruth: "bossai-os",
      bossaiWorkCanonicalOwnerSurface: true,
      radarProjectionOnly: true,
      radarPersistenceAuthorized: false,
      compatibilityProjectionCacheAuthorized: true,
      radarOwnerDecisionAuthority: false,
      salesQualificationRequiresSeparateExplicitAction: true,
      externalActionsExecuted: false,
    },
  };
}
