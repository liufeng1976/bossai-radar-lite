import type { ProjectedProspectOwnerDecisionV2 } from "./owner-business-decision-projection.js";
import type {
  BossAiDelegation,
  ProspectCandidate,
  ProspectOwnerDecisionReasonCode,
  ProspectOwnerDecisionRecord,
  ProspectSalesAuthorizationLineage,
} from "./types.js";

function compatibilityReasonCode(value: string): ProspectOwnerDecisionReasonCode {
  const normalized = value.trim();
  if (["intelligence-ready", "evidence-sufficient", "fit-reviewed", "low-fit", "evidence-insufficient", "wrong-company", "unsuitable-market", "duplicate", "owner-judgment", "other"].includes(normalized)) {
    return normalized as ProspectOwnerDecisionReasonCode;
  }
  if (normalized === "strategic-fit") return "fit-reviewed";
  if (normalized === "not-strategic-fit") return "low-fit";
  return "owner-judgment";
}

export function buildProspectSalesAuthorizationLineage(input: {
  prospect: ProspectCandidate;
  intelligenceDelegation?: BossAiDelegation | null;
  salesDelegation?: BossAiDelegation | null;
  ownerDecisionJournal?: readonly ProspectOwnerDecisionRecord[];
  bossAiOwnerDecisionV2?: ProjectedProspectOwnerDecisionV2 | null;
}): ProspectSalesAuthorizationLineage {
  const intelligence = input.intelligenceDelegation ?? null;
  const sales = input.salesDelegation ?? null;
  const approvals = (input.ownerDecisionJournal ?? []).filter((item) => (
    item.decision === "approve-sales"
    && item.targetStatus === "READY_FOR_SALES"
  ));
  const approval = approvals[0] ?? null;
  const osDecision = input.bossAiOwnerDecisionV2 ?? null;
  const osApproval = osDecision?.decision.decisionType === "authorize-sales-qualification" ? osDecision : null;
  const ownerDecisionReasonCode: ProspectSalesAuthorizationLineage["ownerDecisionReasonCode"] = osApproval
    ? compatibilityReasonCode(osApproval.decision.reasonCode)
    : approval?.reasonCode ?? "";
  const base = {
    schema: "bossai.prospect-sales-authorization-lineage.v1" as const,
    ownerDecisionId: osApproval?.source.decisionId ?? approval?.id ?? "",
    ownerDecisionAt: osApproval?.source.decidedAt ?? approval?.decidedAt ?? "",
    ownerDecisionReasonCode,
    intelligenceManagerTaskId: intelligence?.bossaiRunId ?? "",
    decisionIntelligenceManagerTaskId: osApproval?.decision.contextId ?? approval?.snapshot.intelligenceManagerTaskId ?? "",
    salesManagerTaskId: sales?.bossaiRunId ?? "",
    salesDelegationOwnerDecisionId: sales?.ownerDecisionId ?? "",
    truthBoundary: {
      authorizesSalesQualificationOnly: true as const,
      outreachAuthorized: false as const,
      crmWriteAuthorized: false as const,
      purchaseIntentInferred: false as const,
      closeProbabilityInferred: false as const,
      nextPurchaseDatePredicted: false as const,
    },
  };

  if (osDecision?.decision.decisionType === "reject-prospect") {
    return {
      ...base,
      status: "not-applicable",
      validForSalesQualification: false,
      salesTaskBoundToApproval: false,
      requiresOwnerReconfirmation: false,
    };
  }

  if (osApproval) {
    const intelligenceMatches = Boolean(
      intelligence
      && intelligence.status === "completed"
      && osApproval.decision.contextType === "intelligence-manager-task"
      && osApproval.decision.contextId === intelligence.bossaiRunId,
    );
    if (!intelligenceMatches) {
      return {
        ...base,
        status: "intelligence-mismatch",
        validForSalesQualification: false,
        salesTaskBoundToApproval: false,
        requiresOwnerReconfirmation: true,
      };
    }
    if (!sales) {
      return {
        ...base,
        status: "approved",
        validForSalesQualification: true,
        salesTaskBoundToApproval: false,
        requiresOwnerReconfirmation: false,
      };
    }
    if (sales.ownerDecisionId === osApproval.source.decisionId) {
      return {
        ...base,
        status: "sales-bound",
        validForSalesQualification: true,
        salesTaskBoundToApproval: true,
        requiresOwnerReconfirmation: false,
      };
    }
    return {
      ...base,
      status: "approved",
      validForSalesQualification: true,
      salesTaskBoundToApproval: false,
      requiresOwnerReconfirmation: false,
    };
  }

  if (input.prospect.status !== "READY_FOR_SALES") {
    return {
      ...base,
      status: "not-applicable",
      validForSalesQualification: false,
      salesTaskBoundToApproval: false,
      requiresOwnerReconfirmation: false,
    };
  }

  if (!approval) {
    return {
      ...base,
      status: "missing-owner-approval",
      validForSalesQualification: false,
      salesTaskBoundToApproval: false,
      requiresOwnerReconfirmation: true,
    };
  }

  const intelligenceMatches = Boolean(
    intelligence
    && intelligence.status === "completed"
    && approval.snapshot.intelligenceManagerTaskId
    && approval.snapshot.intelligenceManagerTaskId === intelligence.bossaiRunId,
  );
  if (!intelligenceMatches) {
    return {
      ...base,
      status: "intelligence-mismatch",
      validForSalesQualification: false,
      salesTaskBoundToApproval: false,
      requiresOwnerReconfirmation: true,
    };
  }

  if (!sales) {
    return {
      ...base,
      status: "approved",
      validForSalesQualification: true,
      salesTaskBoundToApproval: false,
      requiresOwnerReconfirmation: false,
    };
  }

  if (sales.ownerDecisionId === approval.id) {
    return {
      ...base,
      status: "sales-bound",
      validForSalesQualification: true,
      salesTaskBoundToApproval: true,
      requiresOwnerReconfirmation: false,
    };
  }

  const approvalAt = Date.parse(approval.decidedAt || "");
  const salesSubmittedAt = Date.parse(sales.submittedAt || "");
  const approvalIsNewerThanSales = Number.isFinite(approvalAt)
    && Number.isFinite(salesSubmittedAt)
    && approvalAt > salesSubmittedAt;

  if (approvalIsNewerThanSales) {
    return {
      ...base,
      status: "approved",
      validForSalesQualification: true,
      salesTaskBoundToApproval: false,
      requiresOwnerReconfirmation: false,
    };
  }

  return {
    ...base,
    status: sales.ownerDecisionId ? "sales-lineage-mismatch" : "sales-unbound-legacy",
    validForSalesQualification: false,
    salesTaskBoundToApproval: false,
    requiresOwnerReconfirmation: true,
  };
}
