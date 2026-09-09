import assert from "node:assert/strict";
import test from "node:test";
import { buildProspectAccountReview } from "../src/account-review.js";
import type { BossAiDelegation, ProspectBrowserEvidenceRequest, ProspectCandidate, ProspectOwnerDecisionRecord, TradeRecord } from "../src/types.js";

const NOW = Date.parse("2026-08-18T05:00:00.000Z");

function prospect(overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    id: "prospect-account-review",
    domain: "acme.example",
    websiteUrl: "https://acme.example/",
    companyName: "Acme Export",
    description: "Industrial pumps for distributors.",
    discoverySourceUrl: "https://expo.example/exhibitors/acme",
    discoverySourceTitle: "Expo exhibitor",
    discoveryQuery: "industrial pump distributors",
    publicEmails: ["sales@acme.example"],
    publicPhones: ["+1 555 0100"],
    contactUrls: ["https://acme.example/contact"],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [{
      type: "email",
      value: "sales@acme.example",
      url: "mailto:sales@acme.example",
      sourcePageUrl: "https://acme.example/contact",
      sourceKind: "jsonld-contact-point",
      businessRole: "sales",
      confidence: "high",
      verificationStatus: "official-site-structured",
    }],
    productSignals: ["Industrial pumps"],
    evidenceUrls: ["https://expo.example/exhibitors/acme", "https://acme.example/"],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T03:00:00.000Z",
    score: 82,
    reasons: ["official website exposes product or service signals"],
    fitScore: 67,
    fitTerms: ["industrial pumps", "distributor", "smart feeder"],
    fitMatches: ["industrial pumps", "distributor"],
    status: "DISCOVERED",
    discoveredAt: "2026-08-18T02:00:00.000Z",
    firstSeenAt: "2026-08-18T02:00:00.000Z",
    lastSeenAt: "2026-08-18T03:00:00.000Z",
    ...overrides,
  };
}

function delegation(sourceType: BossAiDelegation["sourceType"], status: BossAiDelegation["status"], ownerDecisionId = ""): BossAiDelegation {
  return {
    id: sourceType === "prospect" ? 1 : 2,
    sourceType,
    sourceRecordId: "prospect-account-review",
    sourceOperationId: `${sourceType}-operation`,
    bossaiRunId: `${sourceType}-manager-task`,
    bossaiAgentId: sourceType === "prospect" ? "bossai-intelligence-agent" : "bossai-sales-agent",
    status,
    reviewStatus: "pending",
    submittedAt: "2026-08-18T03:15:00.000Z",
    updatedAt: "2026-08-18T03:30:00.000Z",
    resultImportedAt: null,
    errorCode: "",
    errorMessage: "",
    ownerDecisionId,
  };
}

function ownerApproval(): ProspectOwnerDecisionRecord {
  return {
    schema: "bossai.prospect-owner-decision.v1",
    id: "owner-approval-account-review",
    prospectId: "prospect-account-review",
    decision: "approve-sales",
    reasonCode: "intelligence-ready",
    note: "Reviewed Intelligence result.",
    actorType: "owner-admin",
    previousStatus: "REVIEW_REQUIRED",
    targetStatus: "READY_FOR_SALES",
    decidedAt: "2026-08-18T03:45:00.000Z",
    snapshot: {
      schema: "bossai.prospect-owner-decision-snapshot.v1",
      generatedAt: "2026-08-18T03:45:00.000Z",
      accountReviewStage: "owner-decision",
      prospectStatusBefore: "REVIEW_REQUIRED",
      websiteEvidenceStatus: "verified",
      websiteEvidenceSource: "static-http",
      evidenceCompleted: 5,
      evidenceTotal: 6,
      businessChannelCount: 1,
      linkedTradeRecordCount: 2,
      tradeReviewPriority: "REVIEW_FIRST",
      candidateScore: 82,
      intelligenceManagerTaskId: "prospect-manager-task",
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

function browserRequest(): ProspectBrowserEvidenceRequest {
  return {
    schema: "bossai.prospect-browser-evidence-request.v1",
    id: "browser-evidence-account-review",
    prospectId: "prospect-account-review",
    targetUrl: "https://acme.example/",
    status: "pending",
    requestedAt: "2026-08-18T03:10:00.000Z",
    updatedAt: "2026-08-18T03:10:00.000Z",
    submittedAt: "",
    sourceKind: "",
    sourceReference: "",
    pageUrl: "",
  };
}

const TRADE_RECORDS: TradeRecord[] = [
  {
    id: "trade-1",
    fingerprint: "trade-fingerprint-1",
    companyName: "Acme Export",
    role: "buyer",
    country: "US",
    productDescription: "Industrial pumps",
    hsCode: "841370",
    tradeDate: "2026-06-10",
    quantity: "20",
    amount: 18_000,
    currency: "USD",
    websiteUrl: "https://acme.example/",
    sourceLabel: "authorized-trade.csv",
    sourceRow: 2,
    importedAt: "2026-08-18T02:30:00.000Z",
  },
  {
    id: "trade-2",
    fingerprint: "trade-fingerprint-2",
    companyName: "Acme Export",
    role: "buyer",
    country: "US",
    productDescription: "Industrial pumps",
    hsCode: "841370",
    tradeDate: "2026-04-10",
    quantity: "15",
    amount: 15_000,
    currency: "USD",
    websiteUrl: "https://acme.example/",
    sourceLabel: "authorized-trade.csv",
    sourceRow: 3,
    importedAt: "2026-08-18T02:30:00.000Z",
  },
];

test("account review sends an unverified prospect back to website verification without inventing sales facts", () => {
  const review = buildProspectAccountReview({
    prospect: prospect({
      websiteEvidenceStatus: "unverified",
      websiteVerifiedAt: "",
      companyContactChannels: [],
      publicEmails: [],
      publicPhones: [],
      contactUrls: [],
    }),
    now: NOW,
  });
  assert.equal(review.stage, "verify-website");
  assert.ok(review.blockers.includes("website-unverified"));
  assert.deepEqual(review.actions, ["verify-website", "reject-prospect"]);
  assert.equal(review.tradeHistory.recordCount, 0);
  assert.deepEqual(review.qualificationUnknowns, ["buyer-authority", "real-need", "timing", "budget"]);
  assert.deepEqual(review.truthBoundary, {
    purchaseIntentInferred: false,
    closeProbabilityInferred: false,
    nextPurchaseDatePredicted: false,
    crmRecordCreated: false,
    outreachExecuted: false,
  });
});

test("account review keeps JavaScript-incomplete evidence in the browser-evidence stage even when Intelligence review exists", () => {
  const review = buildProspectAccountReview({
    prospect: prospect({ websiteEvidenceStatus: "static-incomplete", status: "REVIEW_REQUIRED" }),
    intelligenceDelegation: delegation("prospect", "completed"),
    latestBrowserRequest: browserRequest(),
    now: NOW,
  });
  assert.equal(review.stage, "browser-evidence");
  assert.ok(review.blockers.includes("browser-evidence-required"));
  assert.ok(review.actions.includes("request-browser-evidence"));
  assert.equal(review.actions.includes("approve-sales"), false);
  assert.equal(review.websiteEvidence.latestBrowserRequest?.status, "pending");
  assert.equal(review.workflow.steps.find((item) => item.id === "intelligence")?.status, "complete");
  assert.equal(review.workflow.steps.find((item) => item.id === "owner-decision")?.status, "blocked");
});

test("account review joins verified company, business channels, historical trade and completed Intelligence into one owner-decision view", () => {
  const review = buildProspectAccountReview({
    prospect: prospect({ status: "REVIEW_REQUIRED" }),
    tradeRecords: TRADE_RECORDS,
    intelligenceDelegation: delegation("prospect", "completed"),
    now: NOW,
  });
  assert.equal(review.stage, "owner-decision");
  assert.equal(review.businessChannels.total, 1);
  assert.deepEqual(review.businessChannels.roles, ["sales"]);
  assert.equal(review.tradeHistory.recordCount, 2);
  assert.equal(review.tradeHistory.latestTradeDate, "2026-06-10");
  assert.equal(review.tradeHistory.amountByCurrency.USD, 33_000);
  assert.deepEqual(review.tradeHistory.roles, ["buyer"]);
  assert.equal(review.evidenceChecklist.completed, 5);
  assert.equal(review.evidenceChecklist.total, 6);
  assert.deepEqual(review.actions, ["review-intelligence-result", "approve-sales", "reject-prospect"]);
  assert.ok(review.blockers.includes("owner-sales-decision-required"));
});

test("legacy READY_FOR_SALES without a matching owner approval becomes a Sales authorization decision instead of qualifying silently", () => {
  const review = buildProspectAccountReview({
    prospect: prospect({ status: "READY_FOR_SALES" }),
    intelligenceDelegation: delegation("prospect", "completed"),
    now: NOW,
  });
  assert.equal(review.stage, "sales-authorization");
  assert.equal(review.workflow.salesAuthorization.status, "missing-owner-approval");
  assert.equal(review.workflow.salesAuthorization.validForSalesQualification, false);
  assert.deepEqual(review.actions, ["reconfirm-sales-authorization", "reject-prospect"]);
  assert.ok(review.blockers.includes("sales-owner-approval-lineage-required"));
  assert.equal(review.actions.includes("qualify-sales"), false);
  assert.equal(review.outcomeLearningMembership.eligible, false);
  assert.equal(review.outcomeLearningMembership.sampleContributionState, "excluded");
  assert.equal(review.outcomeLearningMembership.eligibilityReason, "sales-not-completed");
});

test("account review treats completed Sales qualification as a reviewable result, not CRM creation or outreach", () => {
  const review = buildProspectAccountReview({
    prospect: prospect({ status: "READY_FOR_SALES", websiteEvidenceSource: "browser-rendered" }),
    tradeRecords: TRADE_RECORDS,
    intelligenceDelegation: delegation("prospect", "completed"),
    salesDelegation: delegation("prospect-sales", "completed", "owner-approval-account-review"),
    ownerDecisionJournal: [ownerApproval()],
    now: NOW,
  });
  assert.equal(review.stage, "sales-result-review");
  assert.equal(review.evidenceChecklist.completed, 6);
  assert.deepEqual(review.actions, ["review-outcome", "review-sales-result", "reject-prospect"]);
  assert.equal(review.workflow.steps.find((item) => item.id === "sales")?.status, "complete");
  assert.equal(review.workflow.salesAuthorization.status, "sales-bound");
  assert.equal(review.workflow.salesAuthorization.ownerDecisionId, "owner-approval-account-review");
  assert.equal(review.outcomeLearningMembership.schema, "bossai.prospect-outcome-learning-membership.v1");
  assert.equal(review.outcomeLearningMembership.eligible, true);
  assert.equal(review.outcomeLearningMembership.sampleContributionState, "awaiting-owner-review");
  assert.equal(review.outcomeLearningMembership.eligibilityReason, "current-sales-lineage-completed");
  assert.equal(review.outcomeLearningMembership.cohorts.websiteEvidenceSource.key, "browser-rendered");
  assert.deepEqual(review.outcomeLearningMembership.cohorts.businessChannelRoles, ["sales"]);
  assert.equal(review.outcomeLearningMembership.truthBoundary.cohortMembershipIsNotRanking, true);
  assert.equal(review.outcomeLearningMembership.truthBoundary.closeProbabilityInferred, false);
  assert.equal(review.truthBoundary.crmRecordCreated, false);
  assert.equal(review.truthBoundary.outreachExecuted, false);
  assert.deepEqual(review.qualificationUnknowns, ["buyer-authority", "real-need", "timing", "budget"]);
});
