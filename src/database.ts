import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ValidatedLeadInput } from "./leads.js";
import type {
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadIntent,
  LeadPriority,
  LeadStats,
  LeadStatus,
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

interface LeadRow {
  id: string;
  intent: LeadIntent;
  name: string;
  company: string;
  contact: string;
  team_size: string;
  timeline: string;
  deployment: string;
  budget: string;
  scenario: string;
  requirements: string;
  language: "zh" | "en";
  source: string;
  status: LeadStatus;
  priority: LeadPriority;
  score: number;
  owner: string;
  quote_amount: number | null;
  quote_currency: string;
  next_follow_up_at: string | null;
  consent_at: string;
  created_at: string;
  updated_at: string;
}

interface LeadActivityRow {
  id: number;
  lead_id: string;
  type: LeadActivityType;
  content: string;
  created_at: string;
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

      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        intent TEXT NOT NULL,
        name TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL,
        team_size TEXT NOT NULL,
        timeline TEXT NOT NULL,
        deployment TEXT NOT NULL,
        budget TEXT NOT NULL,
        scenario TEXT NOT NULL,
        requirements TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT 'zh',
        source TEXT NOT NULL DEFAULT 'commercial-page',
        status TEXT NOT NULL DEFAULT 'NEW',
        priority TEXT NOT NULL DEFAULT 'COOL',
        score INTEGER NOT NULL DEFAULT 0,
        owner TEXT NOT NULL DEFAULT '',
        quote_amount REAL,
        quote_currency TEXT NOT NULL DEFAULT 'CNY',
        next_follow_up_at TEXT,
        consent_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority, score DESC);
      CREATE INDEX IF NOT EXISTS idx_leads_intent ON leads(intent, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads(next_follow_up_at);
      CREATE INDEX IF NOT EXISTS idx_leads_contact ON leads(contact);

      CREATE TABLE IF NOT EXISTS lead_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);
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

  createLead(input: ValidatedLeadInput): { lead: Lead; duplicate: boolean } {
    const duplicateCutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    const existing = this.db.prepare(`
      SELECT * FROM leads
      WHERE lower(contact) = lower(?) AND intent = ? AND created_at >= ?
      ORDER BY created_at DESC LIMIT 1
    `).get(input.contact, input.intent, duplicateCutoff) as unknown as LeadRow | undefined;
    if (existing) return { lead: this.mapLead(existing), duplicate: true };

    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO leads (
        id, intent, name, company, contact, team_size, timeline, deployment, budget,
        scenario, requirements, language, source, status, priority, score, owner,
        quote_amount, quote_currency, next_follow_up_at, consent_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, 'CNY', NULL, ?, ?, ?)
    `).run(
      id,
      input.intent,
      input.name,
      input.company,
      input.contact,
      input.teamSize,
      input.timeline,
      input.deployment,
      input.budget,
      input.scenario,
      input.requirements,
      input.language,
      input.source,
      input.initialStatus,
      input.priority,
      input.score,
      now,
      now,
      now,
    );
    this.addLeadActivity(id, "STATUS", `Created as ${input.initialStatus} with ${input.priority} priority (${input.score}/100).`);
    const lead = this.getLead(id);
    if (!lead) throw new Error("Lead was created but could not be read back");
    return { lead, duplicate: false };
  }

  listLeads(options: {
    limit?: number;
    status?: LeadStatus;
    intent?: LeadIntent;
    priority?: LeadPriority;
    query?: string;
  } = {}): Lead[] {
    const filters: string[] = [];
    const params: Array<string | number> = [];
    if (options.status) {
      filters.push("status = ?");
      params.push(options.status);
    }
    if (options.intent) {
      filters.push("intent = ?");
      params.push(options.intent);
    }
    if (options.priority) {
      filters.push("priority = ?");
      params.push(options.priority);
    }
    if (options.query?.trim()) {
      const query = `%${options.query.trim().slice(0, 100)}%`;
      filters.push("(name LIKE ? OR company LIKE ? OR contact LIKE ? OR scenario LIKE ?)");
      params.push(query, query, query, query);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(500, options.limit ?? 100));
    const rows = this.db.prepare(`
      SELECT * FROM leads ${where}
      ORDER BY
        CASE priority WHEN 'HOT' THEN 1 WHEN 'WARM' THEN 2 ELSE 3 END,
        CASE status WHEN 'NEW' THEN 1 WHEN 'QUALIFIED' THEN 2 WHEN 'CONTACTED' THEN 3 WHEN 'PROPOSAL' THEN 4 WHEN 'NEGOTIATION' THEN 5 WHEN 'WAITLIST' THEN 6 WHEN 'WON' THEN 7 ELSE 8 END,
        updated_at DESC
      LIMIT ?
    `).all(...params, limit) as unknown as LeadRow[];
    return rows.map((row) => this.mapLead(row));
  }

  getLead(id: string): Lead | null {
    const row = this.db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as unknown as LeadRow | undefined;
    return row ? this.mapLead(row) : null;
  }

  updateLead(id: string, patch: {
    status?: LeadStatus;
    priority?: LeadPriority;
    owner?: string;
    quoteAmount?: number | null;
    quoteCurrency?: string;
    nextFollowUpAt?: string | null;
  }): Lead | null {
    const current = this.getLead(id);
    if (!current) return null;
    const next = {
      status: patch.status ?? current.status,
      priority: patch.priority ?? current.priority,
      owner: patch.owner ?? current.owner,
      quoteAmount: patch.quoteAmount !== undefined ? patch.quoteAmount : current.quoteAmount,
      quoteCurrency: patch.quoteCurrency ?? current.quoteCurrency,
      nextFollowUpAt: patch.nextFollowUpAt !== undefined ? patch.nextFollowUpAt : current.nextFollowUpAt,
    };
    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      UPDATE leads
      SET status = ?, priority = ?, owner = ?, quote_amount = ?, quote_currency = ?, next_follow_up_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.status,
      next.priority,
      next.owner,
      next.quoteAmount,
      next.quoteCurrency,
      next.nextFollowUpAt,
      updatedAt,
      id,
    );
    if (patch.status && patch.status !== current.status) {
      this.addLeadActivity(id, "STATUS", `${current.status} → ${patch.status}`);
    }
    if (patch.priority && patch.priority !== current.priority) {
      this.addLeadActivity(id, "STATUS", `Priority ${current.priority} → ${patch.priority}`);
    }
    if (patch.quoteAmount !== undefined && patch.quoteAmount !== current.quoteAmount) {
      const value = patch.quoteAmount === null ? "Quote cleared" : `Quote set to ${next.quoteCurrency} ${patch.quoteAmount}`;
      this.addLeadActivity(id, "QUOTE", value);
    }
    return this.getLead(id);
  }

  addLeadActivity(leadId: string, type: LeadActivityType, content: string): LeadActivity {
    const createdAt = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO lead_activities (lead_id, type, content, created_at)
      VALUES (?, ?, ?, ?)
    `).run(leadId, type, content, createdAt);
    this.db.prepare("UPDATE leads SET updated_at = ? WHERE id = ?").run(createdAt, leadId);
    return {
      id: Number(result.lastInsertRowid),
      leadId,
      type,
      content,
      createdAt,
    };
  }

  listLeadActivities(leadId: string, limit = 100): LeadActivity[] {
    const rows = this.db.prepare(`
      SELECT * FROM lead_activities WHERE lead_id = ?
      ORDER BY id DESC LIMIT ?
    `).all(leadId, Math.max(1, Math.min(500, limit))) as unknown as LeadActivityRow[];
    return rows.map((row) => this.mapLeadActivity(row));
  }

  deleteLead(id: string): boolean {
    const result = this.db.prepare("DELETE FROM leads WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  leadStats(): LeadStats {
    const statusTemplate: Record<LeadStatus, number> = {
      NEW: 0,
      WAITLIST: 0,
      QUALIFIED: 0,
      CONTACTED: 0,
      PROPOSAL: 0,
      NEGOTIATION: 0,
      WON: 0,
      LOST: 0,
    };
    const intentTemplate: Record<LeadIntent, number> = {
      commercial: 0,
      "pro-waitlist": 0,
      "white-label": 0,
      "managed-service": 0,
    };
    const statusRows = this.db.prepare("SELECT status, COUNT(*) AS count FROM leads GROUP BY status").all() as unknown as Array<{ status: LeadStatus; count: number }>;
    const intentRows = this.db.prepare("SELECT intent, COUNT(*) AS count FROM leads GROUP BY intent").all() as unknown as Array<{ intent: LeadIntent; count: number }>;
    for (const row of statusRows) if (row.status in statusTemplate) statusTemplate[row.status] = Number(row.count);
    for (const row of intentRows) if (row.intent in intentTemplate) intentTemplate[row.intent] = Number(row.count);
    const totals = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status NOT IN ('WON', 'LOST', 'WAITLIST') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN priority = 'HOT' THEN 1 ELSE 0 END) AS hot
      FROM leads
    `).get() as unknown as { total: number; active: number; hot: number };
    const currencyRows = this.db.prepare(`
      SELECT
        quote_currency AS currency,
        COALESCE(SUM(CASE WHEN status NOT IN ('WON', 'LOST', 'WAITLIST') THEN quote_amount ELSE 0 END), 0) AS pipeline,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN quote_amount ELSE 0 END), 0) AS won
      FROM leads
      WHERE quote_amount IS NOT NULL
      GROUP BY quote_currency
    `).all() as unknown as Array<{ currency: string; pipeline: number; won: number }>;
    const quotedByCurrency: Record<string, number> = {};
    const wonByCurrency: Record<string, number> = {};
    for (const row of currencyRows) {
      const currency = row.currency || "CNY";
      const pipeline = Number(row.pipeline || 0);
      const won = Number(row.won || 0);
      if (pipeline > 0) quotedByCurrency[currency] = pipeline;
      if (won > 0) wonByCurrency[currency] = won;
    }
    return {
      total: Number(totals.total || 0),
      active: Number(totals.active || 0),
      won: statusTemplate.WON,
      lost: statusTemplate.LOST,
      waitlist: statusTemplate.WAITLIST,
      hot: Number(totals.hot || 0),
      quotedValue: quotedByCurrency.CNY || 0,
      wonValue: wonByCurrency.CNY || 0,
      quotedByCurrency,
      wonByCurrency,
      byStatus: statusTemplate,
      byIntent: intentTemplate,
    };
  }

  close(): void {
    this.db.close();
  }

  private mapLead(row: LeadRow): Lead {
    return {
      id: row.id,
      intent: row.intent,
      name: row.name,
      company: row.company,
      contact: row.contact,
      teamSize: row.team_size,
      timeline: row.timeline,
      deployment: row.deployment,
      budget: row.budget,
      scenario: row.scenario,
      requirements: row.requirements,
      language: row.language,
      source: row.source,
      status: row.status,
      priority: row.priority,
      score: row.score,
      owner: row.owner,
      quoteAmount: row.quote_amount,
      quoteCurrency: row.quote_currency,
      nextFollowUpAt: row.next_follow_up_at,
      consentAt: row.consent_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapLeadActivity(row: LeadActivityRow): LeadActivity {
    return {
      id: row.id,
      leadId: row.lead_id,
      type: row.type,
      content: row.content,
      createdAt: row.created_at,
    };
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
