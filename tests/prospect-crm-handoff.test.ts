import test from "node:test";
import assert from "node:assert/strict";

import { buildProspectCrmHandoffProposal } from "../src/prospect-crm-handoff.js";
import type { ProspectCandidate, ProspectSalesHandoffBrief } from "../src/types.js";

function prospect(overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    id: "prospect-crm-1",
    domain: "acme.example",
    websiteUrl: "https://acme.example/",
    companyName: "Acme Industrial",
    description: "Industrial equipment manufacturer",
    discoverySourceUrl: "https://directory.example/acme",
    discoverySourceTitle: "Directory result",
    discoveryQuery: "industrial equipment",
    publicEmails: ["sales@acme.example"],
    publicPhones: ["+1-555-0100"],
    contactUrls: ["https://acme.example/contact"],
    officialProfileUrls: ["https://www.linkedin.com/company/acme-industrial"],
    publicMessagingUrls: [],
    productSignals: ["industrial pumps"],
    evidenceUrls: ["https://acme.example/", "https://directory.example/acme"],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "browser-rendered",
    websiteVerifiedAt: "2026-08-20T08:20:00.000Z",
    score: 72,
    reasons: ["public company evidence reviewed"],
    fitScore: 80,
    fitTerms: ["industrial", "pump"],
    fitMatches: ["industrial", "pump"],
    discoveredAt: "2026-08-20T07:00:00.000Z",
    status: "READY_FOR_SALES",
    firstSeenAt: "2026-08-20T07:00:00.000Z",
    lastSeenAt: "2026-08-20T08:20:00.000Z",
    ...overrides,
  };
}

function handoff(overrides: Partial<ProspectSalesHandoffBrief> = {}): ProspectSalesHandoffBrief {
  return {
    schema: "bossai.prospect-sales-handoff-brief.v1",
    prospectId: "prospect-crm-1",
    generatedAt: "2026-08-20T08:25:00.000Z",
    managerTaskId: "sales-task-1",
    managerStatus: "completed",
    managerReviewStatus: "approved",
    managerUpdatedAt: "2026-08-20T08:24:00.000Z",
    sourceAuthority: "bossai-manager",
    artifactDescriptorId: "sales.lead-qualification.md",
    disposition: "qualification-allowed",
    dispositionMarker: "HUMAN_REVIEWED_QUALIFICATION_ALLOWED",
    sourceReportedWebsiteEvidence: { status: "verified", source: "browser-rendered" },
    currentWebsiteEvidence: { status: "verified", source: "browser-rendered" },
    qualificationFields: [
      { key: "real-need", state: "reported-evidence", reportedValue: "Replacement sourcing workflow under review", source: "sales-manager-result" },
      { key: "buyer-authority", state: "unknown", reportedValue: "UNKNOWN", source: "sales-manager-result" },
      { key: "timing", state: "unknown", reportedValue: "UNKNOWN", source: "sales-manager-result" },
      { key: "budget", state: "unknown", reportedValue: "UNKNOWN", source: "sales-manager-result" },
    ],
    ownerApproval: {
      id: "owner-decision-1",
      reasonCode: "intelligence-ready",
      note: "Allow governed sales qualification only",
      decidedAt: "2026-08-20T08:22:00.000Z",
    },
    nextOwnerAction: "decide-outreach-separately",
    authoritativeOutput: "bounded sales result",
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
    ...overrides,
  };
}

test("Radar CRM handoff stays blocked before completed reviewed Sales qualification", () => {
  const output = buildProspectCrmHandoffProposal({ prospect: prospect(), salesHandoff: null });
  assert.equal(output.schema, "bossai.prospect-crm-handoff.v1");
  assert.equal(output.status, "blocked");
  assert.ok(output.blockers.includes("completed-sales-qualification-required"));
  assert.equal(output.authority.crmWriteAuthorized, false);
  assert.equal(output.authority.requiresCrmAcceptance, true);
  assert.equal(output.authority.externalContactAuthorized, false);
});

test("Radar exports a minimal reviewed lead candidate but never authorizes the CRM write", () => {
  const output = buildProspectCrmHandoffProposal({
    prospect: prospect(),
    salesHandoff: handoff(),
    intelligenceManagerTaskId: "intelligence-task-1",
    salesManagerTaskId: "sales-task-1",
    generatedAt: "2026-08-20T08:30:00.000Z",
  });

  assert.equal(output.status, "ready-for-crm-acceptance");
  assert.deepEqual(output.blockers, []);
  assert.equal(output.target.project, "bossai-crm-employee");
  assert.equal(output.company.publicEmails[0], "sales@acme.example");
  assert.equal(output.intelligenceProvenance.radarCandidateScore, 72);
  assert.equal(output.intelligenceProvenance.radarScoreMeaning, "sorting-only-not-purchase-or-close-probability");
  assert.equal(output.salesQualification?.qualificationFields.find((field) => field.key === "budget")?.state, "unknown");
  assert.equal(output.authority.proposalOnly, true);
  assert.equal(output.authority.crmWriteAuthorized, false);
  assert.equal(output.authority.crmRecordCreated, false);
  assert.equal(output.authority.crmBecomesSourceOfRecordOnlyAfterAcceptedWrite, true);
  assert.equal(output.authority.radarRetainsIntelligenceProvenance, true);
  assert.equal(output.authority.externalActionsExecuted, false);
  assert.equal("authoritativeOutput" in output, false);
});

test("unverified website or blocked Sales disposition cannot become a ready CRM handoff", () => {
  const output = buildProspectCrmHandoffProposal({
    prospect: prospect({ websiteEvidenceStatus: "static-incomplete" }),
    salesHandoff: handoff({ disposition: "blocked-browser-evidence", ownerApproval: null }),
  });
  assert.equal(output.status, "blocked");
  assert.ok(output.blockers.includes("verified-website-evidence-required"));
  assert.ok(output.blockers.includes("sales-qualification-not-allowed"));
  assert.ok(output.blockers.includes("owner-sales-authorization-lineage-required"));
  assert.equal(output.authority.crmWriteAuthorized, false);
});
