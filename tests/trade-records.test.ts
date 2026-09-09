import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";
import { describeHistoricalTradeCadence, inferTradeRecordMapping, parseTradeRecordImport, tradeRecordsToProspectCandidate, tradeRecordToProspectCandidate } from "../src/trade-records.js";

test("trade record CSV import maps buyer, commodity, HS, value and website without personal fields", () => {
  const csv = [
    "Buyer,Buyer Country,Product Description,HS Code,Shipment Date,Quantity,Trade Value,Currency,Website,Contact Email",
    '"Acme Pet Distribution","United States","Smart feeder, automatic",851679,2026-08-01,120,24000,USD,acmepet.example,buyer-person@example.com',
  ].join("\n");
  const parsed = parseTradeRecordImport(csv, "customer-customs-export.csv", Date.parse("2026-08-16T12:00:00.000Z"));

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.rejectedRows, 0);
  const record = parsed.records[0];
  assert.ok(record);
  assert.equal(record.companyName, "Acme Pet Distribution");
  assert.equal(record.role, "buyer");
  assert.equal(record.country, "United States");
  assert.equal(record.productDescription, "Smart feeder, automatic");
  assert.equal(record.hsCode, "851679");
  assert.equal(record.tradeDate, "2026-08-01");
  assert.equal(record.quantity, "120");
  assert.equal(record.amount, 24000);
  assert.equal(record.currency, "USD");
  assert.equal(record.websiteUrl, "https://acmepet.example/");
  assert.equal("contactEmail" in record, false);
  assert.equal(JSON.stringify(record).includes("buyer-person@example.com"), false);
});

test("trade record TSV import accepts Chinese importer fields and keeps missing websites unresolved", () => {
  const tsv = [
    "进口商\t国家\t品名\t海关编码\t进口日期\t金额\t币种",
    "深圳示例贸易有限公司\t中国\t宠物智能喂食器\t851679\t2026/07/12\t¥120000\tCNY",
  ].join("\n");
  const parsed = parseTradeRecordImport(tsv, "海关数据-7月.tsv", Date.parse("2026-08-16T12:00:00.000Z"));
  const record = parsed.records[0];

  assert.ok(record);
  assert.equal(record.role, "importer");
  assert.equal(record.companyName, "深圳示例贸易有限公司");
  assert.equal(record.websiteUrl, "");
  assert.equal(record.amount, 120000);
  assert.ok(parsed.warnings.some((warning) => warning.includes("website/domain")));
});

test("trade record parser handles quoted newlines and rejects rows without a company", () => {
  const csv = [
    "Consignee,Goods Description,Date",
    '"Acme Imports","Smart feeder\nwith camera",2026-08-02',
    ',"Unknown company row",2026-08-03',
  ].join("\n");
  const parsed = parseTradeRecordImport(csv);

  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.rejectedRows, 1);
  assert.equal(parsed.records[0]?.productDescription, "Smart feeder with camera");
});

test("historical trade cadence remains descriptive and never predicts a next purchase", () => {
  const insufficient = describeHistoricalTradeCadence(["2026-08-01"], 1, "", Date.parse("2026-08-17T00:00:00.000Z"));
  assert.equal(insufficient.historicalCadence, "insufficient");
  assert.equal(insufficient.medianIntervalDays, null);
  assert.equal(insufficient.reviewPriority, "REVIEW_LATER");

  const regular = describeHistoricalTradeCadence(
    ["2026-01-01", "2026-02-01", "2026-03-03", "2026-04-03"],
    4,
    "https://acme.example/",
    Date.parse("2026-08-17T00:00:00.000Z"),
  );
  assert.equal(regular.firstTradeDate, "2026-01-01");
  assert.equal(regular.latestTradeDate, "2026-04-03");
  assert.equal(regular.uniqueTradeDateCount, 4);
  assert.equal(regular.medianIntervalDays, 31);
  assert.equal(regular.minIntervalDays, 30);
  assert.equal(regular.maxIntervalDays, 31);
  assert.equal(regular.historicalCadence, "regular");
  assert.equal(regular.reviewPriority, "REVIEW_FIRST");
  assert.match(regular.reviewReasons.join(" "), /not purchase intent/i);
  assert.equal("nextPurchaseDate" in regular, false);
  assert.equal("purchaseProbability" in regular, false);
  assert.equal("intentScore" in regular, false);

  const variable = describeHistoricalTradeCadence(
    ["2025-01-01", "2025-01-11", "2025-07-10", "2026-01-10"],
    4,
    "",
    Date.parse("2026-08-17T00:00:00.000Z"),
  );
  assert.equal(variable.historicalCadence, "variable");
  assert.equal(variable.reviewPriority, "REVIEW_SOON");
});

test("company-level trade promotion groups history without boosting prospect score or inventing intent", () => {
  const parsed = parseTradeRecordImport([
    "Buyer,Country,Product,HS Code,Date,Website",
    "Acme Wholesale,US,Smart feeder,851679,2026-06-01,acme.example",
    "Acme Wholesale,US,Feeder camera,842121,2026-07-01,acme.example",
    "Acme Wholesale,US,Pet feeder,851679,2026-08-01,acme.example",
  ].join("\n"), "authorized-history.csv", Date.parse("2026-08-16T12:00:00.000Z"));
  const candidate = tradeRecordsToProspectCandidate(parsed.records, "https://acme.example/", Date.parse("2026-08-17T00:00:00.000Z"));
  assert.equal(candidate.companyName, "Acme Wholesale");
  assert.equal(candidate.score, 65);
  assert.ok(candidate.productSignals.includes("Smart feeder"));
  assert.ok(candidate.productSignals.includes("Feeder camera"));
  assert.ok(candidate.productSignals.includes("HS 851679"));
  assert.match(candidate.discoverySourceTitle, /3 linked historical company records/);
  assert.match(candidate.reasons.join(" "), /do not increase the prospect score/i);
  assert.match(candidate.reasons.join(" "), /do not establish current buyer intent/i);
  assert.equal("reviewPriority" in candidate, false);
  assert.equal("nextPurchaseDate" in candidate, false);
  assert.equal("purchaseProbability" in candidate, false);
  assert.throws(
    () => tradeRecordsToProspectCandidate([parsed.records[0]!, { ...parsed.records[1]!, companyName: "Other Buyer" }], "https://acme.example/"),
    /TRADE_COMPANY_RECORDS_MIXED/,
  );
});

test("trade record to prospect conversion preserves historical-trade truth boundaries", () => {
  const parsed = parseTradeRecordImport([
    "Buyer,Country,Product,HS Code,Date,Website",
    "Acme Wholesale,US,Smart feeder,851679,2026-08-01,https://www.acme.example/products",
  ].join("\n"), "authorized-export.csv", Date.parse("2026-08-16T12:00:00.000Z"));
  const record = parsed.records[0];
  assert.ok(record);
  const candidate = tradeRecordToProspectCandidate(record, Date.parse("2026-08-16T13:00:00.000Z"));

  assert.equal(candidate.domain, "acme.example");
  assert.equal(candidate.websiteUrl, "https://www.acme.example/");
  assert.equal(candidate.companyName, "Acme Wholesale");
  assert.ok(candidate.productSignals.includes("Smart feeder"));
  assert.ok(candidate.productSignals.includes("HS 851679"));
  assert.match(candidate.reasons.join(" "), /historical transaction evidence/);
  assert.match(candidate.reasons.join(" "), /does not imply current purchase intent/);
  assert.equal(candidate.publicEmails.length, 0);
  assert.equal(candidate.contactUrls.length, 0);
});

test("trade record without a website cannot be converted into a prospect by guessing a domain", () => {
  const parsed = parseTradeRecordImport("Importer,Product\nAcme Imports,Smart feeder");
  const record = parsed.records[0];
  assert.ok(record);
  assert.throws(() => tradeRecordToProspectCandidate(record), /TRADE_RECORD_WEBSITE_REQUIRED/);
});

test("trade record mapping requires a recognizable company role column", () => {
  assert.deepEqual(inferTradeRecordMapping(["SKU", "Product", "Date"]), {
    productDescription: "Product",
    tradeDate: "Date",
  });
  assert.throws(
    () => parseTradeRecordImport("SKU,Product,Date\nA1,Smart feeder,2026-08-01"),
    /TRADE_RECORD_IMPORT_COMPANY_COLUMN_REQUIRED/,
  );
});

test("private prospect-trade relation keeps trade details out of the public prospect model", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-prospect-trade-link-"));
  const db = new RadarDatabase(directory);
  try {
    const parsed = parseTradeRecordImport([
      "Buyer,Country,Product,HS Code,Date,Quantity,Amount,Currency,Website",
      "Acme Wholesale,US,Smart feeder,851679,2026-08-01,120,24000,USD,acme.example",
    ].join("\n"), "authorized-customs.csv", Date.parse("2026-08-16T12:00:00.000Z"));
    const record = parsed.records[0];
    assert.ok(record);
    db.saveTradeRecords(parsed.records);
    const prospect = db.saveProspectCandidate(tradeRecordToProspectCandidate(record, Date.parse("2026-08-16T13:00:00.000Z")));
    db.linkProspectTradeEvidence(prospect.id, record.id, "2026-08-16T13:01:00.000Z");

    const publicProspect = db.getProspectCandidate(prospect.id);
    assert.ok(publicProspect);
    assert.equal("historicalTradeEvidence" in publicProspect, false);
    assert.equal("amount" in publicProspect, false);
    assert.equal(JSON.stringify(publicProspect).includes("24000"), false);

    const internalTrade = db.listTradeRecordsForProspect(prospect.id, 10);
    assert.equal(internalTrade.length, 1);
    assert.equal(internalTrade[0]?.id, record.id);
    assert.equal(internalTrade[0]?.amount, 24000);
    assert.equal(internalTrade[0]?.currency, "USD");

    db.linkProspectTradeEvidence(prospect.id, record.id, "2026-08-16T13:02:00.000Z");
    assert.equal(db.listTradeRecordsForProspect(prospect.id, 10).length, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("trade company summaries aggregate historical facts without producing an intent score", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-trade-company-summary-"));
  const db = new RadarDatabase(directory);
  try {
    const parsed = parseTradeRecordImport([
      "Buyer,Country,Product,HS Code,Date,Amount,Currency,Website",
      "Acme Wholesale,US,Smart feeder,851679,2026-08-01,24000,USD,acme.example",
      "Acme Wholesale,US,Feeder camera,842121,2026-08-03,12000,USD,acme.example",
      "Priority Buyer,US,Smart feeder,851679,2026-05-30,10000,USD,priority.example",
      "Priority Buyer,US,Smart feeder,851679,2026-06-29,11000,USD,priority.example",
      "Priority Buyer,US,Smart feeder,851679,2026-07-30,12000,USD,priority.example",
      "Other Buyer,CA,Pet bowl,392410,2026-07-15,5000,CAD,other.example",
    ].join("\n"), "authorized-history.csv", Date.parse("2026-08-16T12:00:00.000Z"));
    db.saveTradeRecords(parsed.records);

    const summaries = db.summarizeTradeCompanies(10, {}, Date.parse("2026-08-17T00:00:00.000Z"));
    assert.equal(summaries[0]?.companyName, "Priority Buyer");
    assert.equal(summaries[0]?.reviewPriority, "REVIEW_FIRST");
    assert.equal(summaries[0]?.historicalCadence, "regular");
    assert.equal("intentScore" in (summaries[0] || {}), false);
    assert.equal("purchaseProbability" in (summaries[0] || {}), false);
    const acme = summaries.find((item) => item.companyName === "Acme Wholesale");
    assert.ok(acme);
    assert.equal(acme.recordCount, 2);
    assert.equal(acme.firstTradeDate, "2026-08-01");
    assert.equal(acme.latestTradeDate, "2026-08-03");
    assert.equal(acme.datedRecordCount, 2);
    assert.equal(acme.uniqueTradeDateCount, 2);
    assert.equal(acme.medianIntervalDays, 2);
    assert.equal(acme.minIntervalDays, 2);
    assert.equal(acme.maxIntervalDays, 2);
    assert.equal(acme.daysSinceLatestTrade, 14);
    assert.equal(acme.historicalCadence, "single-gap");
    assert.equal(acme.reviewPriority, "REVIEW_SOON");
    assert.match(acme.reviewReasons.join(" "), /not purchase intent/i);
    assert.equal(acme.websiteUrl, "https://acme.example/");
    assert.equal(acme.websiteCount, 1);
    assert.deepEqual(acme.countries, ["US"]);
    assert.deepEqual(acme.roles, ["buyer"]);
    assert.deepEqual(new Set(acme.hsCodes), new Set(["851679", "842121"]));
    assert.equal(acme.productCount, 2);
    assert.deepEqual(acme.amountByCurrency, { USD: 36000 });
    assert.equal("intentScore" in acme, false);
    assert.equal("purchaseProbability" in acme, false);
    assert.equal("nextPurchaseDate" in acme, false);

    const cameraOnly = db.summarizeTradeCompanies(10, { query: "camera", dateFrom: "2026-08-03" }, Date.parse("2026-08-17T00:00:00.000Z"));
    assert.equal(cameraOnly.length, 1);
    assert.equal(cameraOnly[0]?.companyName, "Acme Wholesale");
    assert.equal(cameraOnly[0]?.recordCount, 1);
    assert.equal(cameraOnly[0]?.historicalCadence, "insufficient");
    assert.equal(cameraOnly[0]?.reviewPriority, "REVIEW_LATER");
    assert.deepEqual(cameraOnly[0]?.amountByCurrency, { USD: 12000 });

    const ambiguous = parseTradeRecordImport([
      "Buyer,Country,Product,Date,Website",
      "Ambiguous Co,US,Smart feeder,2026-08-01,one.example",
      "Ambiguous Co,US,Smart feeder,2026-08-02,two.example",
    ].join("\n"), "ambiguous-websites.csv", Date.parse("2026-08-16T12:00:00.000Z"));
    db.saveTradeRecords(ambiguous.records);
    const ambiguousSummary = db.summarizeTradeCompanies(20, { query: "Ambiguous Co" }, Date.parse("2026-08-17T00:00:00.000Z"))[0];
    assert.ok(ambiguousSummary);
    assert.equal(ambiguousSummary.websiteCount, 2);
    assert.equal(ambiguousSummary.websiteUrl, "");

    const crossCountry = parseTradeRecordImport([
      "Buyer,Country,Product,Date,Amount,Currency,Website",
      "Shared Name,US,Smart feeder,2026-07-01,10000,USD,shared-us.example",
      "Shared Name,US,Smart feeder,2026-08-01,12000,USD,shared-us.example",
      "Shared Name,CA,Pet feeder,2026-07-15,5000,CAD,shared-ca.example",
    ].join("\n"), "cross-country-summary.csv", Date.parse("2026-08-16T12:00:00.000Z"));
    db.saveTradeRecords(crossCountry.records);
    const sharedSummaries = db.summarizeTradeCompanies(20, { query: "Shared Name" }, Date.parse("2026-08-17T00:00:00.000Z"));
    assert.equal(sharedSummaries.length, 2);
    const sharedUs = sharedSummaries.find((item) => item.countries[0] === "US");
    const sharedCa = sharedSummaries.find((item) => item.countries[0] === "CA");
    assert.ok(sharedUs);
    assert.ok(sharedCa);
    assert.equal(sharedUs.recordCount, 2);
    assert.deepEqual(sharedUs.amountByCurrency, { USD: 22000 });
    assert.equal(sharedUs.websiteUrl, "https://shared-us.example/");
    assert.equal(sharedCa.recordCount, 1);
    assert.deepEqual(sharedCa.amountByCurrency, { CAD: 5000 });
    assert.equal(sharedCa.websiteUrl, "https://shared-ca.example/");
    assert.equal("purchaseProbability" in sharedUs, false);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("trade records persist as deduplicated evidence without creating prospect or CRM state", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-trade-records-"));
  const db = new RadarDatabase(directory);
  try {
    const parsed = parseTradeRecordImport([
      "Buyer,Country,Product,HS Code,Date,Website",
      "Acme Wholesale,US,Smart feeder,851679,2026-08-01,acme.example",
      "No Web Importer,US,Pet feeder,851679,2026-08-02,",
    ].join("\n"), "authorized-local-export.csv", Date.parse("2026-08-16T12:00:00.000Z"));

    const first = db.saveTradeRecords(parsed.records);
    const second = db.saveTradeRecords(parsed.records);
    assert.deepEqual(first, { imported: 2, duplicates: 0 });
    assert.deepEqual(second, { imported: 0, duplicates: 2 });
    assert.equal(db.listTradeRecords(10).length, 2);
    assert.deepEqual(db.tradeRecordStats(), {
      total: 2,
      companies: 2,
      withWebsite: 1,
      unresolvedCompanies: 1,
    });
    assert.equal(db.listProspectCandidates(10).length, 0);
    assert.equal(db.listLeads({ limit: 10 }).length, 0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
