import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, publicConfig } from "./config.js";
import { RadarDatabase } from "./database.js";
import { seedDemoData } from "./demo.js";
import { RadarEngine } from "./pipeline.js";
import { RadarScheduler } from "./scheduler.js";
import { APP_NAME, APP_SLUG, APP_VERSION, LICENSE_LABEL } from "./version.js";

process.env.TZ = config.radar.timeZone;

const db = new RadarDatabase(config.dataDir);
const engine = new RadarEngine(db);
const scheduler = new RadarScheduler(engine);
const app = express();

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

app.get("/api/report/latest.md", (_req, res) => {
  const report = db.latestReport();
  if (!report) return res.status(404).type("text/plain").send("No report generated yet");
  const date = report.generatedAt.slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename=radar-report-${date}.md`);
  return res.type("text/markdown; charset=utf-8").send(report.markdown);
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
  console.error("[HTTP]", error);
  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({ error: message });
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

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback;
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
