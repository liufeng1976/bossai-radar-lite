import type {
  ProspectAccountReview,
  ProspectOwnerHandlingPriority,
  ProspectOwnerReviewQueue,
  ProspectOwnerReviewQueueItem,
} from "./types.js";

const HANDLING_ORDER: Record<ProspectOwnerHandlingPriority, number> = {
  P0_OWNER_DECISION: 0,
  P1_EXECUTION_EXCEPTION: 1,
  P1_RESULT_REVIEW: 2,
  P2_EVIDENCE_RECOVERY: 3,
  P3_NEXT_STEP_READY: 4,
  P4_WAITING_ON_EMPLOYEE: 5,
  P5_CLOSED: 6,
};

export function buildProspectOwnerReviewQueue(
  reviews: readonly ProspectAccountReview[],
  now = Date.now(),
): ProspectOwnerReviewQueue {
  const items = reviews.map((review) => toQueueItem(review)).sort(compareQueueItems);
  const byHandlingPriority: ProspectOwnerReviewQueue["summary"]["byHandlingPriority"] = {
    P0_OWNER_DECISION: 0,
    P1_EXECUTION_EXCEPTION: 0,
    P1_RESULT_REVIEW: 0,
    P2_EVIDENCE_RECOVERY: 0,
    P3_NEXT_STEP_READY: 0,
    P4_WAITING_ON_EMPLOYEE: 0,
    P5_CLOSED: 0,
  };
  for (const item of items) byHandlingPriority[item.handlingPriority] += 1;

  return {
    schema: "bossai.prospect-owner-review-queue.v1",
    generatedAt: new Date(now).toISOString(),
    items,
    summary: {
      total: items.length,
      ownerDecisionRequired: items.filter((item) => item.attention === "decision-required").length,
      executionExceptions: items.filter((item) => item.attention === "execution-exception").length,
      resultReviewRequired: items.filter((item) => item.attention === "result-review").length,
      actionReady: items.filter((item) => item.attention === "action-ready").length,
      waitingOnEmployee: items.filter((item) => item.attention === "waiting").length,
      closed: items.filter((item) => item.attention === "closed").length,
      byHandlingPriority,
    },
    truthBoundary: {
      handlingPriorityIsSalesProbability: false,
      automaticRetryExecuted: false,
      purchaseIntentInferred: false,
      closeProbabilityInferred: false,
      nextPurchaseDatePredicted: false,
      crmRecordCreated: false,
      outreachExecuted: false,
    },
  };
}

function toQueueItem(review: ProspectAccountReview): ProspectOwnerReviewQueueItem {
  const executionException = executionExceptionForReview(review);
  const { handlingPriority, attention } = classifyReview(review, executionException);
  const waitingOnEmployee = attention === "waiting";
  const ownerDecisionRequired = attention === "decision-required";
  const ownerActionRequired = ["decision-required", "execution-exception", "result-review", "action-ready"].includes(attention);
  return {
    prospectId: review.prospectId,
    companyName: review.company.name,
    domain: review.company.domain,
    stage: review.stage,
    prospectStatus: review.prospectStatus,
    attention,
    handlingPriority,
    handlingOrder: HANDLING_ORDER[handlingPriority],
    ownerDecisionRequired,
    ownerActionRequired,
    waitingOnEmployee,
    evidenceCompleted: review.evidenceChecklist.completed,
    evidenceTotal: review.evidenceChecklist.total,
    primaryAction: review.actions[0] ?? null,
    blockers: review.blockers,
    executionException,
    candidateScore: review.company.candidateScore,
    tradeReviewPriority: review.tradeHistory.reviewPriority,
    latestObservedAt: review.company.lastSeenAt,
  };
}

function classifyReview(
  review: ProspectAccountReview,
  executionException: ProspectOwnerReviewQueueItem["executionException"],
): {
  handlingPriority: ProspectOwnerHandlingPriority;
  attention: ProspectOwnerReviewQueueItem["attention"];
} {
  if (review.stage === "rejected") {
    return { handlingPriority: "P5_CLOSED", attention: "closed" };
  }
  if (["owner-decision", "sales-authorization"].includes(review.stage)) {
    return { handlingPriority: "P0_OWNER_DECISION", attention: "decision-required" };
  }
  if (executionException) {
    return { handlingPriority: "P1_EXECUTION_EXCEPTION", attention: "execution-exception" };
  }
  if (review.stage === "sales-result-review") {
    if (["confirmed-outcome", "no-value"].includes(review.outcomeReview.status)) {
      return { handlingPriority: "P5_CLOSED", attention: "closed" };
    }
    return { handlingPriority: "P1_RESULT_REVIEW", attention: "result-review" };
  }
  if (["verify-website", "browser-evidence"].includes(review.stage)) {
    return { handlingPriority: "P2_EVIDENCE_RECOVERY", attention: "action-ready" };
  }

  const employee = review.stage === "sales-qualification"
    ? review.workflow.sales
    : review.workflow.intelligence;
  if (employee && ["queued", "running"].includes(employee.status)) {
    return { handlingPriority: "P4_WAITING_ON_EMPLOYEE", attention: "waiting" };
  }
  if (employee?.status === "completed") {
    return { handlingPriority: "P1_RESULT_REVIEW", attention: "result-review" };
  }
  return { handlingPriority: "P3_NEXT_STEP_READY", attention: "action-ready" };
}

function executionExceptionForReview(review: ProspectAccountReview): ProspectOwnerReviewQueueItem["executionException"] {
  const sales = review.workflow.sales;
  if (review.prospectStatus === "READY_FOR_SALES" && sales && ["failed", "cancelled"].includes(sales.status)) {
    return {
      employee: "sales",
      status: sales.status as "failed" | "cancelled",
      runId: sales.bossaiRunId,
      errorCode: sales.errorCode || "",
      errorMessage: sales.errorMessage || "",
      retryAction: "retry-sales",
    };
  }
  const intelligence = review.workflow.intelligence;
  if (intelligence && ["failed", "cancelled"].includes(intelligence.status)) {
    return {
      employee: "intelligence",
      status: intelligence.status as "failed" | "cancelled",
      runId: intelligence.bossaiRunId,
      errorCode: intelligence.errorCode || "",
      errorMessage: intelligence.errorMessage || "",
      retryAction: "retry-intelligence",
    };
  }
  return null;
}

function compareQueueItems(a: ProspectOwnerReviewQueueItem, b: ProspectOwnerReviewQueueItem): number {
  if (a.handlingOrder !== b.handlingOrder) return a.handlingOrder - b.handlingOrder;

  // Within an operational bucket, show the least complete account first so blockers surface early.
  const aCoverage = a.evidenceTotal > 0 ? a.evidenceCompleted / a.evidenceTotal : 0;
  const bCoverage = b.evidenceTotal > 0 ? b.evidenceCompleted / b.evidenceTotal : 0;
  if (aCoverage !== bCoverage) return aCoverage - bCoverage;

  // Trade review priority is descriptive human-review ordering only, never purchase intent.
  const tradeOrder = { REVIEW_FIRST: 0, REVIEW_SOON: 1, REVIEW_LATER: 2 } as const;
  const aTrade = a.tradeReviewPriority ? tradeOrder[a.tradeReviewPriority] : 3;
  const bTrade = b.tradeReviewPriority ? tradeOrder[b.tradeReviewPriority] : 3;
  if (aTrade !== bTrade) return aTrade - bTrade;

  const aSeen = Date.parse(a.latestObservedAt || "");
  const bSeen = Date.parse(b.latestObservedAt || "");
  if (Number.isFinite(aSeen) && Number.isFinite(bSeen) && aSeen !== bSeen) return bSeen - aSeen;
  return a.companyName.localeCompare(b.companyName, "en");
}
