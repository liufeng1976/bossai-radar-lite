import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BossAiOsClient,
  BossAiOsClientError,
  type BossAiAgentInstallation,
} from "./bossai-os-client.js";
import { config, publicConfig } from "./config.js";
import { RadarDatabase } from "./database.js";
import { seedDemoData } from "./demo.js";
import { buildFollowUpQueue, createFollowUpCalendar, createFollowUpDraft, createFollowUpReport } from "./followups.js";
import {
  LeadValidationError,
  normalizeActivityInput,
  normalizeLeadPatch,
  validateLeadInput,
} from "./leads.js";
import { RadarEngine } from "./pipeline.js";
import { createEnglishReport } from "./report.js";
import { RadarScheduler } from "./scheduler.js";
import { assertSafePublicBinding } from "./security.js";
import { APP_NAME, APP_SLUG, APP_VERSION, LICENSE_LABEL } from "./version.js";
import type { LeadIntent, LeadPriority, LeadStatus, Opportunity } from "./types.js";

process.env.TZ = config.radar.timeZone;
assertSafePublicBinding(config.host, config.adminApiKey);

const db = new RadarDatabase(config.dataDir);
const bossAiOs = new BossAiOsClient({
  baseUrl: config.bossAiOs.baseUrl,
  apiKey: config.bossAiOs.apiKey,
  jwt: config.bossAiOs.jwt,
  model: config.bossAiOs.model,
  timeoutMs: config.bossAiOs.timeoutMs,
});
const engine = new RadarEngine(db);
const scheduler = new RadarScheduler(engine);
const app = express();
const leadSubmissionWindows = new Map<string, number[]>();
const INTELLIGENCE_AGENT_ID = "bossai-intelligence-agent";
const INTELLIGENCE_AGENT_VERSION = "0.3.0";

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

app.get("/api/admin/bossai/delegations", requireLeadAdmin, (req, res) => {
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
    items: db.listBossAiDelegations(parseLimit(req.query.limit, 50, 200)),
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

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicCandidates = [path.resolve(currentDir, "../public"), path.resolve(process.cwd(), "public")];
const publicDir = publicCandidates.find((candidate) => existsSync(path.join(candidate, "index.html")));
if (!publicDir) throw new Error("Public dashboard files not found");
app.use(express.static(publicDir, { maxAge: "1h", etag: true }));
app.get("*splat", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
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
