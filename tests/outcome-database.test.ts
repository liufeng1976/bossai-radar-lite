import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";
import type { ProspectCandidate, ProspectOutcomeReviewSnapshot } from "../src/types.js";

function candidate(): ProspectCandidate {
  return {
    id: "prospect-outcome-db",
    domain: "outcome-db.example",
    websiteUrl: "https://outcome-db.example/",
    companyName: "Outcome DB Co",
    description: "Industrial distributor",
    discoverySourceUrl: "https://expo.example/outcome-db",
    discoverySourceTitle: "Expo",
    discoveryQuery: "industrial distributor",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [],
    productSignals: ["Industrial distribution"],
    evidenceUrls: ["https://outcome-db.example/"],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T20:00:00.000Z",
    score: 70,
    reasons: [],
    status: "READY_FOR_SALES",
    discoveredAt: "2026-08-18T18:00:00.000Z",
    firstSeenAt: "2026-08-18T18:00:00.000Z",
    lastSeenAt: "2026-08-18T20:00:00.000Z",
  };
}

function snapshot(salesManagerTaskId: string, ownerDecisionId: string): ProspectOutcomeReviewSnapshot {
  return {
    schema: "bossai.prospect-outcome-review-snapshot.v1",
    generatedAt: "2026-08-19T00:00:00.000Z",
    intelligenceManagerTaskId: "manager-intelligence-outcome-db",
    ownerDecisionId,
    salesManagerTaskId,
    salesDisposition: "qualification-allowed",
    salesReportedWebsiteEvidenceStatus: "verified",
    qualificationStates: {
      "real-need": "unknown",
      "buyer-authority": "unknown",
      timing: "unknown",
      budget: "unknown",
    },
    employeeReportedValueClaim: "Revenue claim: USD 999999",
  };
}

function saveSales(db: RadarDatabase, input: {
  runId: string;
  ownerDecisionId: string;
  status?: "queued" | "running" | "completed" | "failed" | "cancelled";
  updatedAt: string;
}): void {
  db.saveBossAiDelegation({
    sourceType: "prospect-sales",
    sourceRecordId: "prospect-outcome-db",
    sourceOperationId: `operation-${input.runId}`,
    bossaiRunId: input.runId,
    bossaiAgentId: "bossai-sales-agent",
    status: input.status ?? "completed",
    reviewStatus: "approved",
    submittedAt: input.updatedAt,
    updatedAt: input.updatedAt,
    ownerDecisionId: input.ownerDecisionId,
  });
}

test("outcome review journal is append-only and preserves owner-entered value rather than employee claims", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-outcome-db-"));
  const db = new RadarDatabase(directory);
  try {
    db.saveProspectCandidate(candidate());
    saveSales(db, {
      runId: "manager-sales-outcome-db-1",
      ownerDecisionId: "owner-decision-outcome-db-1",
      updatedAt: "2026-08-18T22:00:00.000Z",
    });

    const observed = db.recordProspectOutcomeReview({
      prospectId: "prospect-outcome-db",
      salesManagerTaskId: "manager-sales-outcome-db-1",
      ownerDecisionId: "owner-decision-outcome-db-1",
      decision: "observe",
      evidenceState: "OBSERVED",
      summary: "Need another operating signal before confirming business value.",
      businessValueAmount: null,
      businessValueCurrency: "",
      snapshot: snapshot("manager-sales-outcome-db-1", "owner-decision-outcome-db-1"),
      reviewedAt: "2026-08-18T23:00:00.000Z",
    });
    assert.ok(observed);
    assert.equal(observed.businessValueBasis, "none");
    assert.equal(observed.businessValueAmount, null);
    assert.match(observed.snapshot.employeeReportedValueClaim, /999999/u);

    const confirmed = db.recordProspectOutcomeReview({
      prospectId: "prospect-outcome-db",
      salesManagerTaskId: "manager-sales-outcome-db-1",
      ownerDecisionId: "owner-decision-outcome-db-1",
      decision: "confirm-outcome",
      evidenceState: "CONFIRMED",
      summary: "Owner independently confirmed a useful business result.",
      businessValueAmount: 4200,
      businessValueCurrency: "USD",
      snapshot: snapshot("manager-sales-outcome-db-1", "owner-decision-outcome-db-1"),
      reviewedAt: "2026-08-19T00:00:00.000Z",
    });
    assert.ok(confirmed);
    assert.equal(confirmed.businessValueBasis, "owner-entered");
    assert.equal(confirmed.businessValueAmount, 4200);
    assert.equal(confirmed.businessValueCurrency, "USD");
    assert.equal(confirmed.truthBoundary.employeeReportedValueIsConfirmed, false);
    assert.equal(confirmed.truthBoundary.businessValueAutoEstimated, false);

    const journal = db.listProspectOutcomeReviews("prospect-outcome-db", 20);
    assert.equal(journal.length, 2);
    assert.equal(journal[0]?.decision, "confirm-outcome");
    assert.equal(journal[1]?.decision, "observe");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("outcome review write fails atomically when the requested Sales task is not the latest completed lineage", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-outcome-stale-"));
  const db = new RadarDatabase(directory);
  try {
    db.saveProspectCandidate(candidate());
    saveSales(db, {
      runId: "manager-sales-outcome-old",
      ownerDecisionId: "owner-decision-outcome-old",
      updatedAt: "2026-08-18T21:00:00.000Z",
    });
    saveSales(db, {
      runId: "manager-sales-outcome-new",
      ownerDecisionId: "owner-decision-outcome-new",
      status: "running",
      updatedAt: "2026-08-18T23:00:00.000Z",
    });

    const stale = db.recordProspectOutcomeReview({
      prospectId: "prospect-outcome-db",
      salesManagerTaskId: "manager-sales-outcome-old",
      ownerDecisionId: "owner-decision-outcome-old",
      decision: "confirm-outcome",
      evidenceState: "CONFIRMED",
      summary: "This older task must not receive a new outcome review.",
      businessValueAmount: 1000,
      businessValueCurrency: "USD",
      snapshot: snapshot("manager-sales-outcome-old", "owner-decision-outcome-old"),
    });
    assert.equal(stale, null);
    assert.equal(db.listProspectOutcomeReviews("prospect-outcome-db", 20).length, 0);

    const currentButIncomplete = db.recordProspectOutcomeReview({
      prospectId: "prospect-outcome-db",
      salesManagerTaskId: "manager-sales-outcome-new",
      ownerDecisionId: "owner-decision-outcome-new",
      decision: "observe",
      evidenceState: "OBSERVED",
      summary: "The current running task cannot be reviewed as an outcome yet.",
      businessValueAmount: null,
      businessValueCurrency: "",
      snapshot: snapshot("manager-sales-outcome-new", "owner-decision-outcome-new"),
    });
    assert.equal(currentButIncomplete, null);
    assert.equal(db.listProspectOutcomeReviews("prospect-outcome-db", 20).length, 0);

    db.updateBossAiDelegationState("manager-sales-outcome-new", {
      status: "completed",
      reviewStatus: "approved",
      updatedAt: "2026-08-19T00:30:00.000Z",
    });
    const current = db.recordProspectOutcomeReview({
      prospectId: "prospect-outcome-db",
      salesManagerTaskId: "manager-sales-outcome-new",
      ownerDecisionId: "owner-decision-outcome-new",
      decision: "observe",
      evidenceState: "OBSERVED",
      summary: "Current completed Sales task may now receive an owner review.",
      businessValueAmount: null,
      businessValueCurrency: "",
      snapshot: snapshot("manager-sales-outcome-new", "owner-decision-outcome-new"),
    });
    assert.ok(current);
    assert.equal(db.listProspectOutcomeReviews("prospect-outcome-db", 20).length, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
