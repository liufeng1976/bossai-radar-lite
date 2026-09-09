import type {
  BossAiDelegation,
  ProspectOutcomeAttribution,
  ProspectOutcomeAttributionStatus,
  ProspectOutcomePortfolioSummary,
  ProspectOutcomeReviewDecision,
  ProspectOutcomeReviewRecord,
  ProspectOutcomeReviewSnapshot,
  ProspectSalesAuthorizationLineage,
  ProspectSalesHandoffBrief,
  ProspectSalesQualificationFieldKey,
} from "./types.js";

const OUTCOME_DECISIONS = new Set<ProspectOutcomeReviewDecision>([
  "confirm-outcome",
  "no-value",
  "observe",
]);
const MAX_OUTCOME_SUMMARY_CHARS = 1_000;
const MAX_REPORTED_VALUE_CLAIM_CHARS = 500;
const MAX_OWNER_VALUE = 1_000_000_000_000;

export class ProspectOutcomeReviewValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = "PROSPECT_OUTCOME_REVIEW_INVALID", status = 400) {
    super(message);
    this.name = "ProspectOutcomeReviewValidationError";
    this.code = code;
    this.status = status;
  }
}

export function parseProspectOutcomeReviewInput(value: unknown): {
  decision: ProspectOutcomeReviewDecision;
  evidenceState: "OBSERVED" | "CONFIRMED";
  summary: string;
  businessValueAmount: number | null;
  businessValueCurrency: string;
} {
  if (!value || typeof value !== "object") {
    throw new ProspectOutcomeReviewValidationError("Outcome review payload must be an object.");
  }
  const input = value as Record<string, unknown>;
  const decision = String(input.decision ?? "").trim() as ProspectOutcomeReviewDecision;
  if (!OUTCOME_DECISIONS.has(decision)) {
    throw new ProspectOutcomeReviewValidationError(
      "decision must be confirm-outcome, no-value, or observe.",
      "PROSPECT_OUTCOME_REVIEW_DECISION_INVALID",
    );
  }

  const summary = String(input.summary ?? "").replace(/\s+/g, " ").trim();
  if (summary.length < 3 || summary.length > MAX_OUTCOME_SUMMARY_CHARS) {
    throw new ProspectOutcomeReviewValidationError(
      `summary must contain 3 to ${MAX_OUTCOME_SUMMARY_CHARS} characters.`,
      "PROSPECT_OUTCOME_REVIEW_SUMMARY_INVALID",
    );
  }

  const rawAmount = input.businessValueAmount;
  const hasAmount = rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== "";
  let businessValueAmount: number | null = null;
  let businessValueCurrency = "";
  if (hasAmount) {
    if (decision !== "confirm-outcome") {
      throw new ProspectOutcomeReviewValidationError(
        "Business value may only be entered when the owner confirms an outcome.",
        "PROSPECT_OUTCOME_VALUE_NOT_ALLOWED",
      );
    }
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_OWNER_VALUE) {
      throw new ProspectOutcomeReviewValidationError(
        `businessValueAmount must be greater than 0 and no more than ${MAX_OWNER_VALUE}.`,
        "PROSPECT_OUTCOME_VALUE_INVALID",
      );
    }
    businessValueAmount = Math.round(amount * 100) / 100;
    businessValueCurrency = String(input.businessValueCurrency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/u.test(businessValueCurrency)) {
      throw new ProspectOutcomeReviewValidationError(
        "businessValueCurrency must be a three-letter currency code when an amount is entered.",
        "PROSPECT_OUTCOME_CURRENCY_INVALID",
      );
    }
  } else if (String(input.businessValueCurrency ?? "").trim()) {
    throw new ProspectOutcomeReviewValidationError(
      "A currency cannot be stored without an owner-entered business value amount.",
      "PROSPECT_OUTCOME_CURRENCY_WITHOUT_VALUE",
    );
  }

  return {
    decision,
    evidenceState: decision === "observe" ? "OBSERVED" : "CONFIRMED",
    summary,
    businessValueAmount,
    businessValueCurrency,
  };
}

export function extractEmployeeReportedValueClaim(output: string): string {
  const lines = String(output || "")
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const claim = lines.find((line) => (
    /(?:business\s+value|revenue|value\s+created|价值|营收|收入|成交金额|订单金额)/iu.test(line)
    || /(?:[$€£¥￥]|\b(?:USD|CNY|RMB|EUR|GBP|JPY)\b)/iu.test(line)
  ));
  return (claim || "").slice(0, MAX_REPORTED_VALUE_CLAIM_CHARS);
}

export function buildProspectOutcomeReviewSnapshot(input: {
  lineage: ProspectSalesAuthorizationLineage;
  handoff: ProspectSalesHandoffBrief;
}): ProspectOutcomeReviewSnapshot {
  const qualificationStates = Object.fromEntries(
    input.handoff.qualificationFields.map((field) => [field.key, field.state]),
  ) as Record<ProspectSalesQualificationFieldKey, ProspectOutcomeReviewSnapshot["qualificationStates"][ProspectSalesQualificationFieldKey]>;
  for (const key of ["real-need", "buyer-authority", "timing", "budget"] as ProspectSalesQualificationFieldKey[]) {
    if (!qualificationStates[key]) qualificationStates[key] = "not-structured";
  }
  return {
    schema: "bossai.prospect-outcome-review-snapshot.v1",
    generatedAt: new Date().toISOString(),
    intelligenceManagerTaskId: input.lineage.intelligenceManagerTaskId,
    ownerDecisionId: input.lineage.ownerDecisionId,
    salesManagerTaskId: input.handoff.managerTaskId,
    salesDisposition: input.handoff.disposition,
    salesReportedWebsiteEvidenceStatus: input.handoff.sourceReportedWebsiteEvidence.status,
    qualificationStates,
    employeeReportedValueClaim: extractEmployeeReportedValueClaim(input.handoff.authoritativeOutput),
  };
}

export function buildProspectOutcomeAttribution(input: {
  prospectId: string;
  lineage: ProspectSalesAuthorizationLineage;
  handoff: ProspectSalesHandoffBrief | null;
  reviewJournal?: readonly ProspectOutcomeReviewRecord[];
  now?: number;
}): ProspectOutcomeAttribution {
  const validLineage = input.lineage.status === "sales-bound"
    && input.lineage.salesTaskBoundToApproval
    && Boolean(input.lineage.ownerDecisionId)
    && Boolean(input.lineage.salesManagerTaskId);
  const matchingReviews = validLineage
    ? matchingProspectOutcomeReviews(input.lineage, input.reviewJournal ?? [])
    : [];
  const latest = matchingReviews[0] ?? null;
  const status = attributionStatus(validLineage, Boolean(input.handoff), latest);
  const businessValue = latest?.decision === "confirm-outcome"
    && latest.businessValueAmount !== null
    && latest.businessValueCurrency
    ? {
        amount: latest.businessValueAmount,
        currency: latest.businessValueCurrency,
        basis: "owner-entered" as const,
      }
    : null;

  return {
    schema: "bossai.prospect-outcome-attribution.v1",
    prospectId: input.prospectId,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    status,
    lineage: {
      intelligenceManagerTaskId: input.lineage.intelligenceManagerTaskId,
      ownerDecisionId: input.lineage.ownerDecisionId,
      salesManagerTaskId: input.lineage.salesManagerTaskId,
      valid: validLineage,
    },
    salesResultEvidence: {
      state: input.handoff ? "REPORTED" : "UNKNOWN",
      sourceAuthority: "bossai-manager",
      disposition: input.handoff?.disposition ?? "not-ready",
      employeeReportedValueClaim: input.handoff
        ? extractEmployeeReportedValueClaim(input.handoff.authoritativeOutput)
        : "",
    },
    ownerReview: latest,
    businessValue,
    reviewHistory: matchingReviews.slice(0, 20),
    truthBoundary: truthBoundary(),
  };
}

export function buildProspectOutcomeReviewState(input: {
  salesDelegation: BossAiDelegation | null;
  lineage: ProspectSalesAuthorizationLineage;
  reviewJournal?: readonly ProspectOutcomeReviewRecord[];
}): {
  status: ProspectOutcomeAttributionStatus;
  currentSalesManagerTaskId: string;
  currentOwnerDecisionId: string;
  latestReview: ProspectOutcomeReviewRecord | null;
} {
  const matchingReviews = matchingProspectOutcomeReviews(input.lineage, input.reviewJournal ?? []);
  const latest = matchingReviews[0] ?? null;
  const ready = input.salesDelegation?.status === "completed"
    && input.lineage.status === "sales-bound"
    && input.lineage.salesTaskBoundToApproval;
  return {
    status: attributionStatus(ready, ready, latest),
    currentSalesManagerTaskId: input.salesDelegation?.bossaiRunId ?? "",
    currentOwnerDecisionId: input.lineage.ownerDecisionId,
    latestReview: latest,
  };
}

export function buildProspectOutcomePortfolioSummary(input: ReadonlyArray<{
  salesDelegation: BossAiDelegation | null;
  lineage: ProspectSalesAuthorizationLineage;
  reviewJournal?: readonly ProspectOutcomeReviewRecord[];
}>, now = Date.now()): ProspectOutcomePortfolioSummary {
  let completedSalesTasks = 0;
  let confirmedOutcomes = 0;
  let awaitingOwnerReview = 0;
  let observing = 0;
  let noValue = 0;
  let unclosed = 0;
  const ownerEnteredValueByCurrency: Record<string, number> = {};

  for (const item of input) {
    if (item.salesDelegation?.status !== "completed") continue;
    completedSalesTasks += 1;
    const lineageValid = item.lineage.status === "sales-bound" && item.lineage.salesTaskBoundToApproval;
    if (!lineageValid) {
      unclosed += 1;
      continue;
    }
    const latest = matchingProspectOutcomeReviews(item.lineage, item.reviewJournal ?? [])[0] ?? null;
    if (!latest) {
      awaitingOwnerReview += 1;
      continue;
    }
    if (latest.decision === "confirm-outcome") {
      confirmedOutcomes += 1;
      if (latest.businessValueAmount !== null && latest.businessValueCurrency) {
        ownerEnteredValueByCurrency[latest.businessValueCurrency] = Math.round((
          (ownerEnteredValueByCurrency[latest.businessValueCurrency] ?? 0) + latest.businessValueAmount
        ) * 100) / 100;
      }
    } else if (latest.decision === "no-value") {
      noValue += 1;
    } else {
      observing += 1;
    }
  }

  return {
    schema: "bossai.prospect-outcome-portfolio.v1",
    generatedAt: new Date(now).toISOString(),
    completedSalesTasks,
    confirmedOutcomes,
    awaitingOwnerReview,
    observing,
    noValue,
    unclosed,
    ownerEnteredValueByCurrency,
    truthBoundary: {
      salesCompletionIsRevenue: false,
      qualificationIsRevenue: false,
      portfolioValueIsAutoEstimated: false,
      employeeReportedValueIncluded: false,
      purchaseIntentInferred: false,
      closeProbabilityInferred: false,
      crmRecordCreated: false,
      outreachExecuted: false,
    },
  };
}

export function matchingProspectOutcomeReviews(
  lineage: ProspectSalesAuthorizationLineage,
  journal: readonly ProspectOutcomeReviewRecord[],
): ProspectOutcomeReviewRecord[] {
  if (!lineage.salesManagerTaskId || !lineage.ownerDecisionId) return [];
  return journal
    .filter((review) => (
      review.salesManagerTaskId === lineage.salesManagerTaskId
      && review.ownerDecisionId === lineage.ownerDecisionId
    ))
    .sort((left, right) => (
      String(right.reviewedAt || "").localeCompare(String(left.reviewedAt || ""))
      || String(right.id || "").localeCompare(String(left.id || ""))
    ))
    .slice(0, 20);
}

function attributionStatus(
  ready: boolean,
  hasReportedResult: boolean,
  latest: ProspectOutcomeReviewRecord | null,
): ProspectOutcomeAttributionStatus {
  if (!ready || !hasReportedResult) return "not-ready";
  if (!latest) return "awaiting-owner-review";
  if (latest.decision === "confirm-outcome") return "confirmed-outcome";
  if (latest.decision === "no-value") return "no-value";
  return "observing";
}

function truthBoundary(): ProspectOutcomeAttribution["truthBoundary"] {
  return {
    salesCompletionIsRevenue: false,
    qualificationIsRevenue: false,
    employeeReportedValueIsConfirmed: false,
    businessValueAutoEstimated: false,
    purchaseIntentInferred: false,
    closeProbabilityInferred: false,
    nextPurchaseDatePredicted: false,
    crmRecordCreated: false,
    outreachExecuted: false,
  };
}
