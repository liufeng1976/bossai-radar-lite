import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BossAiOsClient,
  BossAiOsClientError,
  type BossAiAgentInstallation,
} from "./bossai-os-client.js";
import {
  collectWebsiteOutcome,
  discoverProspectMapCandidates,
  discoverProspectSearchCandidates,
  mergeProspectCandidates,
} from "./collectors.js";
import { planProspectQueries } from "./ai.js";
import { config, publicConfig } from "./config.js";
import { buildProspectAccountReview } from "./account-review.js";
import { buildProspectOwnerReviewQueue } from "./owner-review-queue.js";
import {
  buildProspectOutcomeAttribution,
  buildProspectOutcomePortfolioSummary,
  buildProspectOutcomeReviewSnapshot,
  parseProspectOutcomeReviewInput,
  ProspectOutcomeReviewValidationError,
} from "./outcome-attribution.js";
import { buildProspectOutcomeLearning, buildProspectOutcomeLearningDrilldown } from "./outcome-learning.js";
import { buildProspectSalesAuthorizationLineage } from "./sales-authorization.js";
import { buildProspectSalesHandoffBrief } from "./sales-handoff.js";
import { buildProspectCrmHandoffProposal } from "./prospect-crm-handoff.js";
import { importIntelligenceEvidenceProposal } from "./intelligence-evidence-import.js";
import { buildBossAiOutcomeProjection, BossAiOutcomeProjectionError } from "./os-outcome-projection.js";
import {
  OwnerBusinessDecisionProjectionError,
  projectBossAiOwnerBusinessDecision,
  projectBossAiOwnerBusinessDecisionV2,
  type ProjectedProspectOwnerDecisionV2,
} from "./owner-business-decision-projection.js";
import {
  buildProspectOwnerDecisionSnapshot,
  parseProspectOwnerDecisionInput,
  ProspectOwnerDecisionValidationError,
} from "./owner-decisions.js";
import { RadarDatabase } from "./database.js";
import {
  applyBrowserRenderedEvidence,
  browserEvidenceCaptureContract,
  ProspectBrowserEvidenceError,
} from "./browser-evidence.js";
import { seedDemoData } from "./demo.js";
import { buildFollowUpQueue, createFollowUpCalendar, createFollowUpDraft, createFollowUpReport } from "./followups.js";
import {
  LeadValidationError,
  normalizeActivityInput,
  normalizeLeadPatch,
  validateLeadInput,
} from "./leads.js";
import { RadarEngine } from "./pipeline.js";
import { enrichProspectCandidates, filterWebsiteVerifiedProspectCandidates } from "./prospects.js";
import { createEnglishReport } from "./report.js";
import { RadarScheduler } from "./scheduler.js";
import { assertSafePublicBinding } from "./security.js";
import { parseTradeRecordImport, tradeRecordsToProspectCandidate, tradeRecordToProspectCandidate } from "./trade-records.js";
import { APP_NAME, APP_SLUG, APP_VERSION, LICENSE_LABEL } from "./version.js";
import type { LeadIntent, LeadPriority, LeadStatus, Opportunity, ProspectCandidate, ProspectOutcomeLearningDimensionKey, ProspectOutcomeLearningOutcomeState, ProspectOwnerDecisionRecord, ProspectStatus, TradeRecord } from "./types.js";
import { loadRadarAgentApiManifest, loadRadarAgentApiOpenApi, radarAgentCapabilities } from "./agent-api.js";

process.env.TZ = config.radar.timeZone;
assertSafePublicBinding(config.host, config.adminApiKey);

const db = new RadarDatabase(config.dataDir);
const bossAiOs = new BossAiOsClient({
  baseUrl: config.bossAiOs.baseUrl,
  apiKey: config.bossAiOs.apiKey,
  jwt: config.bossAiOs.jwt,
  workbenchKey: config.bossAiOs.workbenchKey,
  model: config.bossAiOs.model,
  timeoutMs: config.bossAiOs.timeoutMs,
});
const engine = new RadarEngine(db);
const scheduler = new RadarScheduler(engine);
const app = express();
const leadSubmissionWindows = new Map<string, number[]>();
let prospectSearchRunning = false;
const INTELLIGENCE_AGENT_ID = "bossai-intelligence-agent";
const INTELLIGENCE_AGENT_VERSION = "0.3.0";
const SALES_AGENT_ID = "bossai-sales-agent";
const SALES_AGENT_VERSION = "0.2.0";

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "128kb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.get("/.well-known/bossai-agent-api.json", (_req, res) => {
  res.json(loadRadarAgentApiManifest());
});

app.get("/api/agent/openapi", (_req, res) => {
  res.json(loadRadarAgentApiOpenApi());
});

app.get("/api/agent/capabilities", (_req, res) => {
  res.json(radarAgentCapabilities());
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: APP_SLUG,
    name: APP_NAME,
    version: APP_VERSION,
    license: LICENSE_LABEL,
    time: new Date().toISOString(),
    running: engine.isRunning(),
  });
});

app.get("/api/overview", (_req, res) => {
  res.json({
    version: APP_VERSION,
    stats: db.stats(),
    config: publicConfig(),
    running: engine.isRunning(),
    scheduler: scheduler.status(),
    sourceStatus: engine.sourceStatus(),
    prospectDiscovery: (() => {
      const discovery = engine.prospectDiscoveryStatus();
      return {
        status: discovery.status,
        candidateCount: discovery.candidates.length,
        errorCount: discovery.errors.length,
        durationMs: discovery.durationMs,
        channels: discovery.channels ?? [],
      };
    })(),
    prospectStats: db.prospectStats(),
    tradeRecordStats: db.tradeRecordStats(),
    latestRun: db.listRuns(1)[0] ?? null,
    latestReport: db.latestReport(),
  });
});

app.get("/api/opportunities", (req, res) => {
  res.json({ items: db.listOpportunities(parseLimit(req.query.limit, 50, 200)) });
});

app.get("/api/prospects", (req, res) => {
  const status = parseProspectStatus(req.query.status);
  res.json({ items: db.listProspectCandidates(parseLimit(req.query.limit, 50, 500), status) });
});

app.post("/api/admin/intelligence-evidence-imports", requireLeadAdmin, (req, res) => {
  if (req.body?.confirmation !== "IMPORT REVIEWED INTELLIGENCE EVIDENCE") {
    return res.status(400).json({
      error: "Explicit reviewed-import confirmation is required",
      code: "INTELLIGENCE_EVIDENCE_IMPORT_CONFIRMATION_REQUIRED",
      persistencePerformed: false,
      externalActionsExecuted: false,
    });
  }
  try {
    const receipt = importIntelligenceEvidenceProposal(db, req.body?.proposal, {
      reviewedBy: String(req.body?.reviewedBy ?? ""),
    });
    return res.status(201).json({
      receipt,
      persistencePerformed: receipt.imported.length > 0,
      persistedBy: "bossai-radar-lite",
      deterministicScoringAuthority: "bossai-radar-lite",
      opportunityRebuildExecuted: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    const code = error instanceof Error && /^INTELLIGENCE_EVIDENCE_IMPORT_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "INTELLIGENCE_EVIDENCE_IMPORT_INVALID";
    return res.status(400).json({
      error: "Reviewed Intelligence evidence proposal was rejected by the Radar import boundary",
      code,
      persistencePerformed: false,
      externalActionsExecuted: false,
    });
  }
});

app.get("/api/admin/trade-records", requireLeadAdmin, (req, res) => {
  const filters = {
    query: tradeRecordFilterText(req.query.q, 160),
    country: tradeRecordFilterText(req.query.country, 120),
    hsCode: tradeRecordFilterText(req.query.hs, 40),
    role: parseTradeRecordRole(req.query.role),
    dateFrom: parseIsoDateFilter(req.query.dateFrom),
    dateTo: parseIsoDateFilter(req.query.dateTo),
  };
  const items = db.listTradeRecords(parseLimit(req.query.limit, 100, 500), filters);
  res.json({
    stats: db.tradeRecordStats(),
    resultCount: items.length,
    filters,
    companySummaries: db.summarizeTradeCompanies(12, filters),
    items,
  });
});

app.post(
  "/api/admin/trade-records/preview",
  requireLeadAdmin,
  express.text({ type: ["text/csv", "text/tab-separated-values", "text/plain"], limit: "2mb" }),
  (req, res, next) => {
    try {
      if (typeof req.body !== "string") {
        return res.status(415).json({
          error: "Trade record preview requires CSV, TSV or plain text content",
          code: "TRADE_RECORD_IMPORT_CONTENT_TYPE_INVALID",
        });
      }
      const sourceLabel = tradeRecordSourceLabel(req.headers["x-trade-source-label"]);
      const parsed = parseTradeRecordImport(req.body, sourceLabel);
      const mappedHeaders = new Set(Object.values(parsed.mapping));
      const missingFields = ["country", "productDescription", "hsCode", "tradeDate", "quantity", "amount", "currency", "websiteUrl"]
        .filter((field) => !parsed.mapping[field]);
      const ignoredHeaders = parsed.headers.filter((header) => !mappedHeaders.has(header));
      return res.json({
        headers: parsed.headers,
        mapping: parsed.mapping,
        missingFields,
        ignoredHeaders,
        recordCount: parsed.records.length,
        rejectedRows: parsed.rejectedRows,
        warnings: parsed.warnings,
        preview: parsed.records.slice(0, 5),
        persisted: false,
        prospectsCreated: 0,
        crmRecordsCreated: 0,
        externalActionsExecuted: false,
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("TRADE_RECORD_")) {
        return res.status(400).json({ error: tradeRecordImportErrorMessage(error.message), code: error.message });
      }
      return next(error);
    }
  },
);

app.post(
  "/api/admin/trade-records/import",
  requireLeadAdmin,
  express.text({ type: ["text/csv", "text/tab-separated-values", "text/plain"], limit: "2mb" }),
  (req, res, next) => {
    try {
      if (typeof req.body !== "string") {
        return res.status(415).json({
          error: "Trade record import requires CSV, TSV or plain text content",
          code: "TRADE_RECORD_IMPORT_CONTENT_TYPE_INVALID",
        });
      }
      const sourceLabel = tradeRecordSourceLabel(req.headers["x-trade-source-label"]);
      const parsed = parseTradeRecordImport(req.body, sourceLabel);
      const saved = db.saveTradeRecords(parsed.records);
      return res.json({
        sourceLabel,
        headers: parsed.headers,
        mapping: parsed.mapping,
        parsedCount: parsed.records.length,
        importedCount: saved.imported,
        duplicateCount: saved.duplicates,
        rejectedRows: parsed.rejectedRows,
        warnings: parsed.warnings,
        stats: db.tradeRecordStats(),
        preview: parsed.records.slice(0, 20),
        prospectsCreated: 0,
        crmRecordsCreated: 0,
        externalActionsExecuted: false,
      });
    } catch (error) {
      if (error instanceof Error && /^TRADE_RECORD_IMPORT_/u.test(error.message)) {
        return res.status(400).json({ error: tradeRecordImportErrorMessage(error.message), code: error.message });
      }
      return next(error);
    }
  },
);

app.post("/api/admin/trade-records/:id/resolve-website", requireLeadAdmin, async (req, res, next) => {
  try {
    const record = db.getTradeRecord(routeParam(req.params.id));
    if (!record) return res.status(404).json({ error: "Trade record not found", code: "TRADE_RECORD_NOT_FOUND" });
    const webConfigured = config.radar.prospectSearchProvider === "brave" && Boolean(config.braveSearchApiKey);
    const mapConfigured = config.radar.prospectMapProvider === "google_places" && Boolean(config.googlePlacesApiKey);
    if (!webConfigured && !mapConfigured) {
      return res.status(503).json({
        error: "Company website resolution requires Brave Web Search and/or Google Places to be configured on the server",
        code: "TRADE_RECORD_WEBSITE_RESOLVER_NOT_CONFIGURED",
        prospectsCreated: 0,
      });
    }
    const query = [record.companyName, record.country, record.productDescription]
      .filter(Boolean).join(" ").replace(/\s+/gu, " ").trim().slice(0, 400);
    const [webDiscovery, mapDiscovery] = await Promise.all([
      webConfigured
        ? discoverProspectSearchCandidates([query])
        : Promise.resolve({ status: "skipped" as const, candidates: [], errors: [], durationMs: 0 }),
      mapConfigured
        ? discoverProspectMapCandidates([query])
        : Promise.resolve({ status: "skipped" as const, candidates: [], errors: [], durationMs: 0 }),
    ]);
    const attempted = [webDiscovery, mapDiscovery].filter((item) => item.status !== "skipped");
    const errors = [
      ...webDiscovery.errors.map((error) => `web: ${error}`),
      ...mapDiscovery.errors.map((error) => `maps: ${error}`),
    ];
    if (attempted.length > 0 && attempted.every((item) => item.status === "failed")) {
      return res.status(502).json({ error: "Company website resolution failed", code: "TRADE_RECORD_WEBSITE_RESOLUTION_FAILED", errors });
    }
    const candidates = mergeProspectCandidates([...webDiscovery.candidates, ...mapDiscovery.candidates], 8);
    const websiteOutcome = await collectWebsiteOutcome(candidates.map((candidate) => candidate.websiteUrl));
    const verifiedCandidates = filterWebsiteVerifiedProspectCandidates(candidates, websiteOutcome.items);
    const enriched = enrichProspectCandidates(verifiedCandidates, websiteOutcome.items);
    return res.json({
      tradeRecordId: record.id,
      query,
      suggestions: enriched.slice(0, 8),
      errors,
      websiteVerificationStatus: websiteOutcome.status,
      prospectsCreated: 0,
      crmRecordsCreated: 0,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/trade-companies/resolve-website", requireLeadAdmin, async (req, res, next) => {
  try {
    const companyName = tradeRecordFilterText(req.body?.companyName, 240);
    if (!companyName) {
      return res.status(400).json({ error: "companyName is required", code: "TRADE_COMPANY_NAME_REQUIRED" });
    }
    const allCompanyRecords = db.listTradeRecordsByCompany(companyName, undefined, 100);
    if (!allCompanyRecords.length) {
      return res.status(404).json({ error: "Trade company not found", code: "TRADE_COMPANY_NOT_FOUND" });
    }
    const countries = [...new Set(allCompanyRecords.map((record) => record.country.trim()))];
    const requestedCountry = tradeRecordCountrySelector(req.body?.country);
    if (requestedCountry === undefined && countries.length > 1) {
      return res.status(409).json({
        error: "The same company name exists in multiple countries. Choose a country before website resolution.",
        code: "TRADE_COMPANY_COUNTRY_REQUIRED",
        countries,
      });
    }
    const records = requestedCountry !== undefined
      ? db.listTradeRecordsByCompany(companyName, requestedCountry, 100)
      : allCompanyRecords;
    if (!records.length) {
      return res.status(404).json({ error: "Trade company/country record set not found", code: "TRADE_COMPANY_NOT_FOUND" });
    }

    const knownWebsiteOrigins = tradeRecordWebsiteOrigins(records);
    const webConfigured = config.radar.prospectSearchProvider === "brave" && Boolean(config.braveSearchApiKey);
    const mapConfigured = config.radar.prospectMapProvider === "google_places" && Boolean(config.googlePlacesApiKey);
    if (!knownWebsiteOrigins.length && !webConfigured && !mapConfigured) {
      return res.status(503).json({
        error: "Company website resolution requires historical website evidence and/or a configured Web/Maps provider",
        code: "TRADE_COMPANY_WEBSITE_RESOLVER_NOT_CONFIGURED",
        prospectsCreated: 0,
      });
    }

    const productTerms = [...new Set(records.map((record) => record.productDescription).filter(Boolean))].slice(0, 3);
    const selectedCountry = requestedCountry ?? countries[0] ?? "";
    const query = [companyName, selectedCountry, ...productTerms]
      .filter(Boolean).join(" ").replace(/\s+/gu, " ").trim().slice(0, 400);
    const [webDiscovery, mapDiscovery] = await Promise.all([
      webConfigured
        ? discoverProspectSearchCandidates([query])
        : Promise.resolve({ status: "skipped" as const, candidates: [], errors: [], durationMs: 0 }),
      mapConfigured
        ? discoverProspectMapCandidates([query])
        : Promise.resolve({ status: "skipped" as const, candidates: [], errors: [], durationMs: 0 }),
    ]);
    const historicalCandidates = knownWebsiteOrigins.map((websiteUrl) => tradeRecordsToProspectCandidate(records, websiteUrl));
    const candidates = mergeProspectCandidates([
      ...historicalCandidates,
      ...webDiscovery.candidates,
      ...mapDiscovery.candidates,
    ], 12);
    const websiteOutcome = await collectWebsiteOutcome(candidates.map((candidate) => candidate.websiteUrl));
    const verifiedCandidates = filterWebsiteVerifiedProspectCandidates(candidates, websiteOutcome.items);
    const enriched = enrichProspectCandidates(verifiedCandidates, websiteOutcome.items);
    const errors = [
      ...webDiscovery.errors.map((error) => `web: ${error}`),
      ...mapDiscovery.errors.map((error) => `maps: ${error}`),
      ...(websiteOutcome.error ? [`website: ${websiteOutcome.error}`] : []),
    ];
    return res.json({
      companyName,
      country: selectedCountry,
      query,
      historicalWebsiteCount: knownWebsiteOrigins.length,
      suggestions: enriched.slice(0, 8),
      errors,
      websiteVerificationStatus: websiteOutcome.status,
      prospectsCreated: 0,
      crmRecordsCreated: 0,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/trade-companies/prospect", requireLeadAdmin, async (req, res, next) => {
  try {
    const companyName = tradeRecordFilterText(req.body?.companyName, 240);
    if (!companyName) {
      return res.status(400).json({ error: "companyName is required", code: "TRADE_COMPANY_NAME_REQUIRED" });
    }
    const allCompanyRecords = db.listTradeRecordsByCompany(companyName, undefined, 100);
    if (!allCompanyRecords.length) {
      return res.status(404).json({ error: "Trade company not found", code: "TRADE_COMPANY_NOT_FOUND" });
    }
    const countries = [...new Set(allCompanyRecords.map((record) => record.country.trim()))];
    const requestedCountry = tradeRecordCountrySelector(req.body?.country);
    if (requestedCountry === undefined && countries.length > 1) {
      return res.status(409).json({
        error: "The same company name exists in multiple countries. Choose a country before company-level prospect creation.",
        code: "TRADE_COMPANY_COUNTRY_REQUIRED",
        countries,
        prospectCreated: false,
      });
    }
    const records = requestedCountry !== undefined
      ? db.listTradeRecordsByCompany(companyName, requestedCountry, 100)
      : allCompanyRecords;
    if (!records.length) {
      return res.status(404).json({ error: "Trade company/country record set not found", code: "TRADE_COMPANY_NOT_FOUND" });
    }

    const knownWebsiteOrigins = tradeRecordWebsiteOrigins(records);
    const explicitWebsite = typeof req.body?.websiteUrl === "string" && req.body.websiteUrl.trim()
      ? selectedTradeRecordWebsite(req.body.websiteUrl, "")
      : "";
    if (!explicitWebsite && knownWebsiteOrigins.length === 0) {
      return res.status(409).json({
        error: "This trade company has no verified website field. Resolve the company website explicitly before creating a prospect candidate.",
        code: "TRADE_COMPANY_WEBSITE_REQUIRED",
        prospectCreated: false,
      });
    }
    if (!explicitWebsite && knownWebsiteOrigins.length > 1) {
      return res.status(409).json({
        error: "Multiple company website domains are present in the historical records. Choose the website explicitly before promotion.",
        code: "TRADE_COMPANY_WEBSITE_SELECTION_REQUIRED",
        websiteOptions: knownWebsiteOrigins,
        prospectCreated: false,
      });
    }
    const selectedWebsite = explicitWebsite || knownWebsiteOrigins[0] || "";
    const representative = records[0];
    if (!representative || !selectedWebsite) {
      return res.status(409).json({ error: "Trade company evidence is incomplete", code: "TRADE_COMPANY_EVIDENCE_INCOMPLETE" });
    }

    const groupedCandidate = tradeRecordsToProspectCandidate(records, selectedWebsite);
    const websiteOutcome = await collectWebsiteOutcome([groupedCandidate.websiteUrl]);
    if (websiteOutcome.items.length === 0) {
      return res.status(409).json({
        error: "The trade-company website could not be verified by the bounded public website collector",
        code: "TRADE_COMPANY_WEBSITE_VERIFICATION_FAILED",
        websiteVerificationStatus: websiteOutcome.status,
        websiteVerificationError: websiteOutcome.error ?? null,
        prospectCreated: false,
      });
    }
    const enriched = enrichProspectCandidates([groupedCandidate], websiteOutcome.items)[0] ?? groupedCandidate;
    const existing = db.getProspectCandidateByDomain(groupedCandidate.domain);
    const merged = mergeProspectCandidates(existing ? [existing, enriched] : [enriched], 1)[0] ?? enriched;
    const prospect = db.saveProspectCandidate(merged);
    for (const record of records) db.linkProspectTradeEvidence(prospect.id, record.id);
    return res.json({
      companyName,
      country: requestedCountry ?? countries[0] ?? "",
      linkedTradeRecordCount: records.length,
      prospect,
      websiteVerificationStatus: websiteOutcome.status,
      requiresIntelligenceReview: true,
      crmRecordsCreated: 0,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/trade-records/:id/prospect", requireLeadAdmin, async (req, res, next) => {
  try {
    const record = db.getTradeRecord(routeParam(req.params.id));
    if (!record) return res.status(404).json({ error: "Trade record not found", code: "TRADE_RECORD_NOT_FOUND" });
    const selectedWebsite = selectedTradeRecordWebsite(req.body?.websiteUrl, record.websiteUrl);
    if (!selectedWebsite) {
      return res.status(409).json({
        error: "This trade record has no verified website field. Resolve the company website explicitly before creating a prospect candidate.",
        code: "TRADE_RECORD_WEBSITE_REQUIRED",
        prospectCreated: false,
      });
    }

    const baseCandidate = tradeRecordToProspectCandidate({ ...record, websiteUrl: selectedWebsite });
    const websiteOutcome = await collectWebsiteOutcome([baseCandidate.websiteUrl]);
    if (websiteOutcome.items.length === 0) {
      return res.status(409).json({
        error: "The trade-record website could not be verified by the bounded public website collector",
        code: "TRADE_RECORD_WEBSITE_VERIFICATION_FAILED",
        websiteVerificationStatus: websiteOutcome.status,
        websiteVerificationError: websiteOutcome.error ?? null,
        prospectCreated: false,
      });
    }

    const enriched = enrichProspectCandidates([baseCandidate], websiteOutcome.items)[0] ?? baseCandidate;
    const existing = db.getProspectCandidateByDomain(baseCandidate.domain);
    const merged = mergeProspectCandidates(existing ? [existing, enriched] : [enriched], 1)[0] ?? enriched;
    const prospect = db.saveProspectCandidate(merged);
    db.linkProspectTradeEvidence(prospect.id, record.id);
    return res.json({
      tradeRecordId: record.id,
      prospect,
      websiteVerificationStatus: websiteOutcome.status,
      requiresIntelligenceReview: true,
      crmRecordsCreated: 0,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/prospects/plan", requireLeadAdmin, async (req, res, next) => {
  try {
    const goal = prospectSearchQuery(req.body?.query);
    const plan = await planProspectQueries(goal);
    return res.json({
      goal,
      ...plan,
      automaticCollectionStarted: false,
      crmRecordsCreated: 0,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/prospects/discover", requireLeadAdmin, async (req, res, next) => {
  try {
    if (engine.isRunning()) {
      return res.status(409).json({
        error: "Wait for the current Radar scan to finish before starting prospect search",
        code: "PROSPECT_DISCOVERY_SCAN_RUNNING",
      });
    }
    const webConfigured = config.radar.prospectSearchProvider === "brave" && Boolean(config.braveSearchApiKey);
    const mapConfigured = config.radar.prospectMapProvider === "google_places" && Boolean(config.googlePlacesApiKey);
    if (!webConfigured && !mapConfigured) {
      return res.status(503).json({
        error: "Prospect discovery is not configured. Configure Brave Web Search and/or Google Places on the server.",
        code: "PROSPECT_SEARCH_NOT_CONFIGURED",
      });
    }
    const query = prospectSearchQuery(req.body?.query);
    if (prospectSearchRunning) {
      return res.status(409).json({
        error: "A prospect search is already running",
        code: "PROSPECT_SEARCH_ALREADY_RUNNING",
      });
    }
    prospectSearchRunning = true;
    try {
      const [webDiscovery, mapDiscovery] = await Promise.all([
        webConfigured
          ? discoverProspectSearchCandidates([query])
          : Promise.resolve({ status: "skipped" as const, candidates: [], errors: [], durationMs: 0 }),
        mapConfigured
          ? discoverProspectMapCandidates([query])
          : Promise.resolve({ status: "skipped" as const, candidates: [], errors: [], durationMs: 0 }),
      ]);
      const attempted = [webDiscovery, mapDiscovery].filter((item) => item.status !== "skipped");
      const providers = [webConfigured ? "brave" : null, mapConfigured ? "google_places" : null]
        .filter((item): item is string => Boolean(item));
      const errors = [
        ...webDiscovery.errors.map((error) => `web: ${error}`),
        ...mapDiscovery.errors.map((error) => `maps: ${error}`),
      ];
      if (attempted.length > 0 && attempted.every((item) => item.status === "failed")) {
        return res.status(502).json({
          error: "Prospect discovery failed",
          code: "PROSPECT_SEARCH_FAILED",
          errors,
        });
      }

      const discoveredCandidates = mergeProspectCandidates(
        [...webDiscovery.candidates, ...mapDiscovery.candidates],
        500,
      );
      const verifyCandidates = discoveredCandidates.slice(0, config.radar.prospectVerifyMaxWebsitesPerScan);
      const websiteOutcome = await collectWebsiteOutcome(verifyCandidates.map((candidate) => candidate.websiteUrl));
      const enriched = enrichProspectCandidates(verifyCandidates, websiteOutcome.items);
      const enrichedByDomain = new Map(enriched.map((candidate) => [candidate.domain, candidate]));
      const saved = discoveredCandidates.map((candidate) => db.saveProspectCandidate(enrichedByDomain.get(candidate.domain) ?? candidate));
      const discoveryStatus = attempted.some((item) => item.status === "failed" || item.status === "partial") ? "partial" : "success";
      return res.json({
        query,
        provider: providers.join("+"),
        providers,
        discoveryStatus,
        discoveryDurationMs: Math.max(webDiscovery.durationMs, mapDiscovery.durationMs),
        websiteVerificationStatus: websiteOutcome.status,
        websiteVerificationDurationMs: websiteOutcome.durationMs,
        websiteVerificationError: websiteOutcome.error ?? null,
        discoveredCount: discoveredCandidates.length,
        verifiedWebsiteCount: new Set(websiteOutcome.items.map((item) => item.websiteContext?.rootUrl).filter(Boolean)).size,
        items: saved,
        errors,
        crmRecordsCreated: 0,
        externalActionsExecuted: false,
      });
    } finally {
      prospectSearchRunning = false;
    }
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/prospects/:id/verify-website", requireLeadAdmin, async (req, res, next) => {
  try {
    const prospect = db.getProspectCandidate(routeParam(req.params.id));
    if (!prospect) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    const websiteOutcome = await collectWebsiteOutcome([prospect.websiteUrl]);
    const verifiedCandidates = filterWebsiteVerifiedProspectCandidates([prospect], websiteOutcome.items);
    if (!verifiedCandidates.length) {
      return res.status(409).json({
        error: "The candidate website could not be verified by the bounded public website collector",
        code: "PROSPECT_WEBSITE_VERIFICATION_FAILED",
        websiteEvidenceStatus: prospect.websiteEvidenceStatus ?? "unverified",
        websiteVerificationStatus: websiteOutcome.status,
        websiteVerificationError: websiteOutcome.error ?? null,
        crmRecordCreated: false,
        externalActionsExecuted: false,
      });
    }
    const enriched = enrichProspectCandidates(verifiedCandidates, websiteOutcome.items)[0] ?? prospect;
    const saved = db.saveProspectCandidate(enriched);
    return res.json({
      prospect: saved,
      websiteEvidenceStatus: saved.websiteEvidenceStatus ?? "unverified",
      websiteVerificationStatus: websiteOutcome.status,
      crmRecordCreated: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/prospects/:id/account-review", requireLeadAdmin, (req, res) => {
  const id = routeParam(req.params.id);
  const prospect = db.getProspectCandidate(id);
  if (!prospect) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
  const review = buildProspectAccountReview({
    prospect,
    tradeRecords: db.listTradeRecordsForProspect(id, 20),
    intelligenceDelegation: db.getLatestBossAiDelegationForSource("prospect", id),
    salesDelegation: db.getLatestBossAiDelegationForSource("prospect-sales", id),
    latestBrowserRequest: db.getLatestProspectBrowserEvidenceRequestForProspect(id),
    ownerDecisionJournal: db.listProspectOwnerDecisions(id, 20),
    bossAiOwnerDecisionV2: db.getProspectOwnerAuthorityProjectionV2(id),
    outcomeReviewJournal: db.listProspectOutcomeReviews(id, 20),
  });
  return res.json({
    review,
    crmRecordCreated: false,
    externalActionsExecuted: false,
  });
});

app.get("/api/admin/prospects/:id/sales-handoff-brief", requireLeadAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const prospect = db.getProspectCandidate(id);
    if (!prospect) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    const salesDelegation = db.getLatestBossAiDelegationForSource("prospect-sales", id);
    if (!salesDelegation) {
      return res.status(404).json({
        error: "Sales qualification Manager task not found for this prospect",
        code: "PROSPECT_SALES_QUALIFICATION_NOT_FOUND",
      });
    }
    const run = await bossAiOs.getRun(salesDelegation.bossaiRunId);
    db.updateBossAiDelegationState(run.id, {
      status: run.status,
      reviewStatus: run.reviewStatus,
      updatedAt: run.updatedAt,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
    });
    if (run.status !== "completed") {
      return res.status(409).json({
        error: "Sales qualification Manager task is not completed yet",
        code: "PROSPECT_SALES_QUALIFICATION_NOT_COMPLETED",
        managerTaskId: run.id,
        managerStatus: run.status,
        managerReviewStatus: run.reviewStatus,
      });
    }
    const brief = buildProspectSalesHandoffBrief({
      prospect,
      run,
      ownerDecisionJournal: db.listProspectOwnerDecisions(id, 20),
      ownerDecisionId: salesDelegation.ownerDecisionId || "",
      bossAiOwnerDecisionV2: db.getProspectOwnerAuthorityProjectionV2(id),
    });
    return res.json({
      brief,
      briefPersisted: false,
      sourceAuthority: "bossai-manager",
      crmRecordCreated: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/prospects/:id/crm-handoff-proposal", requireLeadAdmin, async (req, res, next) => {
  try {
    const resolved = await loadProspectOutcomeAttribution(routeParam(req.params.id));
    const proposal = buildProspectCrmHandoffProposal({
      prospect: resolved.prospect,
      salesHandoff: resolved.handoff,
      intelligenceManagerTaskId: resolved.intelligenceDelegation?.bossaiRunId ?? "",
      salesManagerTaskId: resolved.salesDelegation?.bossaiRunId ?? "",
    });
    return res.json({
      proposal,
      crmRecordCreated: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/prospects/:id/outcome-reviews", requireLeadAdmin, (req, res) => {
  const id = routeParam(req.params.id);
  if (!db.getProspectCandidate(id)) {
    return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
  }
  return res.json({
    schema: "bossai.prospect-outcome-review-journal.v1",
    prospectId: id,
    items: db.listProspectOutcomeReviews(id, parseLimit(req.query.limit, 20, 100)),
    crmRecordCreated: false,
    externalActionsExecuted: false,
  });
});

app.post("/api/admin/prospects/:id/owner-decision-projection", requireLeadAdmin, (req, res, next) => {
  try {
    const prospect = db.getProspectCandidate(routeParam(req.params.id));
    if (!prospect) {
      return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    }
    const projection = projectBossAiOwnerBusinessDecision(req.body?.decision, prospect.id);
    return res.json({
      projection,
      radarOwnerDecisionJournalMutationPerformed: false,
      salesTaskCreated: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/prospects/:id/os-outcome-projection", requireLeadAdmin, async (req, res, next) => {
  try {
    const resolved = await loadProspectOutcomeAttribution(routeParam(req.params.id));
    const projection = buildBossAiOutcomeProjection({
      prospectId: resolved.prospect.id,
      salesManagerTaskId: resolved.salesDelegation?.bossaiRunId ?? "",
      salesRun: resolved.salesRun,
    });
    return res.json({
      projection,
      radarOutcomeJournalMutationPerformed: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/prospects/:id/outcome-attribution", requireLeadAdmin, async (req, res, next) => {
  try {
    const resolved = await loadProspectOutcomeAttribution(routeParam(req.params.id));
    return res.json({
      attribution: resolved.attribution,
      crmRecordCreated: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/prospects/:id/outcome-review", requireLeadAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const current = db.getProspectCandidate(id);
    if (!current) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    const cachedOsDecision = db.getProspectOwnerAuthorityProjectionV2(id);
    const modernOwnerAuthority = cachedOsDecision || (bossAiOs.workbenchConfigured() && await bossAiOs.ownerBusinessDecisionV2Supported());
    if (modernOwnerAuthority) {
      return res.status(409).json({
        error: "This prospect uses BossAI OS/Work owner authority; review the Sales result and business outcome in BossAI Work instead of writing the legacy Radar outcome journal",
        code: "PROSPECT_OUTCOME_AUTHORITY_IS_BOSSAI_OS",
        ownerDecisionSurface: "bossai-work",
        outcomeAuthority: "bossai-os",
        radarOutcomeJournalWriteAuthorized: false,
        historicalRadarOutcomeReviewsRemainReadable: true,
      });
    }
    const input = parseProspectOutcomeReviewInput(req.body);
    const resolved = await loadProspectOutcomeAttribution(id);
    if (!resolved.salesDelegation || resolved.salesDelegation.status !== "completed" || !resolved.handoff) {
      return res.status(409).json({
        error: "A completed authoritative Sales qualification result is required before an owner outcome review",
        code: "PROSPECT_OUTCOME_SALES_RESULT_REQUIRED",
        outcomeAttribution: resolved.attribution,
      });
    }
    if (resolved.lineage.status !== "sales-bound"
      || !resolved.lineage.salesTaskBoundToApproval
      || !resolved.lineage.ownerDecisionId
      || resolved.lineage.salesManagerTaskId !== resolved.salesDelegation.bossaiRunId) {
      return res.status(409).json({
        error: "Outcome review requires a current Sales task bound to the exact owner authorization lineage",
        code: "PROSPECT_OUTCOME_AUTHORIZATION_LINEAGE_REQUIRED",
        salesAuthorization: resolved.lineage,
      });
    }
    const review = db.recordProspectOutcomeReview({
      prospectId: resolved.prospect.id,
      salesManagerTaskId: resolved.salesDelegation.bossaiRunId,
      ownerDecisionId: resolved.lineage.ownerDecisionId,
      decision: input.decision,
      evidenceState: input.evidenceState,
      summary: input.summary,
      businessValueAmount: input.businessValueAmount,
      businessValueCurrency: input.businessValueCurrency,
      snapshot: buildProspectOutcomeReviewSnapshot({
        lineage: resolved.lineage,
        handoff: resolved.handoff,
      }),
    });
    if (!review) {
      return res.status(409).json({
        error: "The current Sales task or owner authorization changed while the outcome review was being recorded; reload Account Review and decide again",
        code: "PROSPECT_OUTCOME_REVIEW_STALE",
      });
    }
    const attribution = buildProspectOutcomeAttribution({
      prospectId: resolved.prospect.id,
      lineage: resolved.lineage,
      handoff: resolved.handoff,
      reviewJournal: db.listProspectOutcomeReviews(resolved.prospect.id, 20),
    });
    return res.json({
      review,
      attribution,
      businessValueAutoEstimated: false,
      crmRecordCreated: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/prospects/outcome-summary", requireLeadAdmin, (_req, res) => {
  const summary = buildProspectOutcomePortfolioSummary(db.listProspectCandidates(500).map((prospect) => {
    const intelligenceDelegation = db.getLatestBossAiDelegationForSource("prospect", prospect.id);
    const salesDelegation = db.getLatestBossAiDelegationForSource("prospect-sales", prospect.id);
    const lineage = buildProspectSalesAuthorizationLineage({
      prospect,
      intelligenceDelegation,
      salesDelegation,
      ownerDecisionJournal: db.listProspectOwnerDecisions(prospect.id, 20),
      bossAiOwnerDecisionV2: db.getProspectOwnerAuthorityProjectionV2(prospect.id),
    });
    return {
      salesDelegation,
      lineage,
      reviewJournal: db.listProspectOutcomeReviews(prospect.id, 20),
    };
  }));
  return res.json({
    summary,
    crmRecordCreated: false,
    externalActionsExecuted: false,
  });
});

app.get("/api/admin/prospects/outcome-learning", requireLeadAdmin, (_req, res) => {
  const learning = buildProspectOutcomeLearning(db.listProspectCandidates(500).map((prospect) => {
    const intelligenceDelegation = db.getLatestBossAiDelegationForSource("prospect", prospect.id);
    const salesDelegation = db.getLatestBossAiDelegationForSource("prospect-sales", prospect.id);
    const lineage = buildProspectSalesAuthorizationLineage({
      prospect,
      intelligenceDelegation,
      salesDelegation,
      ownerDecisionJournal: db.listProspectOwnerDecisions(prospect.id, 20),
      bossAiOwnerDecisionV2: db.getProspectOwnerAuthorityProjectionV2(prospect.id),
    });
    return {
      prospect,
      salesDelegation,
      lineage,
      reviewJournal: db.listProspectOutcomeReviews(prospect.id, 20),
    };
  }));
  return res.json({
    learning,
    businessValueAutoEstimated: false,
    crmRecordCreated: false,
    externalActionsExecuted: false,
    managerTasksCreated: 0,
    modelsCalled: 0,
  });
});

app.get("/api/admin/prospects/outcome-learning/drilldown", requireLeadAdmin, (req, res) => {
  const rawDimension = typeof req.query.dimension === "string" ? req.query.dimension.trim() : "";
  const dimensions: ProspectOutcomeLearningDimensionKey[] = [
    "discovery-source",
    "website-evidence-source",
    "business-channel-role",
    "icp-lexical-coverage",
  ];
  if (!dimensions.includes(rawDimension as ProspectOutcomeLearningDimensionKey)) {
    return res.status(400).json({ error: "A valid Outcome Learning dimension is required", code: "OUTCOME_LEARNING_DIMENSION_INVALID" });
  }
  const cohortKey = typeof req.query.cohort === "string" ? req.query.cohort.trim() : "";
  if (!cohortKey || cohortKey.length > 160) {
    return res.status(400).json({ error: "A bounded Outcome Learning cohort key is required", code: "OUTCOME_LEARNING_COHORT_INVALID" });
  }
  const rawState = typeof req.query.state === "string" ? req.query.state.trim() : "";
  const outcomeStates: ProspectOutcomeLearningOutcomeState[] = ["confirmed", "no-value", "observing", "awaiting-owner-review"];
  if (rawState && !outcomeStates.includes(rawState as ProspectOutcomeLearningOutcomeState)) {
    return res.status(400).json({ error: "A valid Outcome Learning outcome state is required", code: "OUTCOME_LEARNING_STATE_INVALID" });
  }
  const outcomeStateFilter = rawState ? rawState as ProspectOutcomeLearningOutcomeState : null;
  const inputs = db.listProspectCandidates(500).map((prospect) => {
    const intelligenceDelegation = db.getLatestBossAiDelegationForSource("prospect", prospect.id);
    const salesDelegation = db.getLatestBossAiDelegationForSource("prospect-sales", prospect.id);
    const lineage = buildProspectSalesAuthorizationLineage({
      prospect,
      intelligenceDelegation,
      salesDelegation,
      ownerDecisionJournal: db.listProspectOwnerDecisions(prospect.id, 20),
      bossAiOwnerDecisionV2: db.getProspectOwnerAuthorityProjectionV2(prospect.id),
    });
    return {
      prospect,
      salesDelegation,
      lineage,
      reviewJournal: db.listProspectOutcomeReviews(prospect.id, 20),
    };
  });
  const drilldown = buildProspectOutcomeLearningDrilldown(
    inputs,
    rawDimension as ProspectOutcomeLearningDimensionKey,
    cohortKey,
    Date.now(),
    outcomeStateFilter,
  );
  return res.json({
    drilldown,
    businessValueIncluded: false,
    ownerReviewNoteIncluded: false,
    rankingPerformed: false,
    crmRecordCreated: false,
    externalActionsExecuted: false,
    managerTasksCreated: 0,
    modelsCalled: 0,
  });
});

app.get("/api/admin/prospects/account-review-queue", requireLeadAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
  const rawAttention = typeof req.query.attention === "string" ? req.query.attention.trim() : "";
  const attention = ["decision-required", "execution-exception", "result-review", "action-ready", "waiting", "closed"].includes(rawAttention)
    ? rawAttention
    : "";
  const reviews = db.listProspectCandidates(500).map((prospect) => buildProspectAccountReview({
    prospect,
    tradeRecords: db.listTradeRecordsForProspect(prospect.id, 20),
    intelligenceDelegation: db.getLatestBossAiDelegationForSource("prospect", prospect.id),
    salesDelegation: db.getLatestBossAiDelegationForSource("prospect-sales", prospect.id),
    latestBrowserRequest: db.getLatestProspectBrowserEvidenceRequestForProspect(prospect.id),
    ownerDecisionJournal: db.listProspectOwnerDecisions(prospect.id, 20),
    bossAiOwnerDecisionV2: db.getProspectOwnerAuthorityProjectionV2(prospect.id),
    outcomeReviewJournal: db.listProspectOutcomeReviews(prospect.id, 20),
  }));
  const queue = buildProspectOwnerReviewQueue(reviews);
  const items = (attention ? queue.items.filter((item) => item.attention === attention) : queue.items).slice(0, limit);
  return res.json({
    queue: { ...queue, items },
    filter: { attention: attention || null, limit },
    crmRecordCreated: false,
    externalActionsExecuted: false,
  });
});

app.get("/api/admin/prospects/browser-evidence", requireLeadAdmin, (req, res) => {
  const rawStatus = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const status = ["pending", "completed-upgraded", "completed-incomplete", "rejected"].includes(rawStatus)
    ? rawStatus as "pending" | "completed-upgraded" | "completed-incomplete" | "rejected"
    : undefined;
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
  res.json({
    schema: "bossai.prospect-browser-evidence-queue.v1",
    items: db.listProspectBrowserEvidenceRequests(limit, status),
    browserRuntimeOwnedByRadar: false,
    rawRenderedHtmlPersisted: false,
  });
});

app.post("/api/admin/prospects/:id/browser-evidence/request", requireLeadAdmin, (req, res, next) => {
  try {
    const prospect = db.getProspectCandidate(routeParam(req.params.id));
    if (!prospect) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    const websiteEvidenceStatus = prospect.websiteEvidenceStatus ?? "unverified";
    if (websiteEvidenceStatus !== "static-incomplete") {
      return res.status(409).json({
        error: websiteEvidenceStatus === "unverified"
          ? "Static official-website verification is required before browser evidence can be requested"
          : "Browser-rendered evidence is not required for this prospect",
        code: websiteEvidenceStatus === "unverified"
          ? "PROSPECT_WEBSITE_EVIDENCE_REQUIRED"
          : "PROSPECT_BROWSER_EVIDENCE_NOT_REQUIRED",
        websiteEvidenceStatus,
      });
    }
    const request = db.createProspectBrowserEvidenceRequest(prospect.id, prospect.websiteUrl);
    return res.status(202).json({
      request,
      captureContract: browserEvidenceCaptureContract(request),
      browserExecutionStarted: false,
      browserRuntimeOwnedByRadar: false,
      crmRecordCreated: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/prospects/:id/browser-evidence/:requestId/submit", requireLeadAdmin, (req, res, next) => {
  try {
    const prospect = db.getProspectCandidate(routeParam(req.params.id));
    if (!prospect) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    const request = db.getProspectBrowserEvidenceRequest(routeParam(req.params.requestId));
    if (!request) return res.status(404).json({ error: "Browser evidence request not found", code: "PROSPECT_BROWSER_EVIDENCE_REQUEST_NOT_FOUND" });

    const applied = applyBrowserRenderedEvidence(prospect, request, req.body);
    const saved = db.saveProspectCandidate(applied.candidate);
    const completed = db.completeProspectBrowserEvidenceRequest({
      id: request.id,
      status: applied.requestStatus,
      submittedAt: applied.submission.capturedAt,
      sourceKind: applied.submission.sourceKind,
      sourceReference: applied.submission.sourceReference,
      pageUrl: applied.submission.pageUrl,
      evidenceContext: applied.context,
    });
    return res.json({
      prospect: saved,
      request: completed,
      websiteEvidenceStatus: saved.websiteEvidenceStatus ?? "unverified",
      websiteEvidenceSource: saved.websiteEvidenceSource ?? "static-http",
      upgraded: saved.websiteEvidenceStatus === "verified",
      rawRenderedHtmlPersisted: false,
      browserRuntimeOwnedByRadar: false,
      crmRecordCreated: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/prospects/:id/owner-decisions", requireLeadAdmin, (req, res) => {
  const id = routeParam(req.params.id);
  if (!db.getProspectCandidate(id)) {
    return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
  }
  return res.json({
    schema: "bossai.prospect-owner-decision-journal.v1",
    prospectId: id,
    items: db.listProspectOwnerDecisions(id, parseLimit(req.query.limit, 20, 100)),
    crmRecordCreated: false,
    externalActionsExecuted: false,
  });
});

app.post("/api/admin/prospects/:id/owner-decision", requireLeadAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const input = parseProspectOwnerDecisionInput(req.body);
    const current = db.getProspectCandidate(id);
    if (!current) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    const osAuthorityProjection = db.getProspectOwnerAuthorityProjectionV2(id);
    const osV2AuthorityAvailable = osAuthorityProjection || (bossAiOs.workbenchConfigured() && await bossAiOs.ownerBusinessDecisionV2Supported());
    if (osV2AuthorityAvailable) {
      return res.status(409).json({
        error: "BossAI OS owner business-decision v2 is authoritative for this deployment; record the decision in BossAI Work instead of the legacy Radar journal",
        code: "PROSPECT_OWNER_DECISION_AUTHORITY_IS_BOSSAI_OS",
        ownerDecisionId: osAuthorityProjection?.source.decisionId ?? "",
        intelligenceManagerTaskId: osAuthorityProjection?.decision.contextId ?? "",
        ownerDecisionSurface: "bossai-work",
        radarOwnerDecisionJournalWriteAuthorized: false,
        historicalRadarOwnerDecisionsRemainReadable: true,
      });
    }
    if (current.status === "REJECTED") {
      return res.status(409).json({
        error: "This prospect is already rejected",
        code: "PROSPECT_OWNER_DECISION_ALREADY_APPLIED",
      });
    }

    const targetStatus = input.decision === "approve-sales" ? "READY_FOR_SALES" : "REJECTED";
    const reconfirmSalesAuthorization = input.decision === "approve-sales" && req.body?.reconfirmSalesAuthorization === true;
    if (input.decision === "approve-sales") {
      if ((current.websiteEvidenceStatus ?? "unverified") === "unverified") {
        return res.status(409).json({
          error: "Verified official-website evidence is required before Sales readiness can be approved",
          code: "PROSPECT_WEBSITE_EVIDENCE_REQUIRED",
          websiteEvidenceStatus: "unverified",
        });
      }
      if (current.websiteEvidenceStatus === "static-incomplete") {
        return res.status(409).json({
          error: "Browser-rendered or alternate public evidence is required before Sales readiness can be approved",
          code: "PROSPECT_BROWSER_EVIDENCE_REQUIRED",
          websiteEvidenceStatus: "static-incomplete",
        });
      }
      const normalApproval = current.status === "REVIEW_REQUIRED" && !reconfirmSalesAuthorization;
      const lineageReconfirmation = current.status === "READY_FOR_SALES" && reconfirmSalesAuthorization;
      if (!normalApproval && !lineageReconfirmation) {
        return res.status(409).json({
          error: reconfirmSalesAuthorization
            ? "Sales authorization can only be reconfirmed for a READY_FOR_SALES prospect"
            : "Prospect must be in REVIEW_REQUIRED before Sales readiness can be approved",
          code: reconfirmSalesAuthorization ? "PROSPECT_SALES_AUTHORIZATION_RECONFIRM_NOT_ALLOWED" : "PROSPECT_REVIEW_REQUIRED",
        });
      }
      const intelligenceDelegation = db.getLatestBossAiDelegationForSource("prospect", id);
      if (!intelligenceDelegation) {
        return res.status(409).json({
          error: "A completed Intelligence review is required before Sales qualification",
          code: "PROSPECT_INTELLIGENCE_REVIEW_REQUIRED",
        });
      }
      const run = await bossAiOs.getRun(intelligenceDelegation.bossaiRunId);
      db.updateBossAiDelegationState(run.id, {
        status: run.status,
        reviewStatus: run.reviewStatus,
        updatedAt: run.updatedAt,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
      });
      if (run.status !== "completed") {
        return res.status(409).json({
          error: "Intelligence review must be completed before Sales readiness can be approved",
          code: "PROSPECT_INTELLIGENCE_REVIEW_NOT_COMPLETED",
          runStatus: run.status,
        });
      }
      const reviewOutput = (run.editedOutput || run.output || "").trim();
      if (!reviewOutput.includes("READY_FOR_SALES_QUALIFICATION_REVIEW")) {
        const websiteEvidenceBlocked = reviewOutput.includes("BLOCKED_PENDING_VERIFIED_WEBSITE_EVIDENCE");
        const staticEvidenceBlocked = reviewOutput.includes("BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE");
        return res.status(409).json({
          error: websiteEvidenceBlocked
            ? "Intelligence review says the official website evidence is still unverified"
            : staticEvidenceBlocked
              ? "Intelligence review says the public website evidence is incomplete; browser-rendered or alternate public evidence is required before Sales qualification"
              : "Intelligence review did not authorize the prospect for Sales qualification",
          code: websiteEvidenceBlocked
            ? "PROSPECT_WEBSITE_EVIDENCE_REQUIRED"
            : staticEvidenceBlocked
              ? "PROSPECT_BROWSER_EVIDENCE_REQUIRED"
              : "PROSPECT_INTELLIGENCE_SALES_HANDOFF_NOT_READY",
          intelligenceManagerTaskId: run.id,
          intelligenceHandoffStatus: prospectIntelligenceHandoffStatus(reviewOutput),
        });
      }
      if (lineageReconfirmation) {
        const currentLineage = buildProspectSalesAuthorizationLineage({
          prospect: current,
          intelligenceDelegation: db.getLatestBossAiDelegationForSource("prospect", id),
          salesDelegation: db.getLatestBossAiDelegationForSource("prospect-sales", id),
          ownerDecisionJournal: db.listProspectOwnerDecisions(id, 20),
          bossAiOwnerDecisionV2: db.getProspectOwnerAuthorityProjectionV2(id),
        });
        if (!currentLineage.requiresOwnerReconfirmation) {
          return res.status(409).json({
            error: "The current READY_FOR_SALES lineage already has a valid owner approval",
            code: "PROSPECT_SALES_AUTHORIZATION_ALREADY_VALID",
            salesAuthorization: currentLineage,
          });
        }
      }
    }

    const review = buildProspectAccountReview({
      prospect: current,
      tradeRecords: db.listTradeRecordsForProspect(id, 20),
      intelligenceDelegation: db.getLatestBossAiDelegationForSource("prospect", id),
      salesDelegation: db.getLatestBossAiDelegationForSource("prospect-sales", id),
      latestBrowserRequest: db.getLatestProspectBrowserEvidenceRequestForProspect(id),
      ownerDecisionJournal: db.listProspectOwnerDecisions(id, 20),
      bossAiOwnerDecisionV2: db.getProspectOwnerAuthorityProjectionV2(id),
      outcomeReviewJournal: db.listProspectOutcomeReviews(id, 20),
    });
    const result = db.recordProspectOwnerDecision({
      prospectId: id,
      decision: input.decision,
      reasonCode: input.reasonCode,
      note: input.note,
      expectedStatus: current.status,
      targetStatus,
      snapshot: buildProspectOwnerDecisionSnapshot(review),
    });
    if (!result) {
      return res.status(409).json({
        error: "Prospect state changed while the owner decision was being recorded; reload Account Review and decide again",
        code: "PROSPECT_OWNER_DECISION_STALE",
      });
    }
    const updatedReview = buildProspectAccountReview({
      prospect: result.prospect,
      tradeRecords: db.listTradeRecordsForProspect(id, 20),
      intelligenceDelegation: db.getLatestBossAiDelegationForSource("prospect", id),
      salesDelegation: db.getLatestBossAiDelegationForSource("prospect-sales", id),
      latestBrowserRequest: db.getLatestProspectBrowserEvidenceRequestForProspect(id),
      ownerDecisionJournal: db.listProspectOwnerDecisions(id, 20),
      bossAiOwnerDecisionV2: db.getProspectOwnerAuthorityProjectionV2(id),
      outcomeReviewJournal: db.listProspectOutcomeReviews(id, 20),
    });
    return res.json({
      prospect: result.prospect,
      decision: result.decision,
      review: updatedReview,
      salesAuthorizationReconfirmed: reconfirmSalesAuthorization,
      crmRecordCreated: false,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/admin/prospects/:id", requireLeadAdmin, async (req, res, next) => {
  try {
    const id = routeParam(req.params.id);
    const status = parseProspectStatus(req.body?.status, true);
    if (!status) return res.status(400).json({ error: "A valid prospect status is required", code: "PROSPECT_STATUS_INVALID" });
    const current = db.getProspectCandidate(id);
    if (!current) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    if (status === "REVIEW_REQUIRED") {
      return res.status(409).json({
        error: "Use the Intelligence delegation action to enter review-required state",
        code: "PROSPECT_REVIEW_DELEGATION_REQUIRED",
      });
    }
    if (status === "READY_FOR_SALES" || status === "REJECTED") {
      return res.status(409).json({
        error: "Owner approval or rejection must be recorded through the owner-decision journal",
        code: "PROSPECT_OWNER_DECISION_REQUIRED",
        ownerDecisionPath: `/api/admin/prospects/${encodeURIComponent(id)}/owner-decision`,
      });
    }
    const prospect = db.updateProspectStatus(id, status);
    return res.json({ prospect, crmRecordCreated: false, externalActionsExecuted: false });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/bossai/delegations", requireLeadAdmin, (req, res) => {
  const limit = parseLimit(req.query.limit, 50, 200);
  const items = db.listBossAiDelegations(limit);
  const totalCount = db.countBossAiDelegations();
  res.json({
    integration: {
      platform: "bossai-os",
      harness: "hermes",
      profile: "bossaiworkforce",
      managerContract: "bossai.manager-task.v1",
      sourceProduct: "bossai-radar-lite",
      agentId: INTELLIGENCE_AGENT_ID,
      expectedVersion: INTELLIGENCE_AGENT_VERSION,
      configured: bossAiOs.employeeConfigured(),
    },
    items,
    totalCount,
    truncated: totalCount > items.length,
  });
});

app.post("/api/admin/opportunities/:id/delegate", requireLeadAdmin, async (req, res, next) => {
  try {
    const opportunity = db.getOpportunity(routeParam(req.params.id));
    if (!opportunity) return res.status(404).json({ error: "Opportunity not found", code: "OPPORTUNITY_NOT_FOUND" });
    if (opportunity.isDemo) {
      return res.status(409).json({
        error: "Demo opportunities cannot be delegated as real employee work",
        code: "DEMO_OPPORTUNITY_DELEGATION_BLOCKED",
      });
    }
    if (!bossAiOs.employeeConfigured()) {
      return res.status(503).json({
        error: "BossAI OS employee delegation is not configured",
        code: "BOSSAI_EMPLOYEE_AUTH_NOT_CONFIGURED",
      });
    }

    const agentId = bossAiAgentId(req.body?.agentId);
    const objective = bossAiObjective(req.body?.objective, opportunity.title);
    const sourceOperationId = bossAiSourceOperationId(
      req.body?.sourceOperationId,
      bossAiOs.stableOperationId([opportunity.id, agentId, objective]),
    );
    const existing = db.getBossAiDelegationByOperation(sourceOperationId);
    if (existing) {
      const run = await bossAiOs.getRun(existing.bossaiRunId);
      const local = db.updateBossAiDelegationState(run.id, {
        status: run.status,
        reviewStatus: run.reviewStatus,
        updatedAt: run.updatedAt,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
      });
      return res.status(200).json({
        deduplicated: true,
        sourceOperationId,
        delegation: local,
        run,
      });
    }

    const evidence = db.listEvidence(500)
      .filter((item) => opportunity.evidenceIds.includes(item.id))
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        source: item.source,
        title: item.title,
        excerpt: compactEvidenceText(item.body, 500),
        url: item.url,
        community: item.source === "reddit" ? redditCommunityFromUrl(item.url) : "",
        communityContext: item.sourceContext ?? null,
        sourceContext: item.websiteContext ?? item.sourceContext ?? null,
        publishedAt: item.publishedAt,
        engagement: item.engagement,
        totalScore: item.totalScore,
        category: item.category,
        tags: item.tags,
        query: item.query,
        isDemo: item.isDemo,
      }));
    const installation = await bossAiOs.getAgentInstallation(agentId);
    assertIntelligenceAgentReady(installation);
    const managerObjective = buildIntelligenceManagerObjective({
      objective,
      sourceOperationId,
      opportunity,
      evidence,
    });
    const submission = await bossAiOs.queueManagerTask(agentId, managerObjective);
    const local = db.saveBossAiDelegation({
      sourceType: "opportunity",
      sourceRecordId: opportunity.id,
      sourceOperationId,
      bossaiRunId: submission.run.id,
      bossaiAgentId: submission.agent.id,
      status: submission.run.status,
      reviewStatus: submission.run.reviewStatus,
      submittedAt: submission.run.createdAt,
      updatedAt: submission.run.updatedAt,
      errorCode: submission.run.errorCode,
      errorMessage: submission.run.errorMessage,
    });
    return res.status(submission.deduplicated ? 200 : 202).json({
      deduplicated: submission.deduplicated,
      sourceOperationId,
      runtime: submission.runtime,
      delegation: local,
      run: submission.run,
      requiresHumanReview: true,
      externalActionsExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/prospects/:id/delegate", requireLeadAdmin, async (req, res, next) => {
  try {
    const prospect = db.getProspectCandidate(routeParam(req.params.id));
    if (!prospect) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    if ((prospect.websiteEvidenceStatus ?? "unverified") === "unverified") {
      return res.status(409).json({
        error: "Prospect website evidence has not been verified by the bounded website collector. Verify the official website before Intelligence review.",
        code: "PROSPECT_WEBSITE_EVIDENCE_REQUIRED",
        websiteEvidenceStatus: "unverified",
        crmRecordCreated: false,
        externalActionsExecuted: false,
      });
    }
    if (!bossAiOs.employeeConfigured()) {
      return res.status(503).json({
        error: "BossAI OS employee delegation is not configured",
        code: "BOSSAI_EMPLOYEE_AUTH_NOT_CONFIGURED",
      });
    }

    const agentId = bossAiAgentId(req.body?.agentId);
    const objective = prospectReviewObjective(req.body?.objective, prospect);
    const retryFailedRunId = bossAiRetryFailedRunId(req.body?.retryFailedRunId);
    if (retryFailedRunId && req.body?.sourceOperationId) {
      return res.status(400).json({
        error: "Retry operation IDs are generated by Radar from the failed Manager task reference",
        code: "PROSPECT_RETRY_OPERATION_ID_MANAGED",
      });
    }
    const sourceOperationId = bossAiSourceOperationId(
      req.body?.sourceOperationId,
      retryFailedRunId
        ? bossAiOs.stableOperationId([prospect.id, agentId, `retry:${retryFailedRunId}`])
        : bossAiOs.stableOperationId([prospect.id, agentId, objective]),
    );
    const existing = db.getBossAiDelegationByOperation(sourceOperationId);
    if (existing) {
      const run = await bossAiOs.getRun(existing.bossaiRunId);
      const local = db.updateBossAiDelegationState(run.id, {
        status: run.status,
        reviewStatus: run.reviewStatus,
        updatedAt: run.updatedAt,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
      });
      return res.status(200).json({
        deduplicated: true,
        sourceOperationId,
        delegation: local,
        run,
        crmRecordCreated: false,
        externalActionsExecuted: false,
        retryOfRunId: retryFailedRunId || null,
        automaticRetryExecuted: false,
      });
    }
    if (retryFailedRunId) {
      const latest = db.getLatestBossAiDelegationForSource("prospect", prospect.id);
      if (!latest || latest.bossaiRunId !== retryFailedRunId || !["failed", "cancelled"].includes(latest.status)) {
        return res.status(409).json({
          error: "Only the latest failed or cancelled Intelligence task can be retried",
          code: "PROSPECT_INTELLIGENCE_RETRY_NOT_ALLOWED",
          automaticRetryExecuted: false,
        });
      }
    }

    const installation = await bossAiOs.getAgentInstallation(agentId);
    assertIntelligenceAgentReady(installation);
    const historicalTradeEvidence = db.listTradeRecordsForProspect(prospect.id, 8);
    const managerObjective = buildProspectManagerObjective({ objective, sourceOperationId, prospect, historicalTradeEvidence });
    const submission = await bossAiOs.queueManagerTask(agentId, managerObjective);
    const local = db.saveBossAiDelegation({
      sourceType: "prospect",
      sourceRecordId: prospect.id,
      sourceOperationId,
      bossaiRunId: submission.run.id,
      bossaiAgentId: submission.agent.id,
      status: submission.run.status,
      reviewStatus: submission.run.reviewStatus,
      submittedAt: submission.run.createdAt,
      updatedAt: submission.run.updatedAt,
      errorCode: submission.run.errorCode,
      errorMessage: submission.run.errorMessage,
    });
    db.updateProspectStatus(prospect.id, "REVIEW_REQUIRED");
    return res.status(submission.deduplicated ? 200 : 202).json({
      deduplicated: submission.deduplicated,
      sourceOperationId,
      runtime: submission.runtime,
      delegation: local,
      prospect: db.getProspectCandidate(prospect.id),
      run: submission.run,
      requiresHumanReview: true,
      externalActionsExecuted: false,
      crmRecordCreated: false,
      retryOfRunId: retryFailedRunId || null,
      automaticRetryExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/prospects/:id/qualify", requireLeadAdmin, async (req, res, next) => {
  try {
    const prospect = db.getProspectCandidate(routeParam(req.params.id));
    if (!prospect) return res.status(404).json({ error: "Prospect candidate not found", code: "PROSPECT_NOT_FOUND" });
    if (!bossAiOs.employeeConfigured()) {
      return res.status(503).json({
        error: "BossAI OS employee delegation is not configured",
        code: "BOSSAI_EMPLOYEE_AUTH_NOT_CONFIGURED",
      });
    }
    const intelligenceDelegation = db.getLatestBossAiDelegationForSource("prospect", prospect.id);
    if (!intelligenceDelegation || intelligenceDelegation.status !== "completed") {
      return res.status(409).json({
        error: "A completed Intelligence review reference is required before Sales qualification",
        code: "PROSPECT_INTELLIGENCE_REVIEW_REQUIRED",
      });
    }
    const ownerDecisionJournal = db.listProspectOwnerDecisions(prospect.id, 20);
    const latestSalesDelegation = db.getLatestBossAiDelegationForSource("prospect-sales", prospect.id);
    const osDecisionV2Supported = bossAiOs.workbenchConfigured()
      ? await bossAiOs.ownerBusinessDecisionV2Supported()
      : false;
    if (osDecisionV2Supported) {
      if ((prospect.websiteEvidenceStatus ?? "unverified") === "unverified") {
        return res.status(409).json({
          error: "Verified official-website evidence is required before an OS-backed Sales authorization can be consumed",
          code: "PROSPECT_WEBSITE_EVIDENCE_REQUIRED",
        });
      }
      if (prospect.websiteEvidenceStatus === "static-incomplete") {
        return res.status(409).json({
          error: "Browser-rendered or alternate public evidence is required before an OS-backed Sales authorization can be consumed",
          code: "PROSPECT_BROWSER_EVIDENCE_REQUIRED",
        });
      }
      const intelligenceRun = await bossAiOs.getRun(intelligenceDelegation.bossaiRunId);
      db.updateBossAiDelegationState(intelligenceRun.id, {
        status: intelligenceRun.status,
        reviewStatus: intelligenceRun.reviewStatus,
        updatedAt: intelligenceRun.updatedAt,
        errorCode: intelligenceRun.errorCode,
        errorMessage: intelligenceRun.errorMessage,
      });
      if (intelligenceRun.status !== "completed") {
        return res.status(409).json({
          error: "The exact Intelligence Manager task bound to the owner decision is no longer completed",
          code: "PROSPECT_INTELLIGENCE_REVIEW_NOT_COMPLETED",
          intelligenceManagerTaskId: intelligenceDelegation.bossaiRunId,
          runStatus: intelligenceRun.status,
        });
      }
      const intelligenceOutput = (intelligenceRun.editedOutput || intelligenceRun.output || "").trim();
      if (!intelligenceOutput.includes("READY_FOR_SALES_QUALIFICATION_REVIEW")) {
        return res.status(409).json({
          error: "The exact Intelligence Manager task does not currently authorize Sales qualification review",
          code: "PROSPECT_INTELLIGENCE_SALES_HANDOFF_NOT_READY",
          intelligenceManagerTaskId: intelligenceDelegation.bossaiRunId,
          intelligenceHandoffStatus: prospectIntelligenceHandoffStatus(intelligenceOutput),
        });
      }
    }
    const osDecisionState = await loadCurrentBossAiOwnerBusinessDecisionV2(
      prospect.id,
      intelligenceDelegation.bossaiRunId,
      osDecisionV2Supported,
    );
    let bossAiOwnerDecisionV2 = osDecisionState.projection;
    let authorizedProspect = prospect;
    if (osDecisionState.supported) {
      if (!bossAiOwnerDecisionV2) {
        return res.status(409).json({
          error: "BossAI OS requires an explicit owner business decision bound to this exact Intelligence Manager task before Sales qualification",
          code: "PROSPECT_OS_OWNER_DECISION_V2_REQUIRED",
          ownerDecisionSurface: "bossai-work",
          prospectId: prospect.id,
          intelligenceManagerTaskId: intelligenceDelegation.bossaiRunId,
        });
      }
      const synced = db.syncProspectOwnerAuthorityProjectionV2(bossAiOwnerDecisionV2);
      if (!synced) {
        return res.status(409).json({
          error: "The BossAI OS owner decision cannot be projected onto the current Radar prospect state",
          code: "PROSPECT_OS_OWNER_DECISION_V2_STATE_CONFLICT",
        });
      }
      authorizedProspect = synced;
      if (bossAiOwnerDecisionV2.decision.decisionType === "reject-prospect") {
        return res.status(409).json({
          error: "The latest explicit BossAI OS owner decision rejects this prospect",
          code: "PROSPECT_REJECTED_BY_OS_OWNER_DECISION",
          ownerDecisionId: bossAiOwnerDecisionV2.source.decisionId,
          intelligenceManagerTaskId: bossAiOwnerDecisionV2.decision.contextId,
          externalActionsExecuted: false,
        });
      }
    } else if (prospect.status !== "READY_FOR_SALES") {
      return res.status(409).json({
        error: "Prospect must be explicitly approved as READY_FOR_SALES before Sales qualification",
        code: "PROSPECT_SALES_APPROVAL_REQUIRED",
        compatibilityAuthority: "radar-local-legacy",
      });
    } else {
      bossAiOwnerDecisionV2 = db.getProspectOwnerAuthorityProjectionV2(prospect.id);
    }
    const salesAuthorization = buildProspectSalesAuthorizationLineage({
      prospect: authorizedProspect,
      intelligenceDelegation,
      salesDelegation: latestSalesDelegation,
      ownerDecisionJournal,
      bossAiOwnerDecisionV2,
    });
    if (!salesAuthorization.validForSalesQualification || !salesAuthorization.ownerDecisionId) {
      return res.status(409).json({
        error: "READY_FOR_SALES must be backed by a current owner approve-sales decision tied to the completed Intelligence review",
        code: "PROSPECT_OWNER_APPROVAL_LINEAGE_REQUIRED",
        salesAuthorization,
        ownerDecisionPath: `/api/admin/prospects/${encodeURIComponent(prospect.id)}/owner-decision`,
        reconfirmSalesAuthorization: true,
      });
    }
    const ownerApproval = bossAiOwnerDecisionV2?.decision.decisionType === "authorize-sales-qualification"
      ? {
          id: bossAiOwnerDecisionV2.source.decisionId,
          reasonCode: salesAuthorization.ownerDecisionReasonCode || "owner-judgment",
          note: "",
          decidedAt: bossAiOwnerDecisionV2.source.decidedAt,
          decision: "approve-sales" as const,
        }
      : ownerDecisionJournal.find((item) => (
          item.id === salesAuthorization.ownerDecisionId && item.decision === "approve-sales"
        ));
    if (!ownerApproval) {
      return res.status(409).json({
        error: "The owner approval referenced by the Sales authorization lineage is unavailable",
        code: "PROSPECT_OWNER_APPROVAL_LINEAGE_REQUIRED",
        salesAuthorization,
      });
    }

    const objective = prospectSalesQualificationObjective(req.body?.objective, prospect);
    const retryFailedRunId = bossAiRetryFailedRunId(req.body?.retryFailedRunId);
    if (retryFailedRunId && req.body?.sourceOperationId) {
      return res.status(400).json({
        error: "Retry operation IDs are generated by Radar from the failed Manager task reference",
        code: "PROSPECT_RETRY_OPERATION_ID_MANAGED",
      });
    }
    const sourceOperationId = bossAiSourceOperationId(
      req.body?.sourceOperationId,
      retryFailedRunId
        ? bossAiOs.stableOperationId([prospect.id, SALES_AGENT_ID, ownerApproval.id, `retry:${retryFailedRunId}`])
        : bossAiOs.stableOperationId([prospect.id, SALES_AGENT_ID, intelligenceDelegation.bossaiRunId, ownerApproval.id, objective]),
    );
    const existing = db.getBossAiDelegationByOperation(sourceOperationId);
    if (existing) {
      if (existing.ownerDecisionId && existing.ownerDecisionId !== ownerApproval.id) {
        return res.status(409).json({
          error: "The existing Sales task belongs to a different owner approval lineage",
          code: "PROSPECT_SALES_DELEGATION_LINEAGE_MISMATCH",
          existingOwnerDecisionId: existing.ownerDecisionId,
          currentOwnerDecisionId: ownerApproval.id,
        });
      }
      const run = await bossAiOs.getRun(existing.bossaiRunId);
      const local = db.updateBossAiDelegationState(run.id, {
        status: run.status,
        reviewStatus: run.reviewStatus,
        updatedAt: run.updatedAt,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
      });
      return res.status(200).json({
        deduplicated: true,
        sourceOperationId,
        delegation: local,
        run,
        crmRecordCreated: false,
        externalActionsExecuted: false,
        retryOfRunId: retryFailedRunId || null,
        ownerDecisionId: ownerApproval.id,
        salesAuthorization: buildProspectSalesAuthorizationLineage({
          prospect: authorizedProspect,
          intelligenceDelegation,
          salesDelegation: local,
          ownerDecisionJournal,
          bossAiOwnerDecisionV2,
        }),
        automaticRetryExecuted: false,
      });
    }
    if (retryFailedRunId) {
      const latest = db.getLatestBossAiDelegationForSource("prospect-sales", prospect.id);
      if (!latest || latest.bossaiRunId !== retryFailedRunId || !["failed", "cancelled"].includes(latest.status)) {
        return res.status(409).json({
          error: "Only the latest failed or cancelled Sales qualification task can be retried",
          code: "PROSPECT_SALES_RETRY_NOT_ALLOWED",
          automaticRetryExecuted: false,
        });
      }
      if (latest.ownerDecisionId && latest.ownerDecisionId !== ownerApproval.id) {
        return res.status(409).json({
          error: "The failed Sales task belongs to a different owner approval lineage",
          code: "PROSPECT_SALES_RETRY_LINEAGE_MISMATCH",
          failedTaskOwnerDecisionId: latest.ownerDecisionId,
          currentOwnerDecisionId: ownerApproval.id,
          automaticRetryExecuted: false,
        });
      }
    }

    const installation = await bossAiOs.getAgentInstallation(SALES_AGENT_ID);
    assertSalesAgentReady(installation);
    const historicalTradeEvidence = db.listTradeRecordsForProspect(prospect.id, 8);
    const managerObjective = buildProspectSalesManagerObjective({
      objective,
      sourceOperationId,
      prospect: authorizedProspect,
      intelligenceManagerTaskId: intelligenceDelegation.bossaiRunId,
      ownerApproval,
      historicalTradeEvidence,
    });
    const submission = await bossAiOs.queueManagerTask(SALES_AGENT_ID, managerObjective);
    const local = db.saveBossAiDelegation({
      sourceType: "prospect-sales",
      sourceRecordId: prospect.id,
      sourceOperationId,
      bossaiRunId: submission.run.id,
      bossaiAgentId: submission.agent.id,
      status: submission.run.status,
      reviewStatus: submission.run.reviewStatus,
      submittedAt: submission.run.createdAt,
      updatedAt: submission.run.updatedAt,
      errorCode: submission.run.errorCode,
      errorMessage: submission.run.errorMessage,
      ownerDecisionId: ownerApproval.id,
    });
    return res.status(submission.deduplicated ? 200 : 202).json({
      deduplicated: submission.deduplicated,
      sourceOperationId,
      runtime: submission.runtime,
      delegation: local,
      run: submission.run,
      capabilityRequested: "sales.lead.qualify",
      crmRecordCreated: false,
      externalActionsExecuted: false,
      retryOfRunId: retryFailedRunId || null,
      ownerDecisionId: ownerApproval.id,
      salesAuthorization: buildProspectSalesAuthorizationLineage({
        prospect: authorizedProspect,
        intelligenceDelegation,
        salesDelegation: local,
        ownerDecisionJournal,
        bossAiOwnerDecisionV2,
      }),
      automaticRetryExecuted: false,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/bossai/runs/:runId", requireLeadAdmin, async (req, res, next) => {
  try {
    const runId = routeParam(req.params.runId);
    const delegation = db.getBossAiDelegationByRunId(runId);
    if (!delegation) return res.status(404).json({ error: "Delegation not found", code: "DELEGATION_NOT_FOUND" });
    const run = await bossAiOs.getRun(runId);
    const local = db.updateBossAiDelegationState(run.id, {
      status: run.status,
      reviewStatus: run.reviewStatus,
      updatedAt: run.updatedAt,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
    });
    return res.json({ delegation: local, run });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/bossai/runs/:runId/events", requireLeadAdmin, async (req, res, next) => {
  try {
    const runId = routeParam(req.params.runId);
    if (!db.getBossAiDelegationByRunId(runId)) {
      return res.status(404).json({ error: "Delegation not found", code: "DELEGATION_NOT_FOUND" });
    }
    return res.json(await bossAiOs.getRunEvents(runId));
  } catch (error) {
    return next(error);
  }
});

app.get("/api/evidence", (req, res) => {
  const category = typeof req.query.category === "string" && req.query.category.trim()
    ? req.query.category.trim()
    : undefined;
  res.json({ items: db.listEvidence(parseLimit(req.query.limit, 100, 500), category) });
});

app.get("/api/runs", (req, res) => {
  res.json({ items: db.listRuns(parseLimit(req.query.limit, 20, 100)) });
});

app.get("/api/report/latest", (_req, res) => {
  const report = db.latestReport();
  if (!report) return res.status(404).json({ error: "No report generated yet" });
  return res.json(report);
});

app.get("/api/report/latest.md", (req, res) => {
  const report = db.latestReport();
  const run = db.listRuns(1)[0];
  if (!report || !run) return res.status(404).type("text/plain").send("No report generated yet");
  const language = req.query.lang === "en" ? "en" : "zh";
  const date = report.generatedAt.slice(0, 10);
  const markdown = language === "en"
    ? report.markdownEnglish || createEnglishReport(run, db.listOpportunities(50), db.listEvidence(100)).markdown
    : report.markdown;
  res.setHeader("Content-Disposition", `attachment; filename=radar-report-${language}-${date}.md`);
  return res.type("text/markdown; charset=utf-8").send(markdown);
});

app.post("/api/leads", (req, res, next) => {
  try {
    if (!config.commercial.leadCaptureEnabled) {
      return res.status(503).json({ error: "Lead capture is disabled", code: "LEAD_CAPTURE_DISABLED" });
    }
    const honeypot = typeof req.body?.website === "string" ? req.body.website.trim() : "";
    if (honeypot) return res.status(202).json({ accepted: true });
    if (!allowLeadSubmission(req.ip)) {
      res.setHeader("Retry-After", "3600");
      return res.status(429).json({ error: "Too many submissions", code: "LEAD_RATE_LIMITED" });
    }
    const input = validateLeadInput(req.body, "commercial-page");
    const result = db.createLead(input);
    return res.status(result.duplicate ? 200 : 201).json({
      id: result.lead.id,
      duplicate: result.duplicate,
      createdAt: result.lead.createdAt,
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/leads/stats", requireLeadAdmin, (_req, res) => {
  res.json(db.leadStats());
});

app.get("/api/admin/followups", requireLeadAdmin, (req, res) => {
  const queue = buildFollowUpQueue(db.listLeads({ limit: 2_000 }), {
    windowDays: parseLimit(req.query.days, 7, 60),
    includeUnscheduled: req.query.includeUnscheduled !== "false",
    displayLanguage: req.query.lang === "en" ? "en" : "zh",
  });
  return res.json(queue);
});

app.get("/api/admin/followups/report.md", requireLeadAdmin, (req, res) => {
  const language = req.query.lang === "en" ? "en" : "zh";
  const queue = buildFollowUpQueue(db.listLeads({ limit: 2_000 }), {
    windowDays: parseLimit(req.query.days, 7, 60),
    includeUnscheduled: req.query.includeUnscheduled !== "false",
    displayLanguage: language,
  });
  res.setHeader("Content-Disposition", `attachment; filename=bossai-followups-${language}-${new Date().toISOString().slice(0, 10)}.md`);
  return res.type("text/markdown; charset=utf-8").send(createFollowUpReport(queue, language));
});

app.get("/api/admin/followups/calendar.ics", requireLeadAdmin, (req, res) => {
  const queue = buildFollowUpQueue(db.listLeads({ limit: 2_000 }), {
    windowDays: parseLimit(req.query.days, 30, 60),
    includeUnscheduled: false,
  });
  res.setHeader("Content-Disposition", `attachment; filename=bossai-followups-${new Date().toISOString().slice(0, 10)}.ics`);
  return res.type("text/calendar; charset=utf-8").send(createFollowUpCalendar(queue));
});

app.get("/api/admin/leads/:id/followup-draft", requireLeadAdmin, (req, res) => {
  const lead = db.getLead(routeParam(req.params.id));
  if (!lead) return res.status(404).json({ error: "Lead not found", code: "LEAD_NOT_FOUND" });
  const language = req.query.lang === "en" ? "en" : req.query.lang === "zh" ? "zh" : lead.language;
  return res.json(createFollowUpDraft(lead, new Date(), language));
});

app.get("/api/admin/leads/export.csv", requireLeadAdmin, (req, res) => {
  const leads = db.listLeads({
    limit: parseLimit(req.query.limit, 500, 2_000),
    status: parseLeadStatus(req.query.status),
    intent: parseLeadIntent(req.query.intent),
    priority: parseLeadPriority(req.query.priority),
    query: typeof req.query.q === "string" ? req.query.q : undefined,
  });
  const header = [
    "id", "intent", "name", "company", "contact", "teamSize", "timeline", "deployment", "budget",
    "status", "priority", "score", "owner", "quoteAmount", "quoteCurrency", "nextFollowUpAt",
    "language", "scenario", "requirements", "createdAt", "updatedAt",
  ];
  const lines = [header.join(","), ...leads.map((lead) => header.map((key) => csvCell(lead[key as keyof typeof lead])).join(","))];
  res.setHeader("Content-Disposition", `attachment; filename=bossai-radar-leads-${new Date().toISOString().slice(0, 10)}.csv`);
  return res.type("text/csv; charset=utf-8").send(`\uFEFF${lines.join("\n")}`);
});

app.get("/api/admin/leads", requireLeadAdmin, (req, res) => {
  res.json({
    items: db.listLeads({
      limit: parseLimit(req.query.limit, 100, 500),
      status: parseLeadStatus(req.query.status),
      intent: parseLeadIntent(req.query.intent),
      priority: parseLeadPriority(req.query.priority),
      query: typeof req.query.q === "string" ? req.query.q : undefined,
    }),
  });
});

app.get("/api/admin/leads/:id", requireLeadAdmin, (req, res) => {
  const lead = db.getLead(routeParam(req.params.id));
  if (!lead) return res.status(404).json({ error: "Lead not found", code: "LEAD_NOT_FOUND" });
  return res.json({ lead, activities: db.listLeadActivities(lead.id) });
});

app.patch("/api/admin/leads/:id", requireLeadAdmin, (req, res, next) => {
  try {
    const lead = db.updateLead(routeParam(req.params.id), normalizeLeadPatch(req.body));
    if (!lead) return res.status(404).json({ error: "Lead not found", code: "LEAD_NOT_FOUND" });
    return res.json({ lead, activities: db.listLeadActivities(lead.id) });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/admin/leads/:id", requireLeadAdmin, (req, res) => {
  const deleted = db.deleteLead(routeParam(req.params.id));
  if (!deleted) return res.status(404).json({ error: "Lead not found", code: "LEAD_NOT_FOUND" });
  return res.status(204).send();
});

app.post("/api/admin/leads/:id/activities", requireLeadAdmin, (req, res, next) => {
  try {
    const lead = db.getLead(routeParam(req.params.id));
    if (!lead) return res.status(404).json({ error: "Lead not found", code: "LEAD_NOT_FOUND" });
    const input = normalizeActivityInput(req.body);
    const activity = db.addLeadActivity(lead.id, input.type, input.content);
    return res.status(201).json({ activity, lead: db.getLead(lead.id) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/scan", requireWriteAccess, async (_req, res, next) => {
  try {
    const result = await engine.scan("manual");
    res.status(result.run.status === "failed" ? 502 : 200).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/demo/seed", requireWriteAccess, (_req, res, next) => {
  try {
    if (!config.demoEnabled) return res.status(404).json({ error: "Demo mode is disabled" });
    if (engine.isRunning()) return res.status(409).json({ error: "A live scan is currently running" });
    const result = seedDemoData(db);
    engine.setSourceStatus(result.sources);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

async function loadCurrentBossAiOwnerBusinessDecisionV2(
  prospectId: string,
  intelligenceManagerTaskId: string,
  supportedHint?: boolean,
): Promise<{ supported: boolean; projection: ProjectedProspectOwnerDecisionV2 | null }> {
  if (!bossAiOs.workbenchConfigured()) return { supported: false, projection: null };
  const supported = supportedHint ?? await bossAiOs.ownerBusinessDecisionV2Supported();
  if (!supported) return { supported: false, projection: null };
  const rawDecisions = await bossAiOs.listOwnerBusinessDecisionsV2({
    prospectId,
    intelligenceManagerTaskId,
    limit: 10,
  });
  if (rawDecisions.length === 0) return { supported: true, projection: null };
  const projections = rawDecisions
    .map((decision) => projectBossAiOwnerBusinessDecisionV2(decision, prospectId, intelligenceManagerTaskId))
    .sort((left, right) => Date.parse(right.source.decidedAt) - Date.parse(left.source.decidedAt));
  return { supported: true, projection: projections[0] ?? null };
}

async function loadProspectOutcomeAttribution(id: string) {
  const prospect = db.getProspectCandidate(id);
  if (!prospect) {
    throw new BossAiOsClientError("Prospect candidate not found", "PROSPECT_NOT_FOUND", 404);
  }
  const intelligenceDelegation = db.getLatestBossAiDelegationForSource("prospect", id);
  let salesDelegation = db.getLatestBossAiDelegationForSource("prospect-sales", id);
  const ownerDecisionJournal = db.listProspectOwnerDecisions(id, 20);
  const bossAiOwnerDecisionV2 = db.getProspectOwnerAuthorityProjectionV2(id);
  let salesRun = null;
  let handoff = null;

  if (salesDelegation) {
    if (!bossAiOs.employeeConfigured()) {
      throw new BossAiOsClientError(
        "BossAI OS employee delegation is not configured",
        "BOSSAI_EMPLOYEE_AUTH_NOT_CONFIGURED",
        503,
      );
    }
    const run = await bossAiOs.getRun(salesDelegation.bossaiRunId);
    salesRun = run;
    db.updateBossAiDelegationState(run.id, {
      status: run.status,
      reviewStatus: run.reviewStatus,
      updatedAt: run.updatedAt,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
    });
    salesDelegation = db.getBossAiDelegationByRunId(run.id) ?? salesDelegation;
    if (run.status === "completed") {
      handoff = buildProspectSalesHandoffBrief({
        prospect,
        run,
        ownerDecisionJournal,
        ownerDecisionId: salesDelegation.ownerDecisionId || "",
        bossAiOwnerDecisionV2,
      });
    }
  }

  const lineage = buildProspectSalesAuthorizationLineage({
    prospect,
    intelligenceDelegation,
    salesDelegation,
    ownerDecisionJournal,
    bossAiOwnerDecisionV2,
  });
  const attribution = buildProspectOutcomeAttribution({
    prospectId: prospect.id,
    lineage,
    handoff,
    reviewJournal: db.listProspectOutcomeReviews(id, 20),
  });
  return {
    prospect,
    intelligenceDelegation,
    salesDelegation,
    salesRun,
    ownerDecisionJournal,
    lineage,
    handoff,
    attribution,
  };
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicCandidates = [path.resolve(currentDir, "../public"), path.resolve(process.cwd(), "public")];
const publicDir = publicCandidates.find((candidate) => existsSync(path.join(candidate, "index.html")));
if (!publicDir) throw new Error("Public dashboard files not found");
app.use(express.static(publicDir, { maxAge: "1h", etag: true }));
app.get("*splat", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof OwnerBusinessDecisionProjectionError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  if (error instanceof BossAiOutcomeProjectionError) {
    return res.status(409).json({ error: error.message, code: error.code });
  }
  if (error instanceof ProspectOutcomeReviewValidationError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  if (error instanceof ProspectOwnerDecisionValidationError) {
    return res.status(400).json({ error: error.message, code: error.code });
  }
  if (error instanceof ProspectBrowserEvidenceError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  if (error instanceof BossAiOsClientError) {
    const status = error.status && error.status >= 400 && error.status < 600
      ? error.status
      : error.code === "BOSSAI_EMPLOYEE_AUTH_NOT_CONFIGURED"
        ? 503
        : 502;
    return res.status(status).json({ error: error.message, code: error.code });
  }
  if (error instanceof LeadValidationError) {
    return res.status(400).json({ error: error.message, code: "LEAD_VALIDATION_FAILED", fields: error.fields });
  }
  console.error("[HTTP]", error);
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return res.status(500).json({ error: message });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`${APP_NAME} v${APP_VERSION} running at http://${config.host}:${config.port}`);
  console.log("License: non-commercial use only; commercial use requires written authorization.");
  scheduler.start();
  if (config.radar.runOnStartup && !db.latestReport()) {
    void engine.scan("startup").then((result) => {
      console.log(`[Startup scan] ${result.run.status}: ${result.run.collectedCount} collected, ${result.run.opportunityCount} opportunities`);
    });
  }
});

function requireLeadAdmin(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  if (!config.commercial.leadAdminEnabled) {
    res.status(404).json({ error: "Lead administration is disabled", code: "LEAD_ADMIN_DISABLED" });
    return;
  }
  requireWriteAccess(req, res, next);
}

function allowLeadSubmission(ip: string | undefined): boolean {
  const key = ip || "unknown";
  const cutoff = Date.now() - 60 * 60 * 1_000;
  const recent = (leadSubmissionWindows.get(key) ?? []).filter((timestamp) => timestamp >= cutoff);
  if (recent.length >= config.commercial.maxSubmissionsPerHour) {
    leadSubmissionWindows.set(key, recent);
    return false;
  }
  recent.push(Date.now());
  leadSubmissionWindows.set(key, recent);
  if (leadSubmissionWindows.size > 2_000) {
    for (const [entryKey, timestamps] of leadSubmissionWindows) {
      const active = timestamps.filter((timestamp) => timestamp >= cutoff);
      if (active.length) leadSubmissionWindows.set(entryKey, active);
      else leadSubmissionWindows.delete(entryKey);
    }
  }
  return true;
}

function requireWriteAccess(req: Request, res: Response, next: NextFunction): void {
  const suppliedKey = req.header("x-radar-key") || req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (suppliedKey && timingSafeEqual(suppliedKey, config.adminApiKey)) return next();
  if (isLoopback(req.ip) && config.host === "127.0.0.1") return next();
  res.status(401).json({ error: "Administrator key required", code: "RADAR_ADMIN_KEY_REQUIRED" });
}

function isLoopback(ip: string | undefined): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function tradeRecordSourceLabel(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] || "" : value || "";
  return raw.replace(/[\u0000-\u001F\u007F]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 120)
    || "local-trade-record-import";
}

function tradeRecordWebsiteOrigins(records: readonly TradeRecord[]): string[] {
  const origins = new Set<string>();
  for (const record of records) {
    if (!record.websiteUrl) continue;
    try {
      const url = new URL(record.websiteUrl);
      if (!/^https?:$/u.test(url.protocol)) continue;
      origins.add(new URL("/", url.origin).href);
    } catch {
      // Imported URLs are normalized; ignore malformed legacy rows defensively.
    }
    if (origins.size >= 20) break;
  }
  return [...origins];
}

function selectedTradeRecordWebsite(value: unknown, fallback: string): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//iu.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password || !url.hostname.includes(".")) {
      throw new Error("invalid");
    }
    url.hash = "";
    return url.href;
  } catch {
    throw new BossAiOsClientError("websiteUrl must be a valid HTTP(S) company website.", "TRADE_RECORD_WEBSITE_INVALID", 400);
  }
}

function tradeRecordImportErrorMessage(code: string): string {
  return ({
    TRADE_RECORD_IMPORT_EMPTY: "Trade record import is empty.",
    TRADE_RECORD_IMPORT_NO_DATA_ROWS: "Trade record import has no data rows.",
    TRADE_RECORD_IMPORT_COMPANY_COLUMN_REQUIRED: "Trade record import requires a recognizable company/buyer/importer/supplier column.",
  } as Record<string, string>)[code] || "Trade record import could not be parsed.";
}

function bossAiAgentId(value: unknown): typeof INTELLIGENCE_AGENT_ID {
  if (value === undefined || value === null || value === "") return INTELLIGENCE_AGENT_ID;
  if (value !== INTELLIGENCE_AGENT_ID) {
    throw new BossAiOsClientError(
      `Radar opportunities can only be delegated to ${INTELLIGENCE_AGENT_ID}.`,
      "BOSSAI_AGENT_ID_INVALID",
      400,
    );
  }
  return INTELLIGENCE_AGENT_ID;
}

function assertIntelligenceAgentReady(installation: BossAiAgentInstallation): void {
  const permissions = Array.isArray(installation.manifest.permissions) ? installation.manifest.permissions : [];
  const managerCompatible = ["runtime.run", "events.subscribe", "events.publish"].every((item) => permissions.includes(item));
  let code = "";
  let message = "";
  if (installation.manifest.id !== INTELLIGENCE_AGENT_ID) {
    code = "INTELLIGENCE_AGENT_INSTALLATION_INVALID";
    message = "BossAI OS 返回了错误的情报员工安装信息。";
  } else if (installation.manifest.version !== INTELLIGENCE_AGENT_VERSION) {
    code = "INTELLIGENCE_AGENT_VERSION_MISMATCH";
    message = `请在 BossAI Manager 中将 Intelligence Agent 升级到 v${INTELLIGENCE_AGENT_VERSION}。`;
  } else if (installation.signatureStatus !== "verified") {
    code = "INTELLIGENCE_AGENT_SIGNATURE_REQUIRED";
    message = "Intelligence Agent 尚未通过签名验证，未签名插件不能执行真实委派。";
  } else if (installation.status !== "enabled") {
    code = "INTELLIGENCE_AGENT_NOT_ENABLED";
    message = "请在 BossAI Manager 数字员工中心启用 Intelligence Agent。";
  } else if (installation.healthStatus !== "healthy") {
    code = "INTELLIGENCE_AGENT_UNHEALTHY";
    message = "请在 BossAI Manager 中重新运行 Intelligence Agent 健康检查。";
  } else if (!managerCompatible) {
    code = "INTELLIGENCE_AGENT_MANAGER_CONTRACT_MISSING";
    message = "Intelligence Agent 缺少 Manager Runtime 与事件权限。";
  }
  if (code) throw new BossAiOsClientError(message, code, 409);
}

function assertSalesAgentReady(installation: BossAiAgentInstallation): void {
  const permissions = Array.isArray(installation.manifest.permissions) ? installation.manifest.permissions : [];
  const managerCompatible = ["runtime.run", "events.subscribe", "events.publish"].every((item) => permissions.includes(item));
  let code = "";
  let message = "";
  if (installation.manifest.id !== SALES_AGENT_ID) {
    code = "SALES_AGENT_INSTALLATION_INVALID";
    message = "BossAI OS 返回了错误的销售员工安装信息。";
  } else if (installation.manifest.version !== SALES_AGENT_VERSION) {
    code = "SALES_AGENT_VERSION_MISMATCH";
    message = `请在 BossAI Manager 中将 Sales Agent 升级到 v${SALES_AGENT_VERSION}。`;
  } else if (installation.signatureStatus !== "verified") {
    code = "SALES_AGENT_SIGNATURE_REQUIRED";
    message = "Sales Agent 尚未通过签名验证，未签名插件不能执行真实资格判断。";
  } else if (installation.status !== "enabled") {
    code = "SALES_AGENT_NOT_ENABLED";
    message = "请在 BossAI Manager 数字员工中心启用 Sales Agent。";
  } else if (installation.healthStatus !== "healthy") {
    code = "SALES_AGENT_UNHEALTHY";
    message = "请在 BossAI Manager 中重新运行 Sales Agent 健康检查。";
  } else if (!managerCompatible) {
    code = "SALES_AGENT_MANAGER_CONTRACT_MISSING";
    message = "Sales Agent 缺少 Manager Runtime 与事件权限。";
  }
  if (code) throw new BossAiOsClientError(message, code, 409);
}

function buildIntelligenceManagerObjective(input: {
  objective: string;
  sourceOperationId: string;
  opportunity: Opportunity;
  evidence: Array<{
    id: string | number;
    source: string;
    title: string;
    excerpt: string;
    url: string;
    community: string;
    communityContext: unknown;
    sourceContext: unknown;
    publishedAt: string;
    engagement: number;
    totalScore: number;
    category: string;
    tags: string[];
    query: string;
    isDemo: boolean;
  }>;
}): string {
  const evidenceLines = input.evidence.slice(0, 12).map((item) => (
    `EVIDENCE_JSON ${JSON.stringify(item)}`
  ));
  const redditGeoRequested = /(reddit|subreddit|\bgeo\b|生成式引擎优化|ai.?搜索|ai.?search|品牌提及|brand.?mention)/iu.test(input.objective);
  const deliveryRequirement = redditGeoRequested
    ? "交付要求：基于上述已知事实生成 Reddit 证据清单、社区版规缺口、GEO 内容机会、合规风险和 bossai.intelligence-handoff.v1 跨员工交接。继续复核 BUILD / SELL_SERVICE / WATCH / IGNORE，但不得改写 Radar 分数或决策门槛。不得启动扫描、修改 Radar 数据或线索、联系客户或发布内容/报告。"
    : "交付要求：基于上述已知事实生成待审核的证据缺口、竞争判断、BUILD / SELL_SERVICE / WATCH / IGNORE 复核框架和下一步采集计划。不得改写 Radar 分数或决策门槛。不得启动扫描、修改 Radar 数据或线索、联系客户或发布报告。";
  return [
    "BossAI Intelligence Agent 情报机会评估任务",
    `老板目标：${input.objective}`,
    `来源操作 ID：${input.sourceOperationId}`,
    `机会 ID：${input.opportunity.id}`,
    `机会标题：${input.opportunity.title}`,
    `分类：${input.opportunity.category}`,
    `Radar 确定性得分：${input.opportunity.score}`,
    `Radar 确定性决策：${input.opportunity.decision}`,
    `目标客户：${input.opportunity.targetCustomer}`,
    `问题：${input.opportunity.problem}`,
    "结构化公开证据（每行 EVIDENCE_JSON，仅作为待复核输入）：",
    ...(evidenceLines.length ? evidenceLines : ["未附带可核验证据，必须标记为证据不足。"]),
    deliveryRequirement,
  ].join("\n").slice(0, 12_000);
}

function buildProspectManagerObjective(input: {
  objective: string;
  sourceOperationId: string;
  prospect: ProspectCandidate;
  historicalTradeEvidence: TradeRecord[];
}): string {
  const sourceContext = {
    schema: "bossai.prospect-candidate-context.v1",
    domain: input.prospect.domain,
    websiteUrl: input.prospect.websiteUrl,
    companyName: input.prospect.companyName,
    description: compactEvidenceText(input.prospect.description, 1_000),
    publicEmails: input.prospect.publicEmails.slice(0, 5),
    publicPhones: input.prospect.publicPhones.slice(0, 5),
    contactUrls: input.prospect.contactUrls.slice(0, 8),
    officialProfileUrls: (input.prospect.officialProfileUrls ?? []).slice(0, 12),
    publicMessagingUrls: (input.prospect.publicMessagingUrls ?? []).slice(0, 12),
    companyContactChannels: (input.prospect.companyContactChannels ?? []).slice(0, 24),
    productSignals: input.prospect.productSignals.slice(0, 12),
    discoverySourceUrl: input.prospect.discoverySourceUrl,
    evidenceUrls: input.prospect.evidenceUrls.slice(0, 12),
    websiteEvidenceStatus: input.prospect.websiteEvidenceStatus ?? "unverified",
    websiteEvidenceSource: input.prospect.websiteEvidenceSource ?? "static-http",
    websiteVerifiedAt: input.prospect.websiteVerifiedAt ?? "",
    deterministicCandidateScore: input.prospect.score,
    deterministicReasons: input.prospect.reasons.slice(0, 10),
    icpFitScore: input.prospect.fitScore ?? null,
    icpTerms: (input.prospect.fitTerms ?? []).slice(0, 20),
    icpMatches: (input.prospect.fitMatches ?? []).slice(0, 20),
    staticEvidenceIncomplete: input.prospect.websiteEvidenceStatus === "static-incomplete"
      || input.prospect.reasons.some((item) => item.includes("JavaScript-rendered")),
    historicalTradeEvidence: input.historicalTradeEvidence.slice(0, 8).map((record) => ({
      tradeRecordId: record.id,
      role: record.role,
      country: record.country,
      productDescription: compactEvidenceText(record.productDescription, 500),
      hsCode: record.hsCode,
      tradeDate: record.tradeDate,
      quantity: compactEvidenceText(record.quantity, 120),
      amount: record.amount,
      currency: record.currency,
      sourceLabel: compactEvidenceText(record.sourceLabel, 120),
    })),
  };
  const evidenceLine = `EVIDENCE_JSON ${JSON.stringify({
    id: input.prospect.id,
    source: "website",
    title: input.prospect.companyName || input.prospect.domain,
    excerpt: compactEvidenceText(input.prospect.description, 800),
    url: input.prospect.websiteUrl,
    sourceContext,
    publishedAt: input.prospect.lastSeenAt,
    engagement: 0,
    totalScore: input.prospect.score,
    category: "prospect-discovery",
    tags: ["prospect", "company-website", "foreign-trade"],
    query: input.prospect.discoveryQuery,
    isDemo: false,
  })}`;
  return [
    "BossAI Intelligence Agent 潜客候选证据复核任务",
    `老板目标：${input.objective}`,
    `来源操作 ID：${input.sourceOperationId}`,
    `潜客候选 ID：${input.prospect.id}`,
    `企业：${input.prospect.companyName || input.prospect.domain}`,
    `域名：${input.prospect.domain}`,
    `官网：${input.prospect.websiteUrl}`,
    `发现来源：${input.prospect.discoverySourceUrl}`,
    `Radar 候选确定性得分：${input.prospect.score}`,
    `ICP 官网词组覆盖：${input.prospect.fitScore === null || input.prospect.fitScore === undefined ? "未配置" : `${input.prospect.fitScore}%`}`,
    evidenceLine,
    "交付要求：复核该企业是否是真实且与目标市场相关的潜客候选；区分已验证事实、推断和缺失信息；给出 FIT / NEED_MORE_EVIDENCE / REJECT 的待审核建议、销售资格判断所缺字段，以及是否值得交给 Sales Employee 做 sales.lead.qualify。CompanyContactChannel 只表示官网公开的公司级业务渠道证据；confidence 只表示渠道证据可信度，不得解释为购买意图、采购概率或成交概率。businessRole=procurement 仅表示目标企业公开的采购/寻源渠道，不表示其正在采购我们的产品。不得发送邮件、私信、自动外联、创建 CRM 正式线索、修改价格或执行任何外部商业动作。Radar 候选分数只用于排序，AI 不得把它改写成已成交概率。",
  ].join("\n").slice(0, 12_000);
}

function prospectReviewObjective(value: unknown, prospect: ProspectCandidate): string {
  const fallback = `复核潜客候选“${prospect.companyName || prospect.domain}”的公开企业证据、产品匹配和销售资格缺口，判断是否值得交给 Sales Employee 做 sales.lead.qualify；不得外联或创建 CRM 正式线索。`;
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") {
    throw new BossAiOsClientError("objective must be a string.", "BOSSAI_OBJECTIVE_INVALID", 400);
  }
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 4_000) {
    throw new BossAiOsClientError("objective must contain 8 to 4000 characters.", "BOSSAI_OBJECTIVE_INVALID", 400);
  }
  return normalized;
}

function buildProspectSalesManagerObjective(input: {
  objective: string;
  sourceOperationId: string;
  prospect: ProspectCandidate;
  intelligenceManagerTaskId: string;
  ownerApproval: Pick<ProspectOwnerDecisionRecord, "id" | "decision" | "reasonCode" | "note" | "decidedAt">;
  historicalTradeEvidence: TradeRecord[];
}): string {
  const fact = {
    schema: "bossai.prospect-sales-qualification-context.v1",
    prospectId: input.prospect.id,
    companyName: input.prospect.companyName,
    domain: input.prospect.domain,
    websiteUrl: input.prospect.websiteUrl,
    description: compactEvidenceText(input.prospect.description, 1_000),
    productSignals: input.prospect.productSignals.slice(0, 12),
    publicEmails: input.prospect.publicEmails.slice(0, 5),
    publicPhones: input.prospect.publicPhones.slice(0, 5),
    contactUrls: input.prospect.contactUrls.slice(0, 8),
    officialProfileUrls: (input.prospect.officialProfileUrls ?? []).slice(0, 12),
    publicMessagingUrls: (input.prospect.publicMessagingUrls ?? []).slice(0, 12),
    companyContactChannels: (input.prospect.companyContactChannels ?? []).slice(0, 24),
    discoverySourceUrl: input.prospect.discoverySourceUrl,
    evidenceUrls: input.prospect.evidenceUrls.slice(0, 12),
    websiteEvidenceStatus: input.prospect.websiteEvidenceStatus ?? "unverified",
    websiteEvidenceSource: input.prospect.websiteEvidenceSource ?? "static-http",
    websiteVerifiedAt: input.prospect.websiteVerifiedAt ?? "",
    radarCandidateScore: input.prospect.score,
    icpFitScore: input.prospect.fitScore ?? null,
    icpTerms: (input.prospect.fitTerms ?? []).slice(0, 20),
    icpMatches: (input.prospect.fitMatches ?? []).slice(0, 20),
    staticEvidenceIncomplete: input.prospect.websiteEvidenceStatus === "static-incomplete"
      || input.prospect.reasons.some((item) => item.includes("JavaScript-rendered")),
    historicalTradeEvidence: input.historicalTradeEvidence.slice(0, 8).map((record) => ({
      tradeRecordId: record.id,
      role: record.role,
      country: record.country,
      productDescription: compactEvidenceText(record.productDescription, 500),
      hsCode: record.hsCode,
      tradeDate: record.tradeDate,
      quantity: compactEvidenceText(record.quantity, 120),
      amount: record.amount,
      currency: record.currency,
      sourceLabel: compactEvidenceText(record.sourceLabel, 120),
    })),
    intelligenceManagerTaskId: input.intelligenceManagerTaskId,
    ownerDecisionId: input.ownerApproval.id,
    ownerDecisionAt: input.ownerApproval.decidedAt,
    ownerDecision: input.ownerApproval.decision,
    ownerDecisionReasonCode: input.ownerApproval.reasonCode,
    humanGate: "READY_FOR_SALES",
  };
  return [
    "BossAI Sales Agent 潜客资格判断任务",
    `老板目标：${input.objective}`,
    `来源操作 ID：${input.sourceOperationId}`,
    "指定能力：sales.lead.qualify",
    `前置 Intelligence Manager Task：${input.intelligenceManagerTaskId}`,
    `老板批准决策：${input.ownerApproval.id} · ${input.ownerApproval.decidedAt} · ${input.ownerApproval.reasonCode}`,
    `人工闸门：${input.prospect.status}`,
    `PROSPECT_FACT_JSON ${JSON.stringify(fact)}`,
    "资格判断要求：只基于以上已审核公开企业事实、关联历史贸易事实、前置 Intelligence Manager Task 和明确的老板 approve-sales 决策引用，分别判断已知事实、未知项、匹配风险和是否值得继续人工销售验证。老板批准只授权本次 Sales 资格判断，不授权外联、CRM 写入、报价、改价、签约或收款。CompanyContactChannel 只表示官网公开公司级业务渠道；confidence 只表示渠道证据可信度，不是购买意图、采购概率、销售分或成交概率。businessRole=procurement 只说明该企业公开了采购/寻源渠道，不能据此判断其正在购买我们的产品。历史交易只证明授权数据中记录过历史交易，不能自动证明当前需求、当前项目、预算、决策权或购买意图。决策权、真实需求、采购时间和预算未提供时必须明确标记未知。Radar 候选分只用于候选排序，不是采购概率或成交概率。",
    "交付要求：生成 sales.lead-qualification.md 待人工审核结果。不得发送邮件、私信或电话，不得自动跟进，不得报价、改价、签约、收款，也不得创建或修改 CRM 正式线索/客户记录。若资格不足，明确建议继续补证据或停止。",
  ].join("\n").slice(0, 12_000);
}

function prospectIntelligenceHandoffStatus(output: string): string {
  const known = [
    "READY_FOR_SALES_QUALIFICATION_REVIEW",
    "BLOCKED_PENDING_VERIFIED_WEBSITE_EVIDENCE",
    "BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE",
    "BLOCKED_PENDING_COMPANY_AND_OFFERING_EVIDENCE",
  ];
  return known.find((status) => output.includes(status)) ?? "UNSPECIFIED";
}

function prospectSalesQualificationObjective(value: unknown, prospect: ProspectCandidate): string {
  const fallback = `对潜客“${prospect.companyName || prospect.domain}”执行 sales.lead.qualify，只判断公开证据下的资格与缺口；不得外联、报价或自动创建 CRM 正式线索。`;
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") {
    throw new BossAiOsClientError("objective must be a string.", "BOSSAI_OBJECTIVE_INVALID", 400);
  }
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 4_000) {
    throw new BossAiOsClientError("objective must contain 8 to 4000 characters.", "BOSSAI_OBJECTIVE_INVALID", 400);
  }
  return normalized;
}

function redditCommunityFromUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!/(^|\.)reddit\.com$/i.test(url.hostname)) return "";
    const match = url.pathname.match(/^\/r\/([^/]+)/i);
    return match?.[1] ? `r/${decodeURIComponent(match[1]).slice(0, 80)}` : "";
  } catch {
    return "";
  }
}

function compactEvidenceText(value: string, maximum: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function bossAiObjective(value: unknown, opportunityTitle: string): string {
  const fallback = `根据 Radar Lite 已验证的机会“${opportunityTitle}”，生成一份可供老板审核的内容与执行草稿。`;
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") {
    throw new BossAiOsClientError("objective must be a string.", "BOSSAI_OBJECTIVE_INVALID", 400);
  }
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 4_000) {
    throw new BossAiOsClientError("objective must contain 8 to 4000 characters.", "BOSSAI_OBJECTIVE_INVALID", 400);
  }
  return normalized;
}

function bossAiRetryFailedRunId(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new BossAiOsClientError("retryFailedRunId must be a string.", "PROSPECT_RETRY_RUN_ID_INVALID", 400);
  }
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{3,160}$/.test(normalized)) {
    throw new BossAiOsClientError(
      "retryFailedRunId must contain 3 to 160 URL-safe characters.",
      "PROSPECT_RETRY_RUN_ID_INVALID",
      400,
    );
  }
  return normalized;
}

function bossAiSourceOperationId(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") {
    throw new BossAiOsClientError("sourceOperationId must be a string.", "BOSSAI_OPERATION_ID_INVALID", 400);
  }
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(normalized)) {
    throw new BossAiOsClientError(
      "sourceOperationId must be 8 to 128 URL-safe characters.",
      "BOSSAI_OPERATION_ID_INVALID",
      400,
    );
  }
  return normalized;
}

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback;
}

function prospectSearchQuery(value: unknown): string {
  if (typeof value !== "string") {
    throw new BossAiOsClientError("query must be a string.", "PROSPECT_SEARCH_QUERY_INVALID", 400);
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  const wordCount = normalized ? normalized.split(/\s+/u).length : 0;
  if (normalized.length < 3 || normalized.length > 400 || wordCount > 50) {
    throw new BossAiOsClientError(
      "query must contain 3 to 400 characters and at most 50 whitespace-delimited words.",
      "PROSPECT_SEARCH_QUERY_INVALID",
      400,
    );
  }
  return normalized;
}

function tradeRecordFilterText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001F\u007F]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
  return normalized || undefined;
}

function tradeRecordCountrySelector(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/[\u0000-\u001F\u007F]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 120);
}

function parseTradeRecordRole(value: unknown): TradeRecord["role"] | undefined {
  const allowed = new Set<TradeRecord["role"]>(["buyer", "importer", "supplier", "exporter", "unknown"]);
  return typeof value === "string" && allowed.has(value as TradeRecord["role"])
    ? value as TradeRecord["role"]
    : undefined;
}

function parseIsoDateFilter(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(normalized) ? normalized : undefined;
}

function parseProspectStatus(value: unknown, required = false): ProspectStatus | undefined {
  const allowed = new Set<ProspectStatus>(["DISCOVERED", "REVIEW_REQUIRED", "READY_FOR_SALES", "REJECTED"]);
  if (typeof value === "string" && allowed.has(value as ProspectStatus)) return value as ProspectStatus;
  return required ? undefined : undefined;
}

function parseLeadStatus(value: unknown): LeadStatus | undefined {
  const allowed = new Set<LeadStatus>(["NEW", "WAITLIST", "QUALIFIED", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]);
  return typeof value === "string" && allowed.has(value as LeadStatus) ? value as LeadStatus : undefined;
}

function parseLeadIntent(value: unknown): LeadIntent | undefined {
  const allowed = new Set<LeadIntent>(["commercial", "pro-waitlist", "white-label", "managed-service"]);
  return typeof value === "string" && allowed.has(value as LeadIntent) ? value as LeadIntent : undefined;
}

function parseLeadPriority(value: unknown): LeadPriority | undefined {
  const allowed = new Set<LeadPriority>(["HOT", "WARM", "COOL"]);
  return typeof value === "string" && allowed.has(value as LeadPriority) ? value as LeadPriority : undefined;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function shutdown(signal: string): void {
  console.log(`[${signal}] Shutting down...`);
  scheduler.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
