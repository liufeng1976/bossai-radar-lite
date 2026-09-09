import type {
  ProspectCandidate,
  ProspectSalesHandoffBrief,
} from "./types.js";

export const PROSPECT_CRM_HANDOFF_SCHEMA = "bossai.prospect-crm-handoff.v1" as const;

function boundedText(value: unknown, maximum = 1_000): string {
  return String(value ?? "").replace(/\r\n?/gu, "\n").trim().slice(0, maximum);
}

function boundedList(values: readonly string[] | undefined, maximumItems: number, maximumChars = 500): string[] {
  return (values ?? []).map((item) => boundedText(item, maximumChars)).filter(Boolean).slice(0, maximumItems);
}

export function buildProspectCrmHandoffProposal(input: {
  prospect: ProspectCandidate;
  salesHandoff: ProspectSalesHandoffBrief | null;
  intelligenceManagerTaskId?: string;
  salesManagerTaskId?: string;
  generatedAt?: string;
}) {
  const { prospect, salesHandoff } = input;
  const blockers: string[] = [];
  if ((prospect.websiteEvidenceStatus ?? "unverified") !== "verified") blockers.push("verified-website-evidence-required");
  if (!salesHandoff) blockers.push("completed-sales-qualification-required");
  if (salesHandoff && salesHandoff.managerStatus !== "completed") blockers.push("sales-manager-task-not-completed");
  if (salesHandoff && salesHandoff.disposition !== "qualification-allowed") blockers.push("sales-qualification-not-allowed");
  if (salesHandoff && !salesHandoff.ownerApproval) blockers.push("owner-sales-authorization-lineage-required");
  if (salesHandoff && salesHandoff.currentWebsiteEvidence.status !== "verified") blockers.push("sales-result-not-bound-to-verified-website");

  const qualificationFields = (salesHandoff?.qualificationFields ?? []).map((field) => ({
    key: field.key,
    state: field.state,
    reportedValue: boundedText(field.reportedValue, 600),
    source: field.source,
  }));

  return {
    schema: PROSPECT_CRM_HANDOFF_SCHEMA,
    status: blockers.length ? "blocked" as const : "ready-for-crm-acceptance" as const,
    generatedAt: boundedText(input.generatedAt || new Date().toISOString(), 64),
    source: {
      project: "bossai-radar-lite" as const,
      entity: "prospect_candidate" as const,
      prospectId: prospect.id,
    },
    target: {
      project: "bossai-crm-employee" as const,
      entityIntent: "lead-candidate" as const,
    },
    company: {
      companyName: boundedText(prospect.companyName, 240),
      domain: boundedText(prospect.domain, 240),
      websiteUrl: boundedText(prospect.websiteUrl, 2_000),
      description: boundedText(prospect.description, 2_000),
      productSignals: boundedList(prospect.productSignals, 12, 240),
      publicEmails: boundedList(prospect.publicEmails, 5, 320),
      publicPhones: boundedList(prospect.publicPhones, 5, 120),
      contactUrls: boundedList(prospect.contactUrls, 8, 2_000),
      officialProfileUrls: boundedList(prospect.officialProfileUrls, 8, 2_000),
      publicMessagingUrls: boundedList(prospect.publicMessagingUrls, 8, 2_000),
    },
    intelligenceProvenance: {
      discoverySourceUrl: boundedText(prospect.discoverySourceUrl, 2_000),
      evidenceUrls: boundedList(prospect.evidenceUrls, 12, 2_000),
      websiteEvidenceStatus: prospect.websiteEvidenceStatus ?? "unverified",
      websiteEvidenceSource: prospect.websiteEvidenceSource ?? "static-http",
      websiteVerifiedAt: boundedText(prospect.websiteVerifiedAt, 64),
      radarCandidateScore: prospect.score,
      radarScoreMeaning: "sorting-only-not-purchase-or-close-probability" as const,
      intelligenceManagerTaskId: boundedText(input.intelligenceManagerTaskId, 180),
    },
    salesQualification: salesHandoff ? {
      managerTaskId: boundedText(input.salesManagerTaskId || salesHandoff.managerTaskId, 180),
      managerStatus: salesHandoff.managerStatus,
      managerReviewStatus: salesHandoff.managerReviewStatus,
      disposition: salesHandoff.disposition,
      qualificationFields,
      ownerSalesAuthorization: salesHandoff.ownerApproval ? {
        id: salesHandoff.ownerApproval.id,
        reasonCode: salesHandoff.ownerApproval.reasonCode,
        decidedAt: salesHandoff.ownerApproval.decidedAt,
      } : null,
    } : null,
    blockers,
    authority: {
      proposalOnly: true,
      crmWriteAuthorized: false,
      crmRecordCreated: false,
      requiresCrmAcceptance: true,
      crmBecomesSourceOfRecordOnlyAfterAcceptedWrite: true,
      radarRetainsIntelligenceProvenance: true,
      ownerApprovalAuthorityTransferred: false,
      salesExecutionAuthorityTransferred: false,
      externalContactAuthorized: false,
      commercialTermsAuthorized: false,
      externalActionsExecuted: false,
    },
  };
}
