import assert from "node:assert/strict";
import test from "node:test";
import type { BossAiManagerRun } from "../src/bossai-os-client.js";
import { buildProspectSalesHandoffBrief } from "../src/sales-handoff.js";
import type { ProspectCandidate, ProspectOwnerDecisionRecord } from "../src/types.js";

const NOW = Date.parse("2026-08-18T10:30:00.000Z");

function prospect(overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  return {
    id: "sales-handoff-prospect",
    domain: "handoff.example",
    websiteUrl: "https://handoff.example/",
    companyName: "Handoff Export",
    description: "Industrial components.",
    discoverySourceUrl: "https://expo.example/handoff",
    discoverySourceTitle: "Expo",
    discoveryQuery: "industrial component distributor",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [],
    productSignals: ["Industrial components"],
    evidenceUrls: ["https://handoff.example/"],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "browser-rendered",
    websiteVerifiedAt: "2026-08-18T09:00:00.000Z",
    score: 78,
    reasons: ["verified public company evidence"],
    fitScore: 50,
    fitTerms: ["industrial"],
    fitMatches: ["industrial"],
    status: "READY_FOR_SALES",
    discoveredAt: "2026-08-18T07:00:00.000Z",
    firstSeenAt: "2026-08-18T07:00:00.000Z",
    lastSeenAt: "2026-08-18T09:00:00.000Z",
    ...overrides,
  };
}

function run(output: string, overrides: Partial<BossAiManagerRun> = {}): BossAiManagerRun {
  return {
    id: "manager-sales-handoff",
    status: "completed",
    reviewStatus: "pending",
    output,
    requiresHumanReview: true,
    externalActionsExecuted: false,
    createdAt: "2026-08-18T09:10:00.000Z",
    updatedAt: "2026-08-18T09:20:00.000Z",
    completedAt: "2026-08-18T09:20:00.000Z",
    ...overrides,
  };
}

const ownerApproval: ProspectOwnerDecisionRecord = {
  schema: "bossai.prospect-owner-decision.v1",
  id: "decision-approve",
  prospectId: "sales-handoff-prospect",
  decision: "approve-sales",
  reasonCode: "intelligence-ready",
  note: "Owner reviewed Intelligence before Sales qualification.",
  actorType: "owner-admin",
  previousStatus: "REVIEW_REQUIRED",
  targetStatus: "READY_FOR_SALES",
  decidedAt: "2026-08-18T09:05:00.000Z",
  snapshot: {
    schema: "bossai.prospect-owner-decision-snapshot.v1",
    generatedAt: "2026-08-18T09:05:00.000Z",
    accountReviewStage: "owner-decision",
    prospectStatusBefore: "REVIEW_REQUIRED",
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "browser-rendered",
    evidenceCompleted: 5,
    evidenceTotal: 6,
    businessChannelCount: 0,
    linkedTradeRecordCount: 0,
    tradeReviewPriority: null,
    candidateScore: 78,
    intelligenceManagerTaskId: "manager-intelligence-handoff",
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

test("Sales handoff parses the current Chinese cold-prospect qualification markers without inventing qualification facts", () => {
  const output = [
    "销售数字员工｜冷潜客资格判断（待人工审核）",
    "",
    "证据边界：",
    "- 官网证据状态：verified；采集来源：browser-rendered；核验时间：2026-08-18T09:00:00.000Z。",
    "",
    "资格判断：",
    "- 处置状态：HUMAN_REVIEWED_QUALIFICATION_ALLOWED；",
    "- 真实需求：未知，必须等待真实客户信号或经批准外联后的回应；",
    "- 决策权：未知；",
    "- 采购时间：未知；",
    "- 预算：未知；",
    "",
    "已执行外部动作：无。未联系潜客，未创建或修改 CRM 记录。",
  ].join("\n");
  const brief = buildProspectSalesHandoffBrief({ prospect: prospect(), run: run(output), ownerDecisionJournal: [ownerApproval], now: NOW });
  assert.equal(brief.disposition, "qualification-allowed");
  assert.equal(brief.dispositionMarker, "HUMAN_REVIEWED_QUALIFICATION_ALLOWED");
  assert.deepEqual(brief.sourceReportedWebsiteEvidence, { status: "verified", source: "browser-rendered" });
  assert.deepEqual(brief.qualificationFields.map((item) => [item.key, item.state]), [
    ["real-need", "unknown"],
    ["buyer-authority", "unknown"],
    ["timing", "unknown"],
    ["budget", "unknown"],
  ]);
  assert.equal(brief.ownerApproval?.id, "decision-approve");
  assert.equal(brief.nextOwnerAction, "decide-outreach-separately");
  assert.equal(brief.truthBoundary.handoffBriefIsOwnerApproval, false);
  assert.equal(brief.truthBoundary.qualificationIsCloseProbability, false);
  assert.equal(brief.truthBoundary.outreachAuthorized, false);
  assert.equal(brief.truthBoundary.crmWriteAuthorized, false);
});

test("Sales handoff does not attach a newer owner approval to an explicitly unbound legacy Sales task", () => {
  const output = [
    "Qualification:",
    "- Disposition: HUMAN_REVIEWED_QUALIFICATION_ALLOWED.",
    "- Need: UNKNOWN.",
    "- Authority: UNKNOWN.",
    "- Timing: UNKNOWN.",
    "- Budget: UNKNOWN.",
  ].join("\n");
  const brief = buildProspectSalesHandoffBrief({
    prospect: prospect(),
    run: run(output),
    ownerDecisionJournal: [ownerApproval],
    ownerDecisionId: "",
    now: NOW,
  });
  assert.equal(brief.ownerApproval, null);
  assert.equal(brief.truthBoundary.handoffBriefIsOwnerApproval, false);
});

test("Sales handoff parses the English browser-evidence blocker and keeps outreach disabled", () => {
  const output = [
    "Sales Agent — cold prospect qualification (review required)",
    "Evidence boundary:",
    "- Website evidence status: static-incomplete; acquisition source: static-http; verified at: not supplied.",
    "Qualification:",
    "- Disposition: BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE.",
    "- Need: UNKNOWN until a real customer signal provides evidence.",
    "- Authority: UNKNOWN.",
    "- Timing: UNKNOWN.",
    "- Budget: UNKNOWN.",
  ].join("\n");
  const brief = buildProspectSalesHandoffBrief({
    prospect: prospect({ websiteEvidenceStatus: "static-incomplete", websiteEvidenceSource: "static-http" }),
    run: run(output),
    now: NOW,
  });
  assert.equal(brief.disposition, "blocked-browser-evidence");
  assert.equal(brief.nextOwnerAction, "recover-browser-evidence");
  assert.equal(brief.truthBoundary.outreachAuthorized, false);
  assert.equal(brief.truthBoundary.crmRecordCreated, false);
});

test("Sales handoff marks a non-UNKNOWN qualification line as Sales-reported evidence rather than owner-verified fact", () => {
  const output = [
    "Qualification:",
    "- Disposition: HUMAN_REVIEWED_QUALIFICATION_ALLOWED.",
    "- Need: Distributor expansion was reported in the task evidence.",
    "- Authority: UNKNOWN.",
    "- Timing: UNKNOWN.",
    "- Budget: UNKNOWN.",
  ].join("\n");
  const brief = buildProspectSalesHandoffBrief({ prospect: prospect(), run: run(output), now: NOW });
  const need = brief.qualificationFields.find((item) => item.key === "real-need");
  assert.equal(need?.state, "reported-evidence");
  assert.match(need?.reportedValue || "", /Distributor expansion/);
  assert.equal(need?.source, "sales-manager-result");
});

test("Sales handoff fails soft to unstructured when a future Sales result lacks known machine markers", () => {
  const brief = buildProspectSalesHandoffBrief({
    prospect: prospect(),
    run: run("A future Sales artifact with no known structured qualification markers."),
    now: NOW,
  });
  assert.equal(brief.disposition, "unstructured");
  assert.equal(brief.nextOwnerAction, "review-result");
  assert.ok(brief.qualificationFields.every((item) => item.state === "not-structured"));
  assert.deepEqual(brief.sourceReportedWebsiteEvidence, { status: "not-structured", source: "not-structured" });
});
