import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";
import { scoreEvidence } from "../src/scoring.js";
import type { DailyBrief, Opportunity } from "../src/types.js";

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
      community: "Pets",
      sourceContext: {
        schema: "bossai.reddit-community-context.v1",
        community: "Pets",
        status: "available",
        aboutStatus: "available",
        rulesStatus: "available",
        pinnedPostsStatus: "available",
        aboutUrl: "https://www.reddit.com/r/Pets/about/",
        rulesUrl: "https://www.reddit.com/r/Pets/about/rules",
        description: "A community for pet owners.",
        rules: [{ shortName: "No spam", description: "Disclose commercial affiliation." }],
        pinnedPosts: [{ title: "Community guide", url: "https://www.reddit.com/r/Pets/comments/guide/" }],
        fetchedAt: "2026-08-10T00:00:00.000Z",
      },
    }));
    db.saveEvidence(scoreEvidence({
      source: "reddit",
      externalId: "1",
      title: "Manual customer support is painful and we would pay for automation",
      body: "Budget $99/month. Need this urgently for our Shopify store.",
      url: "https://example.com/1",
      author: "tester",
      publishedAt: new Date().toISOString(),
      engagement: 99,
      query: "customer support AI",
      community: "Pets",
      sourceContext: {
        schema: "bossai.reddit-community-context.v1",
        community: "Pets",
        status: "unavailable",
        aboutStatus: "unavailable",
        rulesStatus: "unavailable",
        pinnedPostsStatus: "unavailable",
        aboutUrl: "https://www.reddit.com/r/Pets/about/",
        rulesUrl: "https://www.reddit.com/r/Pets/about/rules",
        description: "",
        rules: [],
        pinnedPosts: [],
        fetchedAt: "2026-08-10T01:00:00.000Z",
      },
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
    const brief: DailyBrief = {
      generatedAt: new Date().toISOString(),
      mustRead: [],
      quickScan: [],
      skip: [],
      contentIdeas: ["验证内容选题"],
      counts: { MUST_READ: 0, QUICK_SCAN: 0, SKIP: 0 },
    };
    const report = db.saveReport(run.id, "摘要", "# 报告", brief, "# Report", brief);
    const finished = db.finishRun(run.id, "success", {
      collectedCount: 1,
      evidenceCount: 1,
      opportunityCount: 1,
    }, []);

    assert.equal(finished.status, "success");
    assert.equal(db.listEvidence(10).length, 1);
    assert.equal(db.listEvidence(10)[0]?.community, "Pets");
    assert.equal(db.listEvidence(10)[0]?.sourceContext?.rulesStatus, "available");
    assert.equal(db.listEvidence(10)[0]?.sourceContext?.rules[0]?.shortName, "No spam");
    assert.equal(db.listOpportunities(10)[0]?.decision, "SELL_SERVICE");
    assert.equal(db.latestReport()?.id, report.id);
    assert.equal(db.latestReport()?.brief?.contentIdeas[0], "验证内容选题");
    assert.equal(db.latestReport()?.markdownEnglish, "# Report");
    assert.equal(db.latestReport()?.briefEnglish?.counts.MUST_READ, 0);
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

test("refreshes persisted business website context on repeated scans", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-lite-website-"));
  const db = new RadarDatabase(directory);
  const base = {
    source: "website" as const,
    externalId: "company-home",
    title: "Acme Export",
    body: "Industrial pumps for distributors.",
    url: "https://acme.example/",
    author: "Acme Export",
    publishedAt: "2026-08-16T00:00:00.000Z",
    engagement: 0,
    query: "https://acme.example/",
  };
  try {
    db.saveEvidence(scoreEvidence({
      ...base,
      websiteContext: {
        schema: "bossai.business-website-context.v1",
        rootUrl: base.url,
        pageUrl: base.url,
        companyName: "Acme Export",
        description: "Industrial pumps.",
        publicEmails: ["sales@acme.example"],
        publicPhones: [],
        contactUrls: ["https://acme.example/contact"],
        productSignals: ["Industrial pumps"],
        robotsUrl: "https://acme.example/robots.txt",
        robotsPolicy: "allowed",
        depth: 0,
        crawledAt: "2026-08-16T00:00:00.000Z",
      },
    }));
    db.saveEvidence(scoreEvidence({
      ...base,
      publishedAt: "2026-08-16T01:00:00.000Z",
      websiteContext: {
        schema: "bossai.business-website-context.v1",
        rootUrl: base.url,
        pageUrl: base.url,
        companyName: "Acme Export",
        description: "Industrial pumps and valve systems.",
        publicEmails: ["export@acme.example"],
        publicPhones: ["+1 555 0100"],
        contactUrls: ["https://acme.example/contact"],
        productSignals: ["Industrial pumps", "Valve systems"],
        robotsUrl: "https://acme.example/robots.txt",
        robotsPolicy: "allowed",
        depth: 0,
        crawledAt: "2026-08-16T01:00:00.000Z",
      },
    }));

    const stored = db.listEvidence(10)[0]?.websiteContext;
    assert.ok(stored);
    assert.deepEqual(stored?.publicEmails, ["export@acme.example"]);
    assert.deepEqual(stored?.publicPhones, ["+1 555 0100"]);
    assert.ok(stored?.productSignals.includes("Valve systems"));
    assert.equal(stored?.crawledAt, "2026-08-16T01:00:00.000Z");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("persists, refreshes and review-gates prospect candidates without creating CRM leads", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-lite-prospect-"));
  const db = new RadarDatabase(directory);
  try {
    const first = db.saveProspectCandidate({
      id: "prospect-acme",
      domain: "acme.example",
      websiteUrl: "https://acme.example/",
      companyName: "Acme",
      description: "Industrial pumps",
      discoverySourceUrl: "https://expo.example/exhibitors",
      discoverySourceTitle: "Expo exhibitors",
      discoveryQuery: "https://expo.example/exhibitors",
      publicEmails: [],
      publicPhones: [],
      contactUrls: ["https://acme.example/contact"],
      officialProfileUrls: ["https://www.linkedin.com/company/acme/"],
      publicMessagingUrls: ["https://wa.me/15550100"],
      productSignals: ["Industrial pumps"],
      evidenceUrls: ["https://expo.example/exhibitors", "https://acme.example/"],
      websiteEvidenceStatus: "unverified",
      score: 62,
      reasons: ["directory source"],
      fitScore: 50,
      fitTerms: ["industrial pumps", "distributor"],
      fitMatches: ["industrial pumps"],
      discoveredAt: "2026-08-16T12:00:00.000Z",
    });
    assert.equal(first.status, "DISCOVERED");
    assert.equal(db.prospectStats().total, 1);
    assert.equal(db.listLeads({ limit: 10 }).length, 0);

    const reviewing = db.updateProspectStatus(first.id, "REVIEW_REQUIRED");
    assert.equal(reviewing?.status, "REVIEW_REQUIRED");

    const refreshed = db.saveProspectCandidate({
      ...first,
      publicEmails: ["sales@acme.example"],
      publicPhones: ["+1 555 0100"],
      officialProfileUrls: ["https://www.linkedin.com/company/acme/", "https://www.tiktok.com/@acme"],
      publicMessagingUrls: ["https://wa.me/15550100", "https://wa.me/15550101"],
      companyContactChannels: [
        {
          type: "email",
          value: "sales@acme.example",
          url: "mailto:sales@acme.example",
          sourcePageUrl: "https://acme.example/contact",
          sourceKind: "mailto",
          businessRole: "sales",
          confidence: "high",
          verificationStatus: "official-site-observed",
        },
      ],
      productSignals: ["Industrial pumps", "Export pumps"],
      websiteEvidenceStatus: "verified",
      websiteVerifiedAt: "2026-08-16T12:59:00.000Z",
      score: 81,
      reasons: ["directory source", "official website exposes public contacts"],
      fitScore: 100,
      fitTerms: ["industrial pumps", "export pumps"],
      fitMatches: ["industrial pumps", "export pumps"],
      discoveredAt: "2026-08-16T13:00:00.000Z",
    });
    assert.equal(refreshed.status, "REVIEW_REQUIRED");
    assert.equal(refreshed.score, 81);
    assert.deepEqual(refreshed.publicEmails, ["sales@acme.example"]);
    assert.deepEqual(refreshed.officialProfileUrls, ["https://www.linkedin.com/company/acme/", "https://www.tiktok.com/@acme"]);
    assert.deepEqual(refreshed.publicMessagingUrls, ["https://wa.me/15550100", "https://wa.me/15550101"]);
    assert.equal(refreshed.companyContactChannels?.[0]?.businessRole, "sales");
    assert.equal(refreshed.companyContactChannels?.[0]?.sourcePageUrl, "https://acme.example/contact");
    assert.equal(refreshed.fitScore, 100);
    assert.deepEqual(refreshed.fitMatches, ["industrial pumps", "export pumps"]);
    assert.equal(refreshed.websiteEvidenceStatus, "verified");
    assert.equal(refreshed.websiteVerifiedAt, "2026-08-16T12:59:00.000Z");
    assert.equal(refreshed.firstSeenAt, "2026-08-16T12:00:00.000Z");
    assert.equal(refreshed.lastSeenAt, "2026-08-16T13:00:00.000Z");

    const rediscovered = db.saveProspectCandidate({
      ...refreshed,
      companyName: "Search Result Label",
      description: "Search snippet only",
      publicEmails: [],
      publicPhones: [],
      contactUrls: [],
      officialProfileUrls: [],
      publicMessagingUrls: [],
      companyContactChannels: [],
      productSignals: [],
      evidenceUrls: ["https://search.example/result"],
      websiteEvidenceStatus: "unverified",
      websiteVerifiedAt: "",
      reasons: ["search discovery only"],
      fitScore: 0,
      fitTerms: ["unrelated"],
      fitMatches: [],
      discoveredAt: "2026-08-16T14:00:00.000Z",
    });
    assert.equal(rediscovered.websiteEvidenceStatus, "verified");
    assert.equal(rediscovered.websiteVerifiedAt, "2026-08-16T12:59:00.000Z");
    assert.equal(rediscovered.companyName, "Acme");
    assert.equal(rediscovered.description, "Industrial pumps");
    assert.deepEqual(rediscovered.publicEmails, ["sales@acme.example"]);
    assert.equal(rediscovered.companyContactChannels?.[0]?.value, "sales@acme.example");
    assert.deepEqual(rediscovered.productSignals, ["Industrial pumps", "Export pumps"]);
    assert.equal(rediscovered.fitScore, 100);
    assert.equal(rediscovered.lastSeenAt, "2026-08-16T14:00:00.000Z");
    assert.equal(db.prospectStats().reviewRequired, 1);
    assert.equal(db.listLeads({ limit: 10 }).length, 0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migrates Sales delegation owner-decision lineage non-destructively and persists new bindings", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-lite-sales-lineage-db-"));
  const databasePath = path.join(directory, "radar-lite.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE bossai_delegations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_record_id TEXT NOT NULL,
      source_operation_id TEXT NOT NULL UNIQUE,
      bossai_run_id TEXT NOT NULL UNIQUE,
      bossai_agent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      review_status TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      result_imported_at TEXT,
      error_code TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO bossai_delegations (
      source_type, source_record_id, source_operation_id, bossai_run_id, bossai_agent_id,
      status, review_status, submitted_at, updated_at, error_code, error_message
    ) VALUES (
      'prospect-sales', 'legacy-prospect', 'legacy-sales-operation', 'legacy-sales-run', 'bossai-sales-agent',
      'failed', 'approved', '2026-08-18T01:00:00.000Z', '2026-08-18T01:10:00.000Z', 'LEGACY_FAILED', 'legacy row'
    );
  `);
  legacy.close();

  const db = new RadarDatabase(directory);
  try {
    const legacyDelegation = db.getBossAiDelegationByOperation("legacy-sales-operation");
    assert.ok(legacyDelegation);
    assert.equal(legacyDelegation.ownerDecisionId, "");
    assert.equal(legacyDelegation.bossaiRunId, "legacy-sales-run");

    const bound = db.saveBossAiDelegation({
      sourceType: "prospect-sales",
      sourceRecordId: "bound-prospect",
      sourceOperationId: "bound-sales-operation",
      bossaiRunId: "bound-sales-run",
      bossaiAgentId: "bossai-sales-agent",
      status: "queued",
      reviewStatus: "pending",
      submittedAt: "2026-08-18T02:00:00.000Z",
      updatedAt: "2026-08-18T02:00:00.000Z",
      ownerDecisionId: "owner-decision-db-lineage",
    });
    assert.equal(bound.ownerDecisionId, "owner-decision-db-lineage");
    assert.equal(db.getBossAiDelegationByRunId("bound-sales-run")?.ownerDecisionId, "owner-decision-db-lineage");
    assert.equal(db.countBossAiDelegations(), 2);
    assert.equal(db.listBossAiDelegations(1).length, 1);
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
    CREATE TABLE runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      collected_count INTEGER NOT NULL DEFAULT 0,
      evidence_count INTEGER NOT NULL DEFAULT 0,
      opportunity_count INTEGER NOT NULL DEFAULT 0,
      errors_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      generated_at TEXT NOT NULL,
      executive_summary TEXT NOT NULL,
      markdown TEXT NOT NULL
    );
    INSERT INTO runs (trigger, status, started_at)
    VALUES ('manual', 'success', '2026-01-01T00:00:00.000Z');
    INSERT INTO reports (run_id, generated_at, executive_summary, markdown)
    VALUES (1, '2026-01-01T00:00:01.000Z', 'legacy summary', '# Legacy report');
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
    assert.equal(db.latestReport()?.brief, null);
    assert.equal(db.latestReport()?.markdownEnglish, null);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
