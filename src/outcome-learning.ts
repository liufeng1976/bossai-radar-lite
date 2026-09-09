import { matchingProspectOutcomeReviews } from "./outcome-attribution.js";
import type {
  BossAiDelegation,
  CompanyContactBusinessRole,
  ProspectCandidate,
  ProspectOutcomeLearning,
  ProspectOutcomeLearningCohort,
  ProspectOutcomeLearningDrilldown,
  ProspectOutcomeLearningDimensionKey,
  ProspectOutcomeLearningMembership,
  ProspectOutcomeLearningDimension,
  ProspectOutcomeLearningOutcomeState,
  ProspectOutcomeReviewRecord,
  ProspectSalesAuthorizationLineage,
} from "./types.js";

export const OUTCOME_LEARNING_MIN_SAMPLE = 3;

type OutcomeLearningInput = {
  prospect: ProspectCandidate;
  salesDelegation: BossAiDelegation | null;
  lineage: ProspectSalesAuthorizationLineage;
  reviewJournal?: readonly ProspectOutcomeReviewRecord[];
};

type LearningSample = {
  prospect: ProspectCandidate;
  outcomeState: ProspectOutcomeLearningOutcomeState;
  ownerValue: { amount: number; currency: string } | null;
};

export function buildProspectOutcomeLearningMembership(input: {
  prospect: ProspectCandidate;
  salesDelegation: BossAiDelegation | null;
  lineage: ProspectSalesAuthorizationLineage;
  reviewJournal?: readonly ProspectOutcomeReviewRecord[];
}): ProspectOutcomeLearningMembership {
  const salesTaskId = input.salesDelegation?.bossaiRunId ?? "";
  const eligible = input.salesDelegation?.status === "completed"
    && input.lineage.status === "sales-bound"
    && input.lineage.salesTaskBoundToApproval
    && Boolean(input.lineage.ownerDecisionId)
    && Boolean(input.lineage.salesManagerTaskId)
    && input.lineage.salesManagerTaskId === salesTaskId;
  const eligibilityReason: ProspectOutcomeLearningMembership["eligibilityReason"] = eligible
    ? "current-sales-lineage-completed"
    : input.salesDelegation?.status !== "completed"
      ? "sales-not-completed"
      : input.lineage.status !== "sales-bound" || !input.lineage.salesTaskBoundToApproval || !input.lineage.ownerDecisionId
        ? "authorization-lineage-invalid"
        : "sales-task-lineage-mismatch";
  const fitTerms = input.prospect.fitTerms ?? [];
  const fitMatches = input.prospect.fitMatches ?? [];
  const sampleContributionState = eligible
    ? currentOutcomeState(input.reviewJournal ?? [], input.lineage)
    : "excluded" as const;

  return {
    schema: "bossai.prospect-outcome-learning-membership.v1",
    prospectId: input.prospect.id,
    eligible,
    sampleContributionState,
    eligibilityReason,
    cohorts: {
      discoverySource: {
        key: discoverySourceKey(input.prospect),
        sourceUrl: input.prospect.discoverySourceUrl,
        sourceTitle: input.prospect.discoverySourceTitle,
      },
      websiteEvidenceSource: {
        key: input.prospect.websiteEvidenceSource ?? "static-http",
        evidenceStatus: input.prospect.websiteEvidenceStatus ?? "unverified",
      },
      businessChannelRoles: businessChannelRoleKeys(input.prospect),
      icpLexicalCoverage: {
        key: icpCoverageBucket(input.prospect.fitScore),
        score: input.prospect.fitScore ?? null,
        matchedCount: fitMatches.length,
        termCount: fitTerms.length,
      },
    },
    truthBoundary: {
      cohortMembershipIsNotRanking: true,
      historicalDescriptionOnly: true,
      causalityInferred: false,
      closeProbabilityInferred: false,
      purchaseIntentInferred: false,
      nextPurchaseDatePredicted: false,
      scoreMutationPerformed: false,
      modelCalled: false,
    },
  };
}

export function buildProspectOutcomeLearningDrilldown(
  input: readonly OutcomeLearningInput[],
  dimension: ProspectOutcomeLearningDimensionKey,
  cohortKey: string,
  now = Date.now(),
  outcomeStateFilter: ProspectOutcomeLearningOutcomeState | null = null,
): ProspectOutcomeLearningDrilldown {
  const normalizedKey = String(cohortKey || "").trim();
  const cohortItems = input
    .map((entry) => ({ entry, membership: buildProspectOutcomeLearningMembership(entry) }))
    .filter(({ membership }) => membership.eligible && membershipMatchesDimension(membership, dimension, normalizedKey))
    .map(({ entry, membership }) => ({
      prospectId: entry.prospect.id,
      companyName: entry.prospect.companyName || entry.prospect.domain,
      domain: entry.prospect.domain,
      contributionState: membership.sampleContributionState as ProspectOutcomeLearningOutcomeState,
    }))
    .sort((left, right) => left.companyName.localeCompare(right.companyName, "en")
      || left.domain.localeCompare(right.domain, "en")
      || left.prospectId.localeCompare(right.prospectId, "en"));
  const items = outcomeStateFilter
    ? cohortItems.filter((item) => item.contributionState === outcomeStateFilter)
    : cohortItems;

  return {
    schema: "bossai.prospect-outcome-learning-drilldown.v1",
    generatedAt: new Date(now).toISOString(),
    dimension,
    cohortKey: normalizedKey,
    outcomeStateFilter,
    cohortSampleCount: cohortItems.length,
    sampleCount: items.length,
    items,
    truthBoundary: {
      currentEligibleSamplesOnly: true,
      alphabeticalOrderingOnly: true,
      rankingPerformed: false,
      causalityInferred: false,
      closeProbabilityInferred: false,
      purchaseIntentInferred: false,
      nextPurchaseDatePredicted: false,
      businessValueIncluded: false,
      ownerReviewNoteIncluded: false,
      scoreMutationPerformed: false,
      managerTaskCreated: false,
      modelCalled: false,
      crmRecordCreated: false,
    },
  };
}

export function buildProspectOutcomeLearning(
  input: readonly OutcomeLearningInput[],
  now = Date.now(),
): ProspectOutcomeLearning {
  const samples = input.map(toLearningSample).filter((item): item is LearningSample => Boolean(item));
  const dimensions: ProspectOutcomeLearningDimension[] = [
    buildDimension("discovery-source", samples, (sample) => [discoverySourceKey(sample.prospect)]),
    buildDimension("website-evidence-source", samples, (sample) => [sample.prospect.websiteEvidenceSource ?? "static-http"]),
    buildDimension("business-channel-role", samples, (sample) => businessChannelRoleKeys(sample.prospect)),
    buildDimension("icp-lexical-coverage", samples, (sample) => [icpCoverageBucket(sample.prospect.fitScore)]),
  ];

  return {
    schema: "bossai.prospect-outcome-learning.v1",
    generatedAt: new Date(now).toISOString(),
    status: samples.length < OUTCOME_LEARNING_MIN_SAMPLE ? "insufficient-sample" : "descriptive",
    minimumSampleSize: OUTCOME_LEARNING_MIN_SAMPLE,
    sampleCount: samples.length,
    dimensions,
    truthBoundary: {
      historicalDescriptionOnly: true,
      causalityInferred: false,
      closeProbabilityInferred: false,
      purchaseIntentInferred: false,
      nextPurchaseDatePredicted: false,
      scoreMutationPerformed: false,
      crmRecordCreated: false,
      managerTaskCreated: false,
      modelCalled: false,
      businessValueAutoEstimated: false,
      employeeReportedValueIncluded: false,
      cohortMembershipMayOverlap: true,
    },
  };
}

function toLearningSample(input: OutcomeLearningInput): LearningSample | null {
  const salesTaskId = input.salesDelegation?.bossaiRunId ?? "";
  const validCurrentLineage = input.salesDelegation?.status === "completed"
    && input.lineage.status === "sales-bound"
    && input.lineage.salesTaskBoundToApproval
    && Boolean(input.lineage.ownerDecisionId)
    && Boolean(input.lineage.salesManagerTaskId)
    && input.lineage.salesManagerTaskId === salesTaskId;
  if (!validCurrentLineage) return null;

  const latest = matchingProspectOutcomeReviews(input.lineage, input.reviewJournal ?? [])[0] ?? null;
  const outcomeState = currentOutcomeState(input.reviewJournal ?? [], input.lineage);
  const ownerValue = latest?.decision === "confirm-outcome"
    && latest.businessValueAmount !== null
    && latest.businessValueCurrency
    ? { amount: latest.businessValueAmount, currency: latest.businessValueCurrency }
    : null;

  return { prospect: input.prospect, outcomeState, ownerValue };
}

function currentOutcomeState(
  reviewJournal: readonly ProspectOutcomeReviewRecord[],
  lineage: ProspectSalesAuthorizationLineage,
): ProspectOutcomeLearningOutcomeState {
  const latest = matchingProspectOutcomeReviews(lineage, reviewJournal)[0] ?? null;
  return latest?.decision === "confirm-outcome"
    ? "confirmed"
    : latest?.decision === "no-value"
      ? "no-value"
      : latest?.decision === "observe"
        ? "observing"
        : "awaiting-owner-review";
}

function buildDimension(
  key: ProspectOutcomeLearningDimension["key"],
  samples: readonly LearningSample[],
  keySelector: (sample: LearningSample) => readonly string[],
): ProspectOutcomeLearningDimension {
  const grouped = new Map<string, LearningSample[]>();
  for (const sample of samples) {
    const keys = [...new Set(keySelector(sample).map((item) => String(item || "").trim()).filter(Boolean))];
    for (const cohortKey of keys.length ? keys : ["unknown"]) {
      const items = grouped.get(cohortKey) ?? [];
      items.push(sample);
      grouped.set(cohortKey, items);
    }
  }
  const cohorts = [...grouped.entries()]
    .map(([cohortKey, cohortSamples]) => summarizeCohort(cohortKey, cohortSamples))
    .sort((left, right) => right.sampleCount - left.sampleCount || left.key.localeCompare(right.key));
  return { key, cohorts };
}

function summarizeCohort(key: string, samples: readonly LearningSample[]): ProspectOutcomeLearningCohort {
  const ownerEnteredValueByCurrency: Record<string, number> = {};
  let confirmedCount = 0;
  let noValueCount = 0;
  let observingCount = 0;
  let awaitingCount = 0;

  for (const sample of samples) {
    if (sample.outcomeState === "confirmed") confirmedCount += 1;
    else if (sample.outcomeState === "no-value") noValueCount += 1;
    else if (sample.outcomeState === "observing") observingCount += 1;
    else awaitingCount += 1;

    if (sample.ownerValue) {
      ownerEnteredValueByCurrency[sample.ownerValue.currency] = Math.round((
        (ownerEnteredValueByCurrency[sample.ownerValue.currency] ?? 0) + sample.ownerValue.amount
      ) * 100) / 100;
    }
  }

  return {
    key,
    sampleCount: samples.length,
    confirmedCount,
    noValueCount,
    observingCount,
    awaitingCount,
    ownerEnteredValueByCurrency,
    status: samples.length < OUTCOME_LEARNING_MIN_SAMPLE ? "insufficient-sample" : "descriptive",
  };
}

function discoverySourceKey(prospect: ProspectCandidate): string {
  try {
    const host = new URL(prospect.discoverySourceUrl).hostname.toLowerCase().replace(/^www\./u, "").replace(/\.$/u, "");
    if (host) return host.slice(0, 120);
  } catch {
    // Fall through to the bounded source title when the source is not an absolute URL.
  }
  const title = String(prospect.discoverySourceTitle || "").replace(/\s+/gu, " ").trim();
  return title ? title.slice(0, 120) : "unknown";
}

function membershipMatchesDimension(
  membership: ProspectOutcomeLearningMembership,
  dimension: ProspectOutcomeLearningDimensionKey,
  cohortKey: string,
): boolean {
  if (dimension === "discovery-source") return membership.cohorts.discoverySource.key === cohortKey;
  if (dimension === "website-evidence-source") return membership.cohorts.websiteEvidenceSource.key === cohortKey;
  if (dimension === "business-channel-role") return membership.cohorts.businessChannelRoles.includes(cohortKey as CompanyContactBusinessRole | "none");
  return membership.cohorts.icpLexicalCoverage.key === cohortKey;
}

function businessChannelRoleKeys(prospect: ProspectCandidate): Array<CompanyContactBusinessRole | "none"> {
  const roles = (prospect.companyContactChannels ?? []).map((channel) => channel.businessRole);
  return roles.length ? roles : ["none"];
}

function icpCoverageBucket(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return "not-configured";
  const bounded = Math.max(0, Math.min(100, Number(score)));
  if (bounded === 0) return "0";
  if (bounded <= 33) return "1-33";
  if (bounded <= 66) return "34-66";
  return "67-100";
}
