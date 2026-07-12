import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, publicConfig } from "./config.js";
import { RadarDatabase } from "./database.js";
import { seedDemoData } from "./demo.js";
import {
  LeadValidationError,
  normalizeActivityInput,
  normalizeLeadPatch,
  validateLeadInput,
} from "./leads.js";
import { RadarEngine } from "./pipeline.js";
import { createEnglishReport } from "./report.js";
import { RadarScheduler } from "./scheduler.js";
import { APP_NAME, APP_SLUG, APP_VERSION, LICENSE_LABEL } from "./version.js";
import type { LeadIntent, LeadPriority, LeadStatus } from "./types.js";

process.env.TZ = config.radar.timeZone;

const db = new RadarDatabase(config.dataDir);
const engine = new RadarEngine(db);
const scheduler = new RadarScheduler(engine);
const app = express();
const leadSubmissionWindows = new Map<string, number[]>();

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
    latestRun: db.listRuns(1)[0] ?? null,
    latestReport: db.latestReport(),
  });
});

app.get("/api/opportunities", (req, res) => {
  res.json({ items: db.listOpportunities(parseLimit(req.query.limit, 50, 200)) });
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
    ? createEnglishReport(run, db.listOpportunities(50), db.listEvidence(100)).markdown
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

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicCandidates = [path.resolve(currentDir, "../public"), path.resolve(process.cwd(), "public")];
const publicDir = publicCandidates.find((candidate) => existsSync(path.join(candidate, "index.html")));
if (!publicDir) throw new Error("Public dashboard files not found");
app.use(express.static(publicDir, { maxAge: "1h", etag: true }));
app.get("*splat", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
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

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback;
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
