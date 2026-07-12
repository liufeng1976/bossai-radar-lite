import { config } from "./config.js";
import type { RawItem, SourceName, SourceOutcome } from "./types.js";

const USER_AGENT = "BossAI-Radar-Lite/0.1 (+non-commercial research)";

export async function collectAll(): Promise<SourceOutcome[]> {
  return Promise.all([
    withOutcome("reddit", collectReddit),
    withOutcome("hackernews", collectHackerNews),
    withOutcome("github", collectGitHub),
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
      }));
    }),
  );
  return capAndDedupe(batches.flat());
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
      };
    }>;
  };
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
