import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { RadarDatabase } from "../src/database.js";
import {
  importIntelligenceEvidenceProposal,
  parseIntelligenceEvidenceImportProposal,
} from "../src/intelligence-evidence-import.js";

function proposal() {
  return {
    schema: "bossai.intelligence-evidence-import.v1",
    producer: {
      project: "bossai-intelligence-agent",
      taskId: "manager-task-1",
      operationId: "operation-1",
      producedAt: "2026-08-20T08:01:00.000Z",
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
    records: [{
      schema: "bossai.intelligence-evidence-record.v1",
      externalId: "intel-001",
      source: "website",
      title: "Acme export equipment",
      body: "Acme has a manual workflow problem and is looking for a tool. Budget and pricing are public.",
      url: "https://acme.example/about",
      publishedAt: "2026-08-20T08:00:00.000Z",
      query: "https://acme.example/about",
      provenance: {
        sourceUrl: "https://acme.example/about",
        canonicalUrl: "https://acme.example/about",
        retrievedAt: "2026-08-20T08:00:00.000Z",
        provider: "native-web-acquisition",
        operation: "scrape",
        requestId: "request-1",
        providerJobId: "",
        factClass: "observed-public-source",
        sourceContentTrust: "untrusted-public-evidence",
        instructionAuthority: "none",
        toolAuthority: "none",
        approvalAuthority: "none",
        promptInjectionSignals: [],
      },
    }],
  };
}

test("Radar accepts only a proposal that preserves Radar persistence and scoring authority", () => {
  const parsed = parseIntelligenceEvidenceImportProposal(proposal());
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.authority.persistenceAuthorized, false);
  assert.equal(parsed.authority.scoringAuthorized, false);
  assert.equal(parsed.authority.deterministicScoringAuthority, "bossai-radar-lite");
});

test("Radar rejects Intelligence attempts to smuggle deterministic scores or decisions", () => {
  const input = proposal();
  const firstRecord = input.records[0];
  assert.ok(firstRecord);
  Object.assign(firstRecord, { totalScore: 99, decision: "BUILD" });
  assert.throws(() => parseIntelligenceEvidenceImportProposal(input), /INTELLIGENCE_EVIDENCE_IMPORT_RECORD_INVALID/u);
});

test("Radar persists reviewed Intelligence evidence only after recomputing its own deterministic score", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "radar-intelligence-import-"));
  const db = new RadarDatabase(directory);
  try {
    assert.throws(
      () => importIntelligenceEvidenceProposal(db, proposal(), { reviewedBy: "" }),
      /INTELLIGENCE_EVIDENCE_IMPORT_REVIEW_REQUIRED/u,
    );

    const receipt = importIntelligenceEvidenceProposal(db, proposal(), { reviewedBy: "owner-review" });
    assert.equal(receipt.schema, "bossai.intelligence-evidence-import-receipt.v1");
    assert.equal(receipt.scoringAuthority, "bossai-radar-lite");
    assert.equal(receipt.sourceOfRecord, "bossai-radar-lite");
    assert.equal(receipt.externalActionsExecuted, false);
    assert.equal(receipt.imported.length, 1);
    const saved = receipt.imported[0];
    assert.ok(saved);
    assert.ok(saved.totalScore > 0);
    assert.equal(saved.websiteContext?.intelligenceImport?.producer, "bossai-intelligence-agent");
    assert.equal(saved.websiteContext?.intelligenceImport?.taskId, "manager-task-1");
    assert.equal(saved.websiteContext?.intelligenceImport?.sourceContentTrust, "untrusted-public-evidence");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
