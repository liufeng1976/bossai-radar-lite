import type { BossAiManagerRun } from "./bossai-os-client.js";
import type { ProjectedProspectOwnerDecisionV2 } from "./owner-business-decision-projection.js";
import type {
  ProspectCandidate,
  ProspectOwnerDecisionRecord,
  ProspectSalesHandoffBrief,
  ProspectSalesQualificationDisposition,
  ProspectSalesQualificationField,
  ProspectSalesQualificationFieldKey,
  ProspectWebsiteEvidenceSource,
  ProspectWebsiteEvidenceStatus,
} from "./types.js";

const MAX_AUTHORITATIVE_OUTPUT_CHARS = 24_000;

const DISPOSITION_MARKERS: Array<[string, ProspectSalesQualificationDisposition]> = [
  ["HUMAN_REVIEWED_QUALIFICATION_ALLOWED", "qualification-allowed"],
  ["BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE", "blocked-browser-evidence"],
  ["BLOCKED_PENDING_VERIFIED_WEBSITE_EVIDENCE", "blocked-verified-website"],
];

export function buildProspectSalesHandoffBrief(input: {
  prospect: ProspectCandidate;
  run: BossAiManagerRun;
  ownerDecisionJournal?: readonly ProspectOwnerDecisionRecord[];
  ownerDecisionId?: string;
  bossAiOwnerDecisionV2?: ProjectedProspectOwnerDecisionV2 | null;
  now?: number;
}): ProspectSalesHandoffBrief {
  const output = boundedOutput(input.run.editedOutput || input.run.output || "");
  const [dispositionMarker, disposition] = parseDisposition(output);
  const sourceReportedWebsiteEvidence = parseWebsiteEvidence(output);
  const approvals = (input.ownerDecisionJournal ?? []).filter((item) => item.decision === "approve-sales");
  const ownerDecisionLinkSupplied = Object.prototype.hasOwnProperty.call(input, "ownerDecisionId");
  const localOwnerApproval = ownerDecisionLinkSupplied
    ? approvals.find((item) => item.id === input.ownerDecisionId) ?? null
    : approvals[0] ?? null;
  const osOwnerApproval = input.bossAiOwnerDecisionV2?.decision.decisionType === "authorize-sales-qualification"
    && (!input.ownerDecisionId || input.ownerDecisionId === input.bossAiOwnerDecisionV2.source.decisionId)
    ? {
        id: input.bossAiOwnerDecisionV2.source.decisionId,
        reasonCode: input.bossAiOwnerDecisionV2.decision.reasonCode,
        note: "",
        decidedAt: input.bossAiOwnerDecisionV2.source.decidedAt,
      }
    : null;
  const ownerApproval = osOwnerApproval ?? localOwnerApproval;

  return {
    schema: "bossai.prospect-sales-handoff-brief.v1",
    prospectId: input.prospect.id,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    managerTaskId: input.run.id,
    managerStatus: input.run.status,
    managerReviewStatus: input.run.reviewStatus,
    managerUpdatedAt: input.run.updatedAt,
    sourceAuthority: "bossai-manager",
    artifactDescriptorId: "sales.lead-qualification.md",
    disposition,
    dispositionMarker,
    sourceReportedWebsiteEvidence,
    currentWebsiteEvidence: {
      status: input.prospect.websiteEvidenceStatus ?? "unverified",
      source: input.prospect.websiteEvidenceSource ?? "static-http",
    },
    qualificationFields: [
      parseQualificationField(output, "real-need"),
      parseQualificationField(output, "buyer-authority"),
      parseQualificationField(output, "timing"),
      parseQualificationField(output, "budget"),
    ],
    ownerApproval: ownerApproval
      ? {
          id: ownerApproval.id,
          reasonCode: ownerApproval.reasonCode,
          note: ownerApproval.note,
          decidedAt: ownerApproval.decidedAt,
        }
      : null,
    nextOwnerAction: nextOwnerAction(disposition),
    authoritativeOutput: output,
    truthBoundary: {
      handoffBriefIsOwnerApproval: false,
      qualificationIsCloseProbability: false,
      outreachAuthorized: false,
      crmWriteAuthorized: false,
      purchaseIntentInferred: false,
      closeProbabilityInferred: false,
      nextPurchaseDatePredicted: false,
      crmRecordCreated: false,
      outreachExecuted: false,
    },
  };
}

function boundedOutput(value: string): string {
  return String(value || "").replace(/\r\n?/gu, "\n").trim().slice(0, MAX_AUTHORITATIVE_OUTPUT_CHARS);
}

function parseDisposition(output: string): [string, ProspectSalesQualificationDisposition] {
  for (const [marker, disposition] of DISPOSITION_MARKERS) {
    if (output.includes(marker)) return [marker, disposition];
  }
  return ["", "unstructured"];
}

function parseWebsiteEvidence(output: string): ProspectSalesHandoffBrief["sourceReportedWebsiteEvidence"] {
  const english = output.match(/Website evidence status:\s*(verified|static-incomplete|unverified)\s*;\s*acquisition source:\s*(browser-rendered|static-http)/iu);
  const chinese = output.match(/官网证据状态：\s*(verified|static-incomplete|unverified)\s*；\s*采集来源：\s*(browser-rendered|static-http)/u);
  const match = english || chinese;
  if (!match) return { status: "not-structured", source: "not-structured" };
  return {
    status: match[1] as ProspectWebsiteEvidenceStatus,
    source: match[2] as ProspectWebsiteEvidenceSource,
  };
}

function parseQualificationField(output: string, key: ProspectSalesQualificationFieldKey): ProspectSalesQualificationField {
  const patterns: Record<ProspectSalesQualificationFieldKey, RegExp[]> = {
    "real-need": [
      /^-\s*Need:\s*(.+)$/imu,
      /^-\s*真实需求：\s*(.+)$/gmu,
    ],
    "buyer-authority": [
      /^-\s*Authority:\s*(.+)$/imu,
      /^-\s*决策权：\s*(.+)$/gmu,
    ],
    timing: [
      /^-\s*Timing:\s*(.+)$/imu,
      /^-\s*采购时间：\s*(.+)$/gmu,
    ],
    budget: [
      /^-\s*Budget:\s*(.+)$/imu,
      /^-\s*预算：\s*(.+)$/gmu,
    ],
  };

  for (const pattern of patterns[key]) {
    pattern.lastIndex = 0;
    const match = pattern.exec(output);
    if (!match?.[1]) continue;
    const reportedValue = match[1].trim().slice(0, 600);
    const state = /\bUNKNOWN\b/iu.test(reportedValue) || /^未知(?:[，；。]|$)/u.test(reportedValue)
      ? "unknown"
      : "reported-evidence";
    return { key, state, reportedValue, source: "sales-manager-result" };
  }
  return { key, state: "not-structured", reportedValue: "", source: "sales-manager-result" };
}

function nextOwnerAction(disposition: ProspectSalesQualificationDisposition): ProspectSalesHandoffBrief["nextOwnerAction"] {
  if (disposition === "blocked-browser-evidence") return "recover-browser-evidence";
  if (disposition === "blocked-verified-website") return "verify-website";
  if (disposition === "qualification-allowed") return "decide-outreach-separately";
  return "review-result";
}
