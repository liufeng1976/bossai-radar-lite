import assert from "node:assert/strict";
import test from "node:test";
import { buildProspectSalesAuthorizationLineage } from "../src/sales-authorization.js";
import type {
  BossAiDelegation,
  ProspectCandidate,
  ProspectOwnerDecisionRecord,
} from "../src/types.js";

function prospect(status: ProspectCandidate["status"] = "READY_FOR_SALES"): ProspectCandidate {
  return {
    id: "prospect-sales-lineage",
    domain: "lineage.example",
    websiteUrl: "https://lineage.example/",
    companyName: "Lineage Industrial",
    description: "Industrial components exporter",
    discoverySourceUrl: "https://expo.example/lineage",
    discoverySourceTitle: "Expo",
    discoveryQuery: "industrial components",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [],
    productSignals: ["Industrial components"],
    evidenceUrls: ["https://lineage.example/"],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T02:00:00.000Z",
    score: 72,
    reasons: [],
    status,
    discoveredAt: "2026-08-18T01:00:00.000Z",
    firstSeenAt: "2026-08-18T01:00:00.000Z",
    lastSeenAt: "2026-08-18T02:00:00.000Z",
  };
}

function delegation(
  sourceType: BossAiDelegation["sourceType"],
  runId: string,
  status: BossAiDelegation["status"] = "completed",
  ownerDecisionId = "",
  submittedAt = "2026-08-18T04:00:00.000Z",
): BossAiDelegation {
  return {
    id: sourceType === "prospect" ? 1 : 2,
    sourceType,
    sourceRecordId: "prospect-sales-lineage",
    sourceOperationId: `${sourceType}-${runId}`,
    bossaiRunId: runId,
    bossaiAgentId: sourceType === "prospect" ? "bossai-intelligence-agent" : "bossai-sales-agent",
    status,
    reviewStatus: "approved",
    submittedAt,
    updatedAt: submittedAt,
    resultImportedAt: null,
    errorCode: "",
    errorMessage: "",
    ownerDecisionId,
  };
}

function approval(
  id = "owner-decision-valid",
  intelligenceManagerTaskId = "manager-intelligence-current",
  decidedAt = "2026-08-18T03:00:00.000Z",
): ProspectOwnerDecisionRecord {
  return {
    schema: "bossai.prospect-owner-decision.v1",
    id,
    prospectId: "prospect-sales-lineage",
    decision: "approve-sales",
    reasonCode: "intelligence-ready",
    note: "Private owner note that must not be required by Sales execution.",
    actorType: "owner-admin",
    previousStatus: "REVIEW_REQUIRED",
    targetStatus: "READY_FOR_SALES",
    decidedAt,
    snapshot: {
      schema: "bossai.prospect-owner-decision-snapshot.v1",
      generatedAt: decidedAt,
      accountReviewStage: "owner-decision",
      prospectStatusBefore: "REVIEW_REQUIRED",
      websiteEvidenceStatus: "verified",
      websiteEvidenceSource: "static-http",
      evidenceCompleted: 4,
      evidenceTotal: 6,
      businessChannelCount: 0,
      linkedTradeRecordCount: 0,
      tradeReviewPriority: null,
      candidateScore: 72,
      intelligenceManagerTaskId,
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

const intelligence = delegation("prospect", "manager-intelligence-current");

test("READY_FOR_SALES without an owner approval fails the Sales authorization lineage closed", () => {
  const lineage = buildProspectSalesAuthorizationLineage({
    prospect: prospect(),
    intelligenceDelegation: intelligence,
  });
  assert.equal(lineage.status, "missing-owner-approval");
  assert.equal(lineage.validForSalesQualification, false);
  assert.equal(lineage.requiresOwnerReconfirmation, true);
  assert.equal(lineage.truthBoundary.outreachAuthorized, false);
});

test("owner approval must reference the same completed Intelligence Manager task", () => {
  const lineage = buildProspectSalesAuthorizationLineage({
    prospect: prospect(),
    intelligenceDelegation: intelligence,
    ownerDecisionJournal: [approval("owner-mismatch", "manager-intelligence-old")],
  });
  assert.equal(lineage.status, "intelligence-mismatch");
  assert.equal(lineage.validForSalesQualification, false);
  assert.equal(lineage.requiresOwnerReconfirmation, true);
});

test("matching owner approval authorizes only creation of a Sales qualification task", () => {
  const lineage = buildProspectSalesAuthorizationLineage({
    prospect: prospect(),
    intelligenceDelegation: intelligence,
    ownerDecisionJournal: [approval()],
  });
  assert.equal(lineage.status, "approved");
  assert.equal(lineage.ownerDecisionId, "owner-decision-valid");
  assert.equal(lineage.validForSalesQualification, true);
  assert.equal(lineage.salesTaskBoundToApproval, false);
  assert.equal(lineage.truthBoundary.authorizesSalesQualificationOnly, true);
  assert.equal(lineage.truthBoundary.crmWriteAuthorized, false);
});

test("Sales Manager task bound to the same owner decision completes the traceable lineage", () => {
  const lineage = buildProspectSalesAuthorizationLineage({
    prospect: prospect(),
    intelligenceDelegation: intelligence,
    salesDelegation: delegation("prospect-sales", "manager-sales-bound", "running", "owner-decision-valid"),
    ownerDecisionJournal: [approval()],
  });
  assert.equal(lineage.status, "sales-bound");
  assert.equal(lineage.salesTaskBoundToApproval, true);
  assert.equal(lineage.salesDelegationOwnerDecisionId, "owner-decision-valid");
  assert.equal(lineage.validForSalesQualification, true);
});

test("legacy unbound Sales task requires explicit owner reconfirmation", () => {
  const lineage = buildProspectSalesAuthorizationLineage({
    prospect: prospect(),
    intelligenceDelegation: intelligence,
    salesDelegation: delegation("prospect-sales", "manager-sales-legacy", "failed", "", "2026-08-18T04:00:00.000Z"),
    ownerDecisionJournal: [approval("owner-before-legacy", "manager-intelligence-current", "2026-08-18T03:00:00.000Z")],
  });
  assert.equal(lineage.status, "sales-unbound-legacy");
  assert.equal(lineage.validForSalesQualification, false);
  assert.equal(lineage.requiresOwnerReconfirmation, true);
});

test("a newer explicit owner reconfirmation authorizes a fresh bound Sales task without rewriting the legacy task", () => {
  const lineage = buildProspectSalesAuthorizationLineage({
    prospect: prospect(),
    intelligenceDelegation: intelligence,
    salesDelegation: delegation("prospect-sales", "manager-sales-legacy", "failed", "", "2026-08-18T04:00:00.000Z"),
    ownerDecisionJournal: [
      approval("owner-reconfirmed", "manager-intelligence-current", "2026-08-18T05:00:00.000Z"),
      approval("owner-before-legacy", "manager-intelligence-current", "2026-08-18T03:00:00.000Z"),
    ],
  });
  assert.equal(lineage.status, "approved");
  assert.equal(lineage.ownerDecisionId, "owner-reconfirmed");
  assert.equal(lineage.validForSalesQualification, true);
  assert.equal(lineage.salesTaskBoundToApproval, false);
  assert.equal(lineage.requiresOwnerReconfirmation, false);
});

test("non-READY prospect does not claim Sales authorization even if an old approval exists", () => {
  const lineage = buildProspectSalesAuthorizationLineage({
    prospect: prospect("REJECTED"),
    intelligenceDelegation: intelligence,
    ownerDecisionJournal: [approval()],
  });
  assert.equal(lineage.status, "not-applicable");
  assert.equal(lineage.validForSalesQualification, false);
  assert.equal(lineage.requiresOwnerReconfirmation, false);
});
