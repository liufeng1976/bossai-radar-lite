import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";
import {
  LeadValidationError,
  normalizeActivityInput,
  normalizeLeadPatch,
  validateLeadInput,
} from "../src/leads.js";

function validLead(overrides: Record<string, unknown> = {}) {
  return {
    intent: "managed-service",
    name: "刘风",
    company: "BossAI",
    contact: "liufeng@example.com",
    teamSize: "21-100",
    timeline: "now",
    deployment: "bossai-managed",
    budget: "20000+",
    scenario: "计划为多个电商客户部署海外需求情报系统，需要团队权限、定期报告和托管运行。",
    requirements: "需要飞书推送、CRM、白标报告、私有数据源和持续技术支持。",
    language: "zh",
    consent: true,
    website: "",
    ...overrides,
  };
}

test("validates and scores a high-intent commercial lead", () => {
  const input = validateLeadInput(validLead());
  assert.equal(input.intent, "managed-service");
  assert.equal(input.priority, "HOT");
  assert.ok(input.score >= 70);
  assert.equal(input.initialStatus, "NEW");
});

test("routes Pro waitlist submissions to WAITLIST", () => {
  const input = validateLeadInput(validLead({ intent: "pro-waitlist", budget: "unknown", timeline: "research" }));
  assert.equal(input.initialStatus, "WAITLIST");
});

test("rejects missing consent and honeypot spam", () => {
  assert.throws(
    () => validateLeadInput(validLead({ consent: false, website: "https://spam.example" })),
    (error: unknown) => error instanceof LeadValidationError
      && error.fields.consent === "CONSENT_REQUIRED"
      && error.fields.website === "SPAM_DETECTED",
  );
});

test("persists, deduplicates, updates and reports lead funnel values by currency", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-leads-"));
  const db = new RadarDatabase(directory);
  try {
    const first = db.createLead(validateLeadInput(validLead()));
    const duplicate = db.createLead(validateLeadInput(validLead()));
    assert.equal(first.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(first.lead.id, duplicate.lead.id);

    const updated = db.updateLead(first.lead.id, normalizeLeadPatch({
      status: "PROPOSAL",
      priority: "HOT",
      owner: "刘风",
      quoteAmount: 28800,
      quoteCurrency: "CNY",
      nextFollowUpAt: "2026-07-20T02:00:00.000Z",
    }));
    assert.equal(updated?.status, "PROPOSAL");
    assert.equal(updated?.quoteAmount, 28800);

    const second = db.createLead(validateLeadInput(validLead({
      contact: "buyer@example.com",
      name: "Alex",
      company: "Example Inc",
      language: "en",
      budget: "5000-20000",
    })));
    db.updateLead(second.lead.id, normalizeLeadPatch({
      status: "WON",
      quoteAmount: 5000,
      quoteCurrency: "USD",
    }));

    const activityInput = normalizeActivityInput({ type: "MEETING", content: "Confirmed deployment scope and next steps." });
    db.addLeadActivity(first.lead.id, activityInput.type, activityInput.content);

    const stats = db.leadStats();
    assert.equal(stats.total, 2);
    assert.equal(stats.byStatus.PROPOSAL, 1);
    assert.equal(stats.byStatus.WON, 1);
    assert.equal(stats.quotedByCurrency.CNY, 28800);
    assert.equal(stats.wonByCurrency.USD, 5000);
    assert.ok(db.listLeadActivities(first.lead.id).length >= 4);
    assert.equal(db.listLeads({ priority: "HOT" }).length, 2);
    assert.equal(db.listLeads({ query: "Alex" }).length, 1);

    assert.equal(db.deleteLead(second.lead.id), true);
    assert.equal(db.getLead(second.lead.id), null);
    assert.equal(db.listLeadActivities(second.lead.id).length, 0);
    assert.equal(db.deleteLead(second.lead.id), false);
    assert.equal(db.leadStats().total, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
