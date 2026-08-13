import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { config } from "./config.js";
import type { RawItem, RedditCommunityContext, SourceName, SourceOutcome } from "./types.js";

const USER_AGENT = "BossAI-Radar-Lite/0.1 (+non-commercial research)";
const MAX_XML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REDDIT_CONTEXT_TTL_MS = 24 * 60 * 60 * 1_000;
const REDDIT_CONTEXT_FAILURE_TTL_MS = 15 * 60 * 1_000;
const BLOCKED_ADDRESSES = createBlockedAddressList();
const redditContextCache = new Map<string, { expiresAt: number; context: RedditCommunityContext }>();

export async function collectAll(): Promise<SourceOutcome[]> {
  return Promise.all([
    withOutcome("reddit", collectReddit),
    withOutcome("hackernews", collectHackerNews),
    withOutcome("github", collectGitHub),
    withOutcome("arxiv", collectArxiv),
    collectRssOutcome(),
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
      currentUrl = parseRemoteUrl(location, currentUrl);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${currentUrl.hostname} returned HTTP ${response.status}`);
    }
    return readTextWithLimit(response, MAX_XML_BYTES);
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
