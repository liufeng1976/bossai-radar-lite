import { parseBusinessWebsitePage } from "./collectors.js";
import { enrichProspectCandidates } from "./prospects.js";
import type {
  BusinessWebsiteContext,
  ProspectBrowserEvidenceRequest,
  ProspectBrowserEvidenceRequestStatus,
  ProspectCandidate,
  ProspectBrowserEvidenceSourceKind,
} from "./types.js";

export const MAX_BROWSER_RENDERED_HTML_CHARS = 100_000;

export class ProspectBrowserEvidenceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "ProspectBrowserEvidenceError";
  }
}

export interface BrowserEvidenceSubmission {
  sourceKind: ProspectBrowserEvidenceSourceKind;
  sourceReference: string;
  pageUrl: string;
  renderedHtml: string;
  capturedAt: string;
}

export interface BrowserEvidenceApplicationResult {
  candidate: ProspectCandidate;
  context: BusinessWebsiteContext;
  requestStatus: Extract<ProspectBrowserEvidenceRequestStatus, "completed-upgraded" | "completed-incomplete">;
  submission: BrowserEvidenceSubmission;
}

export function browserEvidenceCaptureContract(request: ProspectBrowserEvidenceRequest) {
  return {
    schema: "bossai.prospect-browser-evidence-capture-contract.v1",
    requestId: request.id,
    targetUrl: request.targetUrl,
    allowedSourceKinds: ["owner-controlled-browser"],
    preferredCompanyTool: {
      toolId: "browser.read",
      currentlyRequired: false,
      note: "BossAI OS browser.read is preferred once executionAvailable=true; Radar does not create a Browser Runtime.",
    },
    constraints: {
      sameOfficialWebsiteHostOnly: true,
      httpOrHttpsOnly: true,
      noAuthenticationBypass: true,
      noCaptchaBypass: true,
      noFormSubmission: true,
      noCustomerOutreach: true,
      maxRenderedHtmlChars: MAX_BROWSER_RENDERED_HTML_CHARS,
      rawRenderedHtmlPersisted: false,
    },
  } as const;
}

export function applyBrowserRenderedEvidence(
  prospect: ProspectCandidate,
  request: ProspectBrowserEvidenceRequest,
  rawInput: unknown,
  now = Date.now(),
): BrowserEvidenceApplicationResult {
  if (request.prospectId !== prospect.id) {
    throw new ProspectBrowserEvidenceError("Browser evidence request does not belong to this prospect.", "PROSPECT_BROWSER_EVIDENCE_REQUEST_MISMATCH", 409);
  }
  if (request.status !== "pending") {
    throw new ProspectBrowserEvidenceError("Browser evidence request is no longer pending.", "PROSPECT_BROWSER_EVIDENCE_REQUEST_CLOSED", 409);
  }
  if ((prospect.websiteEvidenceStatus ?? "unverified") !== "static-incomplete") {
    throw new ProspectBrowserEvidenceError("Browser-rendered evidence is accepted only for static-incomplete prospects.", "PROSPECT_BROWSER_EVIDENCE_NOT_REQUIRED", 409);
  }
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new ProspectBrowserEvidenceError("Browser evidence payload must be an object.", "PROSPECT_BROWSER_EVIDENCE_INVALID");
  }

  const value = rawInput as Record<string, unknown>;
  if (value.sourceKind !== "owner-controlled-browser") {
    throw new ProspectBrowserEvidenceError("Unsupported browser evidence source.", "PROSPECT_BROWSER_EVIDENCE_SOURCE_INVALID");
  }
  const sourceReference = boundedText(value.sourceReference, 240);
  const pageUrl = parseOfficialPageUrl(value.pageUrl, prospect.websiteUrl);
  const renderedHtml = typeof value.renderedHtml === "string" ? value.renderedHtml : "";
  if (renderedHtml.length < 20 || renderedHtml.length > MAX_BROWSER_RENDERED_HTML_CHARS) {
    throw new ProspectBrowserEvidenceError(
      `renderedHtml must contain 20 to ${MAX_BROWSER_RENDERED_HTML_CHARS} characters.`,
      "PROSPECT_BROWSER_EVIDENCE_HTML_INVALID",
      413,
    );
  }
  const capturedAt = parseCapturedAt(value.capturedAt, request.requestedAt, now);
  const rootUrl = new URL(prospect.websiteUrl);
  const parsed = parseBusinessWebsitePage(
    renderedHtml,
    pageUrl,
    rootUrl,
    0,
    capturedAt,
    new URL("/robots.txt", rootUrl.origin).href,
    "allowed",
    { mode: "browser-rendered", browserEvidenceRequestId: request.id },
  );
  const context = parsed.item.websiteContext;
  if (!context) {
    throw new ProspectBrowserEvidenceError("Rendered page did not produce website evidence.", "PROSPECT_BROWSER_EVIDENCE_EMPTY", 409);
  }
  const candidate = enrichProspectCandidates([prospect], [parsed.item])[0] as ProspectCandidate | undefined;
  if (!candidate) {
    throw new ProspectBrowserEvidenceError("Rendered evidence could not be applied to the prospect.", "PROSPECT_BROWSER_EVIDENCE_APPLY_FAILED", 409);
  }
  candidate.websiteEvidenceSource = "browser-rendered";
  candidate.websiteVerifiedAt = capturedAt;
  candidate.discoveredAt = prospect.discoveredAt;

  return {
    candidate,
    context,
    requestStatus: candidate.websiteEvidenceStatus === "verified" ? "completed-upgraded" : "completed-incomplete",
    submission: {
      sourceKind: "owner-controlled-browser",
      sourceReference,
      pageUrl: pageUrl.href,
      renderedHtml: "",
      capturedAt,
    },
  };
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\r\n\u0000-\u001f]+/gu, " ").trim().slice(0, max) : "";
}

function parseOfficialPageUrl(value: unknown, officialWebsiteUrl: string): URL {
  if (typeof value !== "string" || value.length > 1_000) {
    throw new ProspectBrowserEvidenceError("pageUrl is required.", "PROSPECT_BROWSER_EVIDENCE_PAGE_URL_INVALID");
  }
  let pageUrl: URL;
  let official: URL;
  try {
    pageUrl = new URL(value);
    official = new URL(officialWebsiteUrl);
  } catch {
    throw new ProspectBrowserEvidenceError("pageUrl must be a valid absolute URL.", "PROSPECT_BROWSER_EVIDENCE_PAGE_URL_INVALID");
  }
  if (!/^https?:$/u.test(pageUrl.protocol) || pageUrl.username || pageUrl.password) {
    throw new ProspectBrowserEvidenceError("pageUrl must be an unauthenticated HTTP(S) URL.", "PROSPECT_BROWSER_EVIDENCE_PAGE_URL_INVALID");
  }
  if (normalizeHost(pageUrl.hostname) !== normalizeHost(official.hostname)) {
    throw new ProspectBrowserEvidenceError("Browser evidence must come from the verified official website host.", "PROSPECT_BROWSER_EVIDENCE_HOST_MISMATCH", 409);
  }
  pageUrl.hash = "";
  return pageUrl;
}

function parseCapturedAt(value: unknown, requestedAt: string, now: number): string {
  if (typeof value !== "string" || value.length > 64) {
    throw new ProspectBrowserEvidenceError("capturedAt is required.", "PROSPECT_BROWSER_EVIDENCE_CAPTURE_TIME_INVALID");
  }
  const capturedMs = Date.parse(value);
  const requestedMs = Date.parse(requestedAt);
  if (!Number.isFinite(capturedMs) || capturedMs > now + 5 * 60_000 || (Number.isFinite(requestedMs) && capturedMs < requestedMs - 60_000)) {
    throw new ProspectBrowserEvidenceError("capturedAt must represent a capture made after the owner request.", "PROSPECT_BROWSER_EVIDENCE_CAPTURE_TIME_INVALID");
  }
  return new Date(capturedMs).toISOString();
}

function normalizeHost(value: string): string {
  return value.toLowerCase().replace(/^www\./u, "").replace(/\.$/u, "");
}
