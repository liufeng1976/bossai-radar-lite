import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import {
  collectRssOutcome,
  collectWebsiteOutcome,
  discoverProspectCandidates,
  discoverProspectMapCandidates,
  discoverProspectSearchCandidates,
  parseArxivFeed,
  parseBraveProspectSearchResponse,
  parseBusinessWebsitePage,
  parseGooglePlacesProspectSearchResponse,
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

test("Brave prospect search adapter uses the official JSON endpoint and server-side token", async () => {
  const seen: Array<{ url: URL; init: RequestInit }> = [];
  const outcome = await discoverProspectSearchCandidates(
    ["US pet supplies distributor"],
    NOW,
    {
      provider: "brave",
      apiKey: "test-brave-secret",
      country: "US",
      searchLanguage: "en",
      maxResultsPerQuery: 2,
      concurrentQueries: 1,
      fetchImpl: async (input, init = {}) => {
        const url = new URL(String(input));
        seen.push({ url, init });
        return new Response(JSON.stringify({
          query: { original: "US pet supplies distributor", more_results_available: false },
          web: { results: [{
            title: "Acme Pet Distribution | Wholesale Pet Supplies",
            url: "https://acmepet.example/",
            description: "Wholesale pet supplies distributor for retailers.",
          }] },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  );

  assert.equal(outcome.status, "success");
  assert.equal(outcome.candidates[0]?.domain, "acmepet.example");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url.origin, "https://api.search.brave.com");
  assert.equal(seen[0]?.url.pathname, "/res/v1/web/search");
  assert.equal(seen[0]?.url.searchParams.get("q"), "US pet supplies distributor");
  assert.equal(seen[0]?.url.searchParams.get("count"), "2");
  assert.equal(seen[0]?.url.searchParams.get("result_filter"), "web");
  assert.equal(new Headers(seen[0]?.init.headers).get("X-Subscription-Token"), "test-brave-secret");
  assert.equal(seen[0]?.init.redirect, "error");
});

test("Brave prospect search fails closed on provider HTTP errors", async () => {
  const outcome = await discoverProspectSearchCandidates(
    ["US pet supplies distributor"],
    NOW,
    {
      provider: "brave",
      apiKey: "test-brave-secret",
      fetchImpl: async () => new Response("rate limited", { status: 429, headers: { "retry-after": "30" } }),
    },
  );

  assert.equal(outcome.status, "failed");
  assert.equal(outcome.candidates.length, 0);
  assert.match(outcome.errors[0] || "", /HTTP 429/);
  assert.match(outcome.errors[0] || "", /retry after 30s/);
});

test("Brave prospect search parser ranks likely company sites and filters platform hosts", () => {
  const candidates = parseBraveProspectSearchResponse({
    query: { original: "pet supplies distributor USA", more_results_available: false },
    web: {
      results: [
        {
          title: "Acme Pet Distribution | Wholesale Pet Supplies",
          url: "https://www.acmepet.example/",
          description: "Wholesale pet supplies distributor serving independent retailers across the US.",
        },
        {
          title: "Top 10 Pet Supply Distributors",
          url: "https://industryblog.example/blog/top-10-pet-supply-distributors",
          description: "A guide to suppliers and distributors.",
        },
        {
          title: "Acme Pet Distribution on LinkedIn",
          url: "https://www.linkedin.com/company/acme-pet-distribution",
          description: "Company profile",
        },
      ],
    },
  }, "pet supplies distributor USA", NOW);

  assert.equal(candidates.some((item) => item.domain === "linkedin.com"), false);
  const official = candidates.find((item) => item.domain === "acmepet.example");
  const article = candidates.find((item) => item.domain === "industryblog.example");
  assert.equal(official?.companyName, "Acme Pet Distribution");
  assert.equal(official?.discoverySourceTitle, "Brave Search: pet supplies distributor USA");
  assert.equal(official?.websiteUrl, "https://www.acmepet.example/");
  assert.ok((official?.score || 0) > (article?.score || 0));
  assert.ok(official?.reasons.some((reason) => reason.includes("search")));
});

test("Google Places prospect adapter uses Text Search New with a minimal field mask and server-side API key", async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const outcome = await discoverProspectMapCandidates(
    ["pet supplies distributors in Los Angeles"],
    NOW,
    {
      provider: "google_places",
      apiKey: "test-google-places-secret",
      regionCode: "US",
      languageCode: "en",
      maxResultsPerQuery: 3,
      concurrentQueries: 1,
      fetchImpl: async (input, init = {}) => {
        seen.push({ url: String(input), init });
        return new Response(JSON.stringify({ places: [{
          id: "place-acme",
          displayName: { text: "Acme Pet Wholesale", languageCode: "en" },
          formattedAddress: "123 Market St, Los Angeles, CA",
          types: ["pet_supply_store", "wholesaler"],
          websiteUri: "https://acmepet.example/",
        }] }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  );

  assert.equal(outcome.status, "success");
  assert.equal(outcome.candidates[0]?.domain, "acmepet.example");
  assert.equal(outcome.candidates[0]?.companyName, "Acme Pet Wholesale");
  assert.ok(outcome.candidates[0]?.description.includes("Los Angeles"));
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url, "https://places.googleapis.com/v1/places:searchText");
  const headers = new Headers(seen[0]?.init.headers);
  assert.equal(headers.get("X-Goog-Api-Key"), "test-google-places-secret");
  assert.equal(headers.get("X-Goog-FieldMask"), "places.id,places.displayName,places.formattedAddress,places.types,places.websiteUri");
  const body = JSON.parse(String(seen[0]?.init.body)) as { textQuery: string; pageSize: number; languageCode: string; regionCode: string };
  assert.deepEqual(body, {
    textQuery: "pet supplies distributors in Los Angeles",
    pageSize: 3,
    languageCode: "en",
    regionCode: "US",
  });
});

test("Google Places prospect parser keeps only results with usable company websites", () => {
  const candidates = parseGooglePlacesProspectSearchResponse({ places: [
    {
      id: "place-1",
      displayName: { text: "Acme Industrial Supply" },
      formattedAddress: "Dallas, TX",
      types: ["wholesaler"],
      websiteUri: "https://acmeindustrial.example/products",
    },
    {
      id: "place-2",
      displayName: { text: "No Website Store" },
      formattedAddress: "Dallas, TX",
      types: ["store"],
    },
    {
      id: "place-3",
      displayName: { text: "LinkedIn Profile" },
      websiteUri: "https://linkedin.com/company/example",
    },
  ] }, "industrial distributors Dallas", NOW, 10);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.domain, "acmeindustrial.example");
  assert.equal(candidates[0]?.websiteUrl, "https://acmeindustrial.example/");
  assert.match(candidates[0]?.discoverySourceTitle || "", /Google Places/);
  assert.ok(candidates[0]?.productSignals.includes("wholesaler"));
});

test("Google Places prospect discovery fails closed when the API key is missing", async () => {
  const outcome = await discoverProspectMapCandidates(["industrial distributors Dallas"], NOW, {
    provider: "google_places",
    apiKey: "",
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.candidates.length, 0);
  assert.match(outcome.errors[0] || "", /GOOGLE_PLACES_API_KEY/);
});

test("prospect discovery extracts likely company websites from bounded public directory pages", async (t) => {
  const requested: string[] = [];
  replaceFetch(t, async (input) => {
    const url = new URL(String(input));
    requested.push(url.href);
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
    }
    if (url.pathname === "/exhibitors") {
      return htmlResponse(`<html><head><title>Pet Expo Exhibitor Directory</title></head><body>
        <table><tr><td>Acme Pet Supplies Manufacturer</td><td><a href="https://acme.example/products">www.acme.example</a></td><td>Member</td></tr></table>
        <a href="https://linkedin.com/company/acme">LinkedIn</a>
        <a href="/exhibitors?page=2">Next</a>
      </body></html>`);
    }
    if (url.pathname === "/exhibitors" && url.searchParams.get("page") === "2") {
      return htmlResponse("<html><head><title>More exhibitors</title></head></html>");
    }
    return htmlResponse("<html><head><title>Directory</title></head></html>");
  });

  const outcome = await discoverProspectCandidates(["https://8.8.8.8/exhibitors"], NOW);

  assert.equal(outcome.status, "success");
  assert.equal(outcome.candidates.length, 1);
  assert.equal(outcome.candidates[0]?.domain, "acme.example");
  assert.equal(outcome.candidates[0]?.websiteUrl, "https://acme.example/");
  assert.equal(outcome.candidates[0]?.companyName, "Acme Pet Supplies Manufacturer");
  assert.ok((outcome.candidates[0]?.score || 0) >= 45);
  assert.equal(outcome.candidates.some((item) => item.domain.includes("linkedin")), false);
  assert.equal(requested.some((url) => url.startsWith("https://acme.example/")), false);
});

test("business website parser extracts bounded public company and contact context", () => {
  const html = `<!doctype html>
    <html><head>
      <title>Acme Robotics | Warehouse Automation</title>
      <meta property="og:site_name" content="Acme Robotics">
      <meta name="description" content="Industrial warehouse robots and picking systems.">
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "@graph":[
          {"@type":"Organization","name":"Acme Robotics Ltd","email":"sales@acme.example","telephone":"+1 555 0100","sameAs":["https://www.linkedin.com/company/acme-robotics/","https://www.linkedin.com/in/founder-personal/"],"contactPoint":[{"@type":"ContactPoint","contactType":"sales","email":"channel@acme.example","telephone":"+1 555 0199","url":"https://wa.me/15550199"}]},
          {"@type":"Product","name":"PickerBot X"}
        ]
      }</script>
    </head><body>
      <h1>Warehouse automation systems</h1>
      <a href="/contact?utm_source=nav">Contact sales</a>
      <a href="/sales">Sales</a>
      <a href="/export">Export</a>
      <a href="/wholesale">Wholesale</a>
      <a href="/support">Support</a>
      <a href="/procurement">Procurement portal</a>
      <a href="/partners">Partners</a>
      <a href="https://external.example/contact">External contact page</a>
      <a href="/products">Products</a>
      <a href="mailto:export@acme.example">Email export</a>
      <a href="mailto:procurement@acme.example">Procurement</a>
      <a href="mailto:alice@acme.example">Alice personal mailbox</a>
      <a href="tel:+15550101">Call</a>
      <a href="https://www.linkedin.com/company/acme-robotics/">LinkedIn</a>
      <a href="https://www.tiktok.com/@acmerobotics">TikTok</a>
      <a href="https://wa.me/15550101">WhatsApp business</a>
      <a href="https://www.linkedin.com/in/founder-personal/">Founder personal profile</a>
      <form id="sales-contact"><input name="message"></form>
      <p>For distributors: partners@acme.example</p>
    </body></html>`;

  const parsed = parseBusinessWebsitePage(
    html,
    new URL("https://www.acme.example/"),
    new URL("https://www.acme.example/"),
    0,
    "2026-08-16T12:00:00.000Z",
  );
  const context = parsed.item.websiteContext;

  assert.equal(parsed.item.source, "website");
  assert.equal(parsed.item.author, "Acme Robotics Ltd");
  assert.ok(context && context.schema === "bossai.business-website-context.v1");
  if (!context) return;
  assert.deepEqual(context.publicEmails.sort(), ["channel@acme.example", "export@acme.example", "partners@acme.example", "procurement@acme.example", "sales@acme.example"].sort());
  assert.equal(context.publicEmails.includes("alice@acme.example"), false);
  assert.deepEqual(context.publicPhones.sort(), ["+1 555 0100", "+1 555 0199", "+15550101"].sort());
  assert.ok(context.productSignals.includes("PickerBot X"));
  assert.deepEqual(context.officialProfileUrls?.sort(), [
    "https://www.linkedin.com/company/acme-robotics/",
    "https://www.tiktok.com/@acmerobotics",
  ].sort());
  assert.equal(context.officialProfileUrls?.some((url) => url.includes("/in/founder-personal")), false);
  assert.deepEqual(context.publicMessagingUrls?.sort(), ["https://wa.me/15550101", "https://wa.me/15550199"].sort());
  const channels = context.companyContactChannels ?? [];
  assert.equal(channels.some((item) => item.type === "email" && item.value === "export@acme.example" && item.businessRole === "export"), true);
  assert.equal(channels.some((item) => item.type === "email" && item.value === "procurement@acme.example" && item.businessRole === "procurement"), true);
  assert.equal(channels.some((item) => item.type === "email" && item.value === "channel@acme.example" && item.businessRole === "sales" && item.sourceKind === "jsonld-contact-point" && item.verificationStatus === "official-site-structured"), true);
  assert.equal(channels.some((item) => item.type === "contact-form" && item.businessRole === "sales"), true);
  assert.equal(channels.some((item) => item.type === "contact-page" && item.url === "https://www.acme.example/contact" && item.businessRole === "general"), true);
  assert.equal(channels.some((item) => item.type === "contact-page" && item.url === "https://www.acme.example/sales" && item.businessRole === "sales"), true);
  assert.equal(channels.some((item) => item.type === "contact-page" && item.url === "https://www.acme.example/export" && item.businessRole === "export"), true);
  assert.equal(channels.some((item) => item.type === "contact-page" && item.url === "https://www.acme.example/wholesale" && item.businessRole === "wholesale"), true);
  assert.equal(channels.some((item) => item.type === "contact-page" && item.url === "https://www.acme.example/support" && item.businessRole === "support"), true);
  assert.equal(channels.some((item) => item.type === "contact-page" && item.url === "https://www.acme.example/procurement" && item.businessRole === "procurement"), true);
  assert.equal(channels.some((item) => item.type === "contact-page" && item.url === "https://www.acme.example/partners" && item.businessRole === "business-development"), true);
  assert.equal(channels.some((item) => item.url === "https://external.example/contact"), false);
  assert.equal(channels.some((item) => item.type === "whatsapp-business" && item.url === "https://wa.me/15550101"), true);
  assert.equal(channels.some((item) => item.type === "linkedin-company" && item.url === "https://www.linkedin.com/company/acme-robotics/"), true);
  assert.equal(channels.some((item) => item.url?.includes("/in/founder-personal")), false);
  assert.equal(channels.some((item) => item.value === "alice@acme.example"), false);
  assert.equal(channels.every((item) => ["high", "medium"].includes(item.confidence)), true);
  assert.equal(context.renderingHint, "static-sufficient");
  assert.ok(context.contactUrls.some((url) => url === "https://www.acme.example/contact"));
  assert.ok(parsed.links.some((url) => url.href === "https://www.acme.example/products"));
});

test("business website parser marks sparse JavaScript app shells as potentially incomplete static evidence", () => {
  const parsed = parseBusinessWebsitePage(
    `<!doctype html><html><head><title>SPA Company</title></head><body><div id="root"></div><script type="module" src="/app.js"></script><script src="/vendor.js"></script><script src="/analytics.js"></script></body></html>`,
    new URL("https://spa.example/"),
    new URL("https://spa.example/"),
  );
  assert.equal(parsed.item.websiteContext?.renderingHint, "javascript-likely");
});

test("business website crawler respects robots, same-site scope and bounded public pages", async (t) => {
  const requested: string[] = [];
  replaceFetch(t, async (input) => {
    const url = new URL(String(input));
    requested.push(url.href);
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /private\nAllow: /private/public\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url.pathname === "/") {
      return htmlResponse(`<html><head><title>Acme Export</title></head><body>
        <a href="/contact">Contact</a>
        <a href="/products?utm_source=home">Products</a>
        <a href="/private/secret">Private</a>
        <a href="https://example.org/offsite">Offsite</a>
      </body></html>`);
    }
    if (url.pathname === "/contact") return htmlResponse("<html><head><title>Contact</title></head><body><a href='mailto:sales@example.com'>sales@example.com</a></body></html>");
    if (url.pathname === "/products") return htmlResponse("<html><head><title>Products</title></head><body><h1>Industrial pumps</h1></body></html>");
    return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  });

  const outcome = await collectWebsiteOutcome(["https://8.8.8.8/"], NOW);

  assert.equal(outcome.status, "success");
  assert.ok(outcome.items.some((item) => item.title === "Acme Export"));
  assert.ok(outcome.items.some((item) => item.title === "Contact"));
  assert.ok(outcome.items.some((item) => item.title === "Products"));
  assert.equal(requested.some((url) => url.includes("/private/secret")), false);
  assert.equal(requested.some((url) => url.includes("example.org")), false);
  assert.equal(requested.some((url) => url.includes("utm_source")), false);
});

test("business website crawler uses same-site robots sitemap hints for bounded high-value pages", async (t) => {
  const requested: string[] = [];
  replaceFetch(t, async (input) => {
    const url = new URL(String(input));
    requested.push(url.href);
    if (url.pathname === "/robots.txt") {
      return new Response([
        "User-agent: *",
        "Disallow: /products/private",
        "Sitemap: https://8.8.8.8/sitemap-index.xml",
        "Sitemap: https://example.org/external-sitemap.xml",
      ].join("\n"), { status: 200, headers: { "content-type": "text/plain" } });
    }
    if (url.pathname === "/sitemap-index.xml") {
      return xmlResponse(`<sitemapindex>
        <sitemap><loc>https://8.8.8.8/company-sitemap.xml</loc></sitemap>
        <sitemap><loc>https://example.org/foreign.xml</loc></sitemap>
      </sitemapindex>`);
    }
    if (url.pathname === "/company-sitemap.xml") {
      return xmlResponse(`<urlset>
        <url><loc>https://8.8.8.8/about-us</loc></url>
        <url><loc>https://8.8.8.8/products/public-pump</loc></url>
        <url><loc>https://8.8.8.8/products/private</loc></url>
        <url><loc>https://8.8.8.8/blog/post</loc></url>
      </urlset>`);
    }
    if (url.pathname === "/") return htmlResponse("<html><head><title>Acme Pumps</title></head><body></body></html>");
    if (url.pathname === "/about-us") return htmlResponse("<html><head><title>About Acme</title></head><body>Industrial pump manufacturer</body></html>");
    if (url.pathname === "/products/public-pump") return htmlResponse("<html><head><title>Public Pump</title></head><body><h1>API 610 Pump</h1></body></html>");
    return htmlResponse("<html><head><title>Unexpected</title></head></html>");
  });

  const outcome = await collectWebsiteOutcome(["https://8.8.8.8/"], NOW);

  assert.equal(outcome.status, "success");
  assert.ok(outcome.items.some((item) => item.title === "About Acme"));
  assert.ok(outcome.items.some((item) => item.title === "Public Pump"));
  assert.equal(requested.some((url) => url.startsWith("https://example.org/")), false);
  assert.equal(requested.some((url) => url.includes("/products/private")), false);
  assert.equal(requested.some((url) => url.includes("/blog/post")), false);
});

test("business website crawler tries same-site /sitemap.xml when robots has no sitemap directive", async (t) => {
  const requested: string[] = [];
  replaceFetch(t, async (input) => {
    const url = new URL(String(input));
    requested.push(url.href);
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
    }
    if (url.pathname === "/sitemap.xml") {
      return xmlResponse(`<urlset><url><loc>https://8.8.8.8/contact-us</loc></url></urlset>`);
    }
    if (url.pathname === "/") return htmlResponse("<html><head><title>Acme</title></head><body></body></html>");
    if (url.pathname === "/contact-us") return htmlResponse("<html><head><title>Contact Acme</title></head><body><a href='mailto:sales@acme.example'>sales</a></body></html>");
    return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  });

  const outcome = await collectWebsiteOutcome(["https://8.8.8.8/"], NOW);

  assert.equal(outcome.status, "success");
  assert.ok(requested.some((url) => url.endsWith("/sitemap.xml")));
  assert.ok(outcome.items.some((item) => item.title === "Contact Acme"));
});

test("business website crawler bounds concurrent seed processing", async (t) => {
  let active = 0;
  let peak = 0;
  replaceFetch(t, async (input) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    const url = new URL(String(input));
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
    }
    return htmlResponse(`<html><head><title>${url.hostname}</title></head></html>`);
  });

  const outcome = await collectWebsiteOutcome([
    "https://8.8.8.1/",
    "https://8.8.8.2/",
    "https://8.8.8.3/",
    "https://8.8.8.4/",
    "https://8.8.8.5/",
    "https://8.8.8.6/",
  ], NOW);

  assert.equal(outcome.status, "success");
  assert.equal(outcome.items.length, 6);
  assert.ok(peak <= config.radar.websiteConcurrentSeeds, `peak concurrency ${peak} exceeded ${config.radar.websiteConcurrentSeeds}`);
});

test("business website crawler honors BossAI-specific robots rules over wildcard rules", async (t) => {
  const requested: string[] = [];
  replaceFetch(t, async (input) => {
    const url = new URL(String(input));
    requested.push(url.href);
    if (url.pathname === "/robots.txt") {
      return new Response([
        "User-agent: *",
        "Allow: /",
        "User-agent: BossAI-Radar-Lite",
        "Disallow: /private",
        "Allow: /public",
      ].join("\n"), { status: 200, headers: { "content-type": "text/plain" } });
    }
    if (url.pathname === "/") {
      return htmlResponse(`<html><head><title>Acme</title></head><body>
        <a href="/private/secret">Private</a>
        <a href="/public/catalog">Public catalog</a>
      </body></html>`);
    }
    if (url.pathname === "/public/catalog") return htmlResponse("<html><head><title>Public catalog</title></head></html>");
    return htmlResponse("<html><head><title>Unexpected</title></head></html>");
  });

  const outcome = await collectWebsiteOutcome(["https://8.8.8.8/"], NOW);

  assert.equal(outcome.status, "success");
  assert.equal(requested.some((url) => url.includes("/private/secret")), false);
  assert.equal(requested.some((url) => url.includes("/public/catalog")), true);
});

test("business website crawler marks robots policy unavailable when robots.txt cannot be read", async (t) => {
  replaceFetch(t, async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/robots.txt") return new Response("missing", { status: 404 });
    return htmlResponse("<html><head><title>Public company</title></head><body><h1>Industrial valves</h1></body></html>");
  });

  const outcome = await collectWebsiteOutcome(["https://8.8.8.8/"], NOW);

  assert.equal(outcome.status, "success");
  assert.equal(outcome.items[0]?.websiteContext?.robotsPolicy, "unavailable");
});

test("business website crawler blocks cross-site redirects before requesting the external host", async (t) => {
  const requested: string[] = [];
  replaceFetch(t, async (input) => {
    const url = new URL(String(input));
    requested.push(url.href);
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
    }
    if (url.hostname === "8.8.8.8") {
      return new Response(null, { status: 302, headers: { location: "https://example.org/landing" } });
    }
    return htmlResponse("<html><head><title>External</title></head></html>");
  });

  const outcome = await collectWebsiteOutcome(["https://8.8.8.8/"], NOW);

  assert.equal(outcome.status, "failed");
  assert.equal(requested.some((url) => url.startsWith("https://example.org/")), false);
  assert.match(outcome.error || "", /outside the configured website scope/);
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

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function replaceFetch(t: test.TestContext, implementation: (input: URL | RequestInfo) => Promise<Response>): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}
