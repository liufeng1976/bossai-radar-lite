import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Opportunity,
  Report,
  SavedEvidence,
  ScanRunSummary,
  ScanTrigger,
  ScoredEvidence,
} from "./types.js";

interface RunRow {
  id: number;
  trigger: ScanTrigger;
  status: ScanRunSummary["status"];
  started_at: string;
  finished_at: string | null;
  collected_count: number;
  evidence_count: number;
  opportunity_count: number;
  errors_json: string;
}

interface EvidenceRow {
  id: number;
  fingerprint: string;
  source: SavedEvidence["source"];
  external_id: string;
  title: string;
  body: string;
  url: string;
  author: string;
  published_at: string;
  engagement: number;
  query_text: string;
  pain_score: number;
  payment_score: number;
  competition_score: number;
  urgency_score: number;
  total_score: number;
  category: string;
  tags_json: string;
  is_demo: number;
  created_at: string;
}

interface OpportunityRow {
  id: string;
  category: string;
  title: string;
  summary: string;
  target_customer: string;
  problem: string;
  evidence_count: number;
  source_count: number;
  avg_evidence_score: number;
  score: number;
  decision: Opportunity["decision"];
  price_hint: string;
  mvp_plan_json: string;
  evidence_ids_json: string;
  is_demo: number;
  created_at: string;
}

interface ReportRow {
  id: number;
  run_id: number;
  generated_at: string;
  executive_summary: string;
  markdown: string;
}

export class RadarDatabase {
  private readonly db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "radar-lite.sqlite"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
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

      CREATE TABLE IF NOT EXISTS evidence (
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
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_created_at ON evidence(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_evidence_category ON evidence(category);
      CREATE INDEX IF NOT EXISTS idx_evidence_score ON evidence(total_score DESC);

      CREATE TABLE IF NOT EXISTS opportunities (
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
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(score DESC);
      CREATE INDEX IF NOT EXISTS idx_opportunities_created_at ON opportunities(created_at DESC);

      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        generated_at TEXT NOT NULL,
        executive_summary TEXT NOT NULL,
        markdown TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_reports_generated_at ON reports(generated_at DESC);
    `);
    this.ensureColumn("evidence", "is_demo", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("opportunities", "is_demo", "INTEGER NOT NULL DEFAULT 0");
  }

  private ensureColumn(table: "evidence" | "opportunities", column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
    if (columns.some((item) => item.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  startRun(trigger: ScanTrigger): ScanRunSummary {
    const startedAt = new Date().toISOString();
    const result = this.db
      .prepare("INSERT INTO runs (trigger, status, started_at) VALUES (?, 'running', ?)")
      .run(trigger, startedAt);
    return {
      id: Number(result.lastInsertRowid),
      trigger,
      status: "running",
      startedAt,
      collectedCount: 0,
      evidenceCount: 0,
      opportunityCount: 0,
      errors: [],
    };
  }

  finishRun(
    id: number,
    status: Exclude<ScanRunSummary["status"], "running">,
    counts: { collectedCount: number; evidenceCount: number; opportunityCount: number },
    errors: string[],
  ): ScanRunSummary {
    const finishedAt = new Date().toISOString();
    this.db.prepare(`
      UPDATE runs
      SET status = ?, finished_at = ?, collected_count = ?, evidence_count = ?, opportunity_count = ?, errors_json = ?
      WHERE id = ?
    `).run(
      status,
      finishedAt,
      counts.collectedCount,
      counts.evidenceCount,
      counts.opportunityCount,
      JSON.stringify(errors),
      id,
    );
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as unknown as RunRow;
    return this.mapRun(row);
  }

  saveEvidence(item: ScoredEvidence): SavedEvidence {
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO evidence (
        fingerprint, source, external_id, title, body, url, author, published_at, engagement,
        query_text, pain_score, payment_score, competition_score, urgency_score, total_score,
        category, tags_json, is_demo, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        engagement = MAX(evidence.engagement, excluded.engagement),
        total_score = MAX(evidence.total_score, excluded.total_score),
        tags_json = excluded.tags_json,
        is_demo = excluded.is_demo
    `).run(
      item.fingerprint,
      item.source,
      item.externalId,
      item.title,
      item.body,
      item.url,
      item.author,
      item.publishedAt,
      item.engagement,
      item.query,
      item.painScore,
      item.paymentScore,
      item.competitionScore,
      item.urgencyScore,
      item.totalScore,
      item.category,
      JSON.stringify(item.tags),
      item.isDemo ? 1 : 0,
      createdAt,
    );
    const row = this.db.prepare("SELECT * FROM evidence WHERE fingerprint = ?").get(item.fingerprint) as unknown as EvidenceRow;
    return this.mapEvidence(row);
  }

  replaceOpportunities(opportunities: Opportunity[]): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec("DELETE FROM opportunities");
      const statement = this.db.prepare(`
        INSERT INTO opportunities (
          id, category, title, summary, target_customer, problem, evidence_count, source_count,
          avg_evidence_score, score, decision, price_hint, mvp_plan_json, evidence_ids_json, is_demo, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of opportunities) {
        statement.run(
          item.id,
          item.category,
          item.title,
          item.summary,
          item.targetCustomer,
          item.problem,
          item.evidenceCount,
          item.sourceCount,
          item.avgEvidenceScore,
          item.score,
          item.decision,
          item.priceHint,
          JSON.stringify(item.mvpPlan),
          JSON.stringify(item.evidenceIds),
          item.isDemo ? 1 : 0,
          item.createdAt,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  saveReport(runId: number, executiveSummary: string, markdown: string): Report {
    const generatedAt = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO reports (run_id, generated_at, executive_summary, markdown)
      VALUES (?, ?, ?, ?)
    `).run(runId, generatedAt, executiveSummary, markdown);
    return {
      id: Number(result.lastInsertRowid),
      runId,
      generatedAt,
      executiveSummary,
      markdown,
    };
  }

  listOpportunities(limit = 50): Opportunity[] {
    const rows = this.db
      .prepare("SELECT * FROM opportunities ORDER BY score DESC, evidence_count DESC LIMIT ?")
      .all(Math.max(1, Math.min(200, limit))) as unknown as OpportunityRow[];
    return rows.map((row) => this.mapOpportunity(row));
  }

  listEvidence(limit = 100, category?: string, includeDemo = true): SavedEvidence[] {
    const normalizedLimit = Math.max(1, Math.min(500, limit));
    const filters: string[] = [];
    const params: Array<string | number> = [];
    if (category) {
      filters.push("category = ?");
      params.push(category);
    }
    if (!includeDemo) filters.push("is_demo = 0");
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM evidence ${where} ORDER BY total_score DESC, created_at DESC LIMIT ?`)
      .all(...params, normalizedLimit);
    return (rows as unknown as EvidenceRow[]).map((row) => this.mapEvidence(row));
  }

  clearDemoEvidence(): void {
    this.db.prepare("DELETE FROM evidence WHERE is_demo = 1").run();
  }

  listRuns(limit = 20): ScanRunSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?")
      .all(Math.max(1, Math.min(100, limit))) as unknown as RunRow[];
    return rows.map((row) => this.mapRun(row));
  }

  latestReport(): Report | null {
    const row = this.db.prepare("SELECT * FROM reports ORDER BY id DESC LIMIT 1").get() as unknown as ReportRow | undefined;
    return row ? this.mapReport(row) : null;
  }

  stats(): { runs: number; evidence: number; opportunities: number; reports: number; sources: number; demoEvidence: number; demoOpportunities: number } {
    const count = (table: string): number => {
      const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as unknown as { count: number };
      return Number(row.count);
    };
    const sourceRow = this.db.prepare("SELECT COUNT(DISTINCT source) AS count FROM evidence").get() as unknown as { count: number };
    return {
      runs: count("runs"),
      evidence: count("evidence"),
      opportunities: count("opportunities"),
      reports: count("reports"),
      sources: Number(sourceRow.count),
      demoEvidence: Number((this.db.prepare("SELECT COUNT(*) AS count FROM evidence WHERE is_demo = 1").get() as unknown as { count: number }).count),
      demoOpportunities: Number((this.db.prepare("SELECT COUNT(*) AS count FROM opportunities WHERE is_demo = 1").get() as unknown as { count: number }).count),
    };
  }

  close(): void {
    this.db.close();
  }

  private mapRun(row: RunRow): ScanRunSummary {
    return {
      id: row.id,
      trigger: row.trigger,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      collectedCount: row.collected_count,
      evidenceCount: row.evidence_count,
      opportunityCount: row.opportunity_count,
      errors: safeJson<string[]>(row.errors_json, []),
    };
  }

  private mapEvidence(row: EvidenceRow): SavedEvidence {
    return {
      id: row.id,
      fingerprint: row.fingerprint,
      source: row.source,
      externalId: row.external_id,
      title: row.title,
      body: row.body,
      url: row.url,
      author: row.author,
      publishedAt: row.published_at,
      engagement: row.engagement,
      query: row.query_text,
      painScore: row.pain_score,
      paymentScore: row.payment_score,
      competitionScore: row.competition_score,
      urgencyScore: row.urgency_score,
      totalScore: row.total_score,
      category: row.category,
      tags: safeJson<string[]>(row.tags_json, []),
      isDemo: row.is_demo === 1,
      createdAt: row.created_at,
    };
  }

  private mapOpportunity(row: OpportunityRow): Opportunity {
    return {
      id: row.id,
      category: row.category,
      title: row.title,
      summary: row.summary,
      targetCustomer: row.target_customer,
      problem: row.problem,
      evidenceCount: row.evidence_count,
      sourceCount: row.source_count,
      avgEvidenceScore: row.avg_evidence_score,
      score: row.score,
      decision: row.decision,
      priceHint: row.price_hint,
      mvpPlan: safeJson<string[]>(row.mvp_plan_json, []),
      evidenceIds: safeJson<number[]>(row.evidence_ids_json, []),
      isDemo: row.is_demo === 1,
      createdAt: row.created_at,
    };
  }

  private mapReport(row: ReportRow): Report {
    return {
      id: row.id,
      runId: row.run_id,
      generatedAt: row.generated_at,
      executiveSummary: row.executive_summary,
      markdown: row.markdown,
    };
  }
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
