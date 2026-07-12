import assert from "node:assert/strict";
import test from "node:test";
import { createEnglishReport } from "../src/report.js";
import type { Opportunity, SavedEvidence, ScanRunSummary } from "../src/types.js";

const run: ScanRunSummary = {
  id: 7,
  trigger: "manual",
  status: "success",
  startedAt: "2026-07-12T08:00:00.000Z",
  finishedAt: "2026-07-12T08:00:10.000Z",
  collectedCount: 12,
  evidenceCount: 9,
  opportunityCount: 1,
  errors: [],
};

const opportunity: Opportunity = {
  id: "support",
  category: "customer-support",
  title: "电商 AI 客服与售后副驾驶",
  summary: "中文摘要",
  targetCustomer: "电商卖家",
  problem: "人工回复慢",
  evidenceCount: 3,
  sourceCount: 2,
  avgEvidenceScore: 82,
  score: 88,
  decision: "BUILD",
  priceHint: "¥699–¥2,999/年",
  mvpPlan: ["中文步骤"],
  evidenceIds: [1],
  isDemo: false,
  createdAt: "2026-07-12T08:00:10.000Z",
};

const evidence: SavedEvidence = {
  id: 1,
  fingerprint: "abc",
  source: "reddit",
  externalId: "evidence-1",
  title: "We would pay for a better support workflow",
  body: "Manual support is slow.",
  url: "https://example.com/evidence",
  author: "seller",
  publishedAt: "2026-07-12T07:00:00.000Z",
  engagement: 18,
  query: "customer support AI",
  isDemo: false,
  painScore: 18,
  paymentScore: 21,
  competitionScore: 4,
  urgencyScore: 5,
  totalScore: 72,
  category: "customer-support",
  tags: ["would pay"],
  createdAt: "2026-07-12T08:00:10.000Z",
};

test("creates an English report from structured opportunity data", () => {
  const report = createEnglishReport(run, [opportunity], [evidence]);
  assert.match(report.executiveSummary, /current top priority/i);
  assert.match(report.markdown, /BossAI Radar Lite Business Opportunity Report/);
  assert.match(report.markdown, /AI Customer Support & After-Sales Copilot/);
  assert.match(report.markdown, /7-Day Action Plan/);
  assert.match(report.markdown, /non-commercial use only/i);
  assert.doesNotMatch(report.markdown, /中文摘要|中文步骤|人工回复慢/);
});

test("labels an English demo report and translates demo evidence titles", () => {
  const demoRun = { ...run, trigger: "demo" as const };
  const demoEvidence = {
    ...evidence,
    externalId: "demo-support-1",
    title: "中文演示标题",
    isDemo: true,
  };
  const demoOpportunity = { ...opportunity, isDemo: true };
  const report = createEnglishReport(demoRun, [demoOpportunity], [demoEvidence]);
  assert.match(report.markdown, /Synthetic Demo Report/);
  assert.match(report.markdown, /all records in this report are synthetic examples/i);
  assert.match(report.markdown, /More than 200 Shopify after-sales messages/);
  assert.doesNotMatch(report.markdown, /中文演示标题/);
});
