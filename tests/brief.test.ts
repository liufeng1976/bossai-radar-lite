import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyBrief, classifyBriefTier, renderDailyBriefMarkdown } from "../src/brief.js";
import type { Opportunity, ScoredEvidence } from "../src/types.js";

function evidence(overrides: Partial<ScoredEvidence> = {}): ScoredEvidence {
  return {
    source: "hackernews",
    externalId: "item-1",
    title: "Teams would pay for a better AI support workflow",
    body: "The current manual process is slow and urgent.",
    url: "https://example.com/item-1",
    author: "founder",
    publishedAt: "2026-07-12T08:00:00.000Z",
    engagement: 30,
    query: "AI support",
    isDemo: false,
    fingerprint: "fingerprint-1",
    painScore: 18,
    paymentScore: 14,
    competitionScore: 4,
    urgencyScore: 10,
    totalScore: 55,
    category: "customer-support",
    tags: ["would pay", "manual"],
    ...overrides,
  };
}

const opportunity: Opportunity = {
  id: "support",
  category: "customer-support",
  title: "电商 AI 客服与售后副驾驶",
  summary: "摘要",
  targetCustomer: "卖家",
  problem: "回复效率低",
  evidenceCount: 3,
  sourceCount: 2,
  avgEvidenceScore: 70,
  score: 82,
  decision: "BUILD",
  priceHint: "¥699/年",
  mvpPlan: ["做演示"],
  evidenceIds: [1],
  isDemo: false,
  createdAt: "2026-07-12T08:00:00.000Z",
};

test("classifies strong payment and urgency signals as must-read", () => {
  assert.equal(classifyBriefTier(evidence()), "MUST_READ");
  assert.equal(classifyBriefTier(evidence({ totalScore: 28, paymentScore: 0, urgencyScore: 0, painScore: 6, engagement: 5 })), "QUICK_SCAN");
  assert.equal(classifyBriefTier(evidence({ totalScore: 10, paymentScore: 0, urgencyScore: 0, painScore: 0, engagement: 0 })), "SKIP");
});

test("builds a three-tier brief with content ideas and source links", () => {
  const brief = buildDailyBrief([
    evidence(),
    evidence({ externalId: "item-2", fingerprint: "fingerprint-2", title: "Useful workflow comparison", totalScore: 28, paymentScore: 0, urgencyScore: 0, painScore: 6, engagement: 5 }),
    evidence({ externalId: "item-3", fingerprint: "fingerprint-3", title: "Weak generic chatter", totalScore: 8, paymentScore: 0, urgencyScore: 0, painScore: 0, engagement: 0 }),
  ], [opportunity]);

  assert.deepEqual(brief.counts, { MUST_READ: 1, QUICK_SCAN: 1, SKIP: 1 });
  assert.equal(brief.contentIdeas.length > 0, true);
  const markdown = renderDailyBriefMarkdown(brief);
  assert.match(markdown, /今日信息分级/);
  assert.match(markdown, /必读：1 条/);
  assert.match(markdown, /可直接转化的内容选题/);
  assert.match(markdown, /查看原文/);
});

test("renders the same structured brief in English with original source links", () => {
  const brief = buildDailyBrief([
    evidence(),
    evidence({ externalId: "item-2", fingerprint: "fingerprint-2", title: "Useful workflow comparison", totalScore: 28, paymentScore: 0, urgencyScore: 0, painScore: 6, engagement: 5 }),
    evidence({ externalId: "item-3", fingerprint: "fingerprint-3", title: "Weak generic chatter", totalScore: 8, paymentScore: 0, urgencyScore: 0, painScore: 0, engagement: 0 }),
  ], [opportunity], {
    language: "en",
    localizeOpportunityTitle: () => "AI Support Copilot",
  });

  assert.deepEqual(brief.counts, { MUST_READ: 1, QUICK_SCAN: 1, SKIP: 1 });
  assert.match(brief.contentIdeas[0] || "", /AI Support Copilot/);
  const markdown = renderDailyBriefMarkdown(brief, "en");
  assert.match(markdown, /Three-Tier Intelligence Brief/);
  assert.match(markdown, /MUST_READ: 1 items/);
  assert.match(markdown, /QUICK_SCAN: 1 items/);
  assert.match(markdown, /SKIP: 1 items/);
  assert.match(markdown, /Ready-to-Use Content Ideas/);
  assert.match(markdown, /\[View original\]\(<https:\/\/example\.com\/item-1>\)/);
  assert.doesNotMatch(markdown, /查看原文|今日信息分级/);
});
