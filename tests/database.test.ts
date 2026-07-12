import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";
import { scoreEvidence } from "../src/scoring.js";
import type { Opportunity } from "../src/types.js";

test("persists runs, evidence, opportunities and reports", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-lite-"));
  const db = new RadarDatabase(directory);
  try {
    const run = db.startRun("manual");
    const saved = db.saveEvidence(scoreEvidence({
      source: "reddit",
      externalId: "1",
      title: "Manual customer support is painful and we would pay for automation",
      body: "Budget $99/month. Need this urgently for our Shopify store.",
      url: "https://example.com/1",
      author: "tester",
      publishedAt: new Date().toISOString(),
      engagement: 12,
      query: "customer support AI",
    }));
    const opportunity: Opportunity = {
      id: "customer-support",
      category: "customer-support",
      title: "AI客服副驾驶",
      summary: "测试摘要",
      targetCustomer: "电商卖家",
      problem: "人工回复慢",
      evidenceCount: 1,
      sourceCount: 1,
      avgEvidenceScore: saved.totalScore,
      score: 68,
      decision: "SELL_SERVICE",
      priceHint: "¥999/次",
      mvpPlan: ["验证", "交付", "复盘"],
      evidenceIds: [saved.id],
      isDemo: false,
      createdAt: new Date().toISOString(),
    };
    db.replaceOpportunities([opportunity]);
    const report = db.saveReport(run.id, "摘要", "# 报告");
    const finished = db.finishRun(run.id, "success", {
      collectedCount: 1,
      evidenceCount: 1,
      opportunityCount: 1,
    }, []);

    assert.equal(finished.status, "success");
    assert.equal(db.listEvidence(10).length, 1);
    assert.equal(db.listOpportunities(10)[0]?.decision, "SELL_SERVICE");
    assert.equal(db.latestReport()?.id, report.id);
    assert.deepEqual(db.stats(), {
      runs: 1,
      evidence: 1,
      opportunities: 1,
      reports: 1,
      sources: 1,
      demoEvidence: 0,
      demoOpportunities: 0,
    });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("upgrades a v0.1 database with demo columns without destructive reset", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-lite-legacy-"));
  const databasePath = path.join(directory, "radar-lite.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      url TEXT NOT NULL,
      author TEXT NOT NULL,
      published_at TEXT NOT NULL,
      engagement INTEGER NOT NULL DEFAULT 0,
      query_text TEXT NOT NULL,
      pain_score INTEGER NOT NULL,
      payment_score INTEGER NOT NULL,
      competition_score INTEGER NOT NULL,
      urgency_score INTEGER NOT NULL,
      total_score INTEGER NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE opportunities (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      target_customer TEXT NOT NULL,
      problem TEXT NOT NULL,
      evidence_count INTEGER NOT NULL,
      source_count INTEGER NOT NULL,
      avg_evidence_score REAL NOT NULL,
      score INTEGER NOT NULL,
      decision TEXT NOT NULL,
      price_hint TEXT NOT NULL,
      mvp_plan_json TEXT NOT NULL,
      evidence_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  legacy.close();

  const db = new RadarDatabase(directory);
  try {
    const saved = db.saveEvidence(scoreEvidence({
      source: "reddit",
      externalId: "legacy-demo",
      title: "人工流程耗时，团队愿意付费采购工具",
      body: "预算每月 999 元，希望本周立即测试。",
      url: "https://example.com/legacy-demo",
      author: "demo",
      publishedAt: new Date().toISOString(),
      engagement: 10,
      query: "customer support AI",
      isDemo: true,
    }));
    assert.equal(saved.isDemo, true);
    assert.equal(db.stats().demoEvidence, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
