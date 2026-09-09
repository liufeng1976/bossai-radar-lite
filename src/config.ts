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

function prospectSearchProviderFromEnv(): "disabled" | "brave" {
  const value = process.env.RADAR_PROSPECT_SEARCH_PROVIDER?.trim().toLowerCase();
  return value === "brave" ? "brave" : "disabled";
}

function prospectMapProviderFromEnv(): "disabled" | "google_places" {
  const value = process.env.RADAR_PROSPECT_MAP_PROVIDER?.trim().toLowerCase();
  return value === "google_places" ? "google_places" : "disabled";
}

function boundedStringFromEnv(name: string, fallback: string, maxLength: number): string {
  return (process.env[name]?.trim() || fallback).slice(0, maxLength);
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
    websiteSeeds: listFromEnv("RADAR_WEBSITE_SEEDS", "", /;|\r?\n/, 50),
    websiteMaxPagesPerSeed: intFromEnv("RADAR_WEBSITE_MAX_PAGES_PER_SEED", 5, 1, 20),
    websiteMaxDepth: intFromEnv("RADAR_WEBSITE_MAX_DEPTH", 1, 0, 2),
    websiteConcurrentSeeds: intFromEnv("RADAR_WEBSITE_CONCURRENT_SEEDS", 4, 1, 10),
    websiteRespectRobots: boolFromEnv("RADAR_WEBSITE_RESPECT_ROBOTS", true),
    prospectDiscoverySeeds: listFromEnv("RADAR_PROSPECT_DISCOVERY_SEEDS", "", /;|\r?\n/, 50),
    prospectDiscoveryMaxPagesPerSeed: intFromEnv("RADAR_PROSPECT_DISCOVERY_MAX_PAGES_PER_SEED", 3, 1, 10),
    prospectDiscoveryMaxDepth: intFromEnv("RADAR_PROSPECT_DISCOVERY_MAX_DEPTH", 1, 0, 1),
    prospectDiscoveryConcurrentSeeds: intFromEnv("RADAR_PROSPECT_DISCOVERY_CONCURRENT_SEEDS", 3, 1, 10),
    prospectDiscoveryMaxCandidatesPerSeed: intFromEnv("RADAR_PROSPECT_DISCOVERY_MAX_CANDIDATES_PER_SEED", 20, 1, 100),
    prospectDiscoveryMinScore: intFromEnv("RADAR_PROSPECT_DISCOVERY_MIN_SCORE", 45, 0, 100),
    prospectIcpTerms: listFromEnv("RADAR_PROSPECT_ICP_TERMS", "", /;|\r?\n/, 20),
    prospectVerifyMaxWebsitesPerScan: intFromEnv("RADAR_PROSPECT_VERIFY_MAX_WEBSITES_PER_SCAN", 20, 1, 100),
    prospectSearchProvider: prospectSearchProviderFromEnv(),
    prospectSearchQueries: listFromEnv("RADAR_PROSPECT_SEARCH_QUERIES", "", /;|\r?\n/, 20),
    prospectSearchMaxResultsPerQuery: intFromEnv("RADAR_PROSPECT_SEARCH_MAX_RESULTS_PER_QUERY", 10, 1, 20),
    prospectSearchConcurrentQueries: intFromEnv("RADAR_PROSPECT_SEARCH_CONCURRENT_QUERIES", 2, 1, 5),
    prospectSearchCountry: boundedStringFromEnv("RADAR_PROSPECT_SEARCH_COUNTRY", "US", 3).toUpperCase(),
    prospectSearchLanguage: boundedStringFromEnv("RADAR_PROSPECT_SEARCH_LANGUAGE", "en", 8).toLowerCase(),
    prospectMapProvider: prospectMapProviderFromEnv(),
    prospectMapQueries: listFromEnv("RADAR_PROSPECT_MAP_QUERIES", "", /;|\r?\n/, 20),
    prospectMapMaxResultsPerQuery: intFromEnv("RADAR_PROSPECT_MAP_MAX_RESULTS_PER_QUERY", 10, 1, 20),
    prospectMapConcurrentQueries: intFromEnv("RADAR_PROSPECT_MAP_CONCURRENT_QUERIES", 2, 1, 5),
    prospectMapRegionCode: boundedStringFromEnv("RADAR_PROSPECT_MAP_REGION_CODE", "US", 2).toUpperCase(),
    prospectMapLanguageCode: boundedStringFromEnv("RADAR_PROSPECT_MAP_LANGUAGE_CODE", "en", 16),
  },
  bossAiOs: {
    baseUrl: (process.env.BOSSAI_OS_URL?.trim() || "http://127.0.0.1:3001").replace(/\/$/, ""),
    apiKey: process.env.BOSSAI_OS_API_KEY?.trim() || "",
    jwt: process.env.BOSSAI_OS_JWT?.trim() || "",
    workbenchKey: process.env.BOSSAI_OS_WORKBENCH_KEY?.trim() || "",
    model: process.env.BOSSAI_OS_AI_MODEL?.trim() || "bossai-balanced",
    timeoutMs: intFromEnv("BOSSAI_OS_TIMEOUT_MS", 45_000, 3_000, 120_000),
  },
  ai: {
    provider: (process.env.AI_PROVIDER?.trim().toLowerCase() || "deterministic") as
      | "deterministic"
      | "bossai-gateway",
  },
  githubToken: process.env.GITHUB_TOKEN?.trim() || "",
  braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY?.trim() || "",
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY?.trim() || "",
} as const;

export function publicConfig() {
  return {
    topics: config.radar.topics,
    sources: {
      redditContextCommunities: config.radar.redditContextCommunities,
      arxivCategories: config.radar.arxivCategories,
      rssFeedCount: config.radar.rssFeeds.length,
      websiteSeedCount: config.radar.websiteSeeds.length,
      websiteMaxPagesPerSeed: config.radar.websiteMaxPagesPerSeed,
      websiteMaxDepth: config.radar.websiteMaxDepth,
      websiteConcurrentSeeds: config.radar.websiteConcurrentSeeds,
      websiteRespectRobots: config.radar.websiteRespectRobots,
      prospectDiscoverySeedCount: config.radar.prospectDiscoverySeeds.length,
      prospectDiscoveryMaxPagesPerSeed: config.radar.prospectDiscoveryMaxPagesPerSeed,
      prospectDiscoveryMaxDepth: config.radar.prospectDiscoveryMaxDepth,
      prospectDiscoveryConcurrentSeeds: config.radar.prospectDiscoveryConcurrentSeeds,
      prospectDiscoveryMaxCandidatesPerSeed: config.radar.prospectDiscoveryMaxCandidatesPerSeed,
      prospectDiscoveryMinScore: config.radar.prospectDiscoveryMinScore,
      prospectIcpTermCount: config.radar.prospectIcpTerms.length,
      prospectVerifyMaxWebsitesPerScan: config.radar.prospectVerifyMaxWebsitesPerScan,
      prospectSearchProvider: config.radar.prospectSearchProvider,
      prospectSearchConfigured: config.radar.prospectSearchProvider === "brave" && Boolean(config.braveSearchApiKey),
      prospectSearchQueryCount: config.radar.prospectSearchQueries.length,
      prospectSearchMaxResultsPerQuery: config.radar.prospectSearchMaxResultsPerQuery,
      prospectSearchCountry: config.radar.prospectSearchCountry,
      prospectSearchLanguage: config.radar.prospectSearchLanguage,
      prospectMapProvider: config.radar.prospectMapProvider,
      prospectMapConfigured: config.radar.prospectMapProvider === "google_places" && Boolean(config.googlePlacesApiKey),
      prospectMapQueryCount: config.radar.prospectMapQueries.length,
      prospectMapMaxResultsPerQuery: config.radar.prospectMapMaxResultsPerQuery,
      prospectMapRegionCode: config.radar.prospectMapRegionCode,
      prospectMapLanguageCode: config.radar.prospectMapLanguageCode,
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
      ownerDecisionProjectionConfigured: Boolean(config.bossAiOs.workbenchKey),
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
