import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFollowUpQueue,
  createFollowUpCalendar,
  createFollowUpDraft,
  createFollowUpReport,
} from "../src/followups.js";
import type { Lead } from "../src/types.js";

function lead(overrides: Partial<Lead> = {}): Lead {
  const now = new Date(2026, 6, 12, 9, 0, 0).toISOString();
  return {
    id: "lead-1",
    intent: "commercial",
    name: "刘风",
    company: "BossAI",
    contact: "liufeng@example.com",
    teamSize: "6-20",
    timeline: "30-days",
    deployment: "own-cloud",
    budget: "5000-20000",
    scenario: "用于电商团队持续发现海外商业机会，并生成可执行的销售与产品行动。",
    requirements: "需要中英文报告、团队权限、报价跟进和私有部署。",
    language: "zh",
    source: "commercial-page",
    status: "NEW",
    priority: "HOT",
    score: 82,
    owner: "",
    quoteAmount: null,
    quoteCurrency: "CNY",
    nextFollowUpAt: null,
    consentAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function localDate(dayOffset: number, hour = 10): string {
  const date = new Date(2026, 6, 12 + dayOffset, hour, 0, 0);
  return date.toISOString();
}

test("builds a deterministic queue ordered by overdue, today, unscheduled and upcoming", () => {
  const now = new Date(2026, 6, 12, 9, 0, 0);
  const queue = buildFollowUpQueue([
    lead({ id: "upcoming", name: "Upcoming", nextFollowUpAt: localDate(3), priority: "WARM" }),
    lead({ id: "unscheduled", name: "Unscheduled", nextFollowUpAt: null, priority: "HOT" }),
    lead({ id: "today", name: "Today", nextFollowUpAt: localDate(0, 16), priority: "COOL" }),
    lead({ id: "overdue", name: "Overdue", nextFollowUpAt: localDate(-2), status: "PROPOSAL", quoteAmount: 28800 }),
    lead({ id: "won", name: "Won", status: "WON", nextFollowUpAt: localDate(0) }),
  ], { now, windowDays: 7, includeUnscheduled: true });

  assert.deepEqual(queue.items.map((item) => item.lead.id), ["overdue", "today", "unscheduled", "upcoming"]);
  assert.deepEqual(queue.items.map((item) => item.bucket), ["OVERDUE", "TODAY", "UNSCHEDULED", "UPCOMING"]);
  assert.equal(queue.stats.total, 4);
  assert.equal(queue.stats.overdue, 1);
  assert.equal(queue.stats.today, 1);
  assert.equal(queue.stats.unscheduled, 1);
  assert.equal(queue.stats.upcoming, 1);
  assert.equal(queue.items[0]?.draft.suggestedStatus, "NEGOTIATION");
  assert.ok((queue.items[0]?.urgencyScore ?? 0) > (queue.items[3]?.urgencyScore ?? 100));
});

test("creates personalized Chinese and English follow-up drafts", () => {
  const now = new Date(2026, 6, 12, 9, 0, 0);
  const chinese = createFollowUpDraft(lead(), now, "zh");
  assert.match(chinese.subject, /BossAI/);
  assert.match(chinese.message, /刘风/);
  assert.match(chinese.message, /预算/);
  assert.equal(chinese.suggestedStatus, "QUALIFIED");

  const english = createFollowUpDraft(lead({
    name: "Alex",
    company: "Example Inc",
    language: "en",
    status: "PROPOSAL",
    quoteAmount: 5000,
    quoteCurrency: "USD",
  }), now, "en");
  assert.match(english.subject, /proposal/i);
  assert.match(english.message, /Alex/);
  assert.match(english.message, /\$5,000/);
  assert.equal(english.suggestedStatus, "NEGOTIATION");
  assert.ok(new Date(english.suggestedFollowUpAt).getTime() > now.getTime());
});

test("generates bilingual follow-up reports and a valid calendar", () => {
  const now = new Date(2026, 6, 12, 9, 0, 0);
  const queue = buildFollowUpQueue([
    lead({ id: "scheduled", nextFollowUpAt: localDate(0, 14) }),
    lead({ id: "unscheduled", nextFollowUpAt: null }),
  ], { now, windowDays: 7, includeUnscheduled: true });

  const zh = createFollowUpReport(queue, "zh");
  const en = createFollowUpReport(queue, "en");
  const ics = createFollowUpCalendar(queue, now);

  assert.match(zh, /商业线索跟进日报/);
  assert.match(zh, /今天到期/);
  assert.match(en, /Commercial Lead Follow-Up Brief/);
  assert.match(en, /Due Today/);
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /END:VCALENDAR/);
});
