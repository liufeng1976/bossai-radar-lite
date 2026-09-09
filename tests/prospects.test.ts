import assert from "node:assert/strict";
import test from "node:test";
import { deterministicProspectQueryPlan } from "../src/ai.js";
import { enrichProspectCandidates, filterWebsiteVerifiedProspectCandidates } from "../src/prospects.js";
import type { ProspectDiscoveryCandidate, RawItem } from "../src/types.js";

test("official website evidence enriches a discovered prospect without inventing CRM state", () => {
  const candidate: ProspectDiscoveryCandidate = {
    id: "prospect-acme",
    domain: "acme.example",
    websiteUrl: "https://acme.example/",
    companyName: "Acme website",
    description: "Directory listing",
    discoverySourceUrl: "https://expo.example/exhibitors",
    discoverySourceTitle: "Expo exhibitors",
    discoveryQuery: "https://expo.example/exhibitors",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    productSignals: [],
    evidenceUrls: ["https://expo.example/exhibitors"],
    score: 55,
    reasons: ["directory source"],
    discoveredAt: "2026-08-16T12:00:00.000Z",
  };
  const website: RawItem = {
    source: "website",
    externalId: "acme-home",
    title: "Acme Industrial",
    body: "Industrial pumps for distributors",
    url: "https://acme.example/",
    author: "Acme Industrial Ltd",
    publishedAt: "2026-08-16T12:00:00.000Z",
    engagement: 0,
    query: "https://acme.example/",
    websiteContext: {
      schema: "bossai.business-website-context.v1",
      rootUrl: "https://acme.example/",
      pageUrl: "https://acme.example/",
      companyName: "Acme Industrial Ltd",
      description: "Industrial pumps for global distributors.",
      publicEmails: ["sales@acme.example"],
      publicPhones: ["+1 555 0100"],
      contactUrls: ["https://acme.example/contact"],
      officialProfileUrls: ["https://www.linkedin.com/company/acme-industrial/"],
      publicMessagingUrls: ["https://wa.me/15550100"],
      companyContactChannels: [
        {
          type: "email",
          value: "sales@acme.example",
          url: "mailto:sales@acme.example",
          sourcePageUrl: "https://acme.example/contact",
          sourceKind: "mailto",
          businessRole: "sales",
          confidence: "high",
          verificationStatus: "official-site-observed",
        },
        {
          type: "email",
          value: "procurement@acme.example",
          url: "mailto:procurement@acme.example",
          sourcePageUrl: "https://acme.example/contact",
          sourceKind: "visible-text",
          businessRole: "procurement",
          confidence: "medium",
          verificationStatus: "official-site-observed",
        },
      ],
      productSignals: ["Industrial pumps"],
      robotsUrl: "https://acme.example/robots.txt",
      robotsPolicy: "allowed",
      depth: 0,
      crawledAt: "2026-08-16T12:00:00.000Z",
    },
  };

  const [result] = enrichProspectCandidates([candidate], [website], ["industrial pumps", "distributors", "pet food"]);

  assert.equal(result?.companyName, "Acme Industrial Ltd");
  assert.equal(result?.description, "Industrial pumps for global distributors.");
  assert.deepEqual(result?.publicEmails, ["sales@acme.example"]);
  assert.deepEqual(result?.officialProfileUrls, ["https://www.linkedin.com/company/acme-industrial/"]);
  assert.deepEqual(result?.publicMessagingUrls, ["https://wa.me/15550100"]);
  assert.equal(result?.companyContactChannels?.some((item) => item.value === "sales@acme.example" && item.businessRole === "sales"), true);
  assert.equal(result?.companyContactChannels?.some((item) => item.value === "procurement@acme.example" && item.businessRole === "procurement"), true);
  assert.deepEqual(result?.productSignals, ["Industrial pumps"]);
  assert.ok((result?.score || 0) > candidate.score);
  assert.ok(result?.evidenceUrls.includes("https://acme.example/"));
  assert.equal(result?.fitScore, 67);
  assert.deepEqual(result?.fitTerms, ["industrial pumps", "distributors", "pet food"]);
  assert.deepEqual(result?.fitMatches, ["industrial pumps", "distributors"]);
  assert.equal(result?.websiteEvidenceStatus, "verified");
  assert.equal(result?.websiteVerifiedAt, "2026-08-16T12:00:00.000Z");
});

test("website resolver suggestions keep only domains with actual collected website evidence", () => {
  const verifiedCandidate: ProspectDiscoveryCandidate = {
    id: "prospect-verified",
    domain: "acme.example",
    websiteUrl: "https://acme.example/",
    companyName: "Acme",
    description: "Historical candidate",
    discoverySourceUrl: "",
    discoverySourceTitle: "Trade history",
    discoveryQuery: "Acme",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    productSignals: [],
    evidenceUrls: [],
    score: 65,
    reasons: ["historical trade evidence"],
    discoveredAt: "2026-08-17T00:00:00.000Z",
  };
  const unverifiedCandidate: ProspectDiscoveryCandidate = {
    ...verifiedCandidate,
    id: "prospect-unverified",
    domain: "missing.example",
    websiteUrl: "https://missing.example/",
    companyName: "Missing",
  };
  const website: RawItem = {
    source: "website",
    externalId: "acme-home",
    title: "Acme",
    body: "Acme public website",
    url: "https://acme.example/",
    author: "Acme",
    publishedAt: "2026-08-17T00:00:00.000Z",
    engagement: 0,
    query: "https://acme.example/",
    websiteContext: {
      schema: "bossai.business-website-context.v1",
      rootUrl: "https://acme.example/",
      pageUrl: "https://acme.example/",
      companyName: "Acme",
      description: "Verified public company website.",
      publicEmails: [],
      publicPhones: [],
      contactUrls: [],
      productSignals: [],
      robotsUrl: "https://acme.example/robots.txt",
      robotsPolicy: "allowed",
      depth: 0,
      crawledAt: "2026-08-17T00:00:00.000Z",
    },
  };

  const filtered = filterWebsiteVerifiedProspectCandidates([verifiedCandidate, unverifiedCandidate], [website]);
  assert.deepEqual(filtered.map((item) => item.domain), ["acme.example"]);
  const enriched = enrichProspectCandidates(filtered, [website]);
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0]?.domain, "acme.example");
  assert.equal(enriched[0]?.description, "Verified public company website.");
});

test("prospect query planning expands a company goal without starting collection or targeting people", () => {
  const plan = deterministicProspectQueryPlan("美国宠物用品 智能喂食器");
  assert.equal(plan.mode, "deterministic");
  assert.ok(plan.suggestions.length >= 6);
  assert.equal(plan.suggestions[0]?.query, "美国宠物用品 智能喂食器");
  assert.ok(plan.suggestions.some((item) => item.query.includes("批发商")));
  assert.ok(plan.suggestions.some((item) => item.query.includes("经销商")));
  assert.equal(plan.suggestions.some((item) => /个人邮箱|个人手机号|personal email|personal phone/iu.test(item.query)), false);
});

test("ICP fit remains absent when the owner has not configured target terms", () => {
  const candidate: ProspectDiscoveryCandidate = {
    id: "prospect-no-icp",
    domain: "no-icp.example",
    websiteUrl: "https://no-icp.example/",
    companyName: "No ICP Ltd",
    description: "Industrial automation distributor",
    discoverySourceUrl: "https://expo.example/",
    discoverySourceTitle: "Expo",
    discoveryQuery: "https://expo.example/",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    productSignals: [],
    evidenceUrls: ["https://expo.example/"],
    score: 50,
    reasons: [],
    discoveredAt: "2026-08-16T12:00:00.000Z",
  };
  const [result] = enrichProspectCandidates([candidate], [], []);
  assert.equal(result?.fitScore, undefined);
});
