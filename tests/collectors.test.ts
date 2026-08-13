import assert from "node:assert/strict";
import test from "node:test";
import {
  collectRssOutcome,
  parseArxivFeed,
  parseRedditCommunityContext,
  parseRedditSearch,
  parseRssFeed,
} from "../src/collectors.js";

const NOW = Date.parse("2026-07-13T12:00:00.000Z");
const RECENT = "2026-07-12T08:00:00.000Z";

test("Reddit parser preserves subreddit and engagement evidence", () => {
  const items = parseRedditSearch({
    data: {
      children: [{
        data: {
          id: "reddit-1",
          name: "t3-reddit-1",
          title: "Looking for a reliable smart feeder",
          selftext: "Mine stopped working and I would pay more.",
          permalink: "/r/Pets/comments/reddit_1/smart_feeder/",
          url: "https://example.com/fallback",
          author: "pet-owner",
          created_utc: 1_784_000_000,
          score: 30,
          num_comments: 12,
          subreddit: "Pets",
        },
      }],
    },
  }, "smart pet feeder");

  assert.equal(items.length, 1);
  assert.equal(items[0]?.community, "Pets");
  assert.equal(items[0]?.engagement, 54);
  assert.equal(items[0]?.url, "https://www.reddit.com/r/Pets/comments/reddit_1/smart_feeder/");
});

test("Reddit community context preserves rules and pinned posts without scoring them as market evidence", () => {
  const context = parseRedditCommunityContext(
    "Pets",
    { data: { public_description: "A community for pet owners." } },
    { rules: [{ short_name: "No spam", description: "Commercial affiliation must be disclosed." }] },
    { data: { children: [{ data: {
      id: "pinned-1",
      name: "t3-pinned-1",
      title: "Read before posting",
      url: "https://www.reddit.com/r/Pets/comments/pinned_1/guide/",
      permalink: "/r/Pets/comments/pinned_1/guide/",
      stickied: true,
    } }] } },
    "2026-08-10T00:00:00.000Z",
  );

  assert.equal(context.status, "available");
  assert.equal(context.aboutStatus, "available");
  assert.equal(context.rulesStatus, "available");
  assert.equal(context.pinnedPostsStatus, "available");
  assert.equal(context.rules[0]?.shortName, "No spam");
  assert.equal(context.pinnedPosts[0]?.title, "Read before posting");
  assert.equal(context.rulesUrl, "https://www.reddit.com/r/Pets/about/rules");
});

test("RSS parser keeps only recently dated items and sanitizes item links", () => {
  const xml = `
    <rss><channel>
      <item><title>Recent</title><link>/posts/recent</link><pubDate>${RECENT}</pubDate></item>
      <item><title>Old</title><link>https://news.example/old</link><pubDate>2026-06-01T00:00:00Z</pubDate></item>
      <item><title>Unknown date</title><link>https://news.example/unknown</link></item>
      <item><title>Unsafe link</title><link>javascript:alert(1)</link><pubDate>${RECENT}</pubDate></item>
    </channel></rss>`;

  const items = parseRssFeed(xml, new URL("https://news.example/feed.xml"), NOW);

  assert.deepEqual(items.map((item) => item.title), ["Recent", "Unsafe link"]);
  assert.equal(items[0]?.url, "https://news.example/posts/recent");
  assert.equal(items[1]?.url, "https://news.example/feed.xml");
  assert.equal(items[0]?.publishedAt, RECENT);
});

test("ArXiv parser applies the lookback window and drops invalid dates", () => {
  const xml = `
    <feed>
      <entry><id>https://arxiv.org/abs/2607.00001</id><title>Recent paper</title><published>${RECENT}</published></entry>
      <entry><id>https://arxiv.org/abs/2605.00001</id><title>Old paper</title><published>2026-05-01T00:00:00Z</published></entry>
      <entry><id>https://arxiv.org/abs/invalid</id><title>Invalid date</title><published>not-a-date</published></entry>
    </feed>`;

  const items = parseArxivFeed(xml, NOW);

  assert.deepEqual(items.map((item) => item.title), ["Recent paper"]);
  assert.equal(items[0]?.publishedAt, RECENT);
});

test("RSS outcome preserves successful items and reports partial feed failures", async (t) => {
  replaceFetch(t, async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/failed") return new Response("unavailable", { status: 503 });
    return xmlResponse(`<rss><channel><item><title>Useful signal</title><link>https://example.com/item</link><pubDate>${RECENT}</pubDate></item></channel></rss>`);
  });

  const outcome = await collectRssOutcome([
    "https://8.8.8.8/good",
    "https://8.8.8.8/failed",
  ], NOW);

  assert.equal(outcome.status, "partial");
  assert.deepEqual(outcome.items.map((item) => item.title), ["Useful signal"]);
  assert.match(outcome.error || "", /1\/2 RSS feeds failed/);
  assert.match(outcome.error || "", /HTTP 503/);
});

test("RSS collector rejects private targets before making a request", async (t) => {
  let fetchCalls = 0;
  replaceFetch(t, async () => {
    fetchCalls += 1;
    return xmlResponse("<rss></rss>");
  });

  const outcome = await collectRssOutcome(["http://127.0.0.1/private"], NOW);

  assert.equal(outcome.status, "failed");
  assert.equal(fetchCalls, 0);
  assert.match(outcome.error || "", /non-public address/);
});

test("RSS collector rejects private IPv4 targets encoded as IPv6", async () => {
  const outcome = await collectRssOutcome(["http://[::ffff:10.0.0.1]/feed.xml"], NOW);
  assert.equal(outcome.status, "failed");
  assert.match(outcome.error || "", /non-public address/);
});

test("RSS collector allows only HTTP and HTTPS feed URLs", async (t) => {
  let fetchCalls = 0;
  replaceFetch(t, async () => {
    fetchCalls += 1;
    return xmlResponse("<rss></rss>");
  });

  const outcome = await collectRssOutcome(["file:///etc/passwd"], NOW);

  assert.equal(outcome.status, "failed");
  assert.equal(fetchCalls, 0);
  assert.match(outcome.error || "", /protocol file: is not allowed/);
});

test("RSS collector validates every redirect target", async (t) => {
  let fetchCalls = 0;
  replaceFetch(t, async () => {
    fetchCalls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    });
  });

  const outcome = await collectRssOutcome(["https://8.8.8.8/feed"], NOW);

  assert.equal(outcome.status, "failed");
  assert.equal(fetchCalls, 1);
  assert.match(outcome.error || "", /non-public address/);
});

test("RSS collector rejects oversized responses from content length", async (t) => {
  replaceFetch(t, async () => new Response("small body", {
    status: 200,
    headers: { "content-length": String(2 * 1024 * 1024 + 1) },
  }));

  const outcome = await collectRssOutcome(["https://8.8.8.8/feed"], NOW);

  assert.equal(outcome.status, "failed");
  assert.match(outcome.error || "", /byte limit/);
});

test("RSS collector enforces the response limit when content length is absent", async (t) => {
  replaceFetch(t, async () => {
    let step = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (step === 0) controller.enqueue(new Uint8Array(2 * 1024 * 1024));
        else if (step === 1) controller.enqueue(new Uint8Array(1));
        else controller.close();
        step += 1;
      },
    });
    return new Response(body, { status: 200 });
  });

  const outcome = await collectRssOutcome(["https://8.8.8.8/feed"], NOW);

  assert.equal(outcome.status, "failed");
  assert.match(outcome.error || "", /byte limit/);
});

function xmlResponse(xml: string): Response {
  return new Response(xml, { status: 200, headers: { "content-type": "application/xml" } });
}

function replaceFetch(t: test.TestContext, implementation: (input: URL | RequestInfo) => Promise<Response>): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}
