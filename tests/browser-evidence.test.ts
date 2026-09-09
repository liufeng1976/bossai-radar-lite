import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyBrowserRenderedEvidence,
  browserEvidenceCaptureContract,
  ProspectBrowserEvidenceError,
} from "../src/browser-evidence.js";
import { RadarDatabase } from "../src/database.js";
import type { ProspectBrowserEvidenceRequest, ProspectCandidate } from "../src/types.js";

const REQUESTED_AT = "2026-08-18T04:00:00.000Z";
const CAPTURED_AT = "2026-08-18T04:01:00.000Z";
const NOW = Date.parse("2026-08-18T04:02:00.000Z");

function staticIncompleteProspect(): ProspectCandidate {
  return {
    id: "prospect-spa",
    domain: "spa.example",
    websiteUrl: "https://spa.example/",
    companyName: "SPA Example",
    description: "",
    discoverySourceUrl: "https://search.example/result",
    discoverySourceTitle: "Search result",
    discoveryQuery: "industrial automation",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [],
    productSignals: [],
    evidenceUrls: ["https://spa.example/"],
    websiteEvidenceStatus: "static-incomplete",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T03:55:00.000Z",
    score: 60,
    reasons: ["official website appears JavaScript-rendered; static crawl evidence may be incomplete"],
    discoveredAt: "2026-08-18T03:50:00.000Z",
    status: "DISCOVERED",
    firstSeenAt: "2026-08-18T03:50:00.000Z",
    lastSeenAt: "2026-08-18T03:55:00.000Z",
  };
}

function pendingRequest(): ProspectBrowserEvidenceRequest {
  return {
    schema: "bossai.prospect-browser-evidence-request.v1",
    id: "browser-evidence-request-1",
    prospectId: "prospect-spa",
    targetUrl: "https://spa.example/",
    status: "pending",
    requestedAt: REQUESTED_AT,
    updatedAt: REQUESTED_AT,
    submittedAt: "",
    sourceKind: "",
    sourceReference: "",
    pageUrl: "",
  };
}

test("browser-rendered evidence upgrades a static-incomplete prospect only after an owner request", () => {
  const html = `<!doctype html><html><head>
    <title>SPA Industrial Automation</title>
    <meta name="description" content="Industrial automation systems for distributors and manufacturers worldwide.">
  </head><body>
    <main>
      <h1>Industrial automation systems</h1>
      <p>We design warehouse robotics, machine vision and picking systems for industrial customers worldwide.</p>
      <a href="mailto:sales@spa.example">Sales</a>
      <a href="/contact">Contact sales</a>
      <a href="https://www.linkedin.com/company/spa-industrial/">LinkedIn company</a>
    </main>
  </body></html>`;

  const result = applyBrowserRenderedEvidence(staticIncompleteProspect(), pendingRequest(), {
    sourceKind: "owner-controlled-browser",
    sourceReference: "owner-browser-capture-001",
    pageUrl: "https://www.spa.example/",
    renderedHtml: html,
    capturedAt: CAPTURED_AT,
  }, NOW);

  assert.equal(result.requestStatus, "completed-upgraded");
  assert.equal(result.candidate.websiteEvidenceStatus, "verified");
  assert.equal(result.candidate.websiteEvidenceSource, "browser-rendered");
  assert.equal(result.candidate.websiteVerifiedAt, CAPTURED_AT);
  assert.equal(result.context.acquisitionMode, "browser-rendered");
  assert.equal(result.context.browserEvidenceRequestId, "browser-evidence-request-1");
  assert.equal(result.context.renderingHint, "browser-rendered-sufficient");
  assert.equal(result.context.publicEmails.includes("sales@spa.example"), true);
  assert.equal(result.candidate.reasons.some((reason) => reason.includes("JavaScript-rendered")), false);
  assert.equal(result.submission.renderedHtml, "");
});

test("sparse browser-rendered evidence remains static-incomplete", () => {
  const result = applyBrowserRenderedEvidence(staticIncompleteProspect(), pendingRequest(), {
    sourceKind: "owner-controlled-browser",
    sourceReference: "owner-browser-capture-002",
    pageUrl: "https://spa.example/",
    renderedHtml: "<!doctype html><html><head><title>SPA</title></head><body><div id='root'></div></body></html>",
    capturedAt: CAPTURED_AT,
  }, NOW);

  assert.equal(result.requestStatus, "completed-incomplete");
  assert.equal(result.candidate.websiteEvidenceStatus, "static-incomplete");
  assert.equal(result.context.renderingHint, "browser-rendered-incomplete");
  assert.equal(result.candidate.reasons.some((reason) => reason.includes("browser-rendered evidence remains incomplete")), true);
});

test("browser evidence rejects cross-host, pre-request and unsupported source submissions", () => {
  const base = {
    sourceKind: "owner-controlled-browser",
    sourceReference: "owner-browser-capture-003",
    pageUrl: "https://evil.example/",
    renderedHtml: "<!doctype html><html><body><p>Enough rendered content to pass the minimum payload bound.</p></body></html>",
    capturedAt: CAPTURED_AT,
  };
  assert.throws(
    () => applyBrowserRenderedEvidence(staticIncompleteProspect(), pendingRequest(), base, NOW),
    (error: unknown) => error instanceof ProspectBrowserEvidenceError && error.code === "PROSPECT_BROWSER_EVIDENCE_HOST_MISMATCH",
  );
  assert.throws(
    () => applyBrowserRenderedEvidence(staticIncompleteProspect(), pendingRequest(), { ...base, pageUrl: "https://spa.example/", capturedAt: "2026-08-18T03:00:00.000Z" }, NOW),
    (error: unknown) => error instanceof ProspectBrowserEvidenceError && error.code === "PROSPECT_BROWSER_EVIDENCE_CAPTURE_TIME_INVALID",
  );
  assert.throws(
    () => applyBrowserRenderedEvidence(staticIncompleteProspect(), pendingRequest(), { ...base, pageUrl: "https://spa.example/", sourceKind: "bossai-os-browser-read" }, NOW),
    (error: unknown) => error instanceof ProspectBrowserEvidenceError && error.code === "PROSPECT_BROWSER_EVIDENCE_SOURCE_INVALID",
  );
});

test("browser evidence queue is idempotent, persists extracted context only and exposes a bounded capture contract", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-browser-evidence-"));
  const db = new RadarDatabase(directory);
  try {
    const prospect = db.saveProspectCandidate(staticIncompleteProspect());
    const first = db.createProspectBrowserEvidenceRequest(prospect.id, prospect.websiteUrl, REQUESTED_AT);
    const repeated = db.createProspectBrowserEvidenceRequest(prospect.id, prospect.websiteUrl, "2026-08-18T04:00:30.000Z");
    assert.equal(first.id, repeated.id);
    assert.equal(first.status, "pending");

    const contract = browserEvidenceCaptureContract(first);
    assert.equal(contract.constraints.rawRenderedHtmlPersisted, false);
    assert.equal(contract.constraints.sameOfficialWebsiteHostOnly, true);
    assert.equal(contract.preferredCompanyTool.toolId, "browser.read");

    const applied = applyBrowserRenderedEvidence(prospect, first, {
      sourceKind: "owner-controlled-browser",
      sourceReference: "manual-capture",
      pageUrl: "https://spa.example/contact",
      renderedHtml: "<!doctype html><html><head><title>Contact SPA</title></head><body><h1>Contact sales</h1><p>Industrial automation sales and support.</p><a href='mailto:sales@spa.example'>sales@spa.example</a></body></html>",
      capturedAt: CAPTURED_AT,
    }, NOW);
    db.saveProspectCandidate(applied.candidate);
    const completed = db.completeProspectBrowserEvidenceRequest({
      id: first.id,
      status: applied.requestStatus,
      submittedAt: applied.submission.capturedAt,
      sourceKind: applied.submission.sourceKind,
      sourceReference: applied.submission.sourceReference,
      pageUrl: applied.submission.pageUrl,
      evidenceContext: applied.context,
    });

    assert.equal(completed?.status, "completed-upgraded");
    assert.equal(completed?.evidenceContext?.acquisitionMode, "browser-rendered");
    assert.equal(completed?.evidenceContext?.publicEmails.includes("sales@spa.example"), true);
    assert.equal(db.listProspectBrowserEvidenceRequests(10, "pending").length, 0);
    assert.equal(db.listProspectBrowserEvidenceRequests(10, "completed-upgraded")[0]?.id, first.id);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
