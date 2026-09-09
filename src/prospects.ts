import { config } from "./config.js";
import { mergeCompanyContactChannels } from "./contact-channels.js";
import type { ProspectDiscoveryCandidate, ProspectWebsiteEvidenceStatus, RawItem } from "./types.js";

export function filterWebsiteVerifiedProspectCandidates(
  candidates: readonly ProspectDiscoveryCandidate[],
  websiteItems: readonly RawItem[],
): ProspectDiscoveryCandidate[] {
  const verifiedDomains = new Set<string>();
  for (const item of websiteItems) {
    if (item.source !== "website" || !item.websiteContext) continue;
    const domain = hostname(item.websiteContext.rootUrl || item.url);
    if (domain) verifiedDomains.add(domain);
  }
  return candidates.filter((candidate) => verifiedDomains.has(candidate.domain));
}

export function enrichProspectCandidates(
  candidates: readonly ProspectDiscoveryCandidate[],
  websiteItems: readonly RawItem[],
  icpTerms: readonly string[] = config.radar.prospectIcpTerms,
): ProspectDiscoveryCandidate[] {
  const websiteByDomain = new Map<string, RawItem[]>();
  for (const item of websiteItems) {
    if (item.source !== "website" || !item.websiteContext) continue;
    const domain = hostname(item.websiteContext.rootUrl || item.url);
    if (!domain) continue;
    const entries = websiteByDomain.get(domain) ?? [];
    entries.push(item);
    websiteByDomain.set(domain, entries);
  }

  return candidates.map((candidate) => {
    const pages = websiteByDomain.get(candidate.domain) ?? [];
    if (pages.length === 0) return candidate;
    const contexts = pages.map((item) => item.websiteContext).filter((item) => item !== undefined);
    const homepage = contexts.find((item) => normalizeUrl(item?.pageUrl || "") === normalizeUrl(candidate.websiteUrl)) ?? contexts[0];
    const emails = unique(contexts.flatMap((item) => item?.publicEmails ?? []), 20);
    const phones = unique(contexts.flatMap((item) => item?.publicPhones ?? []), 20);
    const contacts = unique(contexts.flatMap((item) => item?.contactUrls ?? []), 20);
    const officialProfiles = unique(contexts.flatMap((item) => item?.officialProfileUrls ?? []), 20);
    const messagingUrls = unique(contexts.flatMap((item) => item?.publicMessagingUrls ?? []), 20);
    const companyContactChannels = mergeCompanyContactChannels(contexts.flatMap((item) => item?.companyContactChannels ?? []), 40);
    const products = unique(contexts.flatMap((item) => item?.productSignals ?? []), 30);
    const evidenceUrls = unique([
      ...candidate.evidenceUrls,
      ...pages.map((item) => item.url),
    ], 30);
    const reasons = candidate.reasons.filter((item) =>
      !item.includes("JavaScript-rendered; static crawl evidence may be incomplete")
      && !item.includes("browser-rendered evidence remains incomplete"));
    let score = candidate.score;

    if (homepage?.description) {
      score += 8;
      reasons.push("official website exposes a public company description");
    }
    if (products.length > 0) {
      score += Math.min(15, 5 + products.length * 2);
      reasons.push("official website exposes product or service signals");
    }
    if (contacts.length > 0) {
      score += 7;
      reasons.push("official website exposes a public contact path");
    }
    if (emails.length > 0 || phones.length > 0) {
      score += 12;
      reasons.push("official website exposes public business contact details");
    }
    if (officialProfiles.length > 0) {
      score += 5;
      reasons.push("official website links to public external profile pages");
    }
    if (messagingUrls.length > 0) {
      score += 3;
      reasons.push("official website exposes a public business messaging channel");
    }
    if (contexts.some((item) => item?.renderingHint === "javascript-likely")) {
      reasons.push("official website appears JavaScript-rendered; static crawl evidence may be incomplete");
    }
    if (contexts.some((item) => item?.renderingHint === "browser-rendered-incomplete")) {
      reasons.push("browser-rendered evidence remains incomplete; keep the prospect blocked pending alternate public evidence");
    }

    const companyName = preferredCompanyName(
      contexts.map((item) => item?.companyName || ""),
      candidate.companyName,
      candidate.domain,
    );
    const description = homepage?.description || candidate.description;
    const staticEvidenceIncomplete = contexts.some((item) =>
      item?.renderingHint === "javascript-likely" || item?.renderingHint === "browser-rendered-incomplete");
    const websiteEvidenceStatus: ProspectWebsiteEvidenceStatus = staticEvidenceIncomplete ? "static-incomplete" : "verified";
    const websiteEvidenceSource = contexts.some((item) => item?.acquisitionMode === "browser-rendered")
      ? "browser-rendered" as const
      : "static-http" as const;
    const websiteVerifiedAt = contexts
      .map((item) => item?.crawledAt || "")
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] || candidate.websiteVerifiedAt || "";
    const fit = scoreProspectIcpFit({ ...candidate, companyName, description, productSignals: products }, icpTerms);
    return {
      ...candidate,
      companyName,
      description,
      publicEmails: emails,
      publicPhones: phones,
      contactUrls: contacts,
      officialProfileUrls: officialProfiles,
      publicMessagingUrls: messagingUrls,
      companyContactChannels,
      productSignals: products,
      evidenceUrls,
      websiteEvidenceStatus,
      websiteEvidenceSource,
      websiteVerifiedAt,
      score: Math.min(100, score),
      reasons: unique(reasons, 20),
      fitScore: fit.fitScore,
      fitTerms: fit.fitTerms,
      fitMatches: fit.fitMatches,
    };
  }).sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
}

export function scoreProspectIcpFit(
  candidate: Pick<ProspectDiscoveryCandidate, "companyName" | "description" | "productSignals">,
  terms: readonly string[],
): { fitScore: number | null; fitTerms: string[]; fitMatches: string[] } {
  const fitTerms = unique(terms.map((item) => String(item || "").trim()).filter((item) => item.length >= 2), 20);
  if (fitTerms.length === 0) return { fitScore: null, fitTerms: [], fitMatches: [] };
  const haystack = normalizeFitText([
    candidate.companyName,
    candidate.description,
    ...(candidate.productSignals ?? []),
  ].join(" "));
  const fitMatches = fitTerms.filter((term) => haystack.includes(normalizeFitText(term)));
  return {
    fitScore: Math.round((fitMatches.length / fitTerms.length) * 100),
    fitTerms,
    fitMatches,
  };
}

function normalizeFitText(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function preferredCompanyName(values: string[], fallback: string, domain: string): string {
  const normalizedDomain = domain.replace(/^www\./i, "").toLowerCase();
  const candidates = values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value.toLowerCase().replace(/^www\./i, "") !== normalizedDomain)
    .sort((a, b) => b.length - a.length);
  return candidates[0] || fallback || domain;
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./i, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

function unique(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= max) break;
  }
  return result;
}
