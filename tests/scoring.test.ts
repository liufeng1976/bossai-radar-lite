import assert from "node:assert/strict";
import test from "node:test";
import { buildOpportunities, decisionFor, scoreEvidence } from "../src/scoring.js";
import type { RawItem, SavedEvidence } from "../src/types.js";

function raw(overrides: Partial<RawItem> = {}): RawItem {
  return {
    source: "reddit",
    externalId: "abc",
    title: "Shopify customer support is painfully manual and we would pay for a better tool",
    body: "Our team is losing sales because refund replies are slow. Budget is $99 per month and this is urgent.",
    url: "https://example.com/evidence",
    author: "seller",
    publishedAt: new Date().toISOString(),
    engagement: 48,
    query: "customer support AI",
    ...overrides,
  };
}

test("scores explicit pain and payment evidence above weak chatter", () => {
  const strong = scoreEvidence(raw());
  const weak = scoreEvidence(raw({
    externalId: "weak",
    title: "Interesting AI news",
    body: "A general discussion about models.",
    engagement: 0,
  }));
  assert.ok(strong.totalScore > weak.totalScore);
  assert.ok(strong.painScore >= 12);
  assert.ok(strong.paymentScore >= 14);
  assert.equal(strong.category, "customer-support");
});

test("recognizes Chinese pain, payment and urgency signals", () => {
  const scored = scoreEvidence(raw({
    externalId: "zh-signal",
    title: "人工客服太慢，团队愿意付费采购自动回复工具",
    body: "退款问题已经影响销售，预算每月 999 元，希望本周立即测试。",
    engagement: 25,
  }));
  assert.ok(scored.painScore >= 12);
  assert.ok(scored.paymentScore >= 14);
  assert.ok(scored.urgencyScore >= 10);
  assert.ok(scored.totalScore >= 45);
});

test("BUILD requires cross-source evidence and payment proof", () => {
  assert.equal(decisionFor(88, 1, 3), "SELL_SERVICE");
  assert.equal(decisionFor(88, 2, 1), "BUILD");
  assert.equal(decisionFor(70, 2, 0), "WATCH");
});

test("clusters evidence into an opportunity with preserved evidence ids", () => {
  const first = { ...scoreEvidence(raw()), id: 1, createdAt: new Date().toISOString() } satisfies SavedEvidence;
  const second = {
    ...scoreEvidence(raw({ source: "github", externalId: "def", url: "https://github.com/example/issue", engagement: 20 })),
    id: 2,
    createdAt: new Date().toISOString(),
  } satisfies SavedEvidence;
  const opportunities = buildOpportunities([first, second]);
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0]?.sourceCount, 2);
  assert.deepEqual(opportunities[0]?.evidenceIds, [1, 2]);
  assert.ok((opportunities[0]?.mvpPlan.length ?? 0) >= 3);
});
