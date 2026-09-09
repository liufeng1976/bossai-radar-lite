import type {
  ProspectAccountReview,
  ProspectOwnerDecisionKind,
  ProspectOwnerDecisionReasonCode,
  ProspectOwnerDecisionSnapshot,
} from "./types.js";

const APPROVE_REASONS = new Set<ProspectOwnerDecisionReasonCode>([
  "intelligence-ready",
  "evidence-sufficient",
  "fit-reviewed",
  "owner-judgment",
  "other",
]);

const REJECT_REASONS = new Set<ProspectOwnerDecisionReasonCode>([
  "low-fit",
  "evidence-insufficient",
  "wrong-company",
  "unsuitable-market",
  "duplicate",
  "owner-judgment",
  "other",
]);

const ALL_REASONS = new Set<ProspectOwnerDecisionReasonCode>([
  ...APPROVE_REASONS,
  ...REJECT_REASONS,
]);

export class ProspectOwnerDecisionValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProspectOwnerDecisionValidationError";
  }
}

export function parseProspectOwnerDecisionInput(body: unknown): {
  decision: ProspectOwnerDecisionKind;
  reasonCode: ProspectOwnerDecisionReasonCode;
  note: string;
} {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const decision = String(input.decision ?? "").trim() as ProspectOwnerDecisionKind;
  if (!(["approve-sales", "reject-prospect"] as const).includes(decision)) {
    throw new ProspectOwnerDecisionValidationError(
      "PROSPECT_OWNER_DECISION_INVALID",
      "Owner decision must be approve-sales or reject-prospect",
    );
  }

  const reasonCode = String(input.reasonCode ?? "").trim() as ProspectOwnerDecisionReasonCode;
  if (!ALL_REASONS.has(reasonCode)) {
    throw new ProspectOwnerDecisionValidationError(
      "PROSPECT_OWNER_DECISION_REASON_INVALID",
      "A supported owner-decision reason is required",
    );
  }
  const allowedReasons = decision === "approve-sales" ? APPROVE_REASONS : REJECT_REASONS;
  if (!allowedReasons.has(reasonCode)) {
    throw new ProspectOwnerDecisionValidationError(
      "PROSPECT_OWNER_DECISION_REASON_MISMATCH",
      "The selected reason is not valid for this owner decision",
    );
  }

  const note = String(input.note ?? "").replace(/\r\n?/gu, "\n").trim();
  if (note.length > 1_000) {
    throw new ProspectOwnerDecisionValidationError(
      "PROSPECT_OWNER_DECISION_NOTE_TOO_LONG",
      "Owner decision note must not exceed 1000 characters",
    );
  }
  if (reasonCode === "other" && note.length < 3) {
    throw new ProspectOwnerDecisionValidationError(
      "PROSPECT_OWNER_DECISION_NOTE_REQUIRED",
      "A short note is required when the owner selects Other",
    );
  }

  return { decision, reasonCode, note };
}

export function buildProspectOwnerDecisionSnapshot(review: ProspectAccountReview): ProspectOwnerDecisionSnapshot {
  return {
    schema: "bossai.prospect-owner-decision-snapshot.v1",
    generatedAt: review.generatedAt,
    accountReviewStage: review.stage,
    prospectStatusBefore: review.prospectStatus,
    websiteEvidenceStatus: review.websiteEvidence.status,
    websiteEvidenceSource: review.websiteEvidence.source,
    evidenceCompleted: review.evidenceChecklist.completed,
    evidenceTotal: review.evidenceChecklist.total,
    businessChannelCount: review.businessChannels.total,
    linkedTradeRecordCount: review.tradeHistory.recordCount,
    tradeReviewPriority: review.tradeHistory.reviewPriority,
    candidateScore: review.company.candidateScore,
    intelligenceManagerTaskId: review.workflow.intelligence?.bossaiRunId ?? "",
    intelligenceStatus: review.workflow.intelligence?.status ?? "not-started",
    salesManagerTaskId: review.workflow.sales?.bossaiRunId ?? "",
    salesStatus: review.workflow.sales?.status ?? "not-started",
    blockers: [...review.blockers],
  };
}
