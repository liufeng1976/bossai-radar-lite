import assert from "node:assert/strict";
import test from "node:test";
import { buildProspectAccountReview } from "../src/account-review.js";
import { buildProspectOwnerReviewQueue } from "../src/owner-review-queue.js";
import type { BossAiDelegation, ProspectCandidate, ProspectOutcomeReviewRecord, ProspectOwnerDecisionRecord } from "../src/types.js";

const NOW = Date.parse("2026-08-18T05:30:00.000Z");

function prospect(id: string, overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    id,
    domain: `${id}.example`,
    websiteUrl: `https://${id}.example/`,
    companyName: id,
    description: "Industrial equipment distributor",
    discoverySourceUrl: "https://expo.example/company",
    discoverySourceTitle: "Expo",
    discoveryQuery: "industrial distributor",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [],
    productSignals: ["Industrial equipment"],
    evidenceUrls: [`https://${id}.example/`],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T03:00:00.000Z",
    score: 60,
    reasons: [],
    status: "DISCOVERED",
    discoveredAt: "2026-08-18T02:00:00.000Z",
    firstSeenAt: "2026-08-18T02:00:00.000Z",
    lastSeenAt: "2026-08-18T04:00:00.000Z",
    ...overrides,
  };
}

function delegation(id: string, sourceType: BossAiDelegation["sourceType"], status: BossAiDelegation["status"], ownerDecisionId = ""): BossAiDelegation {
  return {
    id: sourceType === "prospect" ? 1 : 2,
    sourceType,
    sourceRecordId: id,
    sourceOperationId: `${id}-${sourceType}`,
    bossaiRunId: `${id}-${sourceType}-run`,
    bossaiAgentId: sourceType === "prospect" ? "bossai-intelligence-agent" : "bossai-sales-agent",
    status,
    reviewStatus: "pending",
    submittedAt: "2026-08-18T03:10:00.000Z",
    updatedAt: "2026-08-18T03:20:00.000Z",
    resultImportedAt: null,
    errorCode: "",
    errorMessage: "",
    ownerDecisionId,
  };
}

function outcomeReview(id: string, decision: ProspectOutcomeReviewRecord["decision"]): ProspectOutcomeReviewRecord {
  const ownerDecisionId = `${id}-owner-approval`;
  return {
    schema: "bossai.prospect-outcome-review.v1",
    id: `${id}-outcome-${decision}`,
    prospectId: id,
    salesManagerTaskId: `${id}-prospect-sales-run`,
    ownerDecisionId,
    decision,
    evidenceState: decision === "observe" ? "OBSERVED" : "CONFIRMED",
    summary: `Owner outcome review: ${decision}`,
    businessValueAmount: null,
    businessValueCurrency: "",
    businessValueBasis: "none",
    actorType: "owner-admin",
    reviewedAt: "2026-08-18T05:00:00.000Z",
    snapshot: {
      schema: "bossai.prospect-outcome-review-snapshot.v1",
      generatedAt: "2026-08-18T05:00:00.000Z",
      intelligenceManagerTaskId: `${id}-prospect-run`,
      ownerDecisionId,
      salesManagerTaskId: `${id}-prospect-sales-run`,
      salesDisposition: "qualification-allowed",
      salesReportedWebsiteEvidenceStatus: "verified",
      qualificationStates: {
        "real-need": "unknown",
        "buyer-authority": "unknown",
        timing: "unknown",
        budget: "unknown",
      },
      employeeReportedValueClaim: "",
    },
    truthBoundary: {
      salesCompletionIsRevenue: false,
      qualificationIsRevenue: false,
      employeeReportedValueIsConfirmed: false,
      businessValueAutoEstimated: false,
      purchaseIntentInferred: false,
      closeProbabilityInferred: false,
      nextPurchaseDatePredicted: false,
      crmRecordCreated: false,
      outreachExecuted: false,
    },
  };
}

function ownerApproval(id: string): ProspectOwnerDecisionRecord {
  const decisionId = `${id}-owner-approval`;
  return {
    schema: "bossai.prospect-owner-decision.v1",
    id: decisionId,
    prospectId: id,
    decision: "approve-sales",
    reasonCode: "intelligence-ready",
    note: "Owner reviewed the Intelligence result.",
    actorType: "owner-admin",
    previousStatus: "REVIEW_REQUIRED",
    targetStatus: "READY_FOR_SALES",
    decidedAt: "2026-08-18T03:05:00.000Z",
    snapshot: {
      schema: "bossai.prospect-owner-decision-snapshot.v1",
      generatedAt: "2026-08-18T03:05:00.000Z",
      accountReviewStage: "owner-decision",
      prospectStatusBefore: "REVIEW_REQUIRED",
      websiteEvidenceStatus: "verified",
      websiteEvidenceSource: "static-http",
      evidenceCompleted: 4,
      evidenceTotal: 6,
      businessChannelCount: 0,
      linkedTradeRecordCount: 0,
      tradeReviewPriority: null,
      candidateScore: 60,
      intelligenceManagerTaskId: `${id}-prospect-run`,
      intelligenceStatus: "completed",
      salesManagerTaskId: "",
      salesStatus: "not-started",
      blockers: ["owner-sales-decision-required"],
    },
    truthBoundary: {
      decisionIsSalesProbability: false,
      purchaseIntentInferred: false,
      closeProbabilityInferred: false,
      nextPurchaseDatePredicted: false,
      crmRecordCreated: false,
      outreachExecuted: false,
    },
  };
}

test("owner queue puts explicit owner decisions ahead of evidence recovery, next-step work and employee waiting", () => {
  const ownerDecision = buildProspectAccountReview({
    prospect: prospect("owner-decision", { status: "REVIEW_REQUIRED" }),
    intelligenceDelegation: delegation("owner-decision", "prospect", "completed"),
    now: NOW,
  });
  const evidenceRecovery = buildProspectAccountReview({
    prospect: prospect("browser-gap", { websiteEvidenceStatus: "static-incomplete" }),
    now: NOW,
  });
  const nextStep = buildProspectAccountReview({ prospect: prospect("start-intelligence"), now: NOW });
  const waiting = buildProspectAccountReview({
    prospect: prospect("waiting", { status: "REVIEW_REQUIRED" }),
    intelligenceDelegation: delegation("waiting", "prospect", "running"),
    now: NOW,
  });

  const queue = buildProspectOwnerReviewQueue([waiting, nextStep, evidenceRecovery, ownerDecision], NOW);
  assert.deepEqual(queue.items.map((item) => item.prospectId), [
    "owner-decision",
    "browser-gap",
    "start-intelligence",
    "waiting",
  ]);
  assert.equal(queue.items[0]?.handlingPriority, "P0_OWNER_DECISION");
  assert.equal(queue.items[0]?.ownerDecisionRequired, true);
  assert.equal(queue.items[3]?.waitingOnEmployee, true);
});

test("completed Sales result is a review task, never an automatic CRM or outreach action", () => {
  const review = buildProspectAccountReview({
    prospect: prospect("sales-result", { status: "READY_FOR_SALES" }),
    intelligenceDelegation: delegation("sales-result", "prospect", "completed"),
    salesDelegation: delegation("sales-result", "prospect-sales", "completed", "sales-result-owner-approval"),
    ownerDecisionJournal: [ownerApproval("sales-result")],
    now: NOW,
  });
  const queue = buildProspectOwnerReviewQueue([review], NOW);
  assert.equal(queue.items[0]?.attention, "result-review");
  assert.equal(queue.items[0]?.handlingPriority, "P1_RESULT_REVIEW");
  assert.equal(queue.items[0]?.primaryAction, "review-outcome");
  assert.deepEqual(queue.truthBoundary, {
    handlingPriorityIsSalesProbability: false,
    automaticRetryExecuted: false,
    purchaseIntentInferred: false,
    closeProbabilityInferred: false,
    nextPurchaseDatePredicted: false,
    crmRecordCreated: false,
    outreachExecuted: false,
  });
});

test("owner-confirmed or no-value outcomes close the active owner queue without claiming revenue", () => {
  for (const decision of ["confirm-outcome", "no-value"] as const) {
    const id = `closed-${decision}`;
    const review = buildProspectAccountReview({
      prospect: prospect(id, { status: "READY_FOR_SALES" }),
      intelligenceDelegation: delegation(id, "prospect", "completed"),
      salesDelegation: delegation(id, "prospect-sales", "completed", `${id}-owner-approval`),
      ownerDecisionJournal: [ownerApproval(id)],
      outcomeReviewJournal: [outcomeReview(id, decision)],
      now: NOW,
    });
    const queue = buildProspectOwnerReviewQueue([review], NOW);
    assert.equal(review.outcomeReview.status, decision === "confirm-outcome" ? "confirmed-outcome" : "no-value");
    assert.equal(queue.items[0]?.attention, "closed");
    assert.equal(queue.items[0]?.handlingPriority, "P5_CLOSED");
    assert.equal(queue.summary.closed, 1);
    assert.equal(queue.truthBoundary.purchaseIntentInferred, false);
  }
});

test("continue-observing outcome remains an owner result-review responsibility", () => {
  const id = "outcome-observing";
  const review = buildProspectAccountReview({
    prospect: prospect(id, { status: "READY_FOR_SALES" }),
    intelligenceDelegation: delegation(id, "prospect", "completed"),
    salesDelegation: delegation(id, "prospect-sales", "completed", `${id}-owner-approval`),
    ownerDecisionJournal: [ownerApproval(id)],
    outcomeReviewJournal: [outcomeReview(id, "observe")],
    now: NOW,
  });
  const queue = buildProspectOwnerReviewQueue([review], NOW);
  assert.equal(review.outcomeReview.status, "observing");
  assert.equal(queue.items[0]?.attention, "result-review");
  assert.equal(queue.items[0]?.primaryAction, "review-outcome");
  assert.equal(queue.summary.resultReviewRequired, 1);
});

test("failed Intelligence work becomes an explicit owner execution exception with a manual retry target", () => {
  const failedIntelligence = {
    ...delegation("intel-failed", "prospect", "failed"),
    errorCode: "INTELLIGENCE_RUNTIME_FAILED",
    errorMessage: "Workspace read failed.",
  };
  const review = buildProspectAccountReview({
    prospect: prospect("intel-failed", { status: "REVIEW_REQUIRED" }),
    intelligenceDelegation: failedIntelligence,
    now: NOW,
  });
  const queue = buildProspectOwnerReviewQueue([review], NOW);
  const item = queue.items[0];
  assert.equal(item?.attention, "execution-exception");
  assert.equal(item?.handlingPriority, "P1_EXECUTION_EXCEPTION");
  assert.equal(item?.primaryAction, "retry-intelligence");
  assert.deepEqual(item?.executionException, {
    employee: "intelligence",
    status: "failed",
    runId: "intel-failed-prospect-run",
    errorCode: "INTELLIGENCE_RUNTIME_FAILED",
    errorMessage: "Workspace read failed.",
    retryAction: "retry-intelligence",
  });
  assert.ok(review.blockers.includes("intelligence-execution-failed"));
  assert.equal(queue.summary.executionExceptions, 1);
  assert.equal(queue.truthBoundary.automaticRetryExecuted, false);
});

test("cancelled Sales qualification is an execution exception rather than ordinary action-ready work", () => {
  const cancelledSales = {
    ...delegation("sales-cancelled", "prospect-sales", "cancelled", "sales-cancelled-owner-approval"),
    errorCode: "MANAGER_TASK_CANCELLED",
    errorMessage: "Owner cancelled the task before execution.",
  };
  const review = buildProspectAccountReview({
    prospect: prospect("sales-cancelled", { status: "READY_FOR_SALES" }),
    intelligenceDelegation: delegation("sales-cancelled", "prospect", "completed"),
    salesDelegation: cancelledSales,
    ownerDecisionJournal: [ownerApproval("sales-cancelled")],
    now: NOW,
  });
  const queue = buildProspectOwnerReviewQueue([review], NOW);
  const item = queue.items[0];
  assert.equal(item?.attention, "execution-exception");
  assert.equal(item?.primaryAction, "retry-sales");
  assert.equal(item?.executionException?.employee, "sales");
  assert.equal(item?.executionException?.status, "cancelled");
  assert.ok(review.blockers.includes("sales-execution-cancelled"));
});

test("rejected prospects are closed and sorted after active account-review work", () => {
  const active = buildProspectAccountReview({ prospect: prospect("active"), now: NOW });
  const rejected = buildProspectAccountReview({
    prospect: prospect("rejected", { status: "REJECTED" }),
    now: NOW,
  });
  const queue = buildProspectOwnerReviewQueue([rejected, active], NOW);
  assert.equal(queue.items[0]?.prospectId, "active");
  assert.equal(queue.items[1]?.handlingPriority, "P5_CLOSED");
  assert.equal(queue.summary.closed, 1);
});

test("queue summary counts owner responsibility instead of claiming lead value", () => {
  const decision = buildProspectAccountReview({
    prospect: prospect("decision", { status: "REVIEW_REQUIRED" }),
    intelligenceDelegation: delegation("decision", "prospect", "completed"),
    now: NOW,
  });
  const ready = buildProspectAccountReview({ prospect: prospect("ready"), now: NOW });
  const waiting = buildProspectAccountReview({
    prospect: prospect("wait", { status: "READY_FOR_SALES" }),
    intelligenceDelegation: delegation("wait", "prospect", "completed"),
    salesDelegation: delegation("wait", "prospect-sales", "queued", "wait-owner-approval"),
    ownerDecisionJournal: [ownerApproval("wait")],
    now: NOW,
  });
  const queue = buildProspectOwnerReviewQueue([decision, ready, waiting], NOW);
  assert.equal(queue.summary.total, 3);
  assert.equal(queue.summary.ownerDecisionRequired, 1);
  assert.equal(queue.summary.actionReady, 1);
  assert.equal(queue.summary.waitingOnEmployee, 1);
  assert.equal(queue.summary.resultReviewRequired, 0);
  assert.equal(queue.summary.byHandlingPriority.P0_OWNER_DECISION, 1);
  assert.equal(queue.summary.byHandlingPriority.P4_WAITING_ON_EMPLOYEE, 1);
});
