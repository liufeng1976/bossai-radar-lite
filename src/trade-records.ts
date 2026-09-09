import { createHash } from "node:crypto";
import type {
  ProspectDiscoveryCandidate,
  TradeHistoricalCadence,
  TradeRecord,
  TradeRecordImportResult,
  TradeRecordRole,
  TradeReviewPriority,
} from "./types.js";

const MAX_IMPORT_ROWS = 5_000;
const MAX_CELL_LENGTH = 2_000;

type FieldKey = "companyName" | "role" | "country" | "productDescription" | "hsCode" | "tradeDate" | "quantity" | "amount" | "currency" | "websiteUrl";

const ALIASES: Record<Exclude<FieldKey, "role">, RegExp[]> = {
  companyName: [
    /^(buyer|buyer name|importer|importer name|consignee|customer|customer name|company|company name)$/iu,
    /^(买方|买家|进口商|进口企业|采购商|采购企业|收货人|客户|客户名称|企业|企业名称|公司|公司名称)$/u,
    /^(supplier|supplier name|exporter|exporter name|shipper)$/iu,
    /^(供应商|供应企业|出口商|出口企业|发货人)$/u,
  ],
  country: [/^(country|buyer country|import country|destination country|destination|origin country|country of origin)$/iu, /^(国家|买方国家|进口国|目的国|原产国|来源国)$/u],
  productDescription: [/^(product|product description|goods|goods description|commodity|description|item|item description)$/iu, /^(产品|产品描述|商品|商品描述|品名|货物|货物描述|描述)$/u],
  hsCode: [/^(hs|hs code|hscode|hs_code|tariff code)$/iu, /^(hs编码|海关编码|商品编码|税则号)$/u],
  tradeDate: [/^(date|trade date|shipment date|import date|export date|bill date)$/iu, /^(日期|交易日期|装运日期|进口日期|出口日期|提单日期)$/u],
  quantity: [/^(quantity|qty|volume|weight)$/iu, /^(数量|件数|重量)$/u],
  amount: [/^(amount|value|trade value|customs value|usd value|invoice value)$/iu, /^(金额|交易额|货值|报关金额|美元金额|发票金额)$/u],
  currency: [/^(currency|currency code)$/iu, /^(币种|货币|货币代码)$/u],
  websiteUrl: [/^(website|website url|web site|domain|company website|url)$/iu, /^(官网|官方网站|网站|网站地址|域名|公司官网)$/u],
};

export function parseTradeRecordImport(
  input: string,
  sourceLabel = "local-trade-record-import",
  now = Date.now(),
): TradeRecordImportResult {
  const text = String(input || "").replace(/^\uFEFF/u, "").trim();
  if (!text) throw new Error("TRADE_RECORD_IMPORT_EMPTY");
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter).slice(0, MAX_IMPORT_ROWS + 1);
  if (rows.length < 2) throw new Error("TRADE_RECORD_IMPORT_NO_DATA_ROWS");
  const headerRow = rows[0];
  if (!headerRow) throw new Error("TRADE_RECORD_IMPORT_NO_DATA_ROWS");
  const headers = headerRow.map((value) => cleanCell(value, 160));
  const mapping = inferTradeRecordMapping(headers);
  if (!mapping.companyName) throw new Error("TRADE_RECORD_IMPORT_COMPANY_COLUMN_REQUIRED");

  const records: TradeRecord[] = [];
  let rejectedRows = 0;
  const importedAt = new Date(now).toISOString();
  const normalizedSourceLabel = cleanCell(sourceLabel, 120) || "local-trade-record-import";
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || !row.some((value) => cleanCell(value, 20))) continue;
    const companyName = valueFor(row, headers, mapping.companyName, 240);
    if (!companyName) {
      rejectedRows += 1;
      continue;
    }
    const role = inferTradeRecordRole(mapping.companyName, valueFor(row, headers, mapping.role, 40));
    const recordBase = {
      companyName,
      role,
      country: valueFor(row, headers, mapping.country, 120),
      productDescription: valueFor(row, headers, mapping.productDescription, 800),
      hsCode: valueFor(row, headers, mapping.hsCode, 80),
      tradeDate: normalizeTradeDate(valueFor(row, headers, mapping.tradeDate, 80)),
      quantity: valueFor(row, headers, mapping.quantity, 120),
      amount: normalizeAmount(valueFor(row, headers, mapping.amount, 120)),
      currency: valueFor(row, headers, mapping.currency, 16).toUpperCase(),
      websiteUrl: normalizeOptionalWebsite(valueFor(row, headers, mapping.websiteUrl, 500)),
      sourceLabel: normalizedSourceLabel,
      sourceRow: index + 1,
      importedAt,
    };
    const fingerprint = createHash("sha256").update(JSON.stringify({
      sourceLabel: normalizedSourceLabel,
      companyName: recordBase.companyName.toLocaleLowerCase("en-US"),
      role: recordBase.role,
      country: recordBase.country,
      productDescription: recordBase.productDescription,
      hsCode: recordBase.hsCode,
      tradeDate: recordBase.tradeDate,
      quantity: recordBase.quantity,
      amount: recordBase.amount,
      currency: recordBase.currency,
      websiteUrl: recordBase.websiteUrl,
    })).digest("hex");
    records.push({
      id: `trade-${fingerprint.slice(0, 24)}`,
      fingerprint,
      ...recordBase,
    });
  }

  const warnings: string[] = [];
  if (!mapping.productDescription) warnings.push("No product/commodity description column was detected.");
  if (!mapping.tradeDate) warnings.push("No trade/shipment date column was detected.");
  if (!mapping.websiteUrl) warnings.push("No website/domain column was detected; company websites must be resolved separately before prospect crawling.");
  if (rows.length > MAX_IMPORT_ROWS) warnings.push(`Import was capped at ${MAX_IMPORT_ROWS} data rows.`);
  return { headers, mapping, records, rejectedRows, warnings };
}

export function describeHistoricalTradeCadence(
  tradeDates: readonly string[],
  recordCount: number,
  websiteUrl: string,
  now = Date.now(),
): {
  firstTradeDate: string;
  latestTradeDate: string;
  datedRecordCount: number;
  uniqueTradeDateCount: number;
  medianIntervalDays: number | null;
  minIntervalDays: number | null;
  maxIntervalDays: number | null;
  daysSinceLatestTrade: number | null;
  historicalCadence: TradeHistoricalCadence;
  reviewPriority: TradeReviewPriority;
  reviewReasons: string[];
} {
  const parsedDates = tradeDates
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/u.test(value))
    .map((value) => ({ value, time: Date.parse(`${value}T00:00:00.000Z`) }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  const uniqueDates = [...new Map(parsedDates.map((item) => [item.value, item])).values()];
  const gaps = uniqueDates.slice(1).map((item, index) => {
    const previous = uniqueDates[index];
    return previous ? Math.max(0, Math.round((item.time - previous.time) / 86_400_000)) : 0;
  }).filter((days) => days > 0);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianIntervalDays = sortedGaps.length ? median(sortedGaps) : null;
  const minIntervalDays = sortedGaps.length ? sortedGaps[0] ?? null : null;
  const maxIntervalDays = sortedGaps.length ? sortedGaps[sortedGaps.length - 1] ?? null : null;
  const firstTradeDate = uniqueDates[0]?.value || "";
  const latestTradeDate = uniqueDates[uniqueDates.length - 1]?.value || "";
  const latestTime = uniqueDates[uniqueDates.length - 1]?.time;
  const daysSinceLatestTrade = latestTime === undefined
    ? null
    : Math.max(0, Math.floor((now - latestTime) / 86_400_000));

  let historicalCadence: TradeHistoricalCadence = "insufficient";
  if (gaps.length === 1) historicalCadence = "single-gap";
  if (gaps.length >= 2 && medianIntervalDays !== null && minIntervalDays !== null && maxIntervalDays !== null) {
    const spreadRatio = medianIntervalDays > 0 ? (maxIntervalDays - minIntervalDays) / medianIntervalDays : Number.POSITIVE_INFINITY;
    historicalCadence = spreadRatio <= 0.5 ? "regular" : "variable";
  }

  let reviewPriority: TradeReviewPriority = "REVIEW_LATER";
  if (recordCount >= 3 && daysSinceLatestTrade !== null && daysSinceLatestTrade <= 180) reviewPriority = "REVIEW_FIRST";
  else if (recordCount >= 2 && daysSinceLatestTrade !== null && daysSinceLatestTrade <= 365) reviewPriority = "REVIEW_SOON";

  const reviewReasons: string[] = [];
  if (recordCount >= 3) reviewReasons.push("multiple historical trade records are available for manual review");
  else if (recordCount >= 2) reviewReasons.push("more than one historical trade record is available");
  else reviewReasons.push("only one historical trade record is available");
  if (daysSinceLatestTrade !== null) reviewReasons.push(`latest observed historical trade is ${daysSinceLatestTrade} days before the review date`);
  else reviewReasons.push("no valid historical trade date is available");
  if (historicalCadence === "regular") reviewReasons.push("observed historical intervals are relatively consistent");
  else if (historicalCadence === "variable") reviewReasons.push("observed historical intervals vary materially");
  else if (historicalCadence === "single-gap") reviewReasons.push("only one historical interval is available; cadence is not established");
  else reviewReasons.push("insufficient dated history to describe a cadence");
  if (websiteUrl) reviewReasons.push("a company website is already available for separate evidence verification");
  reviewReasons.push("review priority is not purchase intent, purchase probability, budget, authority or a predicted next order");

  return {
    firstTradeDate,
    latestTradeDate,
    datedRecordCount: parsedDates.length,
    uniqueTradeDateCount: uniqueDates.length,
    medianIntervalDays,
    minIntervalDays,
    maxIntervalDays,
    daysSinceLatestTrade,
    historicalCadence,
    reviewPriority,
    reviewReasons,
  };
}

export function tradeRecordsToProspectCandidate(
  records: readonly TradeRecord[],
  websiteUrl: string,
  now = Date.now(),
): ProspectDiscoveryCandidate {
  const representative = records[0];
  if (!representative) throw new Error("TRADE_COMPANY_RECORDS_REQUIRED");
  const companyKeys = new Set(records.map((record) => record.companyName.trim().toLocaleLowerCase("en-US")).filter(Boolean));
  if (companyKeys.size !== 1) throw new Error("TRADE_COMPANY_RECORDS_MIXED");
  const base = tradeRecordToProspectCandidate({ ...representative, websiteUrl }, now);
  const productSignals = [...new Set(records.flatMap((record) => [
    record.productDescription,
    record.hsCode ? `HS ${record.hsCode}` : "",
  ]).filter(Boolean))].slice(0, 20);
  return {
    ...base,
    companyName: representative.companyName,
    productSignals,
    discoverySourceTitle: `Trade evidence: ${records.length} linked historical company records`,
    reasons: [
      ...base.reasons,
      `explicit owner action grouped ${records.length} authorized historical trade records for one company review`,
      "historical repetition and cadence do not increase the prospect score and do not establish current buyer intent",
    ],
  };
}

export function tradeRecordToProspectCandidate(record: TradeRecord, now = Date.now()): ProspectDiscoveryCandidate {
  if (!record.websiteUrl) throw new Error("TRADE_RECORD_WEBSITE_REQUIRED");
  const website = new URL(record.websiteUrl);
  const domain = website.hostname.toLowerCase().replace(/^www\./u, "").replace(/\.$/u, "");
  if (!domain || !domain.includes(".")) throw new Error("TRADE_RECORD_WEBSITE_INVALID");
  const rootUrl = new URL("/", website.origin).href;
  const productSignals = [record.productDescription, record.hsCode ? `HS ${record.hsCode}` : ""].filter(Boolean);
  const description = [
    `${record.role} trade record`,
    record.country,
    record.productDescription,
    record.hsCode ? `HS ${record.hsCode}` : "",
    record.tradeDate,
  ].filter(Boolean).join(" · ");
  return {
    id: `prospect-${record.fingerprint.slice(0, 24)}`,
    domain,
    websiteUrl: rootUrl,
    companyName: record.companyName,
    description,
    discoverySourceUrl: "",
    discoverySourceTitle: `Trade evidence: ${record.sourceLabel} row ${record.sourceRow}`,
    discoveryQuery: record.companyName,
    publicEmails: [],
    publicPhones: [],
    contactUrls: [],
    officialProfileUrls: [],
    productSignals,
    evidenceUrls: [rootUrl],
    score: 65,
    reasons: [
      "authorized local trade record provides company-level historical transaction evidence",
      "historical trade evidence does not imply current purchase intent, budget or sales readiness",
    ],
    discoveredAt: new Date(now).toISOString(),
  };
}

export function inferTradeRecordMapping(headers: readonly string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalized = headers.map((header) => ({ original: header, normalized: normalizeHeader(header) }));
  for (const [field, patterns] of Object.entries(ALIASES)) {
    const match = normalized.find((item) => patterns.some((pattern) => pattern.test(item.normalized)));
    if (match) mapping[field] = match.original;
  }
  if (mapping.companyName) mapping.role = mapping.companyName;
  return mapping;
}

function detectDelimiter(text: string): "," | "\t" {
  const firstLine = text.split(/\r?\n/u, 1)[0] || "";
  const tabs = [...firstLine].filter((char) => char === "\t").length;
  const commas = countCsvSeparators(firstLine, ",");
  return tabs > commas ? "\t" : ",";
}

function countCsvSeparators(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) count += 1;
  }
  return count;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length > MAX_IMPORT_ROWS + 1) break;
      continue;
    }
    cell += char;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows;
}

function valueFor(row: readonly string[], headers: readonly string[], header: string | undefined, max: number): string {
  if (!header) return "";
  const index = headers.indexOf(header);
  return index >= 0 ? cleanCell(row[index], max) : "";
}

function cleanCell(value: unknown, max = MAX_CELL_LENGTH): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
}

function normalizeHeader(value: string): string {
  return cleanCell(value, 160).toLocaleLowerCase("en-US").replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function inferTradeRecordRole(companyHeader: string, explicitRole: string): TradeRecordRole {
  const value = `${companyHeader} ${explicitRole}`.toLocaleLowerCase("en-US");
  if (/(buyer|consignee|customer|买方|买家|采购|收货人)/u.test(value)) return "buyer";
  if (/(importer|进口)/u.test(value)) return "importer";
  if (/(supplier|shipper|供应|发货人)/u.test(value)) return "supplier";
  if (/(exporter|出口)/u.test(value)) return "exporter";
  return "unknown";
}

function normalizeAmount(value: string): number | null {
  if (!value) return null;
  const normalized = value.replace(/[,$€£¥￥\s]/gu, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle] ?? 0;
  const left = values[middle - 1] ?? 0;
  const right = values[middle] ?? left;
  return Math.round(((left + right) / 2) * 10) / 10;
}

function normalizeTradeDate(value: string): string {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : cleanCell(value, 40);
}

function normalizeOptionalWebsite(value: string): string {
  if (!value) return "";
  const candidate = /^https?:\/\//iu.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password || !url.hostname.includes(".")) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}
