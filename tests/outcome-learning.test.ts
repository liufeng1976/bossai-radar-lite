import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProspectOutcomeLearning,
  buildProspectOutcomeLearningDrilldown,
  buildProspectOutcomeLearningMembership,
  OUTCOME_LEARNING_MIN_SAMPLE,
} from "../src/outcome-learning.js";
import type {
  BossAiDelegation,
  ProspectCandidate,
  ProspectOutcomeReviewRecord,
  ProspectSalesAuthorizationLineage,
} from "../src/types.js";

function prospect(id: string, overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    id,
    domain: `${id}.example`,
    websiteUrl: `https://${id}.example/`,
    companyName: id,
    description: "Industrial exporter",
    discoverySourceUrl: `https://expo.example/${id}`,
    discoverySourceTitle: "Expo directory",
    discoveryQuery: "industrial exporters",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [{
      type: "email",
      value: `sales@${id}.example`,
      url: `mailto:sales@${id}.example`,
      sourcePageUrl: `https://${id}.example/contact`,
      sourceKind: "visible-text",
      businessRole: "sales",
      confidence: "high",
      verificationStatus: "official-site-observed",
    }],
    productSignals: ["industrial equipment"],
    evidenceUrls: [`https://${id}.example/`],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-19T01:00:00.000Z",
    score: 77,
    reasons: ["official website evidence"],
    fitScore: 50,
    fitTerms: ["industrial", "export"],
    fitMatches: ["industrial"],
    discoveredAt: "2026-08-19T00:00:00.000Z",
    status: "READY_FOR_SALES",
    firstSeenAt: "2026-08-19T00:00:00.000Z",
    lastSeenAt: "2026-08-19T01:00:00.000Z",
    ...overrides,
  };
}

function salesDelegation(id: string, ownerDecisionId = `decision-${id}`): BossAiDelegation {
  return {
    id: 1,
    sourceType: "prospect-sales",
    sourceRecordId: id,
    sourceOperationId: `sales-operation-${id}`,
    bossaiRunId: `sales-task-${id}`,
    bossaiAgentId: "bossai-sales-employee",
    status: "completed",
    reviewStatus: "pending",
    submittedAt: "2026-08-19T01:00:00.000Z",
    updatedAt: "2026-08-19T02:00:00.000Z",
    resultImportedAt: null,
    errorCode: "",
    errorMessage: "",
    ownerDecisionId,
  };
}

function lineage(id: string, ownerDecisionId = `decision-${id}`): ProspectSalesAuthorizationLineage {
  return {
    schema: "bossai.prospect-sales-authorization-lineage.v1",
    status: "sales-bound",
    ownerDecisionId,
    ownerDecisionAt: "2026-08-19T00:30:00.000Z",
    ownerDecisionReasonCode: "intelligence-ready",
    intelligenceManagerTaskId: `intelligence-task-${id}`,
    decisionIntelligenceManagerTaskId: `intelligence-task-${id}`,
    salesManagerTaskId: `sales-task-${id}`,
    salesDelegationOwnerDecisionId: ownerDecisionId,
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
  };
}

function review(
  id: string,
  decision: ProspectOutcomeReviewRecord["decision"],
  amount: number | null = null,
  currency = "",
  salesTaskId = `sales-task-${id}`,
  ownerDecisionId = `decision-${id}`,
): ProspectOutcomeReviewRecord {
  return {
    schema: "bossai.prospect-outcome-review.v1",
    id: `outcome-review-${id}-${decision}`,
    prospectId: id,
    salesManagerTaskId: salesTaskId,
    ownerDecisionId,
    decision,
    evidenceState: decision === "observe" ? "OBSERVED" : "CONFIRMED",
    summary: "Owner-reviewed historical outcome.",
    businessValueAmount: amount,
    businessValueCurrency: currency,
    businessValueBasis: amount === null ? "none" : "owner-entered",
    actorType: "owner-admin",
    reviewedAt: "2026-08-19T03:00:00.000Z",
    snapshot: {
      schema: "bossai.prospect-outcome-review-snapshot.v1",
      generatedAt: "2026-08-19T03:00:00.000Z",
      intelligenceManagerTaskId: `intelligence-task-${id}`,
      ownerDecisionId,
      salesManagerTaskId: salesTaskId,
      salesDisposition: "qualification-allowed",
      salesReportedWebsiteEvidenceStatus: "verified",
      qualificationStates: {
        "real-need": "reported-evidence",
        "buyer-authority": "unknown",
        timing: "unknown",
        budget: "unknown",
      },
      employeeReportedValueClaim: "Employee-reported business value may be 100000 USD",
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

function learningInput(id: string, journal: ProspectOutcomeReviewRecord[] = [], candidate = prospect(id)) {
  return {
    prospect: candidate,
    salesDelegation: salesDelegation(id),
    lineage: lineage(id),
    reviewJournal: journal,
  };
}

test("Outcome Learning buckets confirmed, no-value, observing and awaiting samples descriptively", () => {
  const learning = buildProspectOutcomeLearning([
    learningInput("confirmed", [review("confirmed", "confirm-outcome", 5000, "USD")]),
    learningInput("no-value", [review("no-value", "no-value")]),
    learningInput("observing", [review("observing", "observe")]),
    learningInput("awaiting"),
  ], Date.parse("2026-08-19T05:00:00.000Z"));

  assert.equal(learning.schema, "bossai.prospect-outcome-learning.v1");
  assert.equal(learning.status, "descriptive");
  assert.equal(learning.sampleCount, 4);
  const discovery = learning.dimensions.find((item) => item.key === "discovery-source");
  const cohort = discovery?.cohorts.find((item) => item.key === "expo.example");
  assert.equal(cohort?.sampleCount, 4);
  assert.equal(cohort?.confirmedCount, 1);
  assert.equal(cohort?.noValueCount, 1);
  assert.equal(cohort?.observingCount, 1);
  assert.equal(cohort?.awaitingCount, 1);
  assert.deepEqual(cohort?.ownerEnteredValueByCurrency, { USD: 5000 });
});

test("Outcome Learning drill-down returns only current eligible cohort accounts in alphabetical order without private outcome value", () => {
  const alpha = learningInput("alpha", [review("alpha", "confirm-outcome", 4200, "USD")], prospect("alpha", {
    companyName: "Alpha Industries",
    companyContactChannels: [
      {
        type: "email",
        value: "sales@alpha.example",
        url: "mailto:sales@alpha.example",
        sourcePageUrl: "https://alpha.example/contact",
        sourceKind: "visible-text",
        businessRole: "sales",
        confidence: "high",
        verificationStatus: "official-site-observed",
      },
      {
        type: "contact-page",
        value: "https://alpha.example/procurement",
        url: "https://alpha.example/procurement",
        sourcePageUrl: "https://alpha.example/procurement",
        sourceKind: "contact-link",
        businessRole: "procurement",
        confidence: "medium",
        verificationStatus: "official-site-observed",
      },
    ],
  }));
  const zeta = learningInput("zeta", [review("zeta", "observe")], prospect("zeta", { companyName: "Zeta Trading" }));
  const excluded = learningInput("excluded", [review("excluded", "confirm-outcome", 9900, "USD")], prospect("excluded", { companyName: "Beta Excluded" }));
  excluded.salesDelegation = { ...excluded.salesDelegation, status: "running" };

  const discovery = buildProspectOutcomeLearningDrilldown(
    [zeta, excluded, alpha],
    "discovery-source",
    "expo.example",
    Date.parse("2026-08-19T05:30:00.000Z"),
  );
  assert.equal(discovery.schema, "bossai.prospect-outcome-learning-drilldown.v1");
  assert.equal(discovery.outcomeStateFilter, null);
  assert.equal(discovery.cohortSampleCount, 2);
  assert.equal(discovery.sampleCount, 2);
  assert.deepEqual(discovery.items.map((item) => item.companyName), ["Alpha Industries", "Zeta Trading"]);
  assert.deepEqual(discovery.items.map((item) => item.contributionState), ["confirmed", "observing"]);
  assert.equal(JSON.stringify(discovery).includes("4200"), false);
  assert.equal(JSON.stringify(discovery).includes("Owner-reviewed historical outcome"), false);
  assert.equal(discovery.truthBoundary.alphabeticalOrderingOnly, true);
  assert.equal(discovery.truthBoundary.rankingPerformed, false);
  assert.equal(discovery.truthBoundary.businessValueIncluded, false);
  assert.equal(discovery.truthBoundary.ownerReviewNoteIncluded, false);
  assert.equal(discovery.truthBoundary.managerTaskCreated, false);

  const procurement = buildProspectOutcomeLearningDrilldown([alpha, zeta], "business-channel-role", "procurement");
  assert.deepEqual(procurement.items.map((item) => item.prospectId), ["alpha"]);
  const sales = buildProspectOutcomeLearningDrilldown([alpha, zeta], "business-channel-role", "sales");
  assert.deepEqual(sales.items.map((item) => item.prospectId), ["alpha", "zeta"]);

  const observingOnly = buildProspectOutcomeLearningDrilldown(
    [zeta, alpha],
    "discovery-source",
    "expo.example",
    Date.parse("2026-08-19T05:31:00.000Z"),
    "observing",
  );
  assert.equal(observingOnly.outcomeStateFilter, "observing");
  assert.equal(observingOnly.cohortSampleCount, 2);
  assert.equal(observingOnly.sampleCount, 1);
  assert.deepEqual(observingOnly.items.map((item) => item.prospectId), ["zeta"]);
  assert.equal(JSON.stringify(observingOnly).includes("4200"), false);
});

test("employee-reported monetary claims never enter owner-entered value aggregation", () => {
  const confirmedWithoutOwnerAmount = review("reported-claim", "confirm-outcome");
  assert.match(confirmedWithoutOwnerAmount.snapshot.employeeReportedValueClaim, /100000 USD/u);
  const learning = buildProspectOutcomeLearning([learningInput("reported-claim", [confirmedWithoutOwnerAmount])]);
  const source = learning.dimensions.find((item) => item.key === "discovery-source")?.cohorts[0];
  assert.deepEqual(source?.ownerEnteredValueByCurrency, {});
  assert.equal(learning.truthBoundary.employeeReportedValueIncluded, false);
  assert.equal(learning.truthBoundary.businessValueAutoEstimated, false);
});

test("owner-entered values aggregate only by explicit currency and no-value is not revenue zero", () => {
  const learning = buildProspectOutcomeLearning([
    learningInput("usd", [review("usd", "confirm-outcome", 1200, "USD")]),
    learningInput("cny", [review("cny", "confirm-outcome", 8000, "CNY")]),
    learningInput("novalue", [review("novalue", "no-value")]),
  ]);
  const source = learning.dimensions.find((item) => item.key === "discovery-source")?.cohorts[0];
  assert.deepEqual(source?.ownerEnteredValueByCurrency, { USD: 1200, CNY: 8000 });
  assert.equal(source?.noValueCount, 1);
  assert.equal(Object.values(source?.ownerEnteredValueByCurrency ?? {}).includes(0), false);
});

test("small cohorts fail soft as insufficient-sample without declaring a winner", () => {
  const learning = buildProspectOutcomeLearning([
    learningInput("one", [review("one", "confirm-outcome")]),
    learningInput("two"),
  ]);
  assert.equal(learning.minimumSampleSize, OUTCOME_LEARNING_MIN_SAMPLE);
  assert.equal(learning.status, "insufficient-sample");
  for (const dimension of learning.dimensions) {
    assert.equal(dimension.cohorts[0]?.status, "insufficient-sample");
  }
  assert.equal(JSON.stringify(learning).includes("best"), false);
  assert.equal(JSON.stringify(learning).includes("winner"), false);
});

test("a stale P9 outcome review does not attach to a newer Sales lineage cohort", () => {
  const id = "stale";
  const currentSales = salesDelegation(id, "decision-new");
  currentSales.bossaiRunId = "sales-task-new";
  const currentLineage = lineage(id, "decision-new");
  currentLineage.salesManagerTaskId = "sales-task-new";
  currentLineage.salesDelegationOwnerDecisionId = "decision-new";
  const staleReview = review(id, "confirm-outcome", 9999, "USD", "sales-task-old", "decision-old");

  const learning = buildProspectOutcomeLearning([{
    prospect: prospect(id),
    salesDelegation: currentSales,
    lineage: currentLineage,
    reviewJournal: [staleReview],
  }]);
  const source = learning.dimensions.find((item) => item.key === "discovery-source")?.cohorts[0];
  assert.equal(source?.confirmedCount, 0);
  assert.equal(source?.awaitingCount, 1);
  assert.deepEqual(source?.ownerEnteredValueByCurrency, {});
});

test("invalid P8 lineage is excluded from confirmed Outcome Learning samples", () => {
  const id = "invalid-lineage";
  const invalidLineage = lineage(id);
  invalidLineage.status = "sales-lineage-mismatch";
  invalidLineage.salesTaskBoundToApproval = false;
  invalidLineage.validForSalesQualification = false;
  const learning = buildProspectOutcomeLearning([{
    prospect: prospect(id),
    salesDelegation: salesDelegation(id),
    lineage: invalidLineage,
    reviewJournal: [review(id, "confirm-outcome", 7000, "USD")],
  }]);
  assert.equal(learning.sampleCount, 0);
  assert.equal(learning.status, "insufficient-sample");
  assert.ok(learning.dimensions.every((dimension) => dimension.cohorts.length === 0));
});

test("single-account Outcome Learning membership explains cohort facts without creating a ranking", () => {
  const id = "membership";
  const candidate = prospect(id, {
    discoverySourceUrl: "https://directory.example/exhibitors/membership",
    discoverySourceTitle: "Directory exhibitor",
    websiteEvidenceSource: "browser-rendered",
    fitScore: 80,
    fitTerms: ["industrial", "export", "distributor"],
    fitMatches: ["industrial", "export"],
    companyContactChannels: [
      {
        type: "email",
        value: "sales@membership.example",
        sourcePageUrl: "https://membership.example/contact",
        sourceKind: "visible-text",
        businessRole: "sales",
        confidence: "high",
        verificationStatus: "official-site-observed",
      },
      {
        type: "contact-page",
        value: "https://membership.example/procurement",
        url: "https://membership.example/procurement",
        sourcePageUrl: "https://membership.example/procurement",
        sourceKind: "contact-link",
        businessRole: "procurement",
        confidence: "medium",
        verificationStatus: "official-site-observed",
      },
    ],
  });
  const membership = buildProspectOutcomeLearningMembership({
    prospect: candidate,
    salesDelegation: salesDelegation(id),
    lineage: lineage(id),
    reviewJournal: [review(id, "confirm-outcome", 2500, "USD")],
  });

  assert.equal(membership.schema, "bossai.prospect-outcome-learning-membership.v1");
  assert.equal(membership.eligible, true);
  assert.equal(membership.sampleContributionState, "confirmed");
  assert.equal(membership.eligibilityReason, "current-sales-lineage-completed");
  assert.equal(membership.cohorts.discoverySource.key, "directory.example");
  assert.equal(membership.cohorts.discoverySource.sourceTitle, "Directory exhibitor");
  assert.equal(membership.cohorts.websiteEvidenceSource.key, "browser-rendered");
  assert.deepEqual(membership.cohorts.businessChannelRoles, ["sales", "procurement"]);
  assert.deepEqual(membership.cohorts.icpLexicalCoverage, {
    key: "67-100",
    score: 80,
    matchedCount: 2,
    termCount: 3,
  });
  assert.equal(membership.truthBoundary.cohortMembershipIsNotRanking, true);
  assert.equal(membership.truthBoundary.causalityInferred, false);
  assert.equal(membership.truthBoundary.closeProbabilityInferred, false);
  assert.equal(membership.truthBoundary.purchaseIntentInferred, false);
  assert.equal(membership.truthBoundary.scoreMutationPerformed, false);
  assert.equal(membership.truthBoundary.modelCalled, false);
});

test("single-account Outcome Learning membership fail-closes when the current Sales lineage is not eligible", () => {
  const id = "membership-invalid";
  const pendingSales = salesDelegation(id);
  pendingSales.status = "running";
  const pending = buildProspectOutcomeLearningMembership({
    prospect: prospect(id),
    salesDelegation: pendingSales,
    lineage: lineage(id),
  });
  assert.equal(pending.eligible, false);
  assert.equal(pending.sampleContributionState, "excluded");
  assert.equal(pending.eligibilityReason, "sales-not-completed");

  const invalidLineage = lineage(id);
  invalidLineage.status = "sales-lineage-mismatch";
  invalidLineage.salesTaskBoundToApproval = false;
  const invalid = buildProspectOutcomeLearningMembership({
    prospect: prospect(id),
    salesDelegation: salesDelegation(id),
    lineage: invalidLineage,
  });
  assert.equal(invalid.eligible, false);
  assert.equal(invalid.sampleContributionState, "excluded");
  assert.equal(invalid.eligibilityReason, "authorization-lineage-invalid");
});

test("single-account contribution state follows only the exact current P8/P9 lineage", () => {
  const id = "membership-contribution";
  const currentSales = salesDelegation(id, "decision-current");
  currentSales.bossaiRunId = "sales-task-current";
  const currentLineage = lineage(id, "decision-current");
  currentLineage.salesManagerTaskId = "sales-task-current";
  currentLineage.salesDelegationOwnerDecisionId = "decision-current";

  const awaiting = buildProspectOutcomeLearningMembership({
    prospect: prospect(id),
    salesDelegation: currentSales,
    lineage: currentLineage,
    reviewJournal: [review(id, "confirm-outcome", 9000, "USD", "sales-task-old", "decision-old")],
  });
  assert.equal(awaiting.eligible, true);
  assert.equal(awaiting.sampleContributionState, "awaiting-owner-review");

  const observing = buildProspectOutcomeLearningMembership({
    prospect: prospect(id),
    salesDelegation: currentSales,
    lineage: currentLineage,
    reviewJournal: [review(id, "observe", null, "", "sales-task-current", "decision-current")],
  });
  assert.equal(observing.sampleContributionState, "observing");

  const noValue = buildProspectOutcomeLearningMembership({
    prospect: prospect(id),
    salesDelegation: currentSales,
    lineage: currentLineage,
    reviewJournal: [review(id, "no-value", null, "", "sales-task-current", "decision-current")],
  });
  assert.equal(noValue.sampleContributionState, "no-value");
});

test("Outcome Learning chooses the newest matching review even when the journal arrives out of order", () => {
  const id = "unordered-review-journal";
  const older = review(id, "confirm-outcome", 5000, "USD");
  older.id = "review-older-confirmed";
  older.reviewedAt = "2026-08-19T02:00:00.000Z";
  const newer = review(id, "observe");
  newer.id = "review-newer-observe";
  newer.reviewedAt = "2026-08-19T04:00:00.000Z";

  const learning = buildProspectOutcomeLearning([learningInput(id, [older, newer])]);
  const source = learning.dimensions.find((item) => item.key === "discovery-source")?.cohorts[0];
  assert.equal(source?.confirmedCount, 0);
  assert.equal(source?.observingCount, 1);
  assert.deepEqual(source?.ownerEnteredValueByCurrency, {});

  const membership = buildProspectOutcomeLearningMembership({
    prospect: prospect(id),
    salesDelegation: salesDelegation(id),
    lineage: lineage(id),
    reviewJournal: [older, newer],
  });
  assert.equal(membership.sampleContributionState, "observing");
});

test("Outcome Learning is pure descriptive analysis and does not mutate score or claim runtime actions", () => {
  const candidate = prospect("pure", {
    score: 91,
    websiteEvidenceSource: "browser-rendered",
    fitScore: 80,
    companyContactChannels: [
      {
        type: "email",
        value: "sales@pure.example",
        sourcePageUrl: "https://pure.example/contact",
        sourceKind: "visible-text",
        businessRole: "sales",
        confidence: "high",
        verificationStatus: "official-site-observed",
      },
      {
        type: "contact-page",
        value: "https://pure.example/procurement",
        url: "https://pure.example/procurement",
        sourcePageUrl: "https://pure.example/procurement",
        sourceKind: "contact-link",
        businessRole: "procurement",
        confidence: "medium",
        verificationStatus: "official-site-observed",
      },
    ],
  });
  const before = structuredClone(candidate);
  const learning = buildProspectOutcomeLearning([learningInput("pure", [review("pure", "confirm-outcome", 2500, "USD")], candidate)]);

  assert.deepEqual(candidate, before);
  assert.equal(candidate.score, 91);
  assert.equal(learning.truthBoundary.scoreMutationPerformed, false);
  assert.equal(learning.truthBoundary.crmRecordCreated, false);
  assert.equal(learning.truthBoundary.managerTaskCreated, false);
  assert.equal(learning.truthBoundary.modelCalled, false);
  assert.equal(learning.truthBoundary.causalityInferred, false);
  assert.equal(learning.truthBoundary.closeProbabilityInferred, false);
  assert.equal(learning.truthBoundary.purchaseIntentInferred, false);
  assert.equal(learning.truthBoundary.nextPurchaseDatePredicted, false);

  const website = learning.dimensions.find((item) => item.key === "website-evidence-source");
  assert.equal(website?.cohorts[0]?.key, "browser-rendered");
  const channels = learning.dimensions.find((item) => item.key === "business-channel-role");
  assert.deepEqual(channels?.cohorts.map((item) => item.key).sort(), ["procurement", "sales"]);
  const icp = learning.dimensions.find((item) => item.key === "icp-lexical-coverage");
  assert.equal(icp?.cohorts[0]?.key, "67-100");
});
