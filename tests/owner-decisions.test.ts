import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildProspectAccountReview } from "../src/account-review.js";
import { RadarDatabase } from "../src/database.js";
import {
  buildProspectOwnerDecisionSnapshot,
  parseProspectOwnerDecisionInput,
  ProspectOwnerDecisionValidationError,
} from "../src/owner-decisions.js";
import type { ProjectedProspectOwnerDecisionV2 } from "../src/owner-business-decision-projection.js";
import type { ProspectCandidate } from "../src/types.js";

function prospect(overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    id: "prospect-owner-decision",
    domain: "owner-decision.example",
    websiteUrl: "https://owner-decision.example/",
    companyName: "Owner Decision Co",
    description: "Industrial equipment distributor.",
    discoverySourceUrl: "https://expo.example/owner-decision",
    discoverySourceTitle: "Expo",
    discoveryQuery: "industrial distributor",
    publicEmails: [],
    publicPhones: [],
    contactUrls: ["https://owner-decision.example/contact"],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [],
    productSignals: ["Industrial equipment"],
    evidenceUrls: ["https://owner-decision.example/"],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T05:00:00.000Z",
    score: 73,
    reasons: ["official website verified"],
    fitScore: 50,
    fitTerms: ["industrial", "distributor"],
    fitMatches: ["industrial"],
    status: "REVIEW_REQUIRED",
    discoveredAt: "2026-08-18T04:00:00.000Z",
    firstSeenAt: "2026-08-18T04:00:00.000Z",
    lastSeenAt: "2026-08-18T05:00:00.000Z",
    ...overrides,
  };
}

test("owner decision input accepts bounded reasons and requires explanation for Other", () => {
  assert.deepEqual(parseProspectOwnerDecisionInput({
    decision: "approve-sales",
    reasonCode: "intelligence-ready",
    note: "Reviewed the employee result.",
  }), {
    decision: "approve-sales",
    reasonCode: "intelligence-ready",
    note: "Reviewed the employee result.",
  });

  assert.throws(
    () => parseProspectOwnerDecisionInput({ decision: "approve-sales", reasonCode: "low-fit" }),
    (error) => error instanceof ProspectOwnerDecisionValidationError
      && error.code === "PROSPECT_OWNER_DECISION_REASON_MISMATCH",
  );
  assert.throws(
    () => parseProspectOwnerDecisionInput({ decision: "reject-prospect", reasonCode: "other", note: "" }),
    (error) => error instanceof ProspectOwnerDecisionValidationError
      && error.code === "PROSPECT_OWNER_DECISION_NOTE_REQUIRED",
  );
});

test("owner decision snapshot captures review-time evidence without converting it into sales probability", () => {
  const review = buildProspectAccountReview({ prospect: prospect() });
  const snapshot = buildProspectOwnerDecisionSnapshot(review);
  assert.equal(snapshot.schema, "bossai.prospect-owner-decision-snapshot.v1");
  assert.equal(snapshot.prospectStatusBefore, "REVIEW_REQUIRED");
  assert.equal(snapshot.websiteEvidenceStatus, "verified");
  assert.equal(snapshot.candidateScore, 73);
  assert.equal(snapshot.evidenceTotal, 6);
  assert.equal("purchaseProbability" in snapshot, false);
  assert.equal("nextPurchaseDate" in snapshot, false);
});

test("owner decision journal atomically records approval and updates the existing prospect status", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-owner-decision-"));
  const db = new RadarDatabase(dataDir);
  try {
    const discovered = db.saveProspectCandidate(prospect());
    const saved = db.updateProspectStatus(discovered.id, "REVIEW_REQUIRED");
    assert.ok(saved);
    const review = buildProspectAccountReview({ prospect: saved });
    const result = db.recordProspectOwnerDecision({
      prospectId: saved.id,
      decision: "approve-sales",
      reasonCode: "owner-judgment",
      note: "Owner reviewed the evidence chain and approved Sales qualification.",
      expectedStatus: "REVIEW_REQUIRED",
      targetStatus: "READY_FOR_SALES",
      snapshot: buildProspectOwnerDecisionSnapshot(review),
      decidedAt: "2026-08-18T06:00:00.000Z",
    });
    assert.ok(result);
    assert.equal(result.prospect.status, "READY_FOR_SALES");
    assert.equal(result.decision.previousStatus, "REVIEW_REQUIRED");
    assert.equal(result.decision.targetStatus, "READY_FOR_SALES");
    assert.equal(result.decision.actorType, "owner-admin");
    assert.equal(result.decision.truthBoundary.decisionIsSalesProbability, false);
    assert.equal(db.listProspectOwnerDecisions(saved.id, 10).length, 1);
  } finally {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("BossAI OS v2 owner decision is cached only as a compatibility projection and does not create a Radar owner journal entry", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-owner-os-projection-"));
  const db = new RadarDatabase(dataDir);
  try {
    const saved = db.saveProspectCandidate(prospect());
    const projection: ProjectedProspectOwnerDecisionV2 = {
      schema: "bossai.owner-decision-projection.v2",
      status: "projected",
      prospectId: saved.id,
      intelligenceManagerTaskId: "manager-task-intel-42",
      source: {
        project: "bossai-os",
        contract: "bossai.owner-business-decision.v2",
        decisionId: "work-prospect-intel-42-v2",
        auditId: "audit-v2-42",
        decidedAt: "2026-08-20T09:00:00.000Z",
        actorType: "user",
        actorId: "owner-1",
      },
      decision: {
        domain: "sales-prospect",
        subjectType: "prospect",
        subjectId: saved.id,
        decisionType: "authorize-sales-qualification",
        radarCompatibilityDecision: "approve-sales",
        reasonCode: "evidence-sufficient",
        contextType: "intelligence-manager-task",
        contextId: "manager-task-intel-42",
      },
      authority: {
        sourceOfDecisionTruth: "bossai-os",
        bossaiWorkCanonicalOwnerSurface: true,
        radarProjectionOnly: true,
        radarPersistenceAuthorized: false,
        compatibilityProjectionCacheAuthorized: true,
        radarOwnerDecisionAuthority: false,
        salesQualificationRequiresSeparateExplicitAction: true,
        externalActionsExecuted: false,
      },
    };
    const updated = db.syncProspectOwnerAuthorityProjectionV2(projection);
    assert.equal(updated?.status, "READY_FOR_SALES");
    assert.equal(db.listProspectOwnerDecisions(saved.id, 10).length, 0);
    assert.deepEqual(db.getProspectOwnerAuthorityProjectionV2(saved.id), projection);

    db.close();
    const reopened = new RadarDatabase(dataDir);
    try {
      assert.deepEqual(reopened.getProspectOwnerAuthorityProjectionV2(saved.id), projection);
      assert.equal(reopened.getProspectCandidate(saved.id)?.status, "READY_FOR_SALES");
    } finally {
      reopened.close();
    }
  } finally {
    try { db.close(); } catch {}
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("stale owner decision writes neither a journal entry nor a status transition", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-owner-decision-stale-"));
  const db = new RadarDatabase(dataDir);
  try {
    const saved = db.saveProspectCandidate(prospect({ status: "DISCOVERED" }));
    const review = buildProspectAccountReview({ prospect: saved });
    const result = db.recordProspectOwnerDecision({
      prospectId: saved.id,
      decision: "reject-prospect",
      reasonCode: "low-fit",
      note: "",
      expectedStatus: "REVIEW_REQUIRED",
      targetStatus: "REJECTED",
      snapshot: buildProspectOwnerDecisionSnapshot(review),
    });
    assert.equal(result, null);
    assert.equal(db.getProspectCandidate(saved.id)?.status, "DISCOVERED");
    assert.equal(db.listProspectOwnerDecisions(saved.id, 10).length, 0);
  } finally {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
