import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { config } from "./config.js";
import { inferCompanyContactBusinessRole, mergeCompanyContactChannels } from "./contact-channels.js";
import type {
  BusinessWebsiteContext,
  CompanyContactBusinessRole,
  CompanyContactChannel,
  ProspectDiscoveryCandidate,
  ProspectDiscoveryOutcome,
  RawItem,
  RedditCommunityContext,
  SourceName,
  SourceOutcome,
  WebsiteEvidenceAcquisitionMode,
} from "./types.js";

const USER_AGENT = "BossAI-Radar-Lite/0.1 (+non-commercial research)";
const ROBOTS_PRODUCT_TOKEN = "bossai-radar-lite";
const MAX_XML_BYTES = 2 * 1024 * 1024;
const MAX_HTML_BYTES = 1 * 1024 * 1024;
const MAX_ROBOTS_BYTES = 256 * 1024;
const MAX_SITEMAP_BYTES = 1024 * 1024;
const MAX_SITEMAP_DOCUMENTS_PER_SEED = 3;
const MAX_SITEMAP_LOCATIONS = 200;
const MAX_SEARCH_RESPONSE_BYTES = 2 * 1024 * 1024;
const BRAVE_WEB_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const GOOGLE_PLACES_TEXT_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const MAX_REDIRECTS = 3;
const REDDIT_CONTEXT_TTL_MS = 24 * 60 * 60 * 1_000;
const REDDIT_CONTEXT_FAILURE_TTL_MS = 15 * 60 * 1_000;
const BLOCKED_ADDRESSES = createBlockedAddressList();
const redditContextCache = new Map<string, { expiresAt: number; context: RedditCommunityContext }>();

export async function collectAll(additionalWebsiteSeeds: readonly string[] = []): Promise<SourceOutcome[]> {
  const verifiedProspectSeeds = additionalWebsiteSeeds.slice(0, config.radar.prospectVerifyMaxWebsitesPerScan);
  const websiteSeeds = [...new Set([...config.radar.websiteSeeds, ...verifiedProspectSeeds])].slice(0, 100);
  return Promise.all([
    withOutcome("reddit", collectReddit),
    withOutcome("hackernews", collectHackerNews),
    withOutcome("github", collectGitHub),
    withOutcome("arxiv", collectArxiv),
    collectRssOutcome(),
    collectWebsiteOutcome(websiteSeeds),
  ]);
}

async function withOutcome(source: SourceName, collector: () => Promise<RawItem[]>): Promise<SourceOutcome> {
  const startedAt = Date.now();
  try {
    const items = await collector();
    return {
      source,
      status: items.length > 0 ? "success" : "partial",
      items,
      error: items.length > 0 ? undefined : "No matching public evidence returned",
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      source,
      status: "failed",
      items: [],
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function collectReddit(): Promise<RawItem[]> {
  const perTopic = perTopicLimit();
  const batches = await Promise.all(
    config.radar.topics.map(async (topic) => {
      const query = `${topic} (problem OR frustrating OR alternative OR "looking for" OR "would pay")`;
      const url = new URL("https://www.reddit.com/search.json");
      url.searchParams.set("q", query);
      url.searchParams.set("sort", "new");
      url.searchParams.set("t", lookbackWindow());
      url.searchParams.set("limit", String(perTopic));
      url.searchParams.set("raw_json", "1");
      const payload = await fetchJson<RedditResponse>(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      return parseRedditSearch(payload, topic);
    }),
  );
  const items = capAndDedupe(batches.flat());
  const contexts = await collectRedditCommunityContexts(items);
  return items.map((item) => ({
    ...item,
    ...(item.community && contexts.has(item.community.toLowerCase())
      ? { sourceContext: contexts.get(item.community.toLowerCase()) }
      : {}),
  }));
}

export function parseRedditSearch(payload: RedditResponse, topic: string): RawItem[] {
  return (payload.data?.children ?? []).map(({ data }) => ({
    source: "reddit" as const,
    externalId: data.name || data.id,
    title: cleanText(data.title),
    body: cleanText(data.selftext),
    url: data.permalink ? `https://www.reddit.com${data.permalink}` : data.url,
    author: data.author || "unknown",
    publishedAt: new Date((data.created_utc || 0) * 1000).toISOString(),
    engagement: Math.max(0, Number(data.score || 0)) + Math.max(0, Number(data.num_comments || 0) * 2),
    query: topic,
    community: cleanText(data.subreddit).slice(0, 80),
  }));
}

async function collectRedditCommunityContexts(items: RawItem[]): Promise<Map<string, RedditCommunityContext>> {
  const limit = config.radar.redditContextCommunities;
  if (limit <= 0) return new Map();
  const communities = [...new Set(items
    .map((item) => item.community || "")
    .filter((item) => /^[A-Za-z0-9_]{1,80}$/u.test(item)))]
    .slice(0, limit);
  const entries = await Promise.all(communities.map(async (community) => [
    community.toLowerCase(),
    await getRedditCommunityContext(community),
  ] as const));
  return new Map(entries);
}

async function getRedditCommunityContext(community: string): Promise<RedditCommunityContext> {
  const key = community.toLowerCase();
  const cached = redditContextCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.context;
  const base = `https://www.reddit.com/r/${encodeURIComponent(community)}`;
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
  const [about, rules, hot] = await Promise.allSettled([
    fetchJson<RedditAboutResponse>(new URL(`${base}/about.json?raw_json=1`), { headers }),
    fetchJson<RedditRulesResponse>(new URL(`${base}/about/rules.json?raw_json=1`), { headers }),
    fetchJson<RedditResponse>(new URL(`${base}/hot.json?limit=10&raw_json=1`), { headers }),
  ]);
  const context = parseRedditCommunityContext(
    community,
    about.status === "fulfilled" ? about.value : null,
    rules.status === "fulfilled" ? rules.value : null,
    hot.status === "fulfilled" ? hot.value : null,
  );
  redditContextCache.set(key, {
    expiresAt: Date.now() + (context.status === "available" ? REDDIT_CONTEXT_TTL_MS : REDDIT_CONTEXT_FAILURE_TTL_MS),
    context,
  });
  if (redditContextCache.size > 100) {
    for (const [entryKey, entry] of redditContextCache) {
      if (entry.expiresAt <= Date.now()) redditContextCache.delete(entryKey);
    }
    while (redditContextCache.size > 100) {
      const oldestKey = redditContextCache.keys().next().value;
      if (typeof oldestKey !== "string") break;
      redditContextCache.delete(oldestKey);
    }
  }
  return context;
}

export function parseRedditCommunityContext(
  community: string,
  about: RedditAboutResponse | null,
  rules: RedditRulesResponse | null,
  hot: RedditResponse | null,
  fetchedAt = new Date().toISOString(),
): RedditCommunityContext {
  const safeCommunity = cleanText(community).slice(0, 80);
  const base = `https://www.reddit.com/r/${encodeURIComponent(safeCommunity)}`;
  const parsedRules = (rules?.rules ?? []).slice(0, 30).map((item) => ({
    shortName: cleanText(item.short_name).slice(0, 160),
    description: cleanText(item.description || item.violation_reason).slice(0, 1_000),
  })).filter((item) => item.shortName || item.description);
  const pinnedPosts = (hot?.data?.children ?? [])
    .filter(({ data }) => data.stickied === true)
    .slice(0, 5)
    .map(({ data }) => ({
      title: cleanText(data.title).slice(0, 300),
      url: data.permalink ? `https://www.reddit.com${data.permalink}` : normalizeHttpLink(data.url),
    }))
    .filter((item) => item.title && item.url);
  return {
    schema: "bossai.reddit-community-context.v1",
    community: safeCommunity,
    status: about || rules || hot ? "available" : "unavailable",
    aboutStatus: about ? "available" : "unavailable",
    rulesStatus: rules ? "available" : "unavailable",
    pinnedPostsStatus: hot ? "available" : "unavailable",
    aboutUrl: `${base}/about/`,
    rulesUrl: `${base}/about/rules`,
    description: cleanText(about?.data?.public_description || about?.data?.description).slice(0, 2_000),
    rules: parsedRules,
    pinnedPosts,
    fetchedAt,
  };
}

async function collectHackerNews(): Promise<RawItem[]> {
  const perTopic = perTopicLimit();
  const cutoff = Math.floor((Date.now() - config.radar.lookbackDays * 86_400_000) / 1000);
  const batches = await Promise.all(
    config.radar.topics.map(async (topic) => {
      const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
      url.searchParams.set("query", topic);
      url.searchParams.set("tags", "story");
      url.searchParams.set("numericFilters", `created_at_i>${cutoff}`);
      url.searchParams.set("hitsPerPage", String(perTopic));
      const payload = await fetchJson<HackerNewsResponse>(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      return (payload.hits ?? []).map((hit) => ({
        source: "hackernews" as const,
        externalId: hit.objectID,
        title: cleanText(hit.title || hit.story_title || "Untitled"),
        body: cleanText(hit.story_text || hit.comment_text || ""),
        url: hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        author: hit.author || "unknown",
        publishedAt: hit.created_at || new Date((hit.created_at_i || cutoff) * 1000).toISOString(),
        engagement: Math.max(0, Number(hit.points || 0)) + Math.max(0, Number(hit.num_comments || 0) * 2),
        query: topic,
      }));
    }),
  );
  return capAndDedupe(batches.flat());
}

async function collectGitHub(): Promise<RawItem[]> {
  const perTopic = Math.min(30, perTopicLimit());
  const createdAfter = new Date(Date.now() - config.radar.lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;

  const batches = await Promise.all(
    config.radar.topics.map(async (topic) => {
      const url = new URL("https://api.github.com/search/issues");
      url.searchParams.set("q", `\"${topic}\" is:issue created:>=${createdAfter}`);
      url.searchParams.set("sort", "comments");
      url.searchParams.set("order", "desc");
      url.searchParams.set("per_page", String(perTopic));
      const payload = await fetchJson<GitHubSearchResponse>(url, { headers });
      return (payload.items ?? []).map((item) => ({
        source: "github" as const,
        externalId: String(item.id),
        title: cleanText(item.title),
        body: cleanText(item.body || ""),
        url: item.html_url,
        author: item.user?.login || "unknown",
        publishedAt: item.created_at,
        engagement: Math.max(0, Number(item.comments || 0) * 3) + reactionCount(item.reactions),
        query: topic,
      }));
    }),
  );
  return capAndDedupe(batches.flat());
}

async function collectArxiv(): Promise<RawItem[]> {
  const topicQuery = config.radar.topics
    .slice(0, 8)
    .map((topic) => `all:\"${topic.replace(/\"/g, "")}\"`)
    .join(" OR ");
  const categoryQuery = config.radar.arxivCategories
    .map((category) => `cat:${category}`)
    .join(" OR ");
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", [topicQuery && `(${topicQuery})`, categoryQuery && `(${categoryQuery})`].filter(Boolean).join(" AND "));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  url.searchParams.set("max_results", String(config.radar.maxItemsPerSource));

  const xml = await fetchText(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" } });
  return parseArxivFeed(xml);
}

export function parseArxivFeed(xml: string, now = Date.now()): RawItem[] {
  const items: RawItem[] = [];
  for (const entry of findXmlBlocks(xml, "entry")) {
    const id = extractXmlText(entry, "id");
    const title = cleanText(extractXmlText(entry, "title"));
    const summary = cleanText(extractXmlText(entry, "summary"));
    const authorBlock = findXmlBlocks(entry, "author")[0] || "";
    const author = cleanText(extractXmlText(authorBlock, "name")) || "unknown";
    const publishedAt = normalizeRecentDate(
      extractXmlText(entry, "published") || extractXmlText(entry, "updated"),
      now,
    );
    const link = normalizeHttpLink(extractXmlHref(entry) || id);
    if (!title || !link || !publishedAt) continue;
    items.push({
      source: "arxiv" as const,
      externalId: id || stableId(link || title),
      title,
      body: summary,
      url: link,
      author,
      publishedAt,
      engagement: 0,
      query: config.radar.arxivCategories.join(","),
    });
  }
  return capAndDedupe(items);
}

export async function discoverAllProspectCandidates(now = Date.now()): Promise<ProspectDiscoveryOutcome> {
  const startedAt = Date.now();
  const [directory, search, maps] = await Promise.all([
    discoverProspectCandidates(config.radar.prospectDiscoverySeeds, now),
    discoverProspectSearchCandidates(config.radar.prospectSearchQueries, now),
    discoverProspectMapCandidates(config.radar.prospectMapQueries, now),
  ]);
  const channels = [
    { channel: "directory" as const, status: directory.status, candidateCount: directory.candidates.length, errorCount: directory.errors.length, durationMs: directory.durationMs },
    { channel: "web" as const, status: search.status, candidateCount: search.candidates.length, errorCount: search.errors.length, durationMs: search.durationMs },
    { channel: "maps" as const, status: maps.status, candidateCount: maps.candidates.length, errorCount: maps.errors.length, durationMs: maps.durationMs },
  ];
  const attempted = [directory, search, maps].filter((item) => item.status !== "skipped");
  if (attempted.length === 0) return { status: "skipped", candidates: [], errors: [], durationMs: 0, channels };

  const candidates = mergeProspectCandidates(
    attempted.flatMap((item) => item.candidates),
    500,
  ).filter((candidate) => candidate.score >= config.radar.prospectDiscoveryMinScore);
  const errors = [
    ...directory.errors.map((error) => `directory: ${error}`),
    ...search.errors.map((error) => `search: ${error}`),
    ...maps.errors.map((error) => `maps: ${error}`),
  ];
  const failedCount = attempted.filter((item) => item.status === "failed").length;
  const partialCount = attempted.filter((item) => item.status === "partial").length;
  const succeededCount = attempted.filter((item) => item.status === "success").length;
  return {
    status: failedCount === attempted.length
      ? "failed"
      : failedCount > 0 || partialCount > 0
        ? "partial"
        : succeededCount > 0 ? "success" : "partial",
    candidates,
    errors,
    durationMs: Date.now() - startedAt,
    channels,
  };
}

export interface ProspectSearchRuntimeOptions {
  provider?: "disabled" | "brave";
  apiKey?: string;
  country?: string;
  searchLanguage?: string;
  maxResultsPerQuery?: number;
  concurrentQueries?: number;
  fetchImpl?: typeof fetch;
}

export async function discoverProspectSearchCandidates(
  queries: readonly string[] = config.radar.prospectSearchQueries,
  now = Date.now(),
  options: ProspectSearchRuntimeOptions = {},
): Promise<ProspectDiscoveryOutcome> {
  const runtime = {
    provider: options.provider ?? config.radar.prospectSearchProvider,
    apiKey: options.apiKey ?? config.braveSearchApiKey,
    country: (options.country ?? config.radar.prospectSearchCountry).slice(0, 3).toUpperCase(),
    searchLanguage: (options.searchLanguage ?? config.radar.prospectSearchLanguage).slice(0, 8).toLowerCase(),
    maxResultsPerQuery: Math.max(1, Math.min(20, options.maxResultsPerQuery ?? config.radar.prospectSearchMaxResultsPerQuery)),
    concurrentQueries: Math.max(1, Math.min(5, options.concurrentQueries ?? config.radar.prospectSearchConcurrentQueries)),
    fetchImpl: options.fetchImpl ?? fetch,
  } as const;
  if (runtime.provider === "disabled" || queries.length === 0) {
    return { status: "skipped", candidates: [], errors: [], durationMs: 0 };
  }
  if (runtime.provider !== "brave") {
    return { status: "failed", candidates: [], errors: ["Unsupported prospect search provider"], durationMs: 0 };
  }
  if (!runtime.apiKey) {
    return { status: "failed", candidates: [], errors: ["BRAVE_SEARCH_API_KEY is required when RADAR_PROSPECT_SEARCH_PROVIDER=brave"], durationMs: 0 };
  }

  const startedAt = Date.now();
  const normalizedQueries = [...new Set(queries.map(normalizeProspectSearchQuery).filter(Boolean))].slice(0, 20);
  if (normalizedQueries.length === 0) {
    return { status: "skipped", candidates: [], errors: [], durationMs: 0 };
  }
  const settled = await mapSettledWithConcurrency(
    normalizedQueries,
    runtime.concurrentQueries,
    (query) => searchBraveProspectCandidates(query, now, runtime),
  );
  const errors = settled.flatMap((result, index) => result.status === "rejected"
    ? [`${normalizedQueries[index] || "unknown query"}: ${errorMessage(result.reason)}`]
    : []);
  const candidates = mergeProspectCandidates(
    settled.flatMap((result) => result.status === "fulfilled" ? result.value : []),
    Math.min(500, normalizedQueries.length * runtime.maxResultsPerQuery),
  ).filter((candidate) => candidate.score >= config.radar.prospectDiscoveryMinScore);
  const successCount = settled.filter((result) => result.status === "fulfilled").length;
  return {
    status: successCount === 0 ? "failed" : errors.length > 0 ? "partial" : "success",
    candidates,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

export interface ProspectMapRuntimeOptions {
  provider?: "disabled" | "google_places";
  apiKey?: string;
  regionCode?: string;
  languageCode?: string;
  maxResultsPerQuery?: number;
  concurrentQueries?: number;
  fetchImpl?: typeof fetch;
}

export async function discoverProspectMapCandidates(
  queries: readonly string[] = config.radar.prospectMapQueries,
  now = Date.now(),
  options: ProspectMapRuntimeOptions = {},
): Promise<ProspectDiscoveryOutcome> {
  const runtime = {
    provider: options.provider ?? config.radar.prospectMapProvider,
    apiKey: options.apiKey ?? config.googlePlacesApiKey,
    regionCode: (options.regionCode ?? config.radar.prospectMapRegionCode).slice(0, 2).toUpperCase(),
    languageCode: (options.languageCode ?? config.radar.prospectMapLanguageCode).slice(0, 16),
    maxResultsPerQuery: Math.max(1, Math.min(20, options.maxResultsPerQuery ?? config.radar.prospectMapMaxResultsPerQuery)),
    concurrentQueries: Math.max(1, Math.min(5, options.concurrentQueries ?? config.radar.prospectMapConcurrentQueries)),
    fetchImpl: options.fetchImpl ?? fetch,
  } as const;
  if (runtime.provider === "disabled" || queries.length === 0) {
    return { status: "skipped", candidates: [], errors: [], durationMs: 0 };
  }
  if (runtime.provider !== "google_places") {
    return { status: "failed", candidates: [], errors: ["Unsupported prospect map provider"], durationMs: 0 };
  }
  if (!runtime.apiKey) {
    return { status: "failed", candidates: [], errors: ["GOOGLE_PLACES_API_KEY is required when RADAR_PROSPECT_MAP_PROVIDER=google_places"], durationMs: 0 };
  }

  const startedAt = Date.now();
  const normalizedQueries = [...new Set(queries.map(normalizeProspectSearchQuery).filter(Boolean))].slice(0, 20);
  if (normalizedQueries.length === 0) {
    return { status: "skipped", candidates: [], errors: [], durationMs: 0 };
  }
  const settled = await mapSettledWithConcurrency(
    normalizedQueries,
    runtime.concurrentQueries,
    (query) => searchGooglePlacesProspectCandidates(query, now, runtime),
  );
  const errors = settled.flatMap((result, index) => result.status === "rejected"
    ? [`${normalizedQueries[index] || "unknown query"}: ${errorMessage(result.reason)}`]
    : []);
  const candidates = mergeProspectCandidates(
    settled.flatMap((result) => result.status === "fulfilled" ? result.value : []),
    Math.min(500, normalizedQueries.length * runtime.maxResultsPerQuery),
  ).filter((candidate) => candidate.score >= config.radar.prospectDiscoveryMinScore);
  const successCount = settled.filter((result) => result.status === "fulfilled").length;
  return {
    status: successCount === 0 ? "failed" : errors.length > 0 ? "partial" : "success",
    candidates,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

async function searchGooglePlacesProspectCandidates(
  query: string,
  now: number,
  runtime: {
    apiKey: string;
    regionCode: string;
    languageCode: string;
    maxResultsPerQuery: number;
    fetchImpl: typeof fetch;
  },
): Promise<ProspectDiscoveryCandidate[]> {
  const response = await runtime.fetchImpl(GOOGLE_PLACES_TEXT_SEARCH_ENDPOINT, {
    method: "POST",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Goog-Api-Key": runtime.apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.types,places.websiteUri",
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: runtime.maxResultsPerQuery,
      languageCode: runtime.languageCode,
      regionCode: runtime.regionCode,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    await response.body?.cancel();
    throw new Error(`Google Places returned HTTP ${response.status}${retryAfter ? `; retry after ${retryAfter}s` : ""}`);
  }
  const text = await readTextWithLimit(response, MAX_SEARCH_RESPONSE_BYTES);
  let payload: GooglePlacesTextSearchResponse;
  try {
    payload = JSON.parse(text) as GooglePlacesTextSearchResponse;
  } catch {
    throw new Error("Google Places returned invalid JSON");
  }
  return parseGooglePlacesProspectSearchResponse(payload, query, now, runtime.maxResultsPerQuery);
}

export function parseGooglePlacesProspectSearchResponse(
  payload: GooglePlacesTextSearchResponse,
  query: string,
  now = Date.now(),
  maxResults = config.radar.prospectMapMaxResultsPerQuery,
): ProspectDiscoveryCandidate[] {
  const normalizedQuery = normalizeProspectSearchQuery(query);
  const sourceUrl = new URL("https://www.google.com/maps/search/");
  sourceUrl.searchParams.set("api", "1");
  sourceUrl.searchParams.set("query", normalizedQuery);
  return (payload.places ?? [])
    .map((place) => prospectCandidateFromGooglePlace(place, normalizedQuery, sourceUrl, now))
    .filter((item): item is ProspectDiscoveryCandidate => item !== null)
    .slice(0, Math.max(1, Math.min(20, maxResults)));
}

function prospectCandidateFromGooglePlace(
  place: GooglePlaceResult,
  query: string,
  sourceUrl: URL,
  now: number,
): ProspectDiscoveryCandidate | null {
  const website = normalizeHttpLink(place.websiteUri || "");
  if (!website) return null;
  const websiteUrl = canonicalWebsiteUrl(new URL(website));
  const domain = normalizeBusinessDomain(websiteUrl.hostname);
  if (!domain || isExcludedProspectHost(domain) || !isCrawlableBusinessPage(websiteUrl)) return null;
  const companyName = cleanText(place.displayName?.text || domain).slice(0, 240);
  const address = cleanText(place.formattedAddress || "").slice(0, 500);
  const types = uniqueStrings((place.types ?? []).map((item) => cleanText(item).replaceAll("_", " ")), 12, 100);
  const description = cleanText([address, types.length ? `Types: ${types.join(", ")}` : ""].filter(Boolean).join(" · ")).slice(0, 1_000);
  let score = 55;
  const reasons = ["returned by an explicitly configured Google Places text-search query with an official website URI"];
  if (companyName.toLowerCase() !== domain) {
    score += 10;
    reasons.push("map result exposes a company display name");
  }
  if (address) {
    score += 5;
    reasons.push("map result exposes a public business address");
  }
  if (types.length > 0) {
    score += 5;
    reasons.push("map result exposes public place-type signals");
  }
  return {
    id: `prospect-${stableId(domain)}`,
    domain,
    websiteUrl: new URL("/", websiteUrl.origin).href,
    companyName,
    description,
    discoverySourceUrl: sourceUrl.href,
    discoverySourceTitle: `Google Places: ${query}`,
    discoveryQuery: query,
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    productSignals: types,
    evidenceUrls: uniqueStrings([sourceUrl.href, websiteUrl.href], 10, 1_000),
    score: Math.min(100, score),
    reasons,
    discoveredAt: new Date(now).toISOString(),
  };
}

async function searchBraveProspectCandidates(
  query: string,
  now: number,
  runtime: {
    apiKey: string;
    country: string;
    searchLanguage: string;
    maxResultsPerQuery: number;
    fetchImpl: typeof fetch;
  },
): Promise<ProspectDiscoveryCandidate[]> {
  const url = new URL(BRAVE_WEB_SEARCH_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(runtime.maxResultsPerQuery));
  url.searchParams.set("country", runtime.country);
  url.searchParams.set("search_lang", runtime.searchLanguage);
  url.searchParams.set("safesearch", "strict");
  url.searchParams.set("result_filter", "web");
  url.searchParams.set("text_decorations", "false");
  const response = await runtime.fetchImpl(url, {
    method: "GET",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": runtime.apiKey,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    await response.body?.cancel();
    throw new Error(`Brave Search returned HTTP ${response.status}${retryAfter ? `; retry after ${retryAfter}s` : ""}`);
  }
  const text = await readTextWithLimit(response, MAX_SEARCH_RESPONSE_BYTES);
  let payload: BraveWebSearchResponse;
  try {
    payload = JSON.parse(text) as BraveWebSearchResponse;
  } catch {
    throw new Error("Brave Search returned invalid JSON");
  }
  return (payload.web?.results ?? [])
    .map((result) => prospectCandidateFromSearchResult(result, query, now))
    .filter((item): item is ProspectDiscoveryCandidate => item !== null)
    .slice(0, runtime.maxResultsPerQuery);
}

export function parseBraveProspectSearchResponse(
  payload: BraveWebSearchResponse,
  query: string,
  now = Date.now(),
): ProspectDiscoveryCandidate[] {
  const normalizedQuery = normalizeProspectSearchQuery(query);
  return (payload.web?.results ?? [])
    .map((result) => prospectCandidateFromSearchResult(result, normalizedQuery, now))
    .filter((item): item is ProspectDiscoveryCandidate => item !== null)
    .slice(0, config.radar.prospectSearchMaxResultsPerQuery);
}

function prospectCandidateFromSearchResult(
  result: BraveWebSearchResult,
  query: string,
  now: number,
): ProspectDiscoveryCandidate | null {
  const normalizedUrl = normalizeHttpLink(result.url || "");
  if (!normalizedUrl) return null;
  const resultUrl = canonicalWebsiteUrl(new URL(normalizedUrl));
  const domain = normalizeBusinessDomain(resultUrl.hostname);
  if (!domain || isExcludedProspectHost(domain) || !isCrawlableBusinessPage(resultUrl)) return null;

  const title = cleanText(result.title).slice(0, 240);
  const description = cleanText(result.description).slice(0, 1_000);
  const sourceText = `${title} ${description}`;
  let score = 35;
  const reasons = ["returned by an explicitly configured prospect search query"];
  if (resultUrl.pathname === "/" || resultUrl.pathname === "") {
    score += 15;
    reasons.push("search result points to the website root");
  } else if (/(about|company|products?|services?|solutions?|catalog|contact)/iu.test(resultUrl.pathname)) {
    score += 10;
    reasons.push("search result points to a company or offering page");
  }
  if (/(manufacturer|supplier|distributor|wholesal|factory|export|import|brand|company|solutions?|products?|services?|采购|批发|制造|供应|经销|出口|进口|品牌|公司|产品|服务)/iu.test(sourceText)) {
    score += 18;
    reasons.push("search title or snippet contains commercial company signals");
  }
  const companyName = prospectSearchCompanyName(title, domain);
  if (companyName.toLowerCase() !== domain) {
    score += 10;
    reasons.push("search result exposes a company-like title");
  }
  if (/(?:^|\/)(?:blog|news|article|articles|guide|guides|review|reviews|directory|directories|listing|listings)(?:\/|$)|(?:best|top)[-_\s]?\d+/iu.test(`${resultUrl.pathname} ${title}`)) {
    score -= 25;
    reasons.push("search result looks content- or directory-oriented and needs stronger official-site verification");
  }
  if ((domain.split(".")[0]?.length ?? 0) >= 4) score += 5;
  score = Math.max(0, Math.min(100, score));

  const searchSourceUrl = new URL("https://search.brave.com/search");
  searchSourceUrl.searchParams.set("q", query);
  return {
    id: `prospect-${stableId(domain)}`,
    domain,
    websiteUrl: new URL("/", resultUrl.origin).href,
    companyName,
    description,
    discoverySourceUrl: searchSourceUrl.href,
    discoverySourceTitle: `Brave Search: ${query}`,
    discoveryQuery: query,
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    productSignals: [],
    evidenceUrls: uniqueStrings([resultUrl.href, searchSourceUrl.href], 10, 1_000),
    score,
    reasons,
    discoveredAt: new Date(now).toISOString(),
  };
}

function normalizeProspectSearchQuery(value: string): string {
  const words = cleanText(value).split(/\s+/u).filter(Boolean).slice(0, 50);
  return words.join(" ").slice(0, 400).trim();
}

function prospectSearchCompanyName(title: string, domain: string): string {
  const cleanTitle = cleanText(title);
  const segments = cleanTitle.split(/\s+[|—–-]\s+/u).map((item) => item.trim()).filter(Boolean);
  const candidate = segments.find((item) => !looksLikeWebsiteLabel(item, domain) && item.length <= 160);
  return candidate || domain;
}

export function mergeProspectCandidates(candidates: readonly ProspectDiscoveryCandidate[], max: number): ProspectDiscoveryCandidate[] {
  const byDomain = new Map<string, ProspectDiscoveryCandidate>();
  for (const candidate of candidates) {
    const existing = byDomain.get(candidate.domain);
    if (!existing) {
      byDomain.set(candidate.domain, { ...candidate });
      continue;
    }
    const preferred = candidate.score > existing.score ? candidate : existing;
    byDomain.set(candidate.domain, {
      ...preferred,
      evidenceUrls: uniqueStrings([...existing.evidenceUrls, ...candidate.evidenceUrls], 30, 1_000),
      officialProfileUrls: uniqueStrings([...(existing.officialProfileUrls ?? []), ...(candidate.officialProfileUrls ?? [])], 20, 1_000),
      publicMessagingUrls: uniqueStrings([...(existing.publicMessagingUrls ?? []), ...(candidate.publicMessagingUrls ?? [])], 20, 1_000),
      websiteEvidenceStatus: mergeWebsiteEvidenceStatus(existing, candidate),
      websiteVerifiedAt: [existing.websiteVerifiedAt || "", candidate.websiteVerifiedAt || ""].sort((a, b) => b.localeCompare(a))[0] || "",
      reasons: uniqueStrings([...existing.reasons, ...candidate.reasons], 20, 240),
      description: preferred.description || existing.description || candidate.description,
      companyName: preferred.companyName || existing.companyName || candidate.companyName,
    });
  }
  return [...byDomain.values()]
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain))
    .slice(0, max);
}

function mergeWebsiteEvidenceStatus(
  left: ProspectDiscoveryCandidate,
  right: ProspectDiscoveryCandidate,
): NonNullable<ProspectDiscoveryCandidate["websiteEvidenceStatus"]> {
  const leftStatus = left.websiteEvidenceStatus ?? "unverified";
  const rightStatus = right.websiteEvidenceStatus ?? "unverified";
  if (rightStatus === "unverified") return leftStatus;
  if (leftStatus === "unverified") return rightStatus;
  const leftVerifiedAt = left.websiteVerifiedAt || "";
  const rightVerifiedAt = right.websiteVerifiedAt || "";
  if (rightVerifiedAt > leftVerifiedAt) return rightStatus;
  if (leftVerifiedAt > rightVerifiedAt) return leftStatus;
  return leftStatus === "static-incomplete" || rightStatus === "static-incomplete" ? "static-incomplete" : "verified";
}

export async function discoverProspectCandidates(
  seedUrls: readonly string[] = config.radar.prospectDiscoverySeeds,
  now = Date.now(),
): Promise<ProspectDiscoveryOutcome> {
  if (seedUrls.length === 0) {
    return { status: "skipped", candidates: [], errors: [], durationMs: 0 };
  }
  const startedAt = Date.now();
  const settled = await mapSettledWithConcurrency(
    seedUrls,
    config.radar.prospectDiscoveryConcurrentSeeds,
    (seed) => crawlProspectDiscoverySeed(seed, now),
  );
  const errors = settled.flatMap((result, index) => result.status === "rejected"
    ? [`${websiteLabel(seedUrls[index] || "unknown")}: ${errorMessage(result.reason)}`]
    : []);
  const byDomain = new Map<string, ProspectDiscoveryCandidate>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const candidate of result.value) {
      const existing = byDomain.get(candidate.domain);
      if (!existing || candidate.score > existing.score) {
        byDomain.set(candidate.domain, existing ? {
          ...candidate,
          evidenceUrls: uniqueStrings([...existing.evidenceUrls, ...candidate.evidenceUrls], 20, 1_000),
        } : candidate);
      } else {
        existing.evidenceUrls = uniqueStrings([...existing.evidenceUrls, ...candidate.evidenceUrls], 20, 1_000);
      }
    }
  }
  const candidates = [...byDomain.values()]
    .filter((candidate) => candidate.score >= config.radar.prospectDiscoveryMinScore)
    .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain))
    .slice(0, Math.min(500, seedUrls.length * config.radar.prospectDiscoveryMaxCandidatesPerSeed));
  const successCount = settled.filter((result) => result.status === "fulfilled").length;
  return {
    status: successCount === 0 ? "failed" : errors.length > 0 ? "partial" : "success",
    candidates,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

async function crawlProspectDiscoverySeed(seedValue: string, now: number): Promise<ProspectDiscoveryCandidate[]> {
  const seed = canonicalWebsiteUrl(parseRemoteUrl(seedValue));
  await assertSafeRemoteUrl(seed);
  const robots = config.radar.websiteRespectRobots
    ? await loadRobotsPolicy(seed)
    : { url: new URL("/robots.txt", seed.origin).href, status: "unavailable" as const, rules: [] };
  const queue: Array<{ url: URL; depth: number }> = [{ url: seed, depth: 0 }];
  const seenPages = new Set<string>();
  const candidates: ProspectDiscoveryCandidate[] = [];

  while (queue.length > 0 && seenPages.size < config.radar.prospectDiscoveryMaxPagesPerSeed) {
    const next = queue.shift();
    if (!next) break;
    const pageUrl = canonicalWebsiteUrl(next.url);
    if (!sameWebsiteHost(seed, pageUrl) || seenPages.has(pageUrl.href) || !isCrawlableBusinessPage(pageUrl)) continue;
    seenPages.add(pageUrl.href);
    if (config.radar.websiteRespectRobots && !robotsAllows(pageUrl, robots.rules)) continue;

    const page = await fetchHtml(pageUrl, seed);
    const pageTitle = cleanText(extractHtmlTagText(page.text, "title") || page.finalUrl.hostname).slice(0, 300);
    const links = extractProspectDiscoveryLinks(page.text, page.finalUrl);
    for (const link of links) {
      if (sameWebsiteHost(seed, link.url)) continue;
      const candidate = prospectCandidateFromLink(link, page.finalUrl, pageTitle, seed, now);
      if (candidate) candidates.push(candidate);
      if (candidates.length >= config.radar.prospectDiscoveryMaxCandidatesPerSeed * 3) break;
    }

    if (next.depth >= config.radar.prospectDiscoveryMaxDepth) continue;
    const navigation = links
      .filter((link) => sameWebsiteHost(seed, link.url) && isDiscoveryNavigationLink(link.url, link.anchor))
      .sort((a, b) => discoveryNavigationPriority(b.url, b.anchor) - discoveryNavigationPriority(a.url, a.anchor));
    for (const link of navigation) {
      const canonical = canonicalWebsiteUrl(link.url);
      if (!seenPages.has(canonical.href) && !queue.some((item) => item.url.href === canonical.href)) {
        queue.push({ url: canonical, depth: next.depth + 1 });
      }
    }
  }

  const byDomain = new Map<string, ProspectDiscoveryCandidate>();
  for (const candidate of candidates) {
    const existing = byDomain.get(candidate.domain);
    if (!existing || candidate.score > existing.score) byDomain.set(candidate.domain, candidate);
  }
  return [...byDomain.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, config.radar.prospectDiscoveryMaxCandidatesPerSeed);
}

interface ProspectDiscoveryLink {
  url: URL;
  anchor: string;
  context: string;
}

function extractProspectDiscoveryLinks(html: string, baseUrl: URL): ProspectDiscoveryLink[] {
  const links: ProspectDiscoveryLink[] = [];
  const seen = new Set<string>();
  const pattern = /<a\b([^>]*)\bhref\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = decodeXml(match[2] || "").trim();
    if (!href || href.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(href)) continue;
    const normalized = normalizeHttpLink(href, baseUrl);
    if (!normalized) continue;
    const url = canonicalWebsiteUrl(new URL(normalized));
    if (!isCrawlableBusinessPage(url) || seen.has(url.href)) continue;
    seen.add(url.href);
    const anchor = cleanText(match[4] || htmlAttribute(`${match[1] || ""} ${match[3] || ""}`, "title")).slice(0, 180);
    const matchIndex = match.index ?? 0;
    const context = prospectDiscoveryLinkContext(html, matchIndex, match[0].length);
    links.push({ url, anchor, context });
    if (links.length >= 500) break;
  }
  return links;
}

function prospectCandidateFromLink(
  link: ProspectDiscoveryLink,
  sourceUrl: URL,
  sourceTitle: string,
  discoverySeed: URL,
  now: number,
): ProspectDiscoveryCandidate | null {
  const domain = normalizeBusinessDomain(link.url.hostname);
  if (!domain || isExcludedProspectHost(domain) || isGenericProspectAnchor(link.anchor)) return null;
  const websiteUrl = new URL("/", link.url.origin).href;
  const companyName = prospectCompanyName(link, domain);
  const reasons = ["linked from an explicitly configured public discovery source"];
  let score = 35;
  const sourceText = `${sourceUrl.pathname} ${sourceTitle}`.toLowerCase();
  if (/(exhibitor|directory|members?|suppliers?|vendors?|manufacturers?|brands?|companies|marketplace|catalog|展商|名录|会员|供应商|厂商|品牌|企业)/iu.test(sourceText)) {
    score += 20;
    reasons.push("source page looks like a company, supplier or exhibitor directory");
  }
  if (companyName && companyName.toLowerCase() !== domain && companyName.length <= 160) {
    score += 12;
    reasons.push("directory context exposes a company-like label");
  }
  if (/(manufacturer|supplier|distributor|wholesal|factory|export|import|brand|company|solutions?|products?|services?|采购|批发|制造|供应|经销|出口|进口|品牌|公司|产品|服务)/iu.test(`${link.anchor} ${link.context}`)) {
    score += 18;
    reasons.push("nearby public text contains commercial company signals");
  }
  if ((domain.split(".")[0]?.length ?? 0) >= 4) score += 5;
  score = Math.min(100, score);
  return {
    id: `prospect-${stableId(domain)}`,
    domain,
    websiteUrl,
    companyName: cleanText(companyName || domain).slice(0, 240),
    description: cleanText(link.context).slice(0, 1_000),
    discoverySourceUrl: sourceUrl.href,
    discoverySourceTitle: sourceTitle,
    discoveryQuery: discoverySeed.href,
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    productSignals: [],
    evidenceUrls: [sourceUrl.href],
    score,
    reasons,
    discoveredAt: new Date(now).toISOString(),
  };
}

function prospectDiscoveryLinkContext(html: string, matchIndex: number, matchLength: number): string {
  const rowStart = html.toLowerCase().lastIndexOf("<tr", matchIndex);
  const rowEnd = html.toLowerCase().indexOf("</tr>", matchIndex + matchLength);
  if (rowStart >= 0 && rowEnd > rowStart && rowEnd - rowStart <= 20_000) {
    const row = html.slice(rowStart, rowEnd + 5)
      .replace(/<\/(?:td|th)>/gi, " | ")
      .replace(/<br\s*\/?\s*>/gi, " | ");
    return cleanText(stripNonContentHtml(row)).slice(0, 1_000);
  }
  return cleanText(stripNonContentHtml(
    html.slice(Math.max(0, matchIndex - 300), Math.min(html.length, matchIndex + matchLength + 300)),
  )).slice(0, 1_000);
}

function prospectCompanyName(link: ProspectDiscoveryLink, domain: string): string {
  const anchor = cleanText(link.anchor).slice(0, 240);
  if (anchor && !looksLikeWebsiteLabel(anchor, domain) && !isGenericProspectAnchor(anchor)) return anchor;

  const candidates = link.context
    .split(/\s*[|•·]\s*/u)
    .map((value) => cleanText(value).slice(0, 240))
    .filter(Boolean)
    .filter((value) => !looksLikeWebsiteLabel(value, domain))
    .filter((value) => !/^(?:associate\s+member|member|supplier|vendor|manufacturer|website|homepage|visit website|view details|learn more|官网|网站|主页|查看详情|更多)$/iu.test(value))
    .filter((value) => /[\p{L}\p{N}]/u.test(value));
  if (candidates.length > 0) return candidates[0] || domain;
  return anchor && !looksLikeWebsiteLabel(anchor, domain) ? anchor : domain;
}

function looksLikeWebsiteLabel(value: string, domain: string): boolean {
  const normalized = cleanText(value).toLowerCase().replace(/^https?:\/\//u, "").replace(/^www\./u, "").replace(/\/$/u, "");
  const normalizedDomain = domain.toLowerCase().replace(/^www\./u, "");
  if (normalized === normalizedDomain || normalized.startsWith(`${normalizedDomain}/`)) return true;
  return /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/iu.test(normalized);
}

function normalizeBusinessDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./i, "").replace(/\.$/, "");
}

function isExcludedProspectHost(domain: string): boolean {
  const blocked = [
    "google.com", "bing.com", "yahoo.com", "baidu.com", "duckduckgo.com",
    "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "reddit.com",
    "github.com", "gitlab.com", "medium.com", "wikipedia.org", "wordpress.com", "wix.com", "squarespace.com",
    "amazon.com", "alibaba.com", "aliexpress.com", "ebay.com", "etsy.com", "shopify.com",
    "paypal.com", "stripe.com", "cloudflare.com", "doubleclick.net", "googletagmanager.com", "google-analytics.com",
  ];
  return blocked.some((item) => domain === item || domain.endsWith(`.${item}`));
}

function isGenericProspectAnchor(anchor: string): boolean {
  const value = cleanText(anchor).toLowerCase();
  if (!value) return true;
  return /^(privacy|privacy policy|terms|terms of use|cookies?|cookie policy|login|sign in|sign up|register|facebook|instagram|linkedin|twitter|youtube|tiktok|download|app store|google play|powered by|隐私|隐私政策|条款|登录|注册|下载)$/iu.test(value);
}

function isDiscoveryNavigationLink(url: URL, anchor: string): boolean {
  const value = `${url.pathname} ${url.search} ${anchor}`.toLowerCase();
  return /(exhibitor|directory|member|supplier|vendor|manufacturer|brand|compan|catalog|category|listing|search|page=|\/page\/|next|展商|名录|会员|供应商|厂商|品牌|企业|下一页)/iu.test(value);
}

function discoveryNavigationPriority(url: URL, anchor: string): number {
  const value = `${url.pathname} ${url.search} ${anchor}`.toLowerCase();
  if (/(exhibitor|supplier|vendor|manufacturer|展商|供应商|厂商)/iu.test(value)) return 100;
  if (/(directory|member|compan|brand|名录|会员|企业|品牌)/iu.test(value)) return 90;
  if (/(page=|\/page\/|next|下一页)/iu.test(value)) return 80;
  if (/(catalog|category|listing|search)/iu.test(value)) return 70;
  return 0;
}

export async function collectWebsiteOutcome(
  seedUrls: readonly string[] = config.radar.websiteSeeds,
  now = Date.now(),
): Promise<SourceOutcome> {
  if (seedUrls.length === 0) {
    return { source: "website", status: "skipped", items: [], error: "No public business website seeds configured", durationMs: 0 };
  }

  const startedAt = Date.now();
  const settled = await mapSettledWithConcurrency(
    seedUrls,
    config.radar.websiteConcurrentSeeds,
    (seed) => crawlBusinessWebsite(seed, now),
  );
  const items = capAndDedupe(settled.flatMap((result) => result.status === "fulfilled" ? result.value : []));
  const failures = settled.flatMap((result, index) => result.status === "rejected"
    ? [`${websiteLabel(seedUrls[index] || "unknown")}: ${errorMessage(result.reason)}`]
    : []);
  const durationMs = Date.now() - startedAt;

  if (failures.length === seedUrls.length) {
    return {
      source: "website",
      status: "failed",
      items: [],
      error: websiteFailureSummary(failures, seedUrls.length),
      durationMs,
    };
  }
  if (failures.length > 0) {
    return {
      source: "website",
      status: "partial",
      items,
      error: websiteFailureSummary(failures, seedUrls.length),
      durationMs,
    };
  }
  return {
    source: "website",
    status: items.length > 0 ? "success" : "partial",
    items,
    error: items.length > 0 ? undefined : "No crawlable public business pages returned",
    durationMs,
  };
}

async function crawlBusinessWebsite(seedValue: string, now: number): Promise<RawItem[]> {
  const seed = canonicalWebsiteUrl(parseRemoteUrl(seedValue));
  await assertSafeRemoteUrl(seed);
  const robots = config.radar.websiteRespectRobots
    ? await loadRobotsPolicy(seed)
    : { url: new URL("/robots.txt", seed.origin).href, status: "unavailable" as const, rules: [], sitemaps: [] as URL[] };
  const sitemapLinks = await loadBusinessSitemapLinks(seed, robots.sitemaps);
  const queue: Array<{ url: URL; depth: number }> = [
    { url: seed, depth: 0 },
    ...sitemapLinks.map((url) => ({ url, depth: Math.min(1, config.radar.websiteMaxDepth) })),
  ];
  const seen = new Set<string>();
  const items: RawItem[] = [];

  while (queue.length > 0 && seen.size < config.radar.websiteMaxPagesPerSeed) {
    const next = queue.shift();
    if (!next) break;
    const pageUrl = canonicalWebsiteUrl(next.url);
    if (!sameWebsiteHost(seed, pageUrl) || !isCrawlableBusinessPage(pageUrl)) continue;
    if (seen.has(pageUrl.href)) continue;
    seen.add(pageUrl.href);
    if (config.radar.websiteRespectRobots && !robotsAllows(pageUrl, robots.rules)) continue;

    const page = await fetchHtml(pageUrl, seed);
    const parsed = parseBusinessWebsitePage(
      page.text,
      page.finalUrl,
      seed,
      next.depth,
      new Date(now).toISOString(),
      robots.url,
      robots.status === "available" ? "allowed" : "unavailable",
    );
    items.push(parsed.item);

    if (next.depth >= config.radar.websiteMaxDepth) continue;
    const nextLinks = parsed.links
      .filter((link) => sameWebsiteHost(seed, link) && isCrawlableBusinessPage(link))
      .sort((a, b) => businessLinkPriority(b) - businessLinkPriority(a));
    for (const link of nextLinks) {
      const canonical = canonicalWebsiteUrl(link);
      if (!seen.has(canonical.href) && !queue.some((queued) => queued.url.href === canonical.href)) {
        queue.push({ url: canonical, depth: next.depth + 1 });
      }
    }
  }

  return items;
}

export function parseBusinessWebsitePage(
  html: string,
  pageUrl: URL,
  rootUrl: URL,
  depth = 0,
  crawledAt = new Date().toISOString(),
  robotsUrl = new URL("/robots.txt", rootUrl.origin).href,
  robotsPolicy: BusinessWebsiteContext["robotsPolicy"] = "allowed",
  acquisition: { mode?: WebsiteEvidenceAcquisitionMode; browserEvidenceRequestId?: string } = {},
): { item: RawItem; links: URL[] } {
  const jsonLd = extractBusinessJsonLd(html, pageUrl);
  const title = cleanText(extractHtmlTagText(html, "title") || extractMetaContent(html, "og:title") || pageUrl.hostname).slice(0, 300);
  const description = cleanText(
    extractMetaContent(html, "description") ||
    extractMetaContent(html, "og:description") ||
    jsonLd.description ||
    "",
  ).slice(0, 2_000);
  const links = extractPageLinks(html, pageUrl);
  const companyName = cleanText(
    jsonLd.organizationName ||
    extractMetaContent(html, "og:site_name") ||
    pageUrl.hostname.replace(/^www\./i, ""),
  ).slice(0, 240);
  const visibleText = cleanText(stripNonContentHtml(html)).slice(0, 6_000);
  const mailtoEmails = extractMailtoContacts(html);
  const visibleEmails = extractVisibleEmails(visibleText);
  const companyMailtoEmails = mailtoEmails.filter((email) => inferCompanyContactBusinessRole(email) !== "unknown");
  const companyVisibleEmails = visibleEmails.filter((email) => inferCompanyContactBusinessRole(email) !== "unknown");
  const telPhones = extractTelContacts(html);
  const publicEmails = uniqueStrings([
    ...companyMailtoEmails,
    ...companyVisibleEmails,
    ...jsonLd.emails,
  ], 12, 254);
  const publicPhones = uniqueStrings([
    ...telPhones,
    ...jsonLd.phones,
  ], 12, 80);
  const contactUrls = uniqueStrings(
    links.filter((link) => businessLinkPriority(link) >= 80).map((link) => link.href),
    12,
    1_000,
  );
  const linkedProfileUrls = links.map((link) => officialLinkedProfileUrl(link)).filter(Boolean);
  const linkedMessagingUrls = links.map((link) => publicBusinessMessagingUrl(link)).filter(Boolean);
  const officialProfileUrls = uniqueStrings(
    [
      ...linkedProfileUrls,
      ...jsonLd.profileUrls,
    ],
    12,
    1_000,
  );
  const publicMessagingUrls = uniqueStrings(
    [
      ...linkedMessagingUrls,
      ...jsonLd.messagingUrls,
    ],
    12,
    1_000,
  );
  const companyContactChannels = mergeCompanyContactChannels([
    ...companyMailtoEmails.map((email) => companyEmailChannel(email, pageUrl.href, "mailto", "high", "official-site-observed")),
    ...companyVisibleEmails.map((email) => companyEmailChannel(email, pageUrl.href, "visible-text", "medium", "official-site-observed")),
    ...telPhones.map((phone) => companyPhoneChannel(phone, pageUrl.href, "tel", "general", "high", "official-site-observed")),
    ...links.flatMap((link) => {
      if (!sameWebsiteHost(link, pageUrl)) return [];
      const businessRole = companyBusinessContactLinkRole(link);
      if (!businessRole) return [];
      return [companyContactPageChannel(link.href, pageUrl.href, "contact-link", businessRole, "high", "official-site-observed")];
    }),
    ...extractBusinessContactFormChannels(html, pageUrl, title),
    ...linkedProfileUrls.map((url) => companyProfileChannel(url, pageUrl.href, "official-site-link", "official-site-observed")),
    ...linkedMessagingUrls.map((url) => companyMessagingChannel(url, pageUrl.href, "official-site-link", "general", "official-site-observed")),
    ...jsonLd.contactChannels,
  ], 40);
  const productSignals = uniqueStrings([
    ...jsonLd.productNames,
    ...extractHeadingSignals(html),
  ], 20, 160);
  const acquisitionMode = acquisition.mode ?? "static-http";
  const renderingHint = acquisitionMode === "browser-rendered"
    ? browserRenderedEvidenceHint({
      visibleText,
      description,
      publicEmails,
      publicPhones,
      contactUrls,
      officialProfileUrls,
      publicMessagingUrls,
      companyContactChannels,
      productSignals,
    })
    : businessWebsiteRenderingHint(html, visibleText);
  const context: BusinessWebsiteContext = {
    schema: "bossai.business-website-context.v1",
    rootUrl: rootUrl.href,
    pageUrl: pageUrl.href,
    companyName,
    description,
    publicEmails,
    publicPhones,
    contactUrls,
    officialProfileUrls,
    publicMessagingUrls,
    companyContactChannels,
    productSignals,
    robotsUrl,
    robotsPolicy,
    renderingHint,
    acquisitionMode,
    ...(acquisition.browserEvidenceRequestId ? { browserEvidenceRequestId: acquisition.browserEvidenceRequestId } : {}),
    depth,
    crawledAt,
  };
  const body = cleanText([description, visibleText].filter(Boolean).join(" ")).slice(0, 6_000);
  return {
    item: {
      source: "website",
      externalId: stableId(pageUrl.href),
      title,
      body,
      url: pageUrl.href,
      author: companyName || pageUrl.hostname,
      publishedAt: crawledAt,
      engagement: 0,
      query: rootUrl.href,
      websiteContext: context,
    },
    links,
  };
}

interface RobotsRule {
  allow: boolean;
  pattern: string;
}

async function loadRobotsPolicy(seed: URL): Promise<{
  url: string;
  status: "available" | "unavailable";
  rules: RobotsRule[];
  sitemaps: URL[];
}> {
  const robotsUrl = new URL("/robots.txt", seed.origin);
  try {
    const response = await fetchRemoteText(robotsUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/plain,*/*;q=0.1" },
    }, MAX_ROBOTS_BYTES, (redirectUrl) => sameWebsiteHost(seed, redirectUrl));
    return {
      url: response.finalUrl.href,
      status: "available",
      rules: parseRobotsRules(response.text),
      sitemaps: parseRobotsSitemaps(response.text, seed),
    };
  } catch {
    return { url: robotsUrl.href, status: "unavailable", rules: [], sitemaps: [] };
  }
}

function parseRobotsSitemaps(text: string, seed: URL): URL[] {
  const urls: URL[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    const match = line.match(/^sitemap\s*:\s*(.+)$/iu);
    if (!match?.[1]) continue;
    const normalized = normalizeHttpLink(match[1].trim(), seed);
    if (!normalized) continue;
    const url = canonicalWebsiteUrl(new URL(normalized));
    if (!sameWebsiteHost(seed, url) || seen.has(url.href)) continue;
    seen.add(url.href);
    urls.push(url);
    if (urls.length >= MAX_SITEMAP_DOCUMENTS_PER_SEED) break;
  }
  return urls;
}

async function loadBusinessSitemapLinks(seed: URL, declaredSitemaps: readonly URL[]): Promise<URL[]> {
  if (config.radar.websiteMaxDepth <= 0) return [];
  const sitemapSeeds = declaredSitemaps.length > 0
    ? declaredSitemaps
    : [new URL("/sitemap.xml", seed.origin)];
  const queue = sitemapSeeds.slice(0, MAX_SITEMAP_DOCUMENTS_PER_SEED).map((url) => canonicalWebsiteUrl(url));
  const seenDocuments = new Set<string>();
  const pageLinks = new Map<string, URL>();

  while (queue.length > 0 && seenDocuments.size < MAX_SITEMAP_DOCUMENTS_PER_SEED) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenDocuments.has(sitemapUrl.href) || !sameWebsiteHost(seed, sitemapUrl)) continue;
    seenDocuments.add(sitemapUrl.href);
    try {
      const response = await fetchRemoteText(sitemapUrl, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml;q=0.9,*/*;q=0.1" },
      }, MAX_SITEMAP_BYTES, (redirectUrl) => sameWebsiteHost(seed, redirectUrl));
      for (const location of parseSitemapLocations(response.text, response.finalUrl)) {
        if (!sameWebsiteHost(seed, location)) continue;
        if (isXmlSitemapUrl(location)) {
          if (seenDocuments.size + queue.length < MAX_SITEMAP_DOCUMENTS_PER_SEED && !seenDocuments.has(location.href)) {
            queue.push(location);
          }
          continue;
        }
        if (!isCrawlableBusinessPage(location) || businessLinkPriority(location) < 80) continue;
        pageLinks.set(location.href, location);
        if (pageLinks.size >= MAX_SITEMAP_LOCATIONS) break;
      }
    } catch {
      // Sitemap enrichment is optional; the seed page remains authoritative for crawler success/failure.
    }
  }

  return [...pageLinks.values()]
    .sort((a, b) => businessLinkPriority(b) - businessLinkPriority(a))
    .slice(0, Math.max(0, config.radar.websiteMaxPagesPerSeed - 1));
}

function parseSitemapLocations(xml: string, baseUrl: URL): URL[] {
  const locations: URL[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const raw = cleanText(decodeXml(match[1] || ""));
    const normalized = normalizeHttpLink(raw, baseUrl);
    if (!normalized) continue;
    const url = canonicalWebsiteUrl(new URL(normalized));
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    locations.push(url);
    if (locations.length >= MAX_SITEMAP_LOCATIONS) break;
  }
  return locations;
}

function isXmlSitemapUrl(url: URL): boolean {
  return /\.xml(?:$|\?)/iu.test(`${url.pathname}${url.search}`) && !/\.xml\.gz(?:$|\?)/iu.test(`${url.pathname}${url.search}`);
}

function parseRobotsRules(text: string): RobotsRule[] {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let group: { agents: string[]; rules: RobotsRule[] } = { agents: [], rules: [] };
  const flush = () => {
    if (group.agents.length > 0) groups.push(group);
    group = { agents: [], rules: [] };
  };

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (group.rules.length > 0) flush();
      group.agents.push(normalizeRobotsAgent(value));
      continue;
    }
    if (key !== "allow" && key !== "disallow") continue;
    if (group.agents.length === 0) continue;
    if (!value && key === "disallow") continue;
    group.rules.push({ allow: key === "allow", pattern: value.slice(0, 500) });
  }
  flush();

  const specific = groups.filter((item) => item.agents.includes(ROBOTS_PRODUCT_TOKEN));
  const selected = specific.length > 0
    ? specific
    : groups.filter((item) => item.agents.includes("*"));
  return selected.flatMap((item) => item.rules);
}

function normalizeRobotsAgent(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "*") return "*";
  return normalized.split(/[\s/]/u)[0] || "";
}

function robotsAllows(url: URL, rules: RobotsRule[]): boolean {
  const target = `${url.pathname}${url.search}`;
  let winner: RobotsRule | null = null;
  let winnerSpecificity = -1;
  for (const rule of rules) {
    if (!robotsRuleMatches(target, rule.pattern)) continue;
    const specificity = rule.pattern.replace(/[*$]/g, "").length;
    if (specificity > winnerSpecificity || (specificity === winnerSpecificity && rule.allow)) {
      winner = rule;
      winnerSpecificity = specificity;
    }
  }
  return winner?.allow ?? true;
}

function robotsRuleMatches(target: string, pattern: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const raw = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = raw.split("*").map(escapeRegExp).join(".*");
  const regex = new RegExp(`^${escaped}${anchored ? "$" : ""}`);
  return regex.test(target);
}

async function fetchHtml(url: URL, rootUrl: URL): Promise<{ text: string; finalUrl: URL }> {
  const response = await fetchRemoteText(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    },
  }, MAX_HTML_BYTES, (redirectUrl) => sameWebsiteHost(rootUrl, redirectUrl));
  const contentType = response.contentType.toLowerCase();
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error(`${response.finalUrl.hostname} returned unsupported content type ${contentType}`);
  }
  return { text: response.text, finalUrl: response.finalUrl };
}

function officialLinkedProfileUrl(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/^www\./i, "").replace(/\.$/, "");
  const path = url.pathname.replace(/\/+$/u, "");
  if (host === "linkedin.com" && /^\/(?:company|showcase)\/[^/]+/iu.test(path)) return url.href;
  if ((host === "facebook.com" || host === "m.facebook.com")
      && path
      && !/^\/(?:sharer|share|dialog|login|profile\.php)(?:\/|$)/iu.test(path)) return url.href;
  if (host === "tiktok.com" && /^\/@[^/]+/u.test(path)) return url.href;
  if (host === "instagram.com" && /^\/[^/]+$/u.test(path) && !/^\/(?:p|reel|explore|accounts)$/iu.test(path)) return url.href;
  if ((host === "youtube.com" || host === "youtu.be")
      && (/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/u.test(path))) return url.href;
  return "";
}

function publicBusinessMessagingUrl(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/^www\./i, "").replace(/\.$/, "");
  if (host === "wa.me" && /^\/\+?\d{6,20}(?:\/|$)/u.test(url.pathname)) return url.href;
  if (host === "api.whatsapp.com" && /^\/send\/?$/u.test(url.pathname)) {
    const phone = (url.searchParams.get("phone") || "").replace(/[^\d+]/gu, "");
    return /^\+?\d{6,20}$/u.test(phone) ? url.href : "";
  }
  return "";
}

function companyEmailChannel(
  email: string,
  sourcePageUrl: string,
  sourceKind: CompanyContactChannel["sourceKind"],
  confidence: CompanyContactChannel["confidence"],
  verificationStatus: CompanyContactChannel["verificationStatus"],
  businessRole: CompanyContactBusinessRole = inferCompanyContactBusinessRole(email),
): CompanyContactChannel {
  const value = email.trim().replace(/^mailto:/i, "");
  return {
    type: "email",
    value,
    url: `mailto:${value}`,
    sourcePageUrl,
    sourceKind,
    businessRole,
    confidence,
    verificationStatus,
  };
}

function companyPhoneChannel(
  phone: string,
  sourcePageUrl: string,
  sourceKind: CompanyContactChannel["sourceKind"],
  businessRole: CompanyContactBusinessRole,
  confidence: CompanyContactChannel["confidence"],
  verificationStatus: CompanyContactChannel["verificationStatus"],
): CompanyContactChannel {
  const value = phone.trim();
  return {
    type: "phone",
    value,
    url: `tel:${value}`,
    sourcePageUrl,
    sourceKind,
    businessRole,
    confidence,
    verificationStatus,
  };
}

function companyContactPageChannel(
  url: string,
  sourcePageUrl: string,
  sourceKind: CompanyContactChannel["sourceKind"],
  businessRole: CompanyContactBusinessRole,
  confidence: CompanyContactChannel["confidence"],
  verificationStatus: CompanyContactChannel["verificationStatus"],
): CompanyContactChannel {
  const inferredRole = businessRole === "unknown" ? inferCompanyContactBusinessRole(url) : businessRole;
  return {
    type: "contact-page",
    value: url,
    url,
    sourcePageUrl,
    sourceKind,
    businessRole: inferredRole === "unknown" ? "general" : inferredRole,
    confidence,
    verificationStatus,
  };
}

function companyMessagingChannel(
  url: string,
  sourcePageUrl: string,
  sourceKind: CompanyContactChannel["sourceKind"],
  businessRole: CompanyContactBusinessRole,
  verificationStatus: CompanyContactChannel["verificationStatus"],
): CompanyContactChannel {
  return {
    type: "whatsapp-business",
    value: url,
    url,
    sourcePageUrl,
    sourceKind,
    businessRole: businessRole === "unknown" ? "general" : businessRole,
    confidence: "high",
    verificationStatus,
  };
}

function companyProfileChannel(
  url: string,
  sourcePageUrl: string,
  sourceKind: CompanyContactChannel["sourceKind"],
  verificationStatus: CompanyContactChannel["verificationStatus"],
): CompanyContactChannel {
  let type: CompanyContactChannel["type"] = "company-profile";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./i, "");
    if (host === "linkedin.com" && /^\/(?:company|showcase)\//iu.test(parsed.pathname)) type = "linkedin-company";
  } catch {
    // The URL was already normalized by the caller; keep a generic company-profile type if parsing fails.
  }
  return {
    type,
    value: url,
    url,
    sourcePageUrl,
    sourceKind,
    businessRole: "general",
    confidence: "high",
    verificationStatus,
  };
}

function extractBusinessContactFormChannels(html: string, pageUrl: URL, title: string): CompanyContactChannel[] {
  const pageSignal = `${pageUrl.pathname} ${title}`;
  const pageLooksContact = /(contact|inquir(?:y|ies)|enquir(?:y|ies)|sales|export|wholesale|support|联系我们|联系)/iu.test(pageSignal);
  const channels: CompanyContactChannel[] = [];
  for (const match of html.matchAll(/<form\b([^>]*)>/gi)) {
    const attrs = match[1] || "";
    const formSignal = [
      htmlAttribute(attrs, "id"),
      htmlAttribute(attrs, "class"),
      htmlAttribute(attrs, "name"),
      htmlAttribute(attrs, "action"),
      htmlAttribute(attrs, "aria-label"),
    ].join(" ");
    if (!pageLooksContact && !/(contact|inquir(?:y|ies)|enquir(?:y|ies)|sales|export|wholesale|support|联系我们|联系)/iu.test(formSignal)) {
      continue;
    }
    const role = inferCompanyContactBusinessRole(`${pageSignal} ${formSignal}`);
    channels.push({
      type: "contact-form",
      value: pageUrl.href,
      url: pageUrl.href,
      sourcePageUrl: pageUrl.href,
      sourceKind: "contact-form",
      businessRole: role === "unknown" ? "general" : role,
      confidence: "high",
      verificationStatus: "official-site-observed",
    });
    if (channels.length >= 3) break;
  }
  return mergeCompanyContactChannels(channels, 3);
}

function businessWebsiteRenderingHint(html: string, visibleText: string): BusinessWebsiteContext["renderingHint"] {
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;
  const appShellMarker = /(?:id|data-app)\s*=\s*["'](?:root|app|__next)["']|__NEXT_DATA__|data-reactroot|type\s*=\s*["']module["']/iu.test(html);
  return visibleText.length < 500 && (scriptCount >= 3 || appShellMarker)
    ? "javascript-likely"
    : "static-sufficient";
}

function browserRenderedEvidenceHint(input: {
  visibleText: string;
  description: string;
  publicEmails: string[];
  publicPhones: string[];
  contactUrls: string[];
  officialProfileUrls: string[];
  publicMessagingUrls: string[];
  companyContactChannels: CompanyContactChannel[];
  productSignals: string[];
}): BusinessWebsiteContext["renderingHint"] {
  const hasSubstantiveStructuredEvidence = Boolean(
    input.description.length >= 40
    || input.publicEmails.length
    || input.publicPhones.length
    || input.contactUrls.length
    || input.officialProfileUrls.length
    || input.publicMessagingUrls.length
    || input.companyContactChannels.length
    || input.productSignals.length,
  );
  return input.visibleText.length >= 300 || hasSubstantiveStructuredEvidence
    ? "browser-rendered-sufficient"
    : "browser-rendered-incomplete";
}

function extractPageLinks(html: string, baseUrl: URL): URL[] {
  const links: URL[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const href = decodeXml(match[1] || "").trim();
    if (!href || href.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(href)) continue;
    const normalized = normalizeHttpLink(href, baseUrl);
    if (!normalized) continue;
    const url = canonicalWebsiteUrl(new URL(normalized));
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    links.push(url);
    if (links.length >= 200) break;
  }
  return links;
}

function extractBusinessJsonLd(html: string, pageUrl: URL): {
  organizationName: string;
  description: string;
  emails: string[];
  phones: string[];
  profileUrls: string[];
  messagingUrls: string[];
  contactChannels: CompanyContactChannel[];
  productNames: string[];
} {
  const result = {
    organizationName: "",
    description: "",
    emails: [] as string[],
    phones: [] as string[],
    profileUrls: [] as string[],
    messagingUrls: [] as string[],
    contactChannels: [] as CompanyContactChannel[],
    productNames: [] as string[],
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = (match[1] || "").trim();
    if (!raw || raw.length > 250_000) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      for (const node of flattenJsonLd(parsed)) {
        if (!node || typeof node !== "object") continue;
        const record = node as Record<string, unknown>;
        const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
        const normalizedTypes = types.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
        if (normalizedTypes.some((type) => ["organization", "corporation", "localbusiness", "professionalservice"].includes(type))) {
          if (!result.organizationName && typeof record.name === "string") result.organizationName = record.name;
          if (!result.description && typeof record.description === "string") result.description = record.description;
          if (typeof record.email === "string") {
            const email = record.email.replace(/^mailto:/i, "");
            result.emails.push(email);
            result.contactChannels.push(companyEmailChannel(email, pageUrl.href, "jsonld-organization", "high", "official-site-structured"));
          }
          if (typeof record.telephone === "string") {
            result.phones.push(record.telephone);
            result.contactChannels.push(companyPhoneChannel(record.telephone, pageUrl.href, "jsonld-organization", "general", "high", "official-site-structured"));
          }
          for (const sameAs of jsonLdStringValues(record.sameAs)) {
            const normalized = normalizeHttpLink(sameAs);
            if (!normalized) continue;
            const url = new URL(normalized);
            const profile = officialLinkedProfileUrl(url);
            const messaging = publicBusinessMessagingUrl(url);
            if (profile) {
              result.profileUrls.push(profile);
              result.contactChannels.push(companyProfileChannel(profile, pageUrl.href, "jsonld-organization", "official-site-structured"));
            }
            if (messaging) {
              result.messagingUrls.push(messaging);
              result.contactChannels.push(companyMessagingChannel(messaging, pageUrl.href, "jsonld-organization", "general", "official-site-structured"));
            }
          }
          for (const contactPoint of jsonLdContactPoints(record.contactPoint)) {
            const declaredRole = inferCompanyContactBusinessRole(typeof contactPoint.contactType === "string" ? contactPoint.contactType : "");
            if (typeof contactPoint.email === "string") {
              const email = contactPoint.email.replace(/^mailto:/i, "");
              const role = declaredRole === "unknown" ? inferCompanyContactBusinessRole(email) : declaredRole;
              result.emails.push(email);
              result.contactChannels.push(companyEmailChannel(email, pageUrl.href, "jsonld-contact-point", "high", "official-site-structured", role));
            }
            if (typeof contactPoint.telephone === "string") {
              result.phones.push(contactPoint.telephone);
              result.contactChannels.push(companyPhoneChannel(contactPoint.telephone, pageUrl.href, "jsonld-contact-point", declaredRole, "high", "official-site-structured"));
            }
            for (const rawUrl of jsonLdStringValues(contactPoint.url)) {
              const normalized = normalizeHttpLink(rawUrl, pageUrl);
              if (!normalized) continue;
              const url = new URL(normalized);
              const messaging = publicBusinessMessagingUrl(url);
              if (messaging) {
                result.messagingUrls.push(messaging);
                result.contactChannels.push(companyMessagingChannel(messaging, pageUrl.href, "jsonld-contact-point", declaredRole, "official-site-structured"));
                continue;
              }
              result.contactChannels.push(companyContactPageChannel(url.href, pageUrl.href, "jsonld-contact-point", declaredRole, "high", "official-site-structured"));
            }
          }
        }
        if (normalizedTypes.some((type) => ["product", "service", "offer"].includes(type)) && typeof record.name === "string") {
          result.productNames.push(record.name);
        }
      }
    } catch {
      // Invalid JSON-LD is ignored; visible public page content remains usable evidence.
    }
  }
  result.emails = uniqueStrings(result.emails, 12, 254);
  result.phones = uniqueStrings(result.phones, 12, 80);
  result.profileUrls = uniqueStrings(result.profileUrls, 12, 1_000);
  result.messagingUrls = uniqueStrings(result.messagingUrls, 12, 1_000);
  result.contactChannels = mergeCompanyContactChannels(result.contactChannels, 40);
  result.productNames = uniqueStrings(result.productNames, 20, 160);
  return result;
}

function jsonLdStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function jsonLdContactPoints(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (value && typeof value === "object" && !Array.isArray(value)) return [value as Record<string, unknown>];
  return [];
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const graph = Array.isArray(record["@graph"]) ? record["@graph"].flatMap(flattenJsonLd) : [];
  return [value, ...graph];
}

function extractMailtoContacts(html: string): string[] {
  return uniqueStrings([...html.matchAll(/href\s*=\s*["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/gi)]
    .map((match) => decodeXml(match[1] || "")), 12, 254);
}

function extractVisibleEmails(text: string): string[] {
  return uniqueStrings(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi) ?? [], 12, 254);
}

function extractTelContacts(html: string): string[] {
  return uniqueStrings([...html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)]
    .map((match) => decodeXml(match[1] || "")), 12, 80);
}

function extractHeadingSignals(html: string): string[] {
  const headings: string[] = [];
  for (const match of html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const text = cleanText(match[1] || "").slice(0, 160);
    if (text.length >= 3) headings.push(text);
    if (headings.length >= 20) break;
  }
  return headings;
}

function extractHtmlTagText(html: string, tag: string): string {
  const match = html.match(new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, "i"));
  return cleanText(match?.[1] || "");
}

function extractMetaContent(html: string, key: string): string {
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = match[1] || "";
    const name = htmlAttribute(attrs, "name") || htmlAttribute(attrs, "property");
    if (name.toLowerCase() !== key.toLowerCase()) continue;
    return decodeXml(htmlAttribute(attrs, "content"));
  }
  return "";
}

function htmlAttribute(attrs: string, name: string): string {
  const escaped = escapeRegExp(name);
  const quoted = attrs.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*["']([^"']*)["']`, "i"));
  if (quoted?.[1] !== undefined) return quoted[1];
  const unquoted = attrs.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted?.[1] || "";
}

function stripNonContentHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function companyBusinessContactLinkRole(url: URL): CompanyContactBusinessRole | null {
  const value = `${url.pathname} ${url.search}`.toLowerCase();
  if (/(procurement|purchasing|sourcing|supplier-contact|vendor-contact|采购|寻源)/u.test(value)) return "procurement";
  if (/(business-development|bizdev|partnerships?|partners?|alliances?|商务拓展|合作)/u.test(value)) return "business-development";
  if (/(wholesale|distributors?|dealers?|resellers?|批发|经销)/u.test(value)) return "wholesale";
  if (/(export|international-sales|overseas-sales|出口|外贸)/u.test(value)) return "export";
  if (/(sales|commercial|request-a-quote|request-quote|quote-request|询价|销售)/u.test(value)) return "sales";
  if (/(support|help-center|customer-care|customer-support|售后|支持)/u.test(value)) return "support";
  if (/(contact|contact-us|get-in-touch|reach-us|inquir(?:y|ies)|enquir(?:y|ies)|联系我们|联系)/u.test(value)) return "general";
  return null;
}

function businessLinkPriority(url: URL): number {
  const value = `${url.pathname} ${url.search}`.toLowerCase();
  if (/(contact|contact-us|kontakt|联系我们|联系)/u.test(value)) return 100;
  if (/(about|company|who-we-are|about-us|公司|关于)/u.test(value)) return 90;
  if (/(products?|catalog|solutions?|services?|shop|collections?|产品|服务|方案)/u.test(value)) return 80;
  return 10;
}

function isCrawlableBusinessPage(url: URL): boolean {
  if (!/^https?:$/i.test(url.protocol) || url.username || url.password) return false;
  const path = url.pathname.toLowerCase();
  if (/(?:^|\/)(?:login|signin|signup|account|auth|checkout|cart)(?:\/|$)/u.test(path)) return false;
  if (/\.(?:pdf|zip|rar|7z|exe|dmg|pkg|jpg|jpeg|png|gif|webp|svg|mp4|mov|avi|mp3|wav|docx?|xlsx?|pptx?|csv|xml|json)(?:$|\?)/u.test(path)) return false;
  return true;
}

function canonicalWebsiteUrl(value: URL): URL {
  const url = new URL(value.href);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
  }
  return url;
}

function sameWebsiteHost(a: URL, b: URL): boolean {
  const normalize = (hostname: string) => hostname.toLowerCase().replace(/^www\./i, "").replace(/\.$/, "");
  return normalize(a.hostname) === normalize(b.hostname);
}

function websiteLabel(value: string): string {
  try {
    return new URL(value).hostname || "invalid website URL";
  } catch {
    return "invalid website URL";
  }
}

function websiteFailureSummary(failures: string[], total: number): string {
  const shown = failures.slice(0, 3).join("; ");
  const omitted = failures.length > 3 ? `; ${failures.length - 3} more failure(s)` : "";
  return `${failures.length}/${total} website seeds failed: ${shown}${omitted}`;
}

function uniqueStrings(values: string[], maxItems: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value).slice(0, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }
  return output;
}

export async function collectRssOutcome(
  feedUrls: readonly string[] = config.radar.rssFeeds,
  now = Date.now(),
): Promise<SourceOutcome> {
  if (feedUrls.length === 0) {
    return { source: "rss", status: "skipped", items: [], error: "No RSS feeds configured", durationMs: 0 };
  }

  const startedAt = Date.now();
  const settled = await Promise.allSettled(feedUrls.map(async (feedUrl) => {
    const url = parseRemoteUrl(feedUrl);
    const xml = await fetchText(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, text/xml" } });
    return parseRssFeed(xml, url, now);
  }));

  const items = capAndDedupe(settled.flatMap((result) => result.status === "fulfilled" ? result.value : []));
  const failures = settled.flatMap((result, index) => result.status === "rejected"
    ? [`${feedLabel(feedUrls[index] || "unknown")}: ${errorMessage(result.reason)}`]
    : []);
  const durationMs = Date.now() - startedAt;
  if (failures.length === feedUrls.length) {
    return {
      source: "rss",
      status: "failed",
      items: [],
      error: rssFailureSummary(failures, feedUrls.length),
      durationMs,
    };
  }
  if (failures.length > 0) {
    return {
      source: "rss",
      status: "partial",
      items,
      error: rssFailureSummary(failures, feedUrls.length),
      durationMs,
    };
  }
  return {
    source: "rss",
    status: items.length > 0 ? "success" : "partial",
    items,
    error: items.length > 0 ? undefined : "No matching public evidence returned",
    durationMs,
  };
}

export function parseRssFeed(xml: string, feedUrl: URL, now = Date.now()): RawItem[] {
  const blocks = findXmlBlocks(xml, "item");
  const entries = blocks.length > 0 ? blocks : findXmlBlocks(xml, "entry");
  const items: RawItem[] = [];
  for (const entry of entries) {
    const title = cleanText(extractXmlText(entry, "title"));
    const textLink = cleanText(extractXmlText(entry, "link"));
    const link = normalizeHttpLink(extractXmlHref(entry) || textLink, feedUrl);
    const body = cleanText(
      extractXmlText(entry, "description") ||
      extractXmlText(entry, "summary") ||
      extractXmlText(entry, "content:encoded") ||
      extractXmlText(entry, "content"),
    );
    const externalId = cleanText(extractXmlText(entry, "guid") || extractXmlText(entry, "id")) || stableId(link || `${feedUrl.href}:${title}`);
    const author = cleanText(extractXmlText(entry, "dc:creator") || extractXmlText(entry, "author")) || feedUrl.hostname;
    const publishedAt = normalizeRecentDate(
      extractXmlText(entry, "pubDate") || extractXmlText(entry, "published") || extractXmlText(entry, "updated"),
      now,
    );
    if (!title || !publishedAt) continue;
    items.push({
      source: "rss",
      externalId,
      title,
      body,
      url: link || feedUrl.href,
      author,
      publishedAt,
      engagement: 0,
      query: feedUrl.href,
    });
  }
  return items;
}

async function mapSettledWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(items.length || 1, concurrency));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index] as T, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}

function capAndDedupe(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.source}:${item.externalId}`;
      if (!item.title || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, config.radar.maxItemsPerSource);
}

function perTopicLimit(): number {
  return Math.max(3, Math.ceil(config.radar.maxItemsPerSource / Math.max(1, config.radar.topics.length)));
}

function lookbackWindow(): "week" | "month" | "year" {
  if (config.radar.lookbackDays <= 7) return "week";
  if (config.radar.lookbackDays <= 31) return "month";
  return "year";
}

async function fetchJson<T>(url: URL, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(`${url.hostname} returned HTTP ${response.status}${retryAfter ? `; retry after ${retryAfter}s` : ""}`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: URL, init: RequestInit): Promise<string> {
  return (await fetchRemoteText(url, init, MAX_XML_BYTES)).text;
}

async function fetchRemoteText(
  url: URL,
  init: RequestInit,
  maxBytes: number,
  redirectAllowed?: (redirectUrl: URL) => boolean,
): Promise<{ text: string; finalUrl: URL; contentType: string }> {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafeRemoteUrl(currentUrl);
    const timeoutSignal = AbortSignal.timeout(15_000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(currentUrl, { ...init, redirect: "manual", signal });
    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error(`${currentUrl.hostname} returned a redirect without a location`);
      if (redirectCount === MAX_REDIRECTS) throw new Error(`${currentUrl.hostname} exceeded ${MAX_REDIRECTS} redirects`);
      const redirectUrl = parseRemoteUrl(location, currentUrl);
      if (redirectAllowed && !redirectAllowed(redirectUrl)) {
        throw new Error(`${currentUrl.hostname} redirected outside the configured website scope`);
      }
      currentUrl = redirectUrl;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${currentUrl.hostname} returned HTTP ${response.status}`);
    }
    const text = await readTextWithLimit(response, maxBytes);
    return {
      text,
      finalUrl: currentUrl,
      contentType: response.headers.get("content-type") || "",
    };
  }
  throw new Error(`${url.hostname} exceeded ${MAX_REDIRECTS} redirects`);
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number.parseInt(response.headers.get("content-length") || "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Response exceeded the ${maxBytes}-byte limit`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) throw new Error(`Response exceeded the ${maxBytes}-byte limit`);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
    if (bytesRead > maxBytes) await response.body.cancel().catch(() => undefined);
  }
}

function parseRemoteUrl(value: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error("RSS feed URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`RSS feed URL protocol ${url.protocol || "unknown"} is not allowed`);
  }
  if (url.username || url.password) throw new Error("RSS feed URL credentials are not allowed");
  return url;
}

async function assertSafeRemoteUrl(url: URL): Promise<void> {
  parseRemoteUrl(url.href);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!hostname || isBlockedHostname(hostname)) throw new Error(`RSS feed target ${hostname || "unknown"} is not allowed`);

  const ipVersion = isIP(hostname);
  if (ipVersion > 0) {
    assertPublicAddress(hostname, ipVersion);
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(`Unable to resolve RSS feed target ${hostname}: ${errorMessage(error)}`);
  }
  if (addresses.length === 0) throw new Error(`Unable to resolve RSS feed target ${hostname}`);
  for (const address of addresses) assertPublicAddress(address.address, address.family);
}

function assertPublicAddress(address: string, family: number): void {
  const mappedIpv4 = family === 6 ? ipv4FromMappedIpv6(address) : null;
  if (mappedIpv4) {
    if (BLOCKED_ADDRESSES.check(mappedIpv4, "ipv4")) {
      throw new Error("RSS feed target resolves to a non-public address");
    }
    return;
  }
  const type = family === 6 ? "ipv6" : "ipv4";
  if (BLOCKED_ADDRESSES.check(address, type)) throw new Error(`RSS feed target resolves to a non-public address`);
}

function ipv4FromMappedIpv6(address: string): string | null {
  const normalized = address.trim().toLowerCase();
  const dotted = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted?.[1] && isIP(dotted[1]) === 4) return dotted[1];
  const hexadecimal = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hexadecimal?.[1] || !hexadecimal[2]) return null;
  const high = Number.parseInt(hexadecimal[1], 16);
  const low = Number.parseInt(hexadecimal[2], 16);
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function isBlockedHostname(hostname: string): boolean {
  return hostname === "localhost" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan");
}

function createBlockedAddressList(): BlockList {
  const list = new BlockList();
  for (const [address, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
    ["224.0.0.0", 4], ["240.0.0.0", 4],
  ] as const) list.addSubnet(address, prefix, "ipv4");
  for (const [address, prefix] of [
    ["::", 96], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
    ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7],
    ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
  ] as const) list.addSubnet(address, prefix, "ipv6");
  return list;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function findXmlBlocks(xml: string, tag: string): string[] {
  const escaped = escapeRegExp(tag);
  return [...xml.matchAll(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi"))]
    .map((match) => match[1] || "");
}

function extractXmlText(xml: string, tag: string): string {
  const escaped = escapeRegExp(tag);
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return decodeXml(match?.[1] || "");
}

function extractXmlHref(xml: string): string {
  const alternate = xml.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  if (alternate?.[1]) return decodeXml(alternate[1]);
  const anyHref = xml.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  return decodeXml(anyHref?.[1] || "");
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeRecentDate(value: string, now: number): string | null {
  const parsed = Date.parse(value);
  const cutoff = now - config.radar.lookbackDays * 86_400_000;
  const futureLimit = now + 86_400_000;
  return Number.isFinite(parsed) && parsed >= cutoff && parsed <= futureLimit
    ? new Date(parsed).toISOString()
    : null;
}

function normalizeHttpLink(value: string, base?: URL): string {
  if (!value) return "";
  try {
    const url = new URL(value, base);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

function feedLabel(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname || "invalid feed URL";
  } catch {
    return "invalid feed URL";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rssFailureSummary(failures: string[], total: number): string {
  const shown = failures.slice(0, 3).join("; ");
  const omitted = failures.length > 3 ? `; ${failures.length - 3} more failure(s)` : "";
  return `${failures.length}/${total} RSS feeds failed: ${shown}${omitted}`;
}

function stableId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanText(value: string | null | undefined): string {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6_000);
}

function reactionCount(reactions?: { total_count?: number } | null): number {
  return Math.max(0, Number(reactions?.total_count || 0));
}

export interface GooglePlaceResult {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  types?: string[];
  websiteUri?: string;
}

export interface GooglePlacesTextSearchResponse {
  places?: GooglePlaceResult[];
}

export interface BraveWebSearchResult {
  title: string;
  url: string;
  description?: string;
}

export interface BraveWebSearchResponse {
  query?: {
    original?: string;
    more_results_available?: boolean;
  };
  web?: {
    results?: BraveWebSearchResult[];
  };
}

interface RedditResponse {
  data?: {
    children?: Array<{
      data: {
        id: string;
        name: string;
        title: string;
        selftext?: string;
        permalink?: string;
        url: string;
        author?: string;
        created_utc?: number;
        score?: number;
        num_comments?: number;
        subreddit?: string;
        stickied?: boolean;
      };
    }>;
  };
}

interface RedditAboutResponse {
  data?: {
    public_description?: string;
    description?: string;
  };
}

interface RedditRulesResponse {
  rules?: Array<{
    short_name?: string;
    description?: string;
    violation_reason?: string;
  }>;
}

interface HackerNewsResponse {
  hits?: Array<{
    objectID: string;
    title?: string;
    story_title?: string;
    story_text?: string;
    comment_text?: string;
    url?: string;
    story_url?: string;
    author?: string;
    created_at?: string;
    created_at_i?: number;
    points?: number;
    num_comments?: number;
  }>;
}

interface GitHubSearchResponse {
  items?: Array<{
    id: number;
    title: string;
    body?: string | null;
    html_url: string;
    user?: { login?: string } | null;
    created_at: string;
    comments?: number;
    reactions?: { total_count?: number } | null;
  }>;
}
