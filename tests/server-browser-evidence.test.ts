import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";

const ADMIN_KEY = "browser-evidence-admin-key-1234567890";

test("owner-requested browser evidence upgrades only same-host static-incomplete prospects through the real HTTP entry", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-browser-http-"));
  const port = await findFreePort();
  const db = new RadarDatabase(dataDir);
  const prospect = db.saveProspectCandidate({
    id: "prospect-browser-http",
    domain: "browser-http.example",
    websiteUrl: "https://browser-http.example/",
    companyName: "Browser HTTP Co",
    description: "",
    discoverySourceUrl: "https://search.example/result",
    discoverySourceTitle: "Search result",
    discoveryQuery: "industrial supplier",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [],
    productSignals: [],
    evidenceUrls: ["https://browser-http.example/"],
    websiteEvidenceStatus: "static-incomplete",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T03:00:00.000Z",
    score: 61,
    reasons: ["official website appears JavaScript-rendered; static crawl evidence may be incomplete"],
    discoveredAt: "2026-08-18T03:00:00.000Z",
  });
  const unverified = db.saveProspectCandidate({
    id: "prospect-browser-unverified",
    domain: "browser-unverified.example",
    websiteUrl: "https://browser-unverified.example/",
    companyName: "Browser Unverified Co",
    description: "search snippet",
    discoverySourceUrl: "https://search.example/unverified",
    discoverySourceTitle: "Search result",
    discoveryQuery: "industrial supplier",
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [],
    productSignals: [],
    evidenceUrls: ["https://search.example/unverified"],
    websiteEvidenceStatus: "unverified",
    score: 45,
    reasons: ["search discovery only"],
    discoveredAt: "2026-08-18T03:00:00.000Z",
  });
  db.close();

  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "0.0.0.0",
      DATA_DIR: dataDir,
      RADAR_AUTO_SCAN: "false",
      RADAR_RUN_ON_STARTUP: "false",
      RADAR_DEMO_ENABLED: "false",
      RADAR_ADMIN_API_KEY: ADMIN_KEY,
      COMMERCIAL_LEAD_ADMIN_ENABLED: "true",
      AI_PROVIDER: "deterministic",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { output += chunk.toString(); });
  context.after(async () => {
    await stopChild(child);
    rmSync(dataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, child, () => output);
  const headers = { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" };

  const protectedQueue = await fetch(`${baseUrl}/api/admin/prospects/browser-evidence`);
  assert.equal(protectedQueue.status, 401);

  const directSalesBypass = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/owner-decision`, {
    method: "POST",
    headers,
    body: JSON.stringify({ decision: "approve-sales", reasonCode: "evidence-sufficient", note: "Owner review attempt." }),
  });
  const directSalesBypassBody = await directSalesBypass.json() as { code: string; websiteEvidenceStatus: string };
  assert.equal(directSalesBypass.status, 409);
  assert.equal(directSalesBypassBody.code, "PROSPECT_BROWSER_EVIDENCE_REQUIRED");
  assert.equal(directSalesBypassBody.websiteEvidenceStatus, "static-incomplete");

  const unverifiedRequest = await fetch(`${baseUrl}/api/admin/prospects/${unverified.id}/browser-evidence/request`, {
    method: "POST",
    headers,
    body: "{}",
  });
  const unverifiedBody = await unverifiedRequest.json() as { code: string };
  assert.equal(unverifiedRequest.status, 409);
  assert.equal(unverifiedBody.code, "PROSPECT_WEBSITE_EVIDENCE_REQUIRED");

  const requested = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/browser-evidence/request`, {
    method: "POST",
    headers,
    body: "{}",
  });
  const requestedText = await requested.text();
  assert.equal(requested.status, 202, requestedText);
  const requestedBody = JSON.parse(requestedText) as {
    request: { id: string; status: string; targetUrl: string };
    captureContract: {
      preferredCompanyTool: { toolId: string };
      constraints: { sameOfficialWebsiteHostOnly: boolean; rawRenderedHtmlPersisted: boolean; maxRenderedHtmlChars: number };
    };
    browserExecutionStarted: boolean;
    browserRuntimeOwnedByRadar: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(requestedBody.request.status, "pending");
  assert.equal(requestedBody.request.targetUrl, "https://browser-http.example/");
  assert.equal(requestedBody.captureContract.preferredCompanyTool.toolId, "browser.read");
  assert.equal(requestedBody.captureContract.constraints.sameOfficialWebsiteHostOnly, true);
  assert.equal(requestedBody.captureContract.constraints.rawRenderedHtmlPersisted, false);
  assert.ok(requestedBody.captureContract.constraints.maxRenderedHtmlChars <= 100_000);
  assert.equal(requestedBody.browserExecutionStarted, false);
  assert.equal(requestedBody.browserRuntimeOwnedByRadar, false);
  assert.equal(requestedBody.externalActionsExecuted, false);

  const repeated = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/browser-evidence/request`, {
    method: "POST",
    headers,
    body: "{}",
  });
  const repeatedBody = await repeated.json() as { request: { id: string } };
  assert.equal(repeated.status, 202);
  assert.equal(repeatedBody.request.id, requestedBody.request.id);

  const queue = await fetch(`${baseUrl}/api/admin/prospects/browser-evidence?status=pending`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const queueBody = await queue.json() as { items: Array<{ id: string }>; browserRuntimeOwnedByRadar: boolean; rawRenderedHtmlPersisted: boolean };
  assert.equal(queue.status, 200);
  assert.equal(queueBody.items.some((item) => item.id === requestedBody.request.id), true);
  assert.equal(queueBody.browserRuntimeOwnedByRadar, false);
  assert.equal(queueBody.rawRenderedHtmlPersisted, false);

  const crossHost = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/browser-evidence/${requestedBody.request.id}/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      sourceKind: "owner-controlled-browser",
      sourceReference: "cross-host-attempt",
      pageUrl: "https://evil.example/",
      renderedHtml: "<!doctype html><html><body><p>Rendered evidence from the wrong host must not be accepted by Radar.</p></body></html>",
      capturedAt: new Date().toISOString(),
    }),
  });
  const crossHostBody = await crossHost.json() as { code: string };
  assert.equal(crossHost.status, 409);
  assert.equal(crossHostBody.code, "PROSPECT_BROWSER_EVIDENCE_HOST_MISMATCH");

  const capturedAt = new Date().toISOString();
  const renderedHtml = `<!doctype html><html><head>
    <title>Browser HTTP Industrial</title>
    <meta name="description" content="Industrial automation equipment for distributors, factories and system integrators worldwide.">
  </head><body>
    <h1>Industrial automation equipment</h1>
    <p>We supply robotics, picking equipment and machine-vision systems to industrial distributors and manufacturers.</p>
    <a href="mailto:sales@browser-http.example">Sales</a>
    <a href="/sales">Sales team</a>
    <a href="https://www.linkedin.com/company/browser-http-industrial/">LinkedIn company</a>
  </body></html>`;
  const submitted = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/browser-evidence/${requestedBody.request.id}/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      sourceKind: "owner-controlled-browser",
      sourceReference: "owner-browser-window-001",
      pageUrl: "https://www.browser-http.example/",
      renderedHtml,
      capturedAt,
    }),
  });
  const submittedText = await submitted.text();
  assert.equal(submitted.status, 200, submittedText);
  const submittedBody = JSON.parse(submittedText) as {
    prospect: {
      websiteEvidenceStatus: string;
      websiteEvidenceSource: string;
      publicEmails: string[];
      reasons: string[];
    };
    request: { status: string; evidenceContext?: { acquisitionMode?: string; browserEvidenceRequestId?: string } };
    upgraded: boolean;
    rawRenderedHtmlPersisted: boolean;
    browserRuntimeOwnedByRadar: boolean;
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(submittedBody.prospect.websiteEvidenceStatus, "verified");
  assert.equal(submittedBody.prospect.websiteEvidenceSource, "browser-rendered");
  assert.equal(submittedBody.prospect.publicEmails.includes("sales@browser-http.example"), true);
  assert.equal(submittedBody.prospect.reasons.some((reason) => reason.includes("JavaScript-rendered")), false);
  assert.equal(submittedBody.request.status, "completed-upgraded");
  assert.equal(submittedBody.request.evidenceContext?.acquisitionMode, "browser-rendered");
  assert.equal(submittedBody.request.evidenceContext?.browserEvidenceRequestId, requestedBody.request.id);
  assert.equal(submittedBody.upgraded, true);
  assert.equal(submittedBody.rawRenderedHtmlPersisted, false);
  assert.equal(submittedBody.browserRuntimeOwnedByRadar, false);
  assert.equal(submittedBody.crmRecordCreated, false);
  assert.equal(submittedBody.externalActionsExecuted, false);
  assert.equal(submittedText.includes(renderedHtml), false);

  const requestAfterUpgrade = await fetch(`${baseUrl}/api/admin/prospects/${prospect.id}/browser-evidence/request`, {
    method: "POST",
    headers,
    body: "{}",
  });
  const afterUpgradeBody = await requestAfterUpgrade.json() as { code: string };
  assert.equal(requestAfterUpgrade.status, 409);
  assert.equal(afterUpgradeBody.code, "PROSPECT_BROWSER_EVIDENCE_NOT_REQUIRED");

  const publicProspects = await fetch(`${baseUrl}/api/prospects?limit=10`);
  const publicBody = await publicProspects.json() as { items: Array<{ id: string; websiteEvidenceStatus: string; websiteEvidenceSource?: string }> };
  const publicProspect = publicBody.items.find((item) => item.id === prospect.id);
  assert.equal(publicProspect?.websiteEvidenceStatus, "verified");
  assert.equal(publicProspect?.websiteEvidenceSource, "browser-rendered");

  const leads = await fetch(`${baseUrl}/api/admin/leads`, { headers: { "x-radar-key": ADMIN_KEY } });
  const leadsBody = await leads.json() as { items: unknown[] };
  assert.equal(leadsBody.items.length, 0);
});

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a test port"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess, output: () => string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited before health check:\n${output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server:\n${output()}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
