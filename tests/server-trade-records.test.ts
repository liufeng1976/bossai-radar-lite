import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ADMIN_KEY = "trade-record-admin-key-1234567890";

test("imports authorized CSV trade evidence through the real HTTP entry without leaking personal columns or creating prospects", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-trade-http-"));
  const port = await findFreePort();
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "0.0.0.0",
      DATA_DIR: dataDir,
      RADAR_AUTO_SCAN: "false",
      RADAR_RUN_ON_STARTUP: "false",
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

  const noKey = await fetch(`${baseUrl}/api/admin/trade-records`);
  assert.equal(noKey.status, 401);

  const csv = [
    "Buyer,Country,Product,HS Code,Date,Website,Contact Email",
    "Acme Wholesale,US,Smart feeder,851679,2026-08-01,acme.example,private-buyer@example.com",
    "Acme Wholesale,US,Feeder camera,851679,2026-07-01,acme.example,older-private@example.com",
    "No Web Importer,US,Pet feeder,851679,2026-08-02,,personal-contact@example.com",
  ].join("\n");

  const previewed = await fetch(`${baseUrl}/api/admin/trade-records/preview`, {
    method: "POST",
    headers: {
      "x-radar-key": ADMIN_KEY,
      "x-trade-source-label": "authorized-customer-export.csv",
      "Content-Type": "text/csv",
    },
    body: csv,
  });
  const previewText = await previewed.text();
  assert.equal(previewed.status, 200, previewText);
  const previewPayload = JSON.parse(previewText) as {
    recordCount: number;
    rejectedRows: number;
    mapping: Record<string, string>;
    missingFields: string[];
    ignoredHeaders: string[];
    preview: unknown[];
    persisted: boolean;
    prospectsCreated: number;
    crmRecordsCreated: number;
  };
  assert.equal(previewPayload.recordCount, 3);
  assert.equal(previewPayload.rejectedRows, 0);
  assert.equal(previewPayload.mapping.companyName, "Buyer");
  assert.equal(previewPayload.mapping.websiteUrl, "Website");
  assert.ok(previewPayload.missingFields.includes("amount"));
  assert.ok(previewPayload.missingFields.includes("currency"));
  assert.ok(previewPayload.missingFields.includes("quantity"));
  assert.deepEqual(previewPayload.ignoredHeaders, ["Contact Email"]);
  assert.equal(previewPayload.persisted, false);
  assert.equal(previewPayload.prospectsCreated, 0);
  assert.equal(previewPayload.crmRecordsCreated, 0);
  assert.equal(JSON.stringify(previewPayload.preview).includes("private-buyer@example.com"), false);

  const afterPreview = await fetch(`${baseUrl}/api/admin/trade-records?limit=10`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const afterPreviewPayload = await afterPreview.json() as { stats: { total: number }; items: unknown[] };
  assert.equal(afterPreview.status, 200);
  assert.equal(afterPreviewPayload.stats.total, 0);
  assert.equal(afterPreviewPayload.items.length, 0);

  const imported = await fetch(`${baseUrl}/api/admin/trade-records/import`, {
    method: "POST",
    headers: {
      "x-radar-key": ADMIN_KEY,
      "x-trade-source-label": "authorized-customer-export.csv",
      "Content-Type": "text/csv",
    },
    body: csv,
  });
  const importedText = await imported.text();
  assert.equal(imported.status, 200, importedText);
  const payload = JSON.parse(importedText) as {
    importedCount: number;
    duplicateCount: number;
    prospectsCreated: number;
    crmRecordsCreated: number;
    externalActionsExecuted: boolean;
    stats: { total: number; companies: number; withWebsite: number; unresolvedCompanies: number };
    preview: unknown[];
  };
  assert.equal(payload.importedCount, 3);
  assert.equal(payload.duplicateCount, 0);
  assert.equal(payload.prospectsCreated, 0);
  assert.equal(payload.crmRecordsCreated, 0);
  assert.equal(payload.externalActionsExecuted, false);
  assert.deepEqual(payload.stats, { total: 3, companies: 2, withWebsite: 2, unresolvedCompanies: 1 });
  assert.equal(JSON.stringify(payload.preview).includes("private-buyer@example.com"), false);
  assert.equal(JSON.stringify(payload.preview).includes("personal-contact@example.com"), false);

  const repeated = await fetch(`${baseUrl}/api/admin/trade-records/import`, {
    method: "POST",
    headers: {
      "x-radar-key": ADMIN_KEY,
      "x-trade-source-label": "authorized-customer-export.csv",
      "Content-Type": "text/csv",
    },
    body: csv,
  });
  const repeatedPayload = await repeated.json() as { importedCount: number; duplicateCount: number };
  assert.equal(repeated.status, 200);
  assert.equal(repeatedPayload.importedCount, 0);
  assert.equal(repeatedPayload.duplicateCount, 3);

  const listed = await fetch(`${baseUrl}/api/admin/trade-records?limit=10`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const listedPayload = await listed.json() as {
    stats: { total: number };
    companySummaries: Array<{
      companyName: string;
      historicalCadence: string;
      reviewPriority: string;
      websiteCount: number;
      reviewReasons: string[];
    }>;
    items: Array<{ id: string; companyName: string; sourceLabel: string; websiteUrl: string }>;
  };
  assert.equal(listed.status, 200);
  assert.equal(listedPayload.stats.total, 3);
  assert.ok(listedPayload.items.some((item) => item.companyName === "Acme Wholesale" && item.websiteUrl === "https://acme.example/"));
  assert.ok(listedPayload.items.every((item) => item.sourceLabel === "authorized-customer-export.csv"));
  const acmeCompanySummary = listedPayload.companySummaries.find((item) => item.companyName === "Acme Wholesale");
  assert.ok(acmeCompanySummary);
  assert.equal(acmeCompanySummary.historicalCadence, "single-gap");
  assert.equal(acmeCompanySummary.reviewPriority, "REVIEW_SOON");
  assert.equal(acmeCompanySummary.websiteCount, 1);
  assert.match(acmeCompanySummary.reviewReasons.join(" "), /not purchase intent/i);
  assert.equal(JSON.stringify(acmeCompanySummary).includes("purchaseProbability"), false);
  assert.equal(JSON.stringify(acmeCompanySummary).includes("nextPurchaseDate"), false);

  const filtered = await fetch(`${baseUrl}/api/admin/trade-records?limit=10&q=Smart&country=US&hs=851679&role=buyer&dateFrom=2026-08-01&dateTo=2026-08-01`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const filteredPayload = await filtered.json() as {
    resultCount: number;
    filters: Record<string, string>;
    items: Array<{ companyName: string; productDescription: string }>;
  };
  assert.equal(filtered.status, 200);
  assert.equal(filteredPayload.resultCount, 1);
  assert.deepEqual(filteredPayload.filters, {
    query: "Smart",
    country: "US",
    hsCode: "851679",
    role: "buyer",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-01",
  });
  assert.equal(filteredPayload.items[0]?.companyName, "Acme Wholesale");
  assert.equal(filteredPayload.items[0]?.productDescription, "Smart feeder");

  const noMatches = await fetch(`${baseUrl}/api/admin/trade-records?q=nonexistent-company`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const noMatchesPayload = await noMatches.json() as { resultCount: number; items: unknown[] };
  assert.equal(noMatches.status, 200);
  assert.equal(noMatchesPayload.resultCount, 0);
  assert.equal(noMatchesPayload.items.length, 0);

  const noWebsiteRecord = listedPayload.items.find((item) => item.companyName === "No Web Importer");
  assert.ok(noWebsiteRecord);

  const resolverDisabled = await fetch(`${baseUrl}/api/admin/trade-records/${noWebsiteRecord.id}/resolve-website`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const resolverDisabledPayload = await resolverDisabled.json() as { code: string; prospectsCreated: number };
  assert.equal(resolverDisabled.status, 503);
  assert.equal(resolverDisabledPayload.code, "TRADE_RECORD_WEBSITE_RESOLVER_NOT_CONFIGURED");
  assert.equal(resolverDisabledPayload.prospectsCreated, 0);

  const noWebsitePromotion = await fetch(`${baseUrl}/api/admin/trade-records/${noWebsiteRecord.id}/prospect`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const noWebsitePromotionPayload = await noWebsitePromotion.json() as { code: string };
  assert.equal(noWebsitePromotion.status, 409);
  assert.equal(noWebsitePromotionPayload.code, "TRADE_RECORD_WEBSITE_REQUIRED");

  const privateWebsitePromotion = await fetch(`${baseUrl}/api/admin/trade-records/${noWebsiteRecord.id}/prospect`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ websiteUrl: "http://127.0.0.1/private-company" }),
  });
  const privateWebsitePayload = await privateWebsitePromotion.json() as { code: string };
  assert.equal(privateWebsitePromotion.status, 409);
  assert.equal(privateWebsitePayload.code, "TRADE_RECORD_WEBSITE_VERIFICATION_FAILED");

  const noWebsiteCompanyPromotion = await fetch(`${baseUrl}/api/admin/trade-companies/prospect`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "No Web Importer", country: "US" }),
  });
  const noWebsiteCompanyPayload = await noWebsiteCompanyPromotion.json() as { code: string };
  assert.equal(noWebsiteCompanyPromotion.status, 409);
  assert.equal(noWebsiteCompanyPayload.code, "TRADE_COMPANY_WEBSITE_REQUIRED");

  const noWebsiteCompanyResolve = await fetch(`${baseUrl}/api/admin/trade-companies/resolve-website`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "No Web Importer", country: "US" }),
  });
  const noWebsiteCompanyResolvePayload = await noWebsiteCompanyResolve.json() as { code: string };
  assert.equal(noWebsiteCompanyResolve.status, 503);
  assert.equal(noWebsiteCompanyResolvePayload.code, "TRADE_COMPANY_WEBSITE_RESOLVER_NOT_CONFIGURED");

  const crossCountryCsv = [
    "Buyer,Country,Product,Date,Website",
    "Shared Name,US,Smart feeder,2026-08-01,shared-us.example",
    "Shared Name,CA,Pet feeder,2026-08-02,shared-ca.example",
  ].join("\n");
  const crossCountryImport = await fetch(`${baseUrl}/api/admin/trade-records/import`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "x-trade-source-label": "cross-country.csv", "Content-Type": "text/csv" },
    body: crossCountryCsv,
  });
  assert.equal(crossCountryImport.status, 200);
  const crossCountryPromotion = await fetch(`${baseUrl}/api/admin/trade-companies/prospect`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "Shared Name" }),
  });
  const crossCountryPayload = await crossCountryPromotion.json() as { code: string; countries: string[] };
  assert.equal(crossCountryPromotion.status, 409);
  assert.equal(crossCountryPayload.code, "TRADE_COMPANY_COUNTRY_REQUIRED");
  assert.deepEqual(new Set(crossCountryPayload.countries), new Set(["US", "CA"]));
  const crossCountryResolve = await fetch(`${baseUrl}/api/admin/trade-companies/resolve-website`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "Shared Name" }),
  });
  const crossCountryResolvePayload = await crossCountryResolve.json() as { code: string };
  assert.equal(crossCountryResolve.status, 409);
  assert.equal(crossCountryResolvePayload.code, "TRADE_COMPANY_COUNTRY_REQUIRED");

  const multiWebsiteCsv = [
    "Buyer,Country,Product,Date,Website",
    "Website Conflict Co,US,Smart feeder,2026-08-01,one-conflict.example",
    "Website Conflict Co,US,Pet feeder,2026-08-02,two-conflict.example",
  ].join("\n");
  const multiWebsiteImport = await fetch(`${baseUrl}/api/admin/trade-records/import`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "x-trade-source-label": "multi-website.csv", "Content-Type": "text/csv" },
    body: multiWebsiteCsv,
  });
  assert.equal(multiWebsiteImport.status, 200);
  const multiWebsitePromotion = await fetch(`${baseUrl}/api/admin/trade-companies/prospect`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "Website Conflict Co", country: "US" }),
  });
  const multiWebsitePayload = await multiWebsitePromotion.json() as { code: string; websiteOptions: string[] };
  assert.equal(multiWebsitePromotion.status, 409);
  assert.equal(multiWebsitePayload.code, "TRADE_COMPANY_WEBSITE_SELECTION_REQUIRED");
  assert.equal(multiWebsitePayload.websiteOptions.length, 2);

  const prospects = await fetch(`${baseUrl}/api/prospects?limit=10`);
  const prospectsPayload = await prospects.json() as { items: unknown[] };
  assert.equal(prospects.status, 200);
  assert.equal(prospectsPayload.items.length, 0);

  const invalid = await fetch(`${baseUrl}/api/admin/trade-records/import`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "text/csv" },
    body: "SKU,Product\nA1,Smart feeder",
  });
  const invalidPayload = await invalid.json() as { code: string };
  assert.equal(invalid.status, 400);
  assert.equal(invalidPayload.code, "TRADE_RECORD_IMPORT_COMPANY_COLUMN_REQUIRED");
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
