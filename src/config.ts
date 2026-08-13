import "./local-env.js";
import path from "node:path";

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function listFromEnv(name: string, fallback: string, separator: RegExp, max: number): string[] {
  const raw = process.env[name] ?? fallback;
  return [...new Set(raw.split(separator).map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function topicsFromEnv(): string[] {
  return listFromEnv(
    "RADAR_TOPICS",
    "AI ecommerce,Shopify automation,Amazon seller tools,customer support AI,content automation",
    /,|\r?\n/,
    12,
  );
}

export const config = {
  port: intFromEnv("PORT", 3080, 1, 65535),
  host: process.env.HOST?.trim() || "127.0.0.1",
  dataDir: path.resolve(process.env.DATA_DIR?.trim() || "./data"),
  adminApiKey: process.env.RADAR_ADMIN_API_KEY?.trim() || "change-this-before-public-deployment",
  demoEnabled: boolFromEnv("RADAR_DEMO_ENABLED", true),
  commercial: {
    email: process.env.COMMERCIAL_LICENSE_EMAIL?.trim() || "liufeng420594566@gmail.com",
    url: process.env.COMMERCIAL_LICENSE_URL?.trim() || "",
    leadCaptureEnabled: boolFromEnv("COMMERCIAL_LEAD_CAPTURE_ENABLED", true),
    leadAdminEnabled: boolFromEnv("COMMERCIAL_LEAD_ADMIN_ENABLED", true),
    maxSubmissionsPerHour: intFromEnv("COMMERCIAL_LEAD_RATE_LIMIT", 5, 1, 100),
  },
  radar: {
    autoScan: boolFromEnv("RADAR_AUTO_SCAN", true),
    runOnStartup: boolFromEnv("RADAR_RUN_ON_STARTUP", true),
    dailyHour: intFromEnv("RADAR_DAILY_HOUR", 8, 0, 23),
    dailyMinute: intFromEnv("RADAR_DAILY_MINUTE", 0, 0, 59),
    timeZone: process.env.RADAR_TIMEZONE?.trim() || "Asia/Shanghai",
    lookbackDays: intFromEnv("RADAR_LOOKBACK_DAYS", 14, 1, 90),
    maxItemsPerSource: intFromEnv("RADAR_MAX_ITEMS_PER_SOURCE", 20, 3, 100),
    redditContextCommunities: intFromEnv("RADAR_REDDIT_CONTEXT_COMMUNITIES", 3, 0, 10),
    topics: topicsFromEnv(),
    arxivCategories: listFromEnv("RADAR_ARXIV_CATEGORIES", "cs.AI,cs.CL,cs.LG", /,|\r?\n/, 12),
    rssFeeds: listFromEnv("RADAR_RSS_FEEDS", "", /;|\r?\n/, 30),
  },
  bossAiOs: {
    baseUrl: (process.env.BOSSAI_OS_URL?.trim() || "http://127.0.0.1:3001").replace(/\/$/, ""),
    apiKey: process.env.BOSSAI_OS_API_KEY?.trim() || "",
    jwt: process.env.BOSSAI_OS_JWT?.trim() || "",
    model: process.env.BOSSAI_OS_AI_MODEL?.trim() || "bossai-balanced",
    timeoutMs: intFromEnv("BOSSAI_OS_TIMEOUT_MS", 45_000, 3_000, 120_000),
  },
  ai: {
    provider: (process.env.AI_PROVIDER?.trim().toLowerCase() || "deterministic") as
      | "deterministic"
      | "bossai-gateway",
  },
  githubToken: process.env.GITHUB_TOKEN?.trim() || "",
} as const;

export function publicConfig() {
  return {
    topics: config.radar.topics,
    sources: {
      redditContextCommunities: config.radar.redditContextCommunities,
      arxivCategories: config.radar.arxivCategories,
      rssFeedCount: config.radar.rssFeeds.length,
    },
    schedule: {
      enabled: config.radar.autoScan,
      runOnStartup: config.radar.runOnStartup,
      hour: config.radar.dailyHour,
      minute: config.radar.dailyMinute,
      timeZone: config.radar.timeZone,
    },
    ai: {
      provider: config.ai.provider === "bossai-gateway" && config.bossAiOs.apiKey
        ? "bossai-gateway"
        : "deterministic",
      model: config.ai.provider === "bossai-gateway" && config.bossAiOs.apiKey
        ? config.bossAiOs.model
        : null,
      employeeDelegationConfigured: Boolean(config.bossAiOs.jwt),
    },
    demoEnabled: config.demoEnabled,
    commercial: {
      email: config.commercial.email,
      url: config.commercial.url,
      leadCaptureEnabled: config.commercial.leadCaptureEnabled,
      leadAdminEnabled: config.commercial.leadAdminEnabled,
    },
    license: {
      type: "source-available-non-commercial",
      label: "BossAI Radar Lite Non-Commercial License 1.0",
      commercialUseRequiresAuthorization: true,
    },
  };
}
