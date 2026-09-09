import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProspectOutcomeAttribution,
  buildProspectOutcomePortfolioSummary,
  extractEmployeeReportedValueClaim,
  parseProspectOutcomeReviewInput,
  ProspectOutcomeReviewValidationError,
} from "../src/outcome-attribution.js";
import type {
  BossAiDelegation,
  ProspectOutcomeReviewRecord,
  ProspectSalesAuthorizationLineage,
  ProspectSalesHandoffBrief,
} from "../src/types.js";

const NOW = Date.parse("2026-08-19T00:00:00.000Z");

function lineage(overrides: Partial<ProspectSalesAuthorizationLineage> = {}): ProspectSalesAuthorizationLineage {
  return {
    schema: "bossai.prospect-sales-authorization-lineage.v1",
    status: "sales-bound",
    ownerDecisionId: "owner-decision-outcome-1",
    ownerDecisionAt: "2026-08-18T20:00:00.000Z",
    ownerDecisionReasonCode: "intelligence-ready",
    intelligenceManagerTaskId: "manager-intelligence-outcome-1",
    decisionIntelligenceManagerTaskId: "manager-intelligence-outcome-1",
    salesManagerTaskId: "manager-sales-outcome-1",
    salesDelegationOwnerDecisionId: "owner-decision-outcome-1",
    validForSalesQualification: true,
    salesTaskBoundToApproval: true,
    requiresOwnerReconfirmation: false,
    truthBoundary: {
      authorizesSalesQualificationOnly: true,
      outreachAuthorized: false,
      crmWriteAuthorized: false,
      purchaseIntentInferred: false,
      closeProbabilityInferred: false,
      nextPurchaseDatePredicted: false,
    },
    ...overrides,
  };
}

function handoff(output = "Sales qualification complete. Business value: $100,000 potential revenue."): ProspectSalesHandoffBrief {
  return {
    schema: "bossai.prospect-sales-handoff-brief.v1",
    prospectId: "prospect-outcome-1",
    generatedAt: "2026-08-18T22:00:00.000Z",
    managerTaskId: "manager-sales-outcome-1",
    managerStatus: "completed",
    managerReviewStatus: "approved",
    managerUpdatedAt: "2026-08-18T21:30:00.000Z",
    sourceAuthority: "bossai-manager",
    artifactDescriptorId: "sales.lead-qualification.md",
    disposition: "qualification-allowed",
    dispositionMarker: "HUMAN_REVIEWED_QUALIFICATION_ALLOWED",
    sourceReportedWebsiteEvidence: { status: "verified", source: "static-http" },
    currentWebsiteEvidence: { status: "verified", source: "static-http" },
    qualificationFields: [
      { key: "real-need", state: "unknown", reportedValue: "", source: "sales-manager-result" },
      { key: "buyer-authority", state: "unknown", reportedValue: "", source: "sales-manager-result" },
      { key: "timing", state: "unknown", reportedValue: "", source: "sales-manager-result" },
      { key: "budget", state: "unknown", reportedValue: "", source: "sales-manager-result" },
    ],
    ownerApproval: null,
    nextOwnerAction: "decide-outreach-separately",
    authoritativeOutput: output,
    truthBoundary: {
      handoffBriefIsOwnerApproval: false,
      qualificationIsCloseProbability: false,
      outreachAuthorized: false,
      crmWriteAuthorized: false,
      purchaseIntentInferred: false,
      closeProbabilityInferred: false,
      nextPurchaseDatePredicted: false,
      crmRecordCreated: false,
      outreachExecuted: false,
    },
  };
}

function review(overrides: Partial<ProspectOutcomeReviewRecord> = {}): ProspectOutcomeReviewRecord {
  return {
    schema: "bossai.prospect-outcome-review.v1",
    id: "outcome-review-1",
    prospectId: "prospect-outcome-1",
    salesManagerTaskId: "manager-sales-outcome-1",
    ownerDecisionId: "owner-decision-outcome-1",
    decision: "confirm-outcome",
    evidenceState: "CONFIRMED",
    summary: "Owner confirmed a useful business outcome.",
    businessValueAmount: null,
    businessValueCurrency: "",
    businessValueBasis: "none",
    actorType: "owner-admin",
    reviewedAt: "2026-08-18T23:00:00.000Z",
    snapshot: {
      schema: "bossai.prospect-outcome-review-snapshot.v1",
      generatedAt: "2026-08-18T23:00:00.000Z",
      intelligenceManagerTaskId: "manager-intelligence-outcome-1",
      ownerDecisionId: "owner-decision-outcome-1",
      salesManagerTaskId: "manager-sales-outcome-1",
      salesDisposition: "qualification-allowed",
      salesReportedWebsiteEvidenceStatus: "verified",
      qualificationStates: {
        "real-need": "unknown",
        "buyer-authority": "unknown",
        timing: "unknown",
        budget: "unknown",
      },
      employeeReportedValueClaim: "Business value: $100,000 potential revenue.",
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
    ...overrides,
  };
}

function salesDelegation(runId = "manager-sales-outcome-1", ownerDecisionId = "owner-decision-outcome-1"): BossAiDelegation {
  return {
    id: 10,
    sourceType: "prospect-sales",
    sourceRecordId: "prospect-outcome-1",
    sourceOperationId: `sales-${runId}`,
    bossaiRunId: runId,
    bossaiAgentId: "bossai-sales-agent",
    status: "completed",
    reviewStatus: "approved",
    submittedAt: "2026-08-18T21:00:00.000Z",
    updatedAt: "2026-08-18T21:30:00.000Z",
    resultImportedAt: null,
    errorCode: "",
    errorMessage: "",
    ownerDecisionId,
  };
}

test("employee monetary claim remains REPORTED text and never becomes confirmed business value", () => {
  const output = "业务价值：帮助公司获得10万美元；Revenue $100,000.";
  const attribution = buildProspectOutcomeAttribution({
    prospectId: "prospect-outcome-1",
    lineage: lineage(),
    handoff: handoff(output),
    now: NOW,
  });
  assert.equal(attribution.status, "awaiting-owner-review");
  assert.equal(attribution.salesResultEvidence.state, "REPORTED");
  assert.match(attribution.salesResultEvidence.employeeReportedValueClaim, /10万美元|100,000/u);
  assert.equal(attribution.ownerReview, null);
  assert.equal(attribution.businessValue, null);
  assert.equal(attribution.truthBoundary.employeeReportedValueIsConfirmed, false);
  assert.equal(attribution.truthBoundary.businessValueAutoEstimated, false);
});

test("owner may confirm an outcome while keeping monetary value unknown", () => {
  const attribution = buildProspectOutcomeAttribution({
    prospectId: "prospect-outcome-1",
    lineage: lineage(),
    handoff: handoff(),
    reviewJournal: [review()],
    now: NOW,
  });
  assert.equal(attribution.status, "confirmed-outcome");
  assert.equal(attribution.ownerReview?.evidenceState, "CONFIRMED");
  assert.equal(attribution.businessValue, null);
});

test("only owner-entered confirmed value becomes numeric business value", () => {
  const attribution = buildProspectOutcomeAttribution({
    prospectId: "prospect-outcome-1",
    lineage: lineage(),
    handoff: handoff("Employee says value may be $9,999,999."),
    reviewJournal: [review({
      businessValueAmount: 12500.5,
      businessValueCurrency: "USD",
      businessValueBasis: "owner-entered",
    })],
    now: NOW,
  });
  assert.deepEqual(attribution.businessValue, { amount: 12500.5, currency: "USD", basis: "owner-entered" });
  assert.notEqual(attribution.businessValue?.amount, 9999999);
});

test("observe and no-value reviews cannot carry a monetary amount", () => {
  assert.throws(() => parseProspectOutcomeReviewInput({
    decision: "observe",
    summary: "Need another real-world signal.",
    businessValueAmount: 100,
    businessValueCurrency: "USD",
  }), (error) => error instanceof ProspectOutcomeReviewValidationError && error.code === "PROSPECT_OUTCOME_VALUE_NOT_ALLOWED");

  assert.throws(() => parseProspectOutcomeReviewInput({
    decision: "no-value",
    summary: "No useful business effect was observed.",
    businessValueAmount: 100,
    businessValueCurrency: "USD",
  }), (error) => error instanceof ProspectOutcomeReviewValidationError && error.code === "PROSPECT_OUTCOME_VALUE_NOT_ALLOWED");
});

test("confirm outcome parser accepts optional owner-entered value but never requires one", () => {
  assert.deepEqual(parseProspectOutcomeReviewInput({
    decision: "confirm-outcome",
    summary: "Owner verified a useful result.",
  }), {
    decision: "confirm-outcome",
    evidenceState: "CONFIRMED",
    summary: "Owner verified a useful result.",
    businessValueAmount: null,
    businessValueCurrency: "",
  });
  assert.deepEqual(parseProspectOutcomeReviewInput({
    decision: "confirm-outcome",
    summary: "Owner verified invoiced value in an external system.",
    businessValueAmount: "1234.567",
    businessValueCurrency: "usd",
  }).businessValueAmount, 1234.57);
});

test("latest matching outcome review is selected by reviewedAt even when the journal is unsorted", () => {
  const older = review({
    id: "review-older-confirmed",
    reviewedAt: "2026-08-18T22:00:00.000Z",
    decision: "confirm-outcome",
    businessValueAmount: 5000,
    businessValueCurrency: "USD",
    businessValueBasis: "owner-entered",
  });
  const newer = review({
    id: "review-newer-observe",
    reviewedAt: "2026-08-18T23:30:00.000Z",
    decision: "observe",
    evidenceState: "OBSERVED",
    businessValueAmount: null,
    businessValueCurrency: "",
    businessValueBasis: "none",
  });
  const attribution = buildProspectOutcomeAttribution({
    prospectId: "prospect-outcome-1",
    lineage: lineage(),
    handoff: handoff(),
    reviewJournal: [older, newer],
    now: NOW,
  });
  assert.equal(attribution.status, "observing");
  assert.equal(attribution.ownerReview?.id, "review-newer-observe");
  assert.deepEqual(attribution.reviewHistory.map((item) => item.id), ["review-newer-observe", "review-older-confirmed"]);
  assert.equal(attribution.businessValue, null);

  const summary = buildProspectOutcomePortfolioSummary([{
    salesDelegation: salesDelegation(),
    lineage: lineage(),
    reviewJournal: [older, newer],
  }], NOW);
  assert.equal(summary.observing, 1);
  assert.equal(summary.confirmedOutcomes, 0);
  assert.deepEqual(summary.ownerEnteredValueByCurrency, {});
});

test("old outcome review does not apply to a newer Sales task or owner authorization", () => {
  const attribution = buildProspectOutcomeAttribution({
    prospectId: "prospect-outcome-1",
    lineage: lineage({
      ownerDecisionId: "owner-decision-outcome-2",
      salesManagerTaskId: "manager-sales-outcome-2",
      salesDelegationOwnerDecisionId: "owner-decision-outcome-2",
    }),
    handoff: { ...handoff(), managerTaskId: "manager-sales-outcome-2" },
    reviewJournal: [review()],
    now: NOW,
  });
  assert.equal(attribution.status, "awaiting-owner-review");
  assert.equal(attribution.ownerReview, null);
  assert.equal(attribution.reviewHistory.length, 0);
});

test("invalid Sales authorization lineage cannot claim an outcome is ready", () => {
  const attribution = buildProspectOutcomeAttribution({
    prospectId: "prospect-outcome-1",
    lineage: lineage({ status: "sales-lineage-mismatch", salesTaskBoundToApproval: false }),
    handoff: handoff(),
    reviewJournal: [review()],
    now: NOW,
  });
  assert.equal(attribution.status, "not-ready");
  assert.equal(attribution.lineage.valid, false);
  assert.equal(attribution.ownerReview, null);
  assert.equal(attribution.reviewHistory.length, 0);
  assert.equal(attribution.businessValue, null);
});

test("portfolio counts owner closure and aggregates only owner-entered confirmed values", () => {
  const summary = buildProspectOutcomePortfolioSummary([
    { salesDelegation: salesDelegation(), lineage: lineage(), reviewJournal: [] },
    { salesDelegation: salesDelegation("manager-sales-outcome-2", "owner-decision-outcome-2"), lineage: lineage({ ownerDecisionId: "owner-decision-outcome-2", salesManagerTaskId: "manager-sales-outcome-2", salesDelegationOwnerDecisionId: "owner-decision-outcome-2" }), reviewJournal: [review({ id: "review-confirm-2", salesManagerTaskId: "manager-sales-outcome-2", ownerDecisionId: "owner-decision-outcome-2", businessValueAmount: 5000, businessValueCurrency: "USD", businessValueBasis: "owner-entered" })] },
    { salesDelegation: salesDelegation("manager-sales-outcome-3", "owner-decision-outcome-3"), lineage: lineage({ ownerDecisionId: "owner-decision-outcome-3", salesManagerTaskId: "manager-sales-outcome-3", salesDelegationOwnerDecisionId: "owner-decision-outcome-3" }), reviewJournal: [review({ id: "review-observe", salesManagerTaskId: "manager-sales-outcome-3", ownerDecisionId: "owner-decision-outcome-3", decision: "observe", evidenceState: "OBSERVED", businessValueAmount: null, businessValueCurrency: "", businessValueBasis: "none" })] },
    { salesDelegation: salesDelegation("manager-sales-outcome-4", "owner-decision-outcome-4"), lineage: lineage({ ownerDecisionId: "owner-decision-outcome-4", salesManagerTaskId: "manager-sales-outcome-4", salesDelegationOwnerDecisionId: "owner-decision-outcome-4" }), reviewJournal: [review({ id: "review-no-value", salesManagerTaskId: "manager-sales-outcome-4", ownerDecisionId: "owner-decision-outcome-4", decision: "no-value", businessValueAmount: null, businessValueCurrency: "", businessValueBasis: "none" })] },
    { salesDelegation: salesDelegation("manager-sales-outcome-5", ""), lineage: lineage({ status: "sales-unbound-legacy", ownerDecisionId: "", salesManagerTaskId: "manager-sales-outcome-5", salesDelegationOwnerDecisionId: "", validForSalesQualification: false, salesTaskBoundToApproval: false, requiresOwnerReconfirmation: true }), reviewJournal: [] },
  ], NOW);
  assert.equal(summary.completedSalesTasks, 5);
  assert.equal(summary.awaitingOwnerReview, 1);
  assert.equal(summary.confirmedOutcomes, 1);
  assert.equal(summary.observing, 1);
  assert.equal(summary.noValue, 1);
  assert.equal(summary.unclosed, 1);
  assert.deepEqual(summary.ownerEnteredValueByCurrency, { USD: 5000 });
  assert.equal(summary.truthBoundary.employeeReportedValueIncluded, false);
  assert.equal(summary.truthBoundary.portfolioValueIsAutoEstimated, false);
});

test("value-claim extraction is bounded and descriptive only", () => {
  assert.equal(extractEmployeeReportedValueClaim("No business amount was reported."), "");
  const long = `Revenue: USD ${"9".repeat(900)}`;
  assert.ok(extractEmployeeReportedValueClaim(long).length <= 500);
});
