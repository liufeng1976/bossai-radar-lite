import { buildProspectOutcomeReviewState } from "./outcome-attribution.js";
import { buildProspectOutcomeLearningMembership } from "./outcome-learning.js";
import { buildProspectSalesAuthorizationLineage } from "./sales-authorization.js";
import type { ProjectedProspectOwnerDecisionV2 } from "./owner-business-decision-projection.js";
import { describeHistoricalTradeCadence } from "./trade-records.js";
import type {
  BossAiDelegation,
  CompanyContactBusinessRole,
  ProspectAccountReview,
  ProspectAccountReviewActionKind,
  ProspectAccountReviewStage,
  ProspectAccountReviewStepStatus,
  ProspectBrowserEvidenceRequest,
  ProspectCandidate,
  TradeRecord,
  TradeRecordRole,
} from "./types.js";

export function buildProspectAccountReview(input: {
  prospect: ProspectCandidate;
  tradeRecords?: readonly TradeRecord[];
  intelligenceDelegation?: BossAiDelegation | null;
  salesDelegation?: BossAiDelegation | null;
  latestBrowserRequest?: ProspectBrowserEvidenceRequest | null;
  ownerDecisionJournal?: ProspectAccountReview["ownerDecisionJournal"];
  bossAiOwnerDecisionV2?: ProjectedProspectOwnerDecisionV2 | null;
  outcomeReviewJournal?: readonly NonNullable<ProspectAccountReview["outcomeReview"]["latestReview"]>[];
  now?: number;
}): ProspectAccountReview {
  const prospect = input.prospect;
  const tradeRecords = [...(input.tradeRecords ?? [])].slice(0, 20);
  const intelligence = input.intelligenceDelegation ?? null;
  const sales = input.salesDelegation ?? null;
  const websiteStatus = prospect.websiteEvidenceStatus ?? "unverified";
  const websiteSource = prospect.websiteEvidenceSource ?? "static-http";
  const companyChannels = [...(prospect.companyContactChannels ?? [])].slice(0, 40);
  const channelRoles: CompanyContactBusinessRole[] = unique(companyChannels.map((item) => item.businessRole), 12);
  const tradeHistory = summarizeLinkedTradeHistory(tradeRecords, prospect.websiteUrl, input.now ?? Date.now());
  const ownerDecisionJournal = [...(input.ownerDecisionJournal ?? [])].slice(0, 20);
  const salesAuthorization = buildProspectSalesAuthorizationLineage({
    prospect,
    intelligenceDelegation: intelligence,
    salesDelegation: sales,
    ownerDecisionJournal,
    bossAiOwnerDecisionV2: input.bossAiOwnerDecisionV2 ?? null,
  });
  const outcomeReview = buildProspectOutcomeReviewState({
    salesDelegation: sales,
    lineage: salesAuthorization,
    reviewJournal: input.outcomeReviewJournal ?? [],
  });
  const outcomeLearningMembership = buildProspectOutcomeLearningMembership({
    prospect,
    salesDelegation: sales,
    lineage: salesAuthorization,
    reviewJournal: input.outcomeReviewJournal ?? [],
  });
  const stage = accountReviewStage(prospect, intelligence, sales, salesAuthorization);
  const actions = accountReviewActions(prospect, intelligence, sales, salesAuthorization, outcomeReview);
  const browserRequest = input.latestBrowserRequest ?? null;

  const checklistItems: ProspectAccountReview["evidenceChecklist"]["items"] = [
    { id: "official-website", complete: websiteStatus !== "unverified" },
    { id: "company-offering", complete: Boolean(prospect.description.trim() || prospect.productSignals.length) },
    { id: "business-channel", complete: companyChannels.length > 0 },
    { id: "historical-trade", complete: tradeRecords.length > 0 },
    { id: "intelligence-review", complete: intelligence?.status === "completed" },
    { id: "sales-qualification", complete: sales?.status === "completed" },
  ];

  return {
    schema: "bossai.prospect-account-review.v1",
    prospectId: prospect.id,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    stage,
    prospectStatus: prospect.status,
    company: {
      name: prospect.companyName,
      domain: prospect.domain,
      websiteUrl: prospect.websiteUrl,
      description: prospect.description,
      productSignals: prospect.productSignals.slice(0, 20),
      discoverySourceUrl: prospect.discoverySourceUrl,
      evidenceUrls: prospect.evidenceUrls.slice(0, 20),
      candidateScore: prospect.score,
      firstSeenAt: prospect.firstSeenAt,
      lastSeenAt: prospect.lastSeenAt,
      icpFitScore: prospect.fitScore ?? null,
      icpFitMatches: (prospect.fitMatches ?? []).slice(0, 20),
      icpFitTerms: (prospect.fitTerms ?? []).slice(0, 20),
    },
    websiteEvidence: {
      status: websiteStatus,
      source: websiteSource,
      verifiedAt: prospect.websiteVerifiedAt ?? "",
      latestBrowserRequest: browserRequest
        ? {
            id: browserRequest.id,
            status: browserRequest.status,
            requestedAt: browserRequest.requestedAt,
            updatedAt: browserRequest.updatedAt,
            submittedAt: browserRequest.submittedAt,
            pageUrl: browserRequest.pageUrl,
          }
        : null,
    },
    businessChannels: {
      total: companyChannels.length,
      roles: channelRoles,
      channels: companyChannels,
    },
    tradeHistory,
    workflow: {
      intelligence,
      sales,
      salesAuthorization,
      steps: buildWorkflowSteps(prospect, intelligence, sales, browserRequest),
    },
    evidenceChecklist: {
      completed: checklistItems.filter((item) => item.complete).length,
      total: checklistItems.length,
      items: checklistItems,
    },
    qualificationUnknowns: ["buyer-authority", "real-need", "timing", "budget"],
    blockers: accountReviewBlockers(prospect, intelligence, sales, salesAuthorization),
    actions,
    ownerDecisionJournal,
    outcomeReview,
    outcomeLearningMembership,
    truthBoundary: {
      purchaseIntentInferred: false,
      closeProbabilityInferred: false,
      nextPurchaseDatePredicted: false,
      crmRecordCreated: false,
      outreachExecuted: false,
    },
  };
}

function accountReviewStage(
  prospect: ProspectCandidate,
  intelligence: BossAiDelegation | null,
  sales: BossAiDelegation | null,
  salesAuthorization: ProspectAccountReview["workflow"]["salesAuthorization"],
): ProspectAccountReviewStage {
  if (prospect.status === "REJECTED") return "rejected";
  const websiteStatus = prospect.websiteEvidenceStatus ?? "unverified";
  if (websiteStatus === "unverified") return "verify-website";
  if (websiteStatus === "static-incomplete") return "browser-evidence";

  if (prospect.status === "READY_FOR_SALES") {
    if (!salesAuthorization.validForSalesQualification) return "sales-authorization";
    if (!sales || !salesAuthorization.salesTaskBoundToApproval) return "sales-qualification";
    return sales.status === "completed" ? "sales-result-review" : "sales-qualification";
  }
  if (intelligence?.status === "completed" && prospect.status === "REVIEW_REQUIRED") return "owner-decision";
  return "intelligence-review";
}

function accountReviewActions(
  prospect: ProspectCandidate,
  intelligence: BossAiDelegation | null,
  sales: BossAiDelegation | null,
  salesAuthorization: ProspectAccountReview["workflow"]["salesAuthorization"],
  outcomeReview: ProspectAccountReview["outcomeReview"],
): ProspectAccountReviewActionKind[] {
  if (prospect.status === "REJECTED") return [];
  const websiteStatus = prospect.websiteEvidenceStatus ?? "unverified";
  if (websiteStatus === "unverified") return ["verify-website", "reject-prospect"];
  if (websiteStatus === "static-incomplete") {
    const actions: ProspectAccountReviewActionKind[] = ["request-browser-evidence"];
    if (!intelligence) actions.push("delegate-intelligence");
    else if (["failed", "cancelled"].includes(intelligence.status)) actions.push("retry-intelligence", "refresh-intelligence");
    else if (["queued", "running"].includes(intelligence.status)) actions.push("refresh-intelligence");
    else if (intelligence.status === "completed") actions.push("review-intelligence-result");
    actions.push("reject-prospect");
    return actions;
  }

  if (prospect.status === "READY_FOR_SALES") {
    if (!salesAuthorization.validForSalesQualification) {
      return ["reconfirm-sales-authorization", "reject-prospect"];
    }
    if (!sales || !salesAuthorization.salesTaskBoundToApproval) return ["qualify-sales", "reject-prospect"];
    if (["failed", "cancelled"].includes(sales.status)) return ["retry-sales", "refresh-sales", "reject-prospect"];
    if (["queued", "running"].includes(sales.status)) return ["refresh-sales", "reject-prospect"];
    if (["confirmed-outcome", "no-value"].includes(outcomeReview.status)) {
      return ["review-sales-result", "review-outcome", "reject-prospect"];
    }
    return ["review-outcome", "review-sales-result", "reject-prospect"];
  }

  if (!intelligence) return ["delegate-intelligence", "reject-prospect"];
  if (["failed", "cancelled"].includes(intelligence.status)) return ["retry-intelligence", "refresh-intelligence", "reject-prospect"];
  if (["queued", "running"].includes(intelligence.status)) return ["refresh-intelligence", "reject-prospect"];
  if (intelligence.status === "completed" && prospect.status === "REVIEW_REQUIRED") {
    return ["review-intelligence-result", "approve-sales", "reject-prospect"];
  }
  return ["reject-prospect"];
}

function accountReviewBlockers(
  prospect: ProspectCandidate,
  intelligence: BossAiDelegation | null,
  sales: BossAiDelegation | null,
  salesAuthorization: ProspectAccountReview["workflow"]["salesAuthorization"],
): ProspectAccountReview["blockers"] {
  if (prospect.status === "REJECTED") return ["prospect-rejected"];
  const blockers: ProspectAccountReview["blockers"] = [];
  const websiteStatus = prospect.websiteEvidenceStatus ?? "unverified";
  if (websiteStatus === "unverified") blockers.push("website-unverified");
  if (websiteStatus === "static-incomplete") blockers.push("browser-evidence-required");
  if (intelligence?.status === "failed") blockers.push("intelligence-execution-failed");
  else if (intelligence?.status === "cancelled") blockers.push("intelligence-execution-cancelled");
  else if (websiteStatus === "verified" && intelligence?.status !== "completed") blockers.push("intelligence-not-completed");
  if (websiteStatus === "verified" && intelligence?.status === "completed" && prospect.status === "REVIEW_REQUIRED") {
    blockers.push("owner-sales-decision-required");
  }
  if (prospect.status === "READY_FOR_SALES" && !salesAuthorization.validForSalesQualification) {
    blockers.push("sales-owner-approval-lineage-required");
  }
  if (sales?.status === "failed") blockers.push("sales-execution-failed");
  else if (sales?.status === "cancelled") blockers.push("sales-execution-cancelled");
  else if (prospect.status === "READY_FOR_SALES" && (!sales || !salesAuthorization.salesTaskBoundToApproval || sales.status !== "completed")) {
    blockers.push("sales-qualification-not-completed");
  }
  return blockers;
}

function buildWorkflowSteps(
  prospect: ProspectCandidate,
  intelligence: BossAiDelegation | null,
  sales: BossAiDelegation | null,
  browserRequest: ProspectBrowserEvidenceRequest | null,
): ProspectAccountReview["workflow"]["steps"] {
  const websiteStatus = prospect.websiteEvidenceStatus ?? "unverified";
  const rejected = prospect.status === "REJECTED";
  const browserApplicable = websiteStatus === "static-incomplete"
    || prospect.websiteEvidenceSource === "browser-rendered"
    || Boolean(browserRequest);

  return [
    { id: "discovery", status: "complete" },
    {
      id: "website",
      status: stepStatus({
        complete: websiteStatus !== "unverified",
        current: websiteStatus === "unverified" && !rejected,
        blocked: rejected,
      }),
    },
    {
      id: "browser-evidence",
      status: !browserApplicable
        ? "not-applicable"
        : stepStatus({
            complete: websiteStatus === "verified" && prospect.websiteEvidenceSource === "browser-rendered",
            current: websiteStatus === "static-incomplete" && !rejected,
            blocked: rejected || websiteStatus === "unverified",
          }),
    },
    {
      id: "intelligence",
      status: stepStatus({
        complete: intelligence?.status === "completed",
        current: !rejected && websiteStatus !== "unverified" && Boolean(intelligence) && intelligence?.status !== "completed",
        blocked: rejected || websiteStatus === "unverified" || (websiteStatus === "static-incomplete" && !intelligence),
      }),
    },
    {
      id: "owner-decision",
      status: stepStatus({
        complete: prospect.status === "READY_FOR_SALES",
        current: !rejected && websiteStatus === "verified" && intelligence?.status === "completed" && prospect.status === "REVIEW_REQUIRED",
        blocked: rejected || websiteStatus !== "verified" || intelligence?.status !== "completed",
      }),
    },
    {
      id: "sales",
      status: stepStatus({
        complete: sales?.status === "completed",
        current: !rejected && prospect.status === "READY_FOR_SALES" && sales?.status !== "completed",
        blocked: rejected || prospect.status !== "READY_FOR_SALES",
      }),
    },
  ];
}

function stepStatus(input: { complete: boolean; current: boolean; blocked: boolean }): ProspectAccountReviewStepStatus {
  if (input.complete) return "complete";
  if (input.current) return "current";
  if (input.blocked) return "blocked";
  return "pending";
}

function summarizeLinkedTradeHistory(
  records: readonly TradeRecord[],
  websiteUrl: string,
  now: number,
): ProspectAccountReview["tradeHistory"] {
  if (records.length === 0) {
    return {
      recordCount: 0,
      firstTradeDate: "",
      latestTradeDate: "",
      daysSinceLatestTrade: null,
      historicalCadence: "insufficient",
      reviewPriority: null,
      countries: [],
      roles: [],
      hsCodes: [],
      productDescriptions: [],
      amountByCurrency: {},
      records: [],
    };
  }
  const cadence = describeHistoricalTradeCadence(records.map((item) => item.tradeDate), records.length, websiteUrl, now);
  const amountByCurrency: Record<string, number> = {};
  for (const record of records) {
    if (record.amount === null || !record.currency) continue;
    amountByCurrency[record.currency] = (amountByCurrency[record.currency] ?? 0) + record.amount;
  }
  return {
    recordCount: records.length,
    firstTradeDate: cadence.firstTradeDate,
    latestTradeDate: cadence.latestTradeDate,
    daysSinceLatestTrade: cadence.daysSinceLatestTrade,
    historicalCadence: cadence.historicalCadence,
    reviewPriority: cadence.reviewPriority,
    countries: unique(records.map((item) => item.country).filter(Boolean), 12),
    roles: unique(records.map((item) => item.role).filter((item): item is TradeRecordRole => Boolean(item)), 8),
    hsCodes: unique(records.map((item) => item.hsCode).filter(Boolean), 20),
    productDescriptions: unique(records.map((item) => item.productDescription).filter(Boolean), 20),
    amountByCurrency,
    records: [...records].slice(0, 12),
  };
}

function unique<T>(values: readonly T[], limit: number): T[] {
  return [...new Set(values)].slice(0, limit);
}
