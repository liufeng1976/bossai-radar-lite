import { isIP } from "node:net";

import type { RadarDatabase } from "./database.js";
import { scoreEvidence } from "./scoring.js";
import type { RawItem, SavedEvidence } from "./types.js";

export const INTELLIGENCE_EVIDENCE_IMPORT_SCHEMA = "bossai.intelligence-evidence-import.v1" as const;
export const INTELLIGENCE_EVIDENCE_RECORD_SCHEMA = "bossai.intelligence-evidence-record.v1" as const;

interface IntelligenceEvidenceImportRecord {
  schema: typeof INTELLIGENCE_EVIDENCE_RECORD_SCHEMA;
  externalId: string;
  source: "website";
  title: string;
  body: string;
  url: string;
  publishedAt: string;
  query: string;
  provenance: {
    sourceUrl: string;
    canonicalUrl: string;
    retrievedAt: string;
    provider: string;
    operation: string;
    requestId: string;
    providerJobId: string;
    factClass: string;
    sourceContentTrust: "untrusted-public-evidence";
    instructionAuthority: "none";
    toolAuthority: "none";
    approvalAuthority: "none";
    promptInjectionSignals: string[];
  };
}

interface IntelligenceEvidenceImportProposal {
  schema: typeof INTELLIGENCE_EVIDENCE_IMPORT_SCHEMA;
  producer: {
    project: "bossai-intelligence-agent";
    taskId: string;
    operationId: string;
    producedAt: string;
  };
  consumer: {
    project: "bossai-radar-lite";
  };
  authority: {
    proposalOnly: true;
    persistenceAuthorized: false;
    scoringAuthorized: false;
    sourceOfRecordAfterAcceptedImport: "bossai-radar-lite";
    deterministicScoringAuthority: "bossai-radar-lite";
    ownerApprovalAuthority: "none";
    externalActionAuthority: "none";
  };
  records: IntelligenceEvidenceImportRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): string {
  return String(value ?? "").replace(/\r\n?/gu, "\n").trim().slice(0, maximum);
}

function publicHttpUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) return "";
    const host = url.hostname.toLowerCase().replace(/\.$/u, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal") return "";
    if (isIP(host) === 4) {
      const parts = host.split(".").map(Number);
      const [a = 0, b = 0] = parts;
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "";
    }
    if (isIP(host) === 6 && (/^(?:fc|fd|fe8|fe9|fea|feb|::1|::)$/iu.test(host) || host.startsWith("2001:db8:"))) return "";
    return url.href;
  } catch {
    return "";
  }
}

function recordFromUnknown(value: unknown): IntelligenceEvidenceImportRecord | null {
  if (!isRecord(value) || value.schema !== INTELLIGENCE_EVIDENCE_RECORD_SCHEMA || value.source !== "website") return null;
  for (const forbidden of ["painScore", "paymentScore", "competitionScore", "urgencyScore", "totalScore", "category", "tags", "decision"]) {
    if (forbidden in value) return null;
  }
  const provenance = isRecord(value.provenance) ? value.provenance : null;
  if (!provenance
      || provenance.sourceContentTrust !== "untrusted-public-evidence"
      || provenance.instructionAuthority !== "none"
      || provenance.toolAuthority !== "none"
      || provenance.approvalAuthority !== "none") return null;
  const url = publicHttpUrl(value.url);
  const sourceUrl = publicHttpUrl(provenance.sourceUrl);
  const canonicalUrl = publicHttpUrl(provenance.canonicalUrl);
  if (!url || !sourceUrl || !canonicalUrl || new URL(url).hostname !== new URL(canonicalUrl).hostname) return null;
  const externalId = boundedText(value.externalId, 180);
  if (!externalId) return null;
  return {
    schema: INTELLIGENCE_EVIDENCE_RECORD_SCHEMA,
    externalId,
    source: "website",
    title: boundedText(value.title, 800),
    body: boundedText(value.body, 80_000),
    url,
    publishedAt: boundedText(value.publishedAt, 64),
    query: boundedText(value.query || canonicalUrl, 2_000),
    provenance: {
      sourceUrl,
      canonicalUrl,
      retrievedAt: boundedText(provenance.retrievedAt, 64),
      provider: boundedText(provenance.provider, 120),
      operation: boundedText(provenance.operation, 80),
      requestId: boundedText(provenance.requestId, 180),
      providerJobId: boundedText(provenance.providerJobId, 180),
      factClass: boundedText(provenance.factClass, 80),
      sourceContentTrust: "untrusted-public-evidence",
      instructionAuthority: "none",
      toolAuthority: "none",
      approvalAuthority: "none",
      promptInjectionSignals: Array.isArray(provenance.promptInjectionSignals)
        ? provenance.promptInjectionSignals.map((item) => boundedText(item, 120)).filter(Boolean).slice(0, 16)
        : [],
    },
  };
}

export function parseIntelligenceEvidenceImportProposal(value: unknown): IntelligenceEvidenceImportProposal {
  if (!isRecord(value) || value.schema !== INTELLIGENCE_EVIDENCE_IMPORT_SCHEMA) throw new Error("INTELLIGENCE_EVIDENCE_IMPORT_SCHEMA_INVALID");
  const producer = isRecord(value.producer) ? value.producer : null;
  const consumer = isRecord(value.consumer) ? value.consumer : null;
  const authority = isRecord(value.authority) ? value.authority : null;
  if (!producer || producer.project !== "bossai-intelligence-agent" || !consumer || consumer.project !== "bossai-radar-lite") {
    throw new Error("INTELLIGENCE_EVIDENCE_IMPORT_PARTIES_INVALID");
  }
  if (!authority
      || authority.proposalOnly !== true
      || authority.persistenceAuthorized !== false
      || authority.scoringAuthorized !== false
      || authority.sourceOfRecordAfterAcceptedImport !== "bossai-radar-lite"
      || authority.deterministicScoringAuthority !== "bossai-radar-lite"
      || authority.ownerApprovalAuthority !== "none"
      || authority.externalActionAuthority !== "none") {
    throw new Error("INTELLIGENCE_EVIDENCE_IMPORT_AUTHORITY_INVALID");
  }
  const sourceRecords = Array.isArray(value.records) ? value.records : [];
  const records = sourceRecords.map(recordFromUnknown);
  if (records.some((item) => item === null)) throw new Error("INTELLIGENCE_EVIDENCE_IMPORT_RECORD_INVALID");
  return {
    schema: INTELLIGENCE_EVIDENCE_IMPORT_SCHEMA,
    producer: {
      project: "bossai-intelligence-agent",
      taskId: boundedText(producer.taskId, 180),
      operationId: boundedText(producer.operationId, 180),
      producedAt: boundedText(producer.producedAt, 64),
    },
    consumer: { project: "bossai-radar-lite" },
    authority: {
      proposalOnly: true,
      persistenceAuthorized: false,
      scoringAuthorized: false,
      sourceOfRecordAfterAcceptedImport: "bossai-radar-lite",
      deterministicScoringAuthority: "bossai-radar-lite",
      ownerApprovalAuthority: "none",
      externalActionAuthority: "none",
    },
    records: records as IntelligenceEvidenceImportRecord[],
  };
}

function rawItemFromImport(proposal: IntelligenceEvidenceImportProposal, record: IntelligenceEvidenceImportRecord): RawItem {
  const canonical = new URL(record.url);
  const rootUrl = new URL("/", canonical.origin).href;
  return {
    source: "website",
    externalId: record.externalId,
    title: record.title || canonical.hostname,
    body: record.body,
    url: record.url,
    author: "",
    publishedAt: record.publishedAt || record.provenance.retrievedAt,
    engagement: 0,
    query: record.query,
    websiteContext: {
      schema: "bossai.business-website-context.v1",
      rootUrl,
      pageUrl: record.url,
      companyName: record.title || canonical.hostname,
      description: boundedText(record.body, 2_000),
      publicEmails: [],
      publicPhones: [],
      contactUrls: [],
      productSignals: [],
      robotsUrl: new URL("/robots.txt", canonical.origin).href,
      robotsPolicy: "unavailable",
      renderingHint: "static-sufficient",
      acquisitionMode: "static-http",
      intelligenceImport: {
        schema: "bossai.intelligence-evidence-import-context.v1",
        producer: "bossai-intelligence-agent",
        contract: INTELLIGENCE_EVIDENCE_IMPORT_SCHEMA,
        taskId: proposal.producer.taskId,
        operationId: proposal.producer.operationId,
        provider: record.provenance.provider,
        operation: record.provenance.operation,
        requestId: record.provenance.requestId,
        providerJobId: record.provenance.providerJobId,
        sourceContentTrust: "untrusted-public-evidence",
        instructionAuthority: "none",
        toolAuthority: "none",
        approvalAuthority: "none",
        promptInjectionSignals: record.provenance.promptInjectionSignals,
      },
      depth: 0,
      crawledAt: record.provenance.retrievedAt || proposal.producer.producedAt,
    },
    isDemo: false,
  };
}

export function importIntelligenceEvidenceProposal(
  db: RadarDatabase,
  value: unknown,
  { reviewedBy }: { reviewedBy: string },
): {
  schema: "bossai.intelligence-evidence-import-receipt.v1";
  imported: SavedEvidence[];
  reviewedBy: string;
  scoringAuthority: "bossai-radar-lite";
  sourceOfRecord: "bossai-radar-lite";
  opportunityRebuildRequired: true;
  externalActionsExecuted: false;
} {
  const reviewer = boundedText(reviewedBy, 180);
  if (!reviewer) throw new Error("INTELLIGENCE_EVIDENCE_IMPORT_REVIEW_REQUIRED");
  const proposal = parseIntelligenceEvidenceImportProposal(value);
  const imported = proposal.records.map((record) => db.saveEvidence(scoreEvidence(rawItemFromImport(proposal, record))));
  return {
    schema: "bossai.intelligence-evidence-import-receipt.v1",
    imported,
    reviewedBy: reviewer,
    scoringAuthority: "bossai-radar-lite",
    sourceOfRecord: "bossai-radar-lite",
    opportunityRebuildRequired: true,
    externalActionsExecuted: false,
  };
}
