import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ValidatedLeadInput } from "./leads.js";
import type { ProjectedProspectOwnerDecisionV2 } from "./owner-business-decision-projection.js";
import { describeHistoricalTradeCadence } from "./trade-records.js";
import type {
  BossAiDelegation,
  BossAiExecutionStatus,
  BossAiReviewStatus,
  DailyBrief,
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadIntent,
  LeadPriority,
  LeadStats,
  LeadStatus,
  Opportunity,
  ProspectBrowserEvidenceRequest,
  ProspectBrowserEvidenceRequestStatus,
  ProspectCandidate,
  ProspectDiscoveryCandidate,
  ProspectOwnerDecisionRecord,
  ProspectOutcomeReviewRecord,
  ProspectStatus,
  Report,
  SourceContext,
  SavedEvidence,
  ScanRunSummary,
  ScanTrigger,
  ScoredEvidence,
  TradeCompanySummary,
  TradeRecord,
  TradeRecordFilters,
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
  community: string;
  source_context_json: string;
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

interface ProspectCandidateRow {
  id: string;
  domain: string;
  website_url: string;
  company_name: string;
  description: string;
  discovery_source_url: string;
  discovery_source_title: string;
  discovery_query: string;
  public_emails_json: string;
  public_phones_json: string;
  contact_urls_json: string;
  official_profile_urls_json: string;
  public_messaging_urls_json: string;
  company_contact_channels_json: string;
  product_signals_json: string;
  evidence_urls_json: string;
  website_evidence_status: string;
  website_evidence_source: string;
  website_verified_at: string;
  score: number;
  reasons_json: string;
  fit_score: number | null;
  fit_terms_json: string;
  fit_matches_json: string;
  status: ProspectStatus;
  first_seen_at: string;
  last_seen_at: string;
}

interface ProspectOwnerDecisionRow {
  id: string;
  prospect_id: string;
  decision: ProspectOwnerDecisionRecord["decision"];
  reason_code: ProspectOwnerDecisionRecord["reasonCode"];
  note: string;
  actor_type: ProspectOwnerDecisionRecord["actorType"];
  previous_status: ProspectStatus;
  target_status: "READY_FOR_SALES" | "REJECTED";
  decided_at: string;
  snapshot_json: string;
}

interface ProspectOwnerAuthorityProjectionV2Row {
  prospect_id: string;
  decision_id: string;
  audit_id: string;
  decision_type: "authorize-sales-qualification" | "reject-prospect";
  reason_code: string;
  context_type: "intelligence-manager-task";
  context_id: string;
  decided_at: string;
  actor_type: string;
  actor_id: string;
  synced_at: string;
}

interface ProspectBrowserEvidenceRequestRow {
  id: string;
  prospect_id: string;
  target_url: string;
  status: ProspectBrowserEvidenceRequestStatus;
  requested_at: string;
  updated_at: string;
  submitted_at: string;
  source_kind: string;
  source_reference: string;
  page_url: string;
  evidence_context_json: string;
}

interface TradeRecordRow {
  id: string;
  fingerprint: string;
  company_name: string;
  role: TradeRecord["role"];
  country: string;
  product_description: string;
  hs_code: string;
  trade_date: string;
  quantity: string;
  amount: number | null;
  currency: string;
  website_url: string;
  source_label: string;
  source_row: number;
  imported_at: string;
}

interface ReportRow {
  id: number;
  run_id: number;
  generated_at: string;
  executive_summary: string;
  markdown: string;
  brief_json: string;
  markdown_en: string | null;
  brief_en_json: string;
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

interface ProspectOutcomeReviewRow {
  id: string;
  prospect_id: string;
  sales_manager_task_id: string;
  owner_decision_id: string;
  decision: ProspectOutcomeReviewRecord["decision"];
  evidence_state: ProspectOutcomeReviewRecord["evidenceState"];
  summary: string;
  business_value_amount: number | null;
  business_value_currency: string;
  business_value_basis: ProspectOutcomeReviewRecord["businessValueBasis"];
  actor_type: "owner-admin";
  reviewed_at: string;
  snapshot_json: string;
}

interface BossAiDelegationRow {
  id: number;
  source_type: "opportunity" | "prospect" | "prospect-sales";
  source_record_id: string;
  source_operation_id: string;
  bossai_run_id: string;
  bossai_agent_id: string;
  status: BossAiExecutionStatus;
  review_status: BossAiReviewStatus;
  submitted_at: string;
  updated_at: string;
  result_imported_at: string | null;
  error_code: string;
  error_message: string;
  owner_decision_id: string;
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
        community TEXT NOT NULL DEFAULT '',
        source_context_json TEXT NOT NULL DEFAULT '{}',
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

      CREATE TABLE IF NOT EXISTS prospect_candidates (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL UNIQUE,
        website_url TEXT NOT NULL,
        company_name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        discovery_source_url TEXT NOT NULL,
        discovery_source_title TEXT NOT NULL DEFAULT '',
        discovery_query TEXT NOT NULL DEFAULT '',
        public_emails_json TEXT NOT NULL DEFAULT '[]',
        public_phones_json TEXT NOT NULL DEFAULT '[]',
        contact_urls_json TEXT NOT NULL DEFAULT '[]',
        official_profile_urls_json TEXT NOT NULL DEFAULT '[]',
        public_messaging_urls_json TEXT NOT NULL DEFAULT '[]',
        company_contact_channels_json TEXT NOT NULL DEFAULT '[]',
        product_signals_json TEXT NOT NULL DEFAULT '[]',
        evidence_urls_json TEXT NOT NULL DEFAULT '[]',
        website_evidence_status TEXT NOT NULL DEFAULT 'unverified',
        website_evidence_source TEXT NOT NULL DEFAULT '',
        website_verified_at TEXT NOT NULL DEFAULT '',
        score INTEGER NOT NULL DEFAULT 0,
        reasons_json TEXT NOT NULL DEFAULT '[]',
        fit_score INTEGER,
        fit_terms_json TEXT NOT NULL DEFAULT '[]',
        fit_matches_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'DISCOVERED',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_prospect_candidates_score ON prospect_candidates(score DESC, last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_prospect_candidates_status ON prospect_candidates(status, score DESC);
      CREATE INDEX IF NOT EXISTS idx_prospect_candidates_domain ON prospect_candidates(domain);

      CREATE TABLE IF NOT EXISTS prospect_owner_decisions (
        id TEXT PRIMARY KEY,
        prospect_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        actor_type TEXT NOT NULL DEFAULT 'owner-admin',
        previous_status TEXT NOT NULL,
        target_status TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        FOREIGN KEY(prospect_id) REFERENCES prospect_candidates(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_prospect_owner_decisions_prospect
        ON prospect_owner_decisions(prospect_id, decided_at DESC);
      CREATE INDEX IF NOT EXISTS idx_prospect_owner_decisions_time
        ON prospect_owner_decisions(decided_at DESC);

      CREATE TABLE IF NOT EXISTS prospect_owner_authority_projection_v2 (
        prospect_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL,
        audit_id TEXT NOT NULL,
        decision_type TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        context_type TEXT NOT NULL,
        context_id TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        actor_type TEXT NOT NULL DEFAULT '',
        actor_id TEXT NOT NULL DEFAULT '',
        synced_at TEXT NOT NULL,
        FOREIGN KEY(prospect_id) REFERENCES prospect_candidates(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_prospect_owner_authority_projection_v2_context
        ON prospect_owner_authority_projection_v2(context_type, context_id, decided_at DESC);

      CREATE TABLE IF NOT EXISTS prospect_outcome_reviews (
        id TEXT PRIMARY KEY,
        prospect_id TEXT NOT NULL,
        sales_manager_task_id TEXT NOT NULL,
        owner_decision_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        evidence_state TEXT NOT NULL,
        summary TEXT NOT NULL,
        business_value_amount REAL,
        business_value_currency TEXT NOT NULL DEFAULT '',
        business_value_basis TEXT NOT NULL DEFAULT 'none',
        actor_type TEXT NOT NULL DEFAULT 'owner-admin',
        reviewed_at TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        FOREIGN KEY(prospect_id) REFERENCES prospect_candidates(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_prospect_outcome_reviews_prospect
        ON prospect_outcome_reviews(prospect_id, reviewed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_prospect_outcome_reviews_sales
        ON prospect_outcome_reviews(sales_manager_task_id, reviewed_at DESC);

      CREATE TABLE IF NOT EXISTS prospect_browser_evidence_requests (
        id TEXT PRIMARY KEY,
        prospect_id TEXT NOT NULL,
        target_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        submitted_at TEXT NOT NULL DEFAULT '',
        source_kind TEXT NOT NULL DEFAULT '',
        source_reference TEXT NOT NULL DEFAULT '',
        page_url TEXT NOT NULL DEFAULT '',
        evidence_context_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(prospect_id) REFERENCES prospect_candidates(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_prospect_browser_evidence_status
        ON prospect_browser_evidence_requests(status, requested_at ASC);
      CREATE INDEX IF NOT EXISTS idx_prospect_browser_evidence_prospect
        ON prospect_browser_evidence_requests(prospect_id, requested_at DESC);

      CREATE TABLE IF NOT EXISTS trade_records (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        company_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'unknown',
        country TEXT NOT NULL DEFAULT '',
        product_description TEXT NOT NULL DEFAULT '',
        hs_code TEXT NOT NULL DEFAULT '',
        trade_date TEXT NOT NULL DEFAULT '',
        quantity TEXT NOT NULL DEFAULT '',
        amount REAL,
        currency TEXT NOT NULL DEFAULT '',
        website_url TEXT NOT NULL DEFAULT '',
        source_label TEXT NOT NULL,
        source_row INTEGER NOT NULL,
        imported_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_trade_records_company ON trade_records(company_name, imported_at DESC);
      CREATE INDEX IF NOT EXISTS idx_trade_records_country ON trade_records(country, imported_at DESC);
      CREATE INDEX IF NOT EXISTS idx_trade_records_hs ON trade_records(hs_code, imported_at DESC);
      CREATE INDEX IF NOT EXISTS idx_trade_records_date ON trade_records(trade_date DESC, imported_at DESC);

      CREATE TABLE IF NOT EXISTS prospect_trade_evidence (
        prospect_id TEXT NOT NULL,
        trade_record_id TEXT NOT NULL,
        linked_at TEXT NOT NULL,
        PRIMARY KEY (prospect_id, trade_record_id),
        FOREIGN KEY(prospect_id) REFERENCES prospect_candidates(id) ON DELETE CASCADE,
        FOREIGN KEY(trade_record_id) REFERENCES trade_records(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_prospect_trade_evidence_prospect ON prospect_trade_evidence(prospect_id, linked_at DESC);
      CREATE INDEX IF NOT EXISTS idx_prospect_trade_evidence_trade ON prospect_trade_evidence(trade_record_id, linked_at DESC);

      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        generated_at TEXT NOT NULL,
        executive_summary TEXT NOT NULL,
        markdown TEXT NOT NULL,
        brief_json TEXT NOT NULL DEFAULT '{}',
        markdown_en TEXT,
        brief_en_json TEXT NOT NULL DEFAULT '{}',
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

      CREATE TABLE IF NOT EXISTS bossai_delegations (
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
        error_message TEXT NOT NULL DEFAULT '',
        owner_decision_id TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_bossai_delegations_source
        ON bossai_delegations(source_type, source_record_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bossai_delegations_status
        ON bossai_delegations(status, review_status, updated_at DESC);

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
    this.ensureColumn("evidence", "community", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("evidence", "source_context_json", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("evidence", "is_demo", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("opportunities", "is_demo", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("reports", "brief_json", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("reports", "markdown_en", "TEXT");
    this.ensureColumn("reports", "brief_en_json", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("prospect_candidates", "official_profile_urls_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("prospect_candidates", "public_messaging_urls_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("prospect_candidates", "company_contact_channels_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("prospect_candidates", "website_evidence_status", "TEXT NOT NULL DEFAULT 'unverified'");
    this.ensureColumn("prospect_candidates", "website_evidence_source", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("prospect_candidates", "website_verified_at", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("prospect_candidates", "fit_score", "INTEGER");
    this.ensureColumn("prospect_candidates", "fit_terms_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("prospect_candidates", "fit_matches_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("bossai_delegations", "owner_decision_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("prospect_owner_authority_projection_v2", "actor_type", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("prospect_owner_authority_projection_v2", "actor_id", "TEXT NOT NULL DEFAULT ''");
  }

  private ensureColumn(table: "evidence" | "opportunities" | "reports" | "prospect_candidates" | "bossai_delegations" | "prospect_owner_authority_projection_v2", column: string, definition: string): void {
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
        category, tags_json, community, source_context_json, is_demo, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        engagement = MAX(evidence.engagement, excluded.engagement),
        total_score = MAX(evidence.total_score, excluded.total_score),
        tags_json = excluded.tags_json,
        community = CASE WHEN excluded.community <> '' THEN excluded.community ELSE evidence.community END,
        source_context_json = CASE
          WHEN excluded.source_context_json LIKE '%\"schema\":\"bossai.business-website-context.v1\"%' THEN excluded.source_context_json
          WHEN excluded.source_context_json LIKE '%\"status\":\"available\"%' THEN excluded.source_context_json
          ELSE evidence.source_context_json
        END,
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
      item.community || "",
      JSON.stringify(item.websiteContext ?? item.sourceContext ?? {}),
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

  saveReport(
    runId: number,
    executiveSummary: string,
    markdown: string,
    brief: DailyBrief | null = null,
    markdownEnglish: string | null = null,
    briefEnglish: DailyBrief | null = null,
  ): Report {
    const generatedAt = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO reports (
        run_id, generated_at, executive_summary, markdown, brief_json, markdown_en, brief_en_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      generatedAt,
      executiveSummary,
      markdown,
      JSON.stringify(brief ?? {}),
      markdownEnglish,
      JSON.stringify(briefEnglish ?? {}),
    );
    return {
      id: Number(result.lastInsertRowid),
      runId,
      generatedAt,
      executiveSummary,
      markdown,
      brief,
      markdownEnglish,
      briefEnglish,
    };
  }

  listOpportunities(limit = 50): Opportunity[] {
    const rows = this.db
      .prepare("SELECT * FROM opportunities ORDER BY score DESC, evidence_count DESC LIMIT ?")
      .all(Math.max(1, Math.min(200, limit))) as unknown as OpportunityRow[];
    return rows.map((row) => this.mapOpportunity(row));
  }

  getOpportunity(id: string): Opportunity | null {
    const row = this.db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id) as unknown as OpportunityRow | undefined;
    return row ? this.mapOpportunity(row) : null;
  }

  saveProspectCandidate(input: ProspectDiscoveryCandidate): ProspectCandidate {
    this.db.prepare(`
      INSERT INTO prospect_candidates (
        id, domain, website_url, company_name, description, discovery_source_url, discovery_source_title,
        discovery_query, public_emails_json, public_phones_json, contact_urls_json, official_profile_urls_json, public_messaging_urls_json, company_contact_channels_json, product_signals_json,
        evidence_urls_json, website_evidence_status, website_evidence_source, website_verified_at, score, reasons_json, fit_score, fit_terms_json, fit_matches_json, status, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISCOVERED', ?, ?)
      ON CONFLICT(domain) DO UPDATE SET
        website_url = CASE
          WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.website_url
          ELSE excluded.website_url
        END,
        company_name = CASE
          WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.company_name
          WHEN excluded.company_name <> '' THEN excluded.company_name
          ELSE prospect_candidates.company_name
        END,
        description = CASE
          WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.description
          WHEN excluded.description <> '' THEN excluded.description
          ELSE prospect_candidates.description
        END,
        discovery_source_url = excluded.discovery_source_url,
        discovery_source_title = excluded.discovery_source_title,
        discovery_query = excluded.discovery_query,
        public_emails_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.public_emails_json ELSE excluded.public_emails_json END,
        public_phones_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.public_phones_json ELSE excluded.public_phones_json END,
        contact_urls_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.contact_urls_json ELSE excluded.contact_urls_json END,
        official_profile_urls_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.official_profile_urls_json ELSE excluded.official_profile_urls_json END,
        public_messaging_urls_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.public_messaging_urls_json ELSE excluded.public_messaging_urls_json END,
        company_contact_channels_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.company_contact_channels_json ELSE excluded.company_contact_channels_json END,
        product_signals_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.product_signals_json ELSE excluded.product_signals_json END,
        evidence_urls_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.evidence_urls_json ELSE excluded.evidence_urls_json END,
        website_evidence_status = CASE
          WHEN excluded.website_evidence_status = 'unverified' THEN prospect_candidates.website_evidence_status
          WHEN prospect_candidates.website_evidence_status = 'unverified' THEN excluded.website_evidence_status
          WHEN excluded.website_verified_at >= prospect_candidates.website_verified_at THEN excluded.website_evidence_status
          ELSE prospect_candidates.website_evidence_status
        END,
        website_evidence_source = CASE
          WHEN excluded.website_evidence_status = 'unverified' THEN prospect_candidates.website_evidence_source
          WHEN prospect_candidates.website_evidence_status = 'unverified' THEN excluded.website_evidence_source
          WHEN excluded.website_verified_at >= prospect_candidates.website_verified_at THEN excluded.website_evidence_source
          ELSE prospect_candidates.website_evidence_source
        END,
        website_verified_at = CASE
          WHEN excluded.website_verified_at > prospect_candidates.website_verified_at THEN excluded.website_verified_at
          ELSE prospect_candidates.website_verified_at
        END,
        score = MAX(prospect_candidates.score, excluded.score),
        reasons_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.reasons_json ELSE excluded.reasons_json END,
        fit_score = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.fit_score ELSE excluded.fit_score END,
        fit_terms_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.fit_terms_json ELSE excluded.fit_terms_json END,
        fit_matches_json = CASE WHEN excluded.website_evidence_status = 'unverified' AND prospect_candidates.website_evidence_status <> 'unverified' THEN prospect_candidates.fit_matches_json ELSE excluded.fit_matches_json END,
        last_seen_at = excluded.last_seen_at
    `).run(
      input.id,
      input.domain,
      input.websiteUrl,
      input.companyName,
      input.description,
      input.discoverySourceUrl,
      input.discoverySourceTitle,
      input.discoveryQuery,
      JSON.stringify(input.publicEmails),
      JSON.stringify(input.publicPhones),
      JSON.stringify(input.contactUrls),
      JSON.stringify(input.officialProfileUrls ?? []),
      JSON.stringify(input.publicMessagingUrls ?? []),
      JSON.stringify(input.companyContactChannels ?? []),
      JSON.stringify(input.productSignals),
      JSON.stringify(input.evidenceUrls),
      input.websiteEvidenceStatus ?? "unverified",
      input.websiteEvidenceSource ?? "",
      input.websiteVerifiedAt ?? "",
      input.score,
      JSON.stringify(input.reasons),
      input.fitScore ?? null,
      JSON.stringify(input.fitTerms ?? []),
      JSON.stringify(input.fitMatches ?? []),
      input.discoveredAt,
      input.discoveredAt,
    );
    const row = this.db.prepare("SELECT * FROM prospect_candidates WHERE domain = ?")
      .get(input.domain) as unknown as ProspectCandidateRow;
    return this.mapProspectCandidate(row);
  }

  listProspectCandidates(limit = 50, status?: ProspectStatus): ProspectCandidate[] {
    const normalizedLimit = Math.max(1, Math.min(500, limit));
    const rows = status
      ? this.db.prepare("SELECT * FROM prospect_candidates WHERE status = ? ORDER BY score DESC, last_seen_at DESC LIMIT ?").all(status, normalizedLimit)
      : this.db.prepare("SELECT * FROM prospect_candidates ORDER BY score DESC, last_seen_at DESC LIMIT ?").all(normalizedLimit);
    return (rows as unknown as ProspectCandidateRow[]).map((row) => this.mapProspectCandidate(row));
  }

  getProspectCandidate(id: string): ProspectCandidate | null {
    const row = this.db.prepare("SELECT * FROM prospect_candidates WHERE id = ?").get(id) as unknown as ProspectCandidateRow | undefined;
    return row ? this.mapProspectCandidate(row) : null;
  }

  getProspectCandidateByDomain(domain: string): ProspectCandidate | null {
    const row = this.db.prepare("SELECT * FROM prospect_candidates WHERE domain = ?").get(domain) as unknown as ProspectCandidateRow | undefined;
    return row ? this.mapProspectCandidate(row) : null;
  }

  updateProspectStatus(id: string, status: ProspectStatus): ProspectCandidate | null {
    this.db.prepare("UPDATE prospect_candidates SET status = ? WHERE id = ?").run(status, id);
    return this.getProspectCandidate(id);
  }

  recordProspectOwnerDecision(input: {
    prospectId: string;
    decision: ProspectOwnerDecisionRecord["decision"];
    reasonCode: ProspectOwnerDecisionRecord["reasonCode"];
    note: string;
    expectedStatus: ProspectStatus;
    targetStatus: "READY_FOR_SALES" | "REJECTED";
    snapshot: ProspectOwnerDecisionRecord["snapshot"];
    decidedAt?: string;
  }): { decision: ProspectOwnerDecisionRecord; prospect: ProspectCandidate } | null {
    const decidedAt = input.decidedAt ?? new Date().toISOString();
    const id = `owner-decision-${randomUUID()}`;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db.prepare("SELECT status FROM prospect_candidates WHERE id = ?")
        .get(input.prospectId) as unknown as { status: ProspectStatus } | undefined;
      if (!current || current.status !== input.expectedStatus) {
        this.db.exec("ROLLBACK");
        return null;
      }
      this.db.prepare(`
        INSERT INTO prospect_owner_decisions (
          id, prospect_id, decision, reason_code, note, actor_type,
          previous_status, target_status, decided_at, snapshot_json
        ) VALUES (?, ?, ?, ?, ?, 'owner-admin', ?, ?, ?, ?)
      `).run(
        id,
        input.prospectId,
        input.decision,
        input.reasonCode,
        input.note,
        input.expectedStatus,
        input.targetStatus,
        decidedAt,
        JSON.stringify(input.snapshot),
      );
      const updated = this.db.prepare("UPDATE prospect_candidates SET status = ? WHERE id = ? AND status = ?")
        .run(input.targetStatus, input.prospectId, input.expectedStatus);
      if (Number(updated.changes || 0) !== 1) {
        this.db.exec("ROLLBACK");
        return null;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const decision = this.getProspectOwnerDecision(id);
    const prospect = this.getProspectCandidate(input.prospectId);
    return decision && prospect ? { decision, prospect } : null;
  }

  getProspectOwnerDecision(id: string): ProspectOwnerDecisionRecord | null {
    const row = this.db.prepare("SELECT * FROM prospect_owner_decisions WHERE id = ?")
      .get(id) as unknown as ProspectOwnerDecisionRow | undefined;
    return row ? this.mapProspectOwnerDecision(row) : null;
  }

  listProspectOwnerDecisions(prospectId: string, limit = 20): ProspectOwnerDecisionRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM prospect_owner_decisions
      WHERE prospect_id = ? ORDER BY decided_at DESC, id DESC LIMIT ?
    `).all(prospectId, Math.max(1, Math.min(100, limit))) as unknown as ProspectOwnerDecisionRow[];
    return rows.map((row) => this.mapProspectOwnerDecision(row));
  }

  getProspectOwnerAuthorityProjectionV2(prospectId: string): ProjectedProspectOwnerDecisionV2 | null {
    const row = this.db.prepare("SELECT * FROM prospect_owner_authority_projection_v2 WHERE prospect_id = ?")
      .get(prospectId) as unknown as ProspectOwnerAuthorityProjectionV2Row | undefined;
    if (!row) return null;
    return {
      schema: "bossai.owner-decision-projection.v2",
      status: "projected",
      prospectId: row.prospect_id,
      intelligenceManagerTaskId: row.context_id,
      source: {
        project: "bossai-os",
        contract: "bossai.owner-business-decision.v2",
        decisionId: row.decision_id,
        auditId: row.audit_id,
        decidedAt: row.decided_at,
        actorType: row.actor_type,
        actorId: row.actor_id,
      },
      decision: {
        domain: "sales-prospect",
        subjectType: "prospect",
        subjectId: row.prospect_id,
        decisionType: row.decision_type,
        radarCompatibilityDecision: row.decision_type === "authorize-sales-qualification" ? "approve-sales" : "reject-prospect",
        reasonCode: row.reason_code,
        contextType: "intelligence-manager-task",
        contextId: row.context_id,
      },
      authority: {
        sourceOfDecisionTruth: "bossai-os",
        bossaiWorkCanonicalOwnerSurface: true,
        radarProjectionOnly: true,
        radarPersistenceAuthorized: false,
        compatibilityProjectionCacheAuthorized: true,
        radarOwnerDecisionAuthority: false,
        salesQualificationRequiresSeparateExplicitAction: true,
        externalActionsExecuted: false,
      },
    };
  }

  syncProspectOwnerAuthorityProjectionV2(projection: ProjectedProspectOwnerDecisionV2): ProspectCandidate | null {
    const targetStatus: ProspectStatus = projection.decision.decisionType === "authorize-sales-qualification"
      ? "READY_FOR_SALES"
      : "REJECTED";
    const current = this.getProspectCandidate(projection.prospectId);
    if (!current) return null;
    if (current.status === "REJECTED" && targetStatus !== "REJECTED") return null;
    const syncedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT INTO prospect_owner_authority_projection_v2 (
          prospect_id, decision_id, audit_id, decision_type, reason_code,
          context_type, context_id, decided_at, actor_type, actor_id, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(prospect_id) DO UPDATE SET
          decision_id = excluded.decision_id,
          audit_id = excluded.audit_id,
          decision_type = excluded.decision_type,
          reason_code = excluded.reason_code,
          context_type = excluded.context_type,
          context_id = excluded.context_id,
          decided_at = excluded.decided_at,
          actor_type = excluded.actor_type,
          actor_id = excluded.actor_id,
          synced_at = excluded.synced_at
      `).run(
        projection.prospectId,
        projection.source.decisionId,
        projection.source.auditId,
        projection.decision.decisionType,
        projection.decision.reasonCode,
        projection.decision.contextType,
        projection.decision.contextId,
        projection.source.decidedAt,
        projection.source.actorType,
        projection.source.actorId,
        syncedAt,
      );
      this.db.prepare("UPDATE prospect_candidates SET status = ? WHERE id = ?").run(targetStatus, projection.prospectId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getProspectCandidate(projection.prospectId);
  }

  recordProspectOutcomeReview(input: {
    prospectId: string;
    salesManagerTaskId: string;
    ownerDecisionId: string;
    decision: ProspectOutcomeReviewRecord["decision"];
    evidenceState: ProspectOutcomeReviewRecord["evidenceState"];
    summary: string;
    businessValueAmount: number | null;
    businessValueCurrency: string;
    snapshot: ProspectOutcomeReviewRecord["snapshot"];
    reviewedAt?: string;
  }): ProspectOutcomeReviewRecord | null {
    const reviewedAt = input.reviewedAt ?? new Date().toISOString();
    const id = `outcome-review-${randomUUID()}`;
    const businessValueBasis: ProspectOutcomeReviewRecord["businessValueBasis"] = input.businessValueAmount === null
      ? "none"
      : "owner-entered";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const currentSales = this.db.prepare(`
        SELECT bossai_run_id, owner_decision_id, status
        FROM bossai_delegations
        WHERE source_type = 'prospect-sales' AND source_record_id = ?
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `).get(input.prospectId) as unknown as {
        bossai_run_id: string;
        owner_decision_id: string;
        status: BossAiExecutionStatus;
      } | undefined;
      if (!currentSales
        || currentSales.bossai_run_id !== input.salesManagerTaskId
        || currentSales.owner_decision_id !== input.ownerDecisionId
        || currentSales.status !== "completed") {
        this.db.exec("ROLLBACK");
        return null;
      }
      this.db.prepare(`
        INSERT INTO prospect_outcome_reviews (
          id, prospect_id, sales_manager_task_id, owner_decision_id, decision, evidence_state,
          summary, business_value_amount, business_value_currency, business_value_basis,
          actor_type, reviewed_at, snapshot_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'owner-admin', ?, ?)
      `).run(
        id,
        input.prospectId,
        input.salesManagerTaskId,
        input.ownerDecisionId,
        input.decision,
        input.evidenceState,
        input.summary,
        input.businessValueAmount,
        input.businessValueCurrency,
        businessValueBasis,
        reviewedAt,
        JSON.stringify(input.snapshot),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const review = this.getProspectOutcomeReview(id);
    if (!review) throw new Error("Outcome review was not persisted");
    return review;
  }

  getProspectOutcomeReview(id: string): ProspectOutcomeReviewRecord | null {
    const row = this.db.prepare("SELECT * FROM prospect_outcome_reviews WHERE id = ?")
      .get(id) as unknown as ProspectOutcomeReviewRow | undefined;
    return row ? this.mapProspectOutcomeReview(row) : null;
  }

  listProspectOutcomeReviews(prospectId: string, limit = 20): ProspectOutcomeReviewRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM prospect_outcome_reviews
      WHERE prospect_id = ? ORDER BY reviewed_at DESC, id DESC LIMIT ?
    `).all(prospectId, Math.max(1, Math.min(100, limit))) as unknown as ProspectOutcomeReviewRow[];
    return rows.map((row) => this.mapProspectOutcomeReview(row));
  }

  createProspectBrowserEvidenceRequest(
    prospectId: string,
    targetUrl: string,
    requestedAt = new Date().toISOString(),
  ): ProspectBrowserEvidenceRequest {
    const existing = this.db.prepare(`
      SELECT * FROM prospect_browser_evidence_requests
      WHERE prospect_id = ? AND status = 'pending'
      ORDER BY requested_at DESC LIMIT 1
    `).get(prospectId) as unknown as ProspectBrowserEvidenceRequestRow | undefined;
    if (existing) return this.mapProspectBrowserEvidenceRequest(existing);

    const id = `browser-evidence-${randomUUID()}`;
    this.db.prepare(`
      INSERT INTO prospect_browser_evidence_requests (
        id, prospect_id, target_url, status, requested_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(id, prospectId, targetUrl, requestedAt, requestedAt);
    return this.getProspectBrowserEvidenceRequest(id) as ProspectBrowserEvidenceRequest;
  }

  getProspectBrowserEvidenceRequest(id: string): ProspectBrowserEvidenceRequest | null {
    const row = this.db.prepare("SELECT * FROM prospect_browser_evidence_requests WHERE id = ?")
      .get(id) as unknown as ProspectBrowserEvidenceRequestRow | undefined;
    return row ? this.mapProspectBrowserEvidenceRequest(row) : null;
  }

  listProspectBrowserEvidenceRequests(
    limit = 100,
    status?: ProspectBrowserEvidenceRequestStatus,
  ): ProspectBrowserEvidenceRequest[] {
    const boundedLimit = Math.max(1, Math.min(500, limit));
    const rows = status
      ? this.db.prepare(`
          SELECT * FROM prospect_browser_evidence_requests
          WHERE status = ? ORDER BY requested_at ASC LIMIT ?
        `).all(status, boundedLimit)
      : this.db.prepare(`
          SELECT * FROM prospect_browser_evidence_requests
          ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, requested_at DESC LIMIT ?
        `).all(boundedLimit);
    return (rows as unknown as ProspectBrowserEvidenceRequestRow[])
      .map((row) => this.mapProspectBrowserEvidenceRequest(row));
  }

  getLatestProspectBrowserEvidenceRequestForProspect(prospectId: string): ProspectBrowserEvidenceRequest | null {
    const row = this.db.prepare(`
      SELECT * FROM prospect_browser_evidence_requests
      WHERE prospect_id = ?
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, requested_at DESC
      LIMIT 1
    `).get(prospectId) as unknown as ProspectBrowserEvidenceRequestRow | undefined;
    return row ? this.mapProspectBrowserEvidenceRequest(row) : null;
  }

  completeProspectBrowserEvidenceRequest(input: {
    id: string;
    status: Exclude<ProspectBrowserEvidenceRequestStatus, "pending">;
    submittedAt: string;
    sourceKind?: string;
    sourceReference?: string;
    pageUrl?: string;
    evidenceContext?: SourceContext;
  }): ProspectBrowserEvidenceRequest | null {
    this.db.prepare(`
      UPDATE prospect_browser_evidence_requests
      SET status = ?, updated_at = ?, submitted_at = ?, source_kind = ?, source_reference = ?, page_url = ?, evidence_context_json = ?
      WHERE id = ? AND status = 'pending'
    `).run(
      input.status,
      input.submittedAt,
      input.submittedAt,
      input.sourceKind ?? "",
      input.sourceReference ?? "",
      input.pageUrl ?? "",
      JSON.stringify(input.evidenceContext ?? {}),
      input.id,
    );
    return this.getProspectBrowserEvidenceRequest(input.id);
  }

  prospectStats(): { total: number; reviewRequired: number; readyForSales: number; rejected: number } {
    const rows = this.db.prepare("SELECT status, COUNT(*) AS count FROM prospect_candidates GROUP BY status").all() as unknown as Array<{ status: ProspectStatus; count: number }>;
    const byStatus = new Map(rows.map((row) => [row.status, Number(row.count)]));
    return {
      total: rows.reduce((sum, row) => sum + Number(row.count), 0),
      reviewRequired: byStatus.get("REVIEW_REQUIRED") ?? 0,
      readyForSales: byStatus.get("READY_FOR_SALES") ?? 0,
      rejected: byStatus.get("REJECTED") ?? 0,
    };
  }

  saveTradeRecords(records: readonly TradeRecord[]): { imported: number; duplicates: number } {
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO trade_records (
        id, fingerprint, company_name, role, country, product_description, hs_code, trade_date,
        quantity, amount, currency, website_url, source_label, source_row, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let imported = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const record of records.slice(0, 5_000)) {
        const result = statement.run(
          record.id,
          record.fingerprint,
          record.companyName,
          record.role,
          record.country,
          record.productDescription,
          record.hsCode,
          record.tradeDate,
          record.quantity,
          record.amount,
          record.currency,
          record.websiteUrl,
          record.sourceLabel,
          record.sourceRow,
          record.importedAt,
        );
        imported += Number(result.changes || 0);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { imported, duplicates: Math.max(0, Math.min(5_000, records.length) - imported) };
  }

  listTradeRecords(limit = 100, filters: TradeRecordFilters = {}): TradeRecord[] {
    const { clause, params } = tradeRecordFilterSql(filters);
    const rows = this.db.prepare(`
      SELECT * FROM trade_records
      ${clause}
      ORDER BY COALESCE(NULLIF(trade_date, ''), imported_at) DESC, imported_at DESC, source_row ASC
      LIMIT ?
    `).all(...params, Math.max(1, Math.min(500, limit))) as unknown as TradeRecordRow[];
    return rows.map((row) => this.mapTradeRecord(row));
  }

  summarizeTradeCompanies(limit = 12, filters: TradeRecordFilters = {}, now = Date.now()): TradeCompanySummary[] {
    const { clause, params } = tradeRecordFilterSql(filters);
    const rows = this.db.prepare(`
      SELECT
        lower(company_name) || char(31) || lower(country) AS company_key,
        MAX(company_name) AS company_name,
        MAX(country) AS country,
        COUNT(*) AS record_count,
        MIN(NULLIF(trade_date, '')) AS first_trade_date,
        MAX(NULLIF(trade_date, '')) AS latest_trade_date,
        SUM(CASE WHEN trade_date <> '' THEN 1 ELSE 0 END) AS dated_record_count,
        GROUP_CONCAT(NULLIF(trade_date, '')) AS trade_dates,
        GROUP_CONCAT(DISTINCT NULLIF(website_url, '')) AS website_urls,
        GROUP_CONCAT(DISTINCT NULLIF(role, 'unknown')) AS roles,
        GROUP_CONCAT(DISTINCT NULLIF(hs_code, '')) AS hs_codes,
        COUNT(DISTINCT NULLIF(product_description, '')) AS product_count
      FROM trade_records
      ${clause}
      GROUP BY lower(company_name), lower(country)
      ORDER BY latest_trade_date DESC, record_count DESC, company_name ASC, country ASC
      LIMIT ?
    `).all(...params, Math.max(50, Math.min(500, limit * 10))) as unknown as Array<{
      company_key: string;
      company_name: string;
      country: string;
      record_count: number;
      first_trade_date: string | null;
      latest_trade_date: string | null;
      dated_record_count: number;
      trade_dates: string | null;
      website_urls: string | null;
      roles: string | null;
      hs_codes: string | null;
      product_count: number;
    }>;
    if (rows.length === 0) return [];

    const { clause: amountClause, params: amountParams } = tradeRecordFilterSql(filters);
    const amountWhere = amountClause
      ? `${amountClause} AND amount IS NOT NULL AND currency <> ''`
      : "WHERE amount IS NOT NULL AND currency <> ''";
    const amountRows = this.db.prepare(`
      SELECT lower(company_name) || char(31) || lower(country) AS company_key, upper(currency) AS currency, SUM(amount) AS total
      FROM trade_records
      ${amountWhere}
      GROUP BY lower(company_name), lower(country), upper(currency)
    `).all(...amountParams) as unknown as Array<{ company_key: string; currency: string; total: number }>;
    const amounts = new Map<string, Record<string, number>>();
    const selectedKeys = new Set(rows.map((row) => row.company_key));
    for (const row of amountRows) {
      if (!selectedKeys.has(row.company_key)) continue;
      const current = amounts.get(row.company_key) ?? {};
      current[row.currency] = Number(row.total || 0);
      amounts.set(row.company_key, current);
    }

    return rows.map((row) => {
      const recordCount = Number(row.record_count || 0);
      const websiteOrigins = normalizeTradeWebsiteOrigins(splitSqlList(row.website_urls, 20));
      const websiteUrl = websiteOrigins.length === 1 ? websiteOrigins[0] ?? "" : "";
      const cadence = describeHistoricalTradeCadence(
        splitSqlList(row.trade_dates, Math.max(1, recordCount)),
        recordCount,
        websiteUrl,
        now,
      );
      return {
        companyName: row.company_name,
        recordCount,
        ...cadence,
        websiteUrl,
        websiteCount: websiteOrigins.length,
        countries: row.country ? [row.country] : [],
        roles: splitSqlList(row.roles, 8).filter((role): role is TradeRecord["role"] => ["buyer", "importer", "supplier", "exporter", "unknown"].includes(role)),
        hsCodes: splitSqlList(row.hs_codes, 20),
        productCount: Number(row.product_count || 0),
        amountByCurrency: amounts.get(row.company_key) ?? {},
      };
    }).sort((a, b) => {
      const priority = { REVIEW_FIRST: 0, REVIEW_SOON: 1, REVIEW_LATER: 2 } as const;
      return priority[a.reviewPriority] - priority[b.reviewPriority]
        || String(b.latestTradeDate).localeCompare(String(a.latestTradeDate))
        || b.recordCount - a.recordCount
        || a.companyName.localeCompare(b.companyName);
    }).slice(0, Math.max(1, Math.min(100, limit)));
  }

  getTradeRecord(id: string): TradeRecord | null {
    const row = this.db.prepare("SELECT * FROM trade_records WHERE id = ?").get(id) as unknown as TradeRecordRow | undefined;
    return row ? this.mapTradeRecord(row) : null;
  }

  listTradeRecordsByCompany(companyName: string, country: string | undefined = undefined, limit = 50): TradeRecord[] {
    const normalized = companyName.trim().slice(0, 240);
    const hasCountryFilter = country !== undefined;
    const normalizedCountry = (country ?? "").trim().slice(0, 120);
    if (!normalized) return [];
    const countryClause = hasCountryFilter ? "AND lower(country) = lower(?)" : "";
    const params: Array<string | number> = [normalized];
    if (hasCountryFilter) params.push(normalizedCountry);
    params.push(Math.max(1, Math.min(100, limit)));
    const rows = this.db.prepare(`
      SELECT * FROM trade_records
      WHERE lower(company_name) = lower(?)
      ${countryClause}
      ORDER BY COALESCE(NULLIF(trade_date, ''), imported_at) DESC, imported_at DESC, source_row ASC
      LIMIT ?
    `).all(...params) as unknown as TradeRecordRow[];
    return rows.map((row) => this.mapTradeRecord(row));
  }

  linkProspectTradeEvidence(prospectId: string, tradeRecordId: string, linkedAt = new Date().toISOString()): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO prospect_trade_evidence (prospect_id, trade_record_id, linked_at)
      VALUES (?, ?, ?)
    `).run(prospectId, tradeRecordId, linkedAt);
  }

  listTradeRecordsForProspect(prospectId: string, limit = 10): TradeRecord[] {
    const rows = this.db.prepare(`
      SELECT t.*
      FROM trade_records t
      INNER JOIN prospect_trade_evidence pte ON pte.trade_record_id = t.id
      WHERE pte.prospect_id = ?
      ORDER BY COALESCE(NULLIF(t.trade_date, ''), t.imported_at) DESC, pte.linked_at DESC
      LIMIT ?
    `).all(prospectId, Math.max(1, Math.min(50, limit))) as unknown as TradeRecordRow[];
    return rows.map((row) => this.mapTradeRecord(row));
  }

  tradeRecordStats(): { total: number; companies: number; withWebsite: number; unresolvedCompanies: number } {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT lower(company_name) || char(31) || lower(country)) AS companies,
        SUM(CASE WHEN website_url <> '' THEN 1 ELSE 0 END) AS with_website,
        COUNT(DISTINCT CASE WHEN website_url = '' THEN lower(company_name) || char(31) || lower(country) END) AS unresolved_companies
      FROM trade_records
    `).get() as unknown as { total: number; companies: number; with_website: number; unresolved_companies: number };
    return {
      total: Number(row.total || 0),
      companies: Number(row.companies || 0),
      withWebsite: Number(row.with_website || 0),
      unresolvedCompanies: Number(row.unresolved_companies || 0),
    };
  }

  saveBossAiDelegation(input: {
    sourceType: "opportunity" | "prospect" | "prospect-sales";
    sourceRecordId: string;
    sourceOperationId: string;
    bossaiRunId: string;
    bossaiAgentId: string;
    status: BossAiExecutionStatus;
    reviewStatus: BossAiReviewStatus;
    submittedAt: string;
    updatedAt: string;
    errorCode?: string;
    errorMessage?: string;
    ownerDecisionId?: string;
  }): BossAiDelegation {
    this.db.prepare(`
      INSERT INTO bossai_delegations (
        source_type, source_record_id, source_operation_id, bossai_run_id, bossai_agent_id,
        status, review_status, submitted_at, updated_at, error_code, error_message, owner_decision_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_operation_id) DO UPDATE SET
        bossai_run_id = excluded.bossai_run_id,
        bossai_agent_id = excluded.bossai_agent_id,
        status = excluded.status,
        review_status = excluded.review_status,
        updated_at = excluded.updated_at,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        owner_decision_id = excluded.owner_decision_id
    `).run(
      input.sourceType,
      input.sourceRecordId,
      input.sourceOperationId,
      input.bossaiRunId,
      input.bossaiAgentId,
      input.status,
      input.reviewStatus,
      input.submittedAt,
      input.updatedAt,
      input.errorCode ?? "",
      input.errorMessage ?? "",
      input.ownerDecisionId ?? "",
    );
    const row = this.db.prepare("SELECT * FROM bossai_delegations WHERE source_operation_id = ?")
      .get(input.sourceOperationId) as unknown as BossAiDelegationRow;
    return this.mapBossAiDelegation(row);
  }

  getBossAiDelegationByOperation(sourceOperationId: string): BossAiDelegation | null {
    const row = this.db.prepare("SELECT * FROM bossai_delegations WHERE source_operation_id = ?")
      .get(sourceOperationId) as unknown as BossAiDelegationRow | undefined;
    return row ? this.mapBossAiDelegation(row) : null;
  }

  getBossAiDelegationByRunId(runId: string): BossAiDelegation | null {
    const row = this.db.prepare("SELECT * FROM bossai_delegations WHERE bossai_run_id = ?")
      .get(runId) as unknown as BossAiDelegationRow | undefined;
    return row ? this.mapBossAiDelegation(row) : null;
  }

  getLatestBossAiDelegationForSource(sourceType: BossAiDelegation["sourceType"], sourceRecordId: string): BossAiDelegation | null {
    const row = this.db.prepare(`
      SELECT * FROM bossai_delegations
      WHERE source_type = ? AND source_record_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `).get(sourceType, sourceRecordId) as unknown as BossAiDelegationRow | undefined;
    return row ? this.mapBossAiDelegation(row) : null;
  }

  listBossAiDelegations(limit = 50): BossAiDelegation[] {
    const rows = this.db.prepare("SELECT * FROM bossai_delegations ORDER BY updated_at DESC LIMIT ?")
      .all(Math.max(1, Math.min(200, limit))) as unknown as BossAiDelegationRow[];
    return rows.map((row) => this.mapBossAiDelegation(row));
  }

  countBossAiDelegations(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM bossai_delegations").get() as { count: number };
    return Number(row.count || 0);
  }

  updateBossAiDelegationState(
    runId: string,
    state: {
      status: BossAiExecutionStatus;
      reviewStatus: BossAiReviewStatus;
      updatedAt: string;
      resultImportedAt?: string | null;
      errorCode?: string;
      errorMessage?: string;
    },
  ): BossAiDelegation | null {
    this.db.prepare(`
      UPDATE bossai_delegations
      SET status = ?, review_status = ?, updated_at = ?,
          result_imported_at = COALESCE(?, result_imported_at),
          error_code = ?, error_message = ?
      WHERE bossai_run_id = ?
    `).run(
      state.status,
      state.reviewStatus,
      state.updatedAt,
      state.resultImportedAt ?? null,
      state.errorCode ?? "",
      state.errorMessage ?? "",
      runId,
    );
    return this.getBossAiDelegationByRunId(runId);
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

  private mapProspectCandidate(row: ProspectCandidateRow): ProspectCandidate {
    return {
      id: row.id,
      domain: row.domain,
      websiteUrl: row.website_url,
      companyName: row.company_name,
      description: row.description,
      discoverySourceUrl: row.discovery_source_url,
      discoverySourceTitle: row.discovery_source_title,
      discoveryQuery: row.discovery_query,
      publicEmails: safeJson<string[]>(row.public_emails_json, []),
      publicPhones: safeJson<string[]>(row.public_phones_json, []),
      contactUrls: safeJson<string[]>(row.contact_urls_json, []),
      officialProfileUrls: safeJson<string[]>(row.official_profile_urls_json, []),
      publicMessagingUrls: safeJson<string[]>(row.public_messaging_urls_json, []),
      companyContactChannels: safeJson<NonNullable<ProspectCandidate["companyContactChannels"]>>(row.company_contact_channels_json, []),
      productSignals: safeJson<string[]>(row.product_signals_json, []),
      evidenceUrls: safeJson<string[]>(row.evidence_urls_json, []),
      websiteEvidenceStatus: row.website_evidence_status === "verified" || row.website_evidence_status === "static-incomplete"
        ? row.website_evidence_status
        : "unverified",
      websiteEvidenceSource: row.website_evidence_source === "browser-rendered" ? "browser-rendered" : "static-http",
      websiteVerifiedAt: row.website_verified_at || "",
      score: row.score,
      reasons: safeJson<string[]>(row.reasons_json, []),
      fitScore: row.fit_score,
      fitTerms: safeJson<string[]>(row.fit_terms_json, []),
      fitMatches: safeJson<string[]>(row.fit_matches_json, []),
      status: row.status,
      discoveredAt: row.first_seen_at,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  private mapProspectOwnerDecision(row: ProspectOwnerDecisionRow): ProspectOwnerDecisionRecord {
    const snapshot = safeJson<ProspectOwnerDecisionRecord["snapshot"]>(row.snapshot_json, {
      schema: "bossai.prospect-owner-decision-snapshot.v1",
      generatedAt: row.decided_at,
      accountReviewStage: row.target_status === "REJECTED" ? "rejected" : "owner-decision",
      prospectStatusBefore: row.previous_status,
      websiteEvidenceStatus: "unverified",
      websiteEvidenceSource: "static-http",
      evidenceCompleted: 0,
      evidenceTotal: 0,
      businessChannelCount: 0,
      linkedTradeRecordCount: 0,
      tradeReviewPriority: null,
      candidateScore: 0,
      intelligenceManagerTaskId: "",
      intelligenceStatus: "not-started",
      salesManagerTaskId: "",
      salesStatus: "not-started",
      blockers: [],
    });
    return {
      schema: "bossai.prospect-owner-decision.v1",
      id: row.id,
      prospectId: row.prospect_id,
      decision: row.decision,
      reasonCode: row.reason_code,
      note: row.note,
      actorType: "owner-admin",
      previousStatus: row.previous_status,
      targetStatus: row.target_status,
      decidedAt: row.decided_at,
      snapshot,
      truthBoundary: {
        decisionIsSalesProbability: false,
        purchaseIntentInferred: false,
        closeProbabilityInferred: false,
        nextPurchaseDatePredicted: false,
        crmRecordCreated: false,
        outreachExecuted: false,
      },
    };
  }

  private mapProspectBrowserEvidenceRequest(row: ProspectBrowserEvidenceRequestRow): ProspectBrowserEvidenceRequest {
    const evidenceContext = safeJson<SourceContext | null>(row.evidence_context_json, null);
    return {
      schema: "bossai.prospect-browser-evidence-request.v1",
      id: row.id,
      prospectId: row.prospect_id,
      targetUrl: row.target_url,
      status: row.status,
      requestedAt: row.requested_at,
      updatedAt: row.updated_at,
      submittedAt: row.submitted_at || "",
      sourceKind: row.source_kind === "owner-controlled-browser" ? "owner-controlled-browser" : "",
      sourceReference: row.source_reference || "",
      pageUrl: row.page_url || "",
      ...(evidenceContext && "schema" in evidenceContext && evidenceContext.schema === "bossai.business-website-context.v1"
        ? { evidenceContext }
        : {}),
    };
  }

  private mapTradeRecord(row: TradeRecordRow): TradeRecord {
    return {
      id: row.id,
      fingerprint: row.fingerprint,
      companyName: row.company_name,
      role: row.role,
      country: row.country,
      productDescription: row.product_description,
      hsCode: row.hs_code,
      tradeDate: row.trade_date,
      quantity: row.quantity,
      amount: row.amount,
      currency: row.currency,
      websiteUrl: row.website_url,
      sourceLabel: row.source_label,
      sourceRow: row.source_row,
      importedAt: row.imported_at,
    };
  }

  private mapProspectOutcomeReview(row: ProspectOutcomeReviewRow): ProspectOutcomeReviewRecord {
    return {
      schema: "bossai.prospect-outcome-review.v1",
      id: row.id,
      prospectId: row.prospect_id,
      salesManagerTaskId: row.sales_manager_task_id,
      ownerDecisionId: row.owner_decision_id,
      decision: row.decision,
      evidenceState: row.evidence_state,
      summary: row.summary,
      businessValueAmount: row.business_value_amount,
      businessValueCurrency: row.business_value_currency,
      businessValueBasis: row.business_value_basis,
      actorType: "owner-admin",
      reviewedAt: row.reviewed_at,
      snapshot: safeJson<ProspectOutcomeReviewRecord["snapshot"]>(row.snapshot_json, {
        schema: "bossai.prospect-outcome-review-snapshot.v1",
        generatedAt: row.reviewed_at,
        intelligenceManagerTaskId: "",
        ownerDecisionId: row.owner_decision_id,
        salesManagerTaskId: row.sales_manager_task_id,
        salesDisposition: "unstructured",
        salesReportedWebsiteEvidenceStatus: "not-structured",
        qualificationStates: {
          "real-need": "not-structured",
          "buyer-authority": "not-structured",
          timing: "not-structured",
          budget: "not-structured",
        },
        employeeReportedValueClaim: "",
      }),
      truthBoundary: {
        salesCompletionIsRevenue: false,
        qualificationIsRevenue: false,
        employeeReportedValueIsConfirmed: false,
        businessValueAutoEstimated: false,
        purchaseIntentInferred: false,
        closeProbabilityInferred: false,
        nextPurchaseDatePredicted: false,
        crmRecordCreated: false,
        outreachExecuted: false,
      },
    };
  }

  private mapBossAiDelegation(row: BossAiDelegationRow): BossAiDelegation {
    return {
      id: row.id,
      sourceType: row.source_type,
      sourceRecordId: row.source_record_id,
      sourceOperationId: row.source_operation_id,
      bossaiRunId: row.bossai_run_id,
      bossaiAgentId: row.bossai_agent_id,
      status: row.status,
      reviewStatus: row.review_status,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      resultImportedAt: row.result_imported_at,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      ownerDecisionId: row.owner_decision_id ?? "",
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
    const sourceContext = safeJson<SourceContext | Record<string, never>>(row.source_context_json, {});
    const isRedditContext = "schema" in sourceContext && sourceContext.schema === "bossai.reddit-community-context.v1";
    const isWebsiteContext = "schema" in sourceContext && sourceContext.schema === "bossai.business-website-context.v1";
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
      ...(row.community ? { community: row.community } : {}),
      ...(isRedditContext ? { sourceContext: sourceContext as Extract<SourceContext, { schema: "bossai.reddit-community-context.v1" }> } : {}),
      ...(isWebsiteContext ? { websiteContext: sourceContext as Extract<SourceContext, { schema: "bossai.business-website-context.v1" }> } : {}),
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
      brief: briefFromJson(row.brief_json),
      markdownEnglish: row.markdown_en,
      briefEnglish: briefFromJson(row.brief_en_json),
    };
  }
}

function briefFromJson(value: string): DailyBrief | null {
  const parsed = safeJson<DailyBrief | Record<string, never>>(value, {});
  return "counts" in parsed && "mustRead" in parsed && "quickScan" in parsed
    ? parsed as DailyBrief
    : null;
}

function tradeRecordFilterSql(filters: TradeRecordFilters): { clause: string; params: Array<string | number> } {
  const where: string[] = [];
  const params: Array<string | number> = [];
  const query = filters.query?.trim().slice(0, 160) || "";
  if (query) {
    const pattern = `%${escapeSqlLike(query.toLocaleLowerCase("en-US"))}%`;
    where.push(`(
      lower(company_name) LIKE ? ESCAPE '\\'
      OR lower(product_description) LIKE ? ESCAPE '\\'
      OR lower(source_label) LIKE ? ESCAPE '\\'
    )`);
    params.push(pattern, pattern, pattern);
  }
  const country = filters.country?.trim().slice(0, 120) || "";
  if (country) {
    where.push("lower(country) = ?");
    params.push(country.toLocaleLowerCase("en-US"));
  }
  const hsCode = filters.hsCode?.trim().replace(/\s+/gu, "").slice(0, 40) || "";
  if (hsCode) {
    where.push("hs_code LIKE ? ESCAPE '\\'");
    params.push(`${escapeSqlLike(hsCode)}%`);
  }
  if (filters.role && ["buyer", "importer", "supplier", "exporter", "unknown"].includes(filters.role)) {
    where.push("role = ?");
    params.push(filters.role);
  }
  if (filters.dateFrom) {
    where.push("trade_date >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push("trade_date <= ?");
    params.push(filters.dateTo);
  }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

function splitSqlList(value: string | null, max: number): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function normalizeTradeWebsiteOrigins(values: readonly string[]): string[] {
  const origins = new Set<string>();
  for (const value of values) {
    try {
      const url = new URL(value);
      if (!/^https?:$/u.test(url.protocol)) continue;
      origins.add(new URL("/", url.origin).href);
    } catch {
      // Invalid imported website values are already excluded during import; ignore legacy rows defensively.
    }
    if (origins.size >= 20) break;
  }
  return [...origins];
}

function escapeSqlLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
