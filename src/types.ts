export type SourceName = "reddit" | "hackernews" | "github" | "arxiv" | "rss" | "website";
export type Decision = "BUILD" | "SELL_SERVICE" | "WATCH" | "IGNORE";
export type BriefTier = "MUST_READ" | "QUICK_SCAN" | "SKIP";
export type ScanTrigger = "manual" | "startup" | "scheduled" | "demo";

export interface RedditCommunityRule {
  shortName: string;
  description: string;
}

export interface RedditPinnedPost {
  title: string;
  url: string;
}

export interface RedditCommunityContext {
  schema: "bossai.reddit-community-context.v1";
  community: string;
  status: "available" | "unavailable";
  aboutStatus: "available" | "unavailable";
  rulesStatus: "available" | "unavailable";
  pinnedPostsStatus: "available" | "unavailable";
  aboutUrl: string;
  rulesUrl: string;
  description: string;
  rules: RedditCommunityRule[];
  pinnedPosts: RedditPinnedPost[];
  fetchedAt: string;
}

export type CompanyContactChannelType =
  | "email"
  | "phone"
  | "contact-page"
  | "contact-form"
  | "whatsapp-business"
  | "linkedin-company"
  | "company-profile";

export type CompanyContactBusinessRole =
  | "general"
  | "sales"
  | "export"
  | "wholesale"
  | "support"
  | "procurement"
  | "business-development"
  | "unknown";

export type CompanyContactSourceKind =
  | "mailto"
  | "visible-text"
  | "tel"
  | "contact-link"
  | "contact-form"
  | "jsonld-organization"
  | "jsonld-contact-point"
  | "official-site-link";

export type CompanyContactConfidence = "high" | "medium";
export type CompanyContactVerificationStatus = "official-site-observed" | "official-site-structured";

export interface CompanyContactChannel {
  type: CompanyContactChannelType;
  value: string;
  url?: string;
  sourcePageUrl: string;
  sourceKind: CompanyContactSourceKind;
  businessRole: CompanyContactBusinessRole;
  /** Evidence confidence that this is a public company-level business channel; never buyer intent. */
  confidence: CompanyContactConfidence;
  verificationStatus: CompanyContactVerificationStatus;
}

export type WebsiteEvidenceAcquisitionMode = "static-http" | "browser-rendered";
export type WebsiteRenderingHint =
  | "static-sufficient"
  | "javascript-likely"
  | "browser-rendered-sufficient"
  | "browser-rendered-incomplete";

export interface BusinessWebsiteContext {
  schema: "bossai.business-website-context.v1";
  rootUrl: string;
  pageUrl: string;
  companyName: string;
  description: string;
  publicEmails: string[];
  publicPhones: string[];
  contactUrls: string[];
  officialProfileUrls?: string[];
  publicMessagingUrls?: string[];
  companyContactChannels?: CompanyContactChannel[];
  productSignals: string[];
  robotsUrl: string;
  robotsPolicy: "allowed" | "disallowed" | "unavailable";
  renderingHint?: WebsiteRenderingHint;
  acquisitionMode?: WebsiteEvidenceAcquisitionMode;
  browserEvidenceRequestId?: string;
  intelligenceImport?: {
    schema: "bossai.intelligence-evidence-import-context.v1";
    producer: "bossai-intelligence-agent";
    contract: "bossai.intelligence-evidence-import.v1";
    taskId: string;
    operationId: string;
    provider: string;
    operation: string;
    requestId: string;
    providerJobId: string;
    sourceContentTrust: "untrusted-public-evidence";
    instructionAuthority: "none";
    toolAuthority: "none";
    approvalAuthority: "none";
    promptInjectionSignals: string[];
  };
  depth: number;
  crawledAt: string;
}

export type SourceContext = RedditCommunityContext | BusinessWebsiteContext;

export type ProspectStatus = "DISCOVERED" | "REVIEW_REQUIRED" | "READY_FOR_SALES" | "REJECTED";

export type ProspectWebsiteEvidenceStatus = "unverified" | "verified" | "static-incomplete";
export type ProspectWebsiteEvidenceSource = "static-http" | "browser-rendered";

export type ProspectBrowserEvidenceRequestStatus =
  | "pending"
  | "completed-upgraded"
  | "completed-incomplete"
  | "rejected";

export type ProspectBrowserEvidenceSourceKind = "owner-controlled-browser";

export interface ProspectBrowserEvidenceRequest {
  schema: "bossai.prospect-browser-evidence-request.v1";
  id: string;
  prospectId: string;
  targetUrl: string;
  status: ProspectBrowserEvidenceRequestStatus;
  requestedAt: string;
  updatedAt: string;
  submittedAt: string;
  sourceKind: ProspectBrowserEvidenceSourceKind | "";
  sourceReference: string;
  pageUrl: string;
  evidenceContext?: BusinessWebsiteContext;
}

export interface ProspectDiscoveryCandidate {
  id: string;
  domain: string;
  websiteUrl: string;
  companyName: string;
  description: string;
  discoverySourceUrl: string;
  discoverySourceTitle: string;
  discoveryQuery: string;
  publicEmails: string[];
  publicPhones: string[];
  contactUrls: string[];
  officialProfileUrls?: string[];
  publicMessagingUrls?: string[];
  companyContactChannels?: CompanyContactChannel[];
  productSignals: string[];
  evidenceUrls: string[];
  websiteEvidenceStatus?: ProspectWebsiteEvidenceStatus;
  websiteEvidenceSource?: ProspectWebsiteEvidenceSource;
  websiteVerifiedAt?: string;
  score: number;
  reasons: string[];
  fitScore?: number | null;
  fitTerms?: string[];
  fitMatches?: string[];
  discoveredAt: string;
}

export interface ProspectCandidate extends ProspectDiscoveryCandidate {
  status: ProspectStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export type ProspectAccountReviewStage =
  | "rejected"
  | "verify-website"
  | "browser-evidence"
  | "intelligence-review"
  | "owner-decision"
  | "sales-authorization"
  | "sales-qualification"
  | "sales-result-review";

export type ProspectAccountReviewStepStatus = "complete" | "current" | "blocked" | "pending" | "not-applicable";

export type ProspectOwnerAttention = "decision-required" | "execution-exception" | "result-review" | "action-ready" | "waiting" | "closed";
export type ProspectOwnerHandlingPriority =
  | "P0_OWNER_DECISION"
  | "P1_EXECUTION_EXCEPTION"
  | "P1_RESULT_REVIEW"
  | "P2_EVIDENCE_RECOVERY"
  | "P3_NEXT_STEP_READY"
  | "P4_WAITING_ON_EMPLOYEE"
  | "P5_CLOSED";

export type ProspectAccountReviewActionKind =
  | "verify-website"
  | "request-browser-evidence"
  | "delegate-intelligence"
  | "retry-intelligence"
  | "refresh-intelligence"
  | "review-intelligence-result"
  | "approve-sales"
  | "reconfirm-sales-authorization"
  | "reject-prospect"
  | "qualify-sales"
  | "retry-sales"
  | "refresh-sales"
  | "review-sales-result"
  | "review-outcome";

export type ProspectOwnerDecisionKind = "approve-sales" | "reject-prospect";
export type ProspectOwnerDecisionReasonCode =
  | "intelligence-ready"
  | "evidence-sufficient"
  | "fit-reviewed"
  | "low-fit"
  | "evidence-insufficient"
  | "wrong-company"
  | "unsuitable-market"
  | "duplicate"
  | "owner-judgment"
  | "other";

export interface ProspectOwnerDecisionSnapshot {
  schema: "bossai.prospect-owner-decision-snapshot.v1";
  generatedAt: string;
  accountReviewStage: ProspectAccountReviewStage;
  prospectStatusBefore: ProspectStatus;
  websiteEvidenceStatus: ProspectWebsiteEvidenceStatus;
  websiteEvidenceSource: ProspectWebsiteEvidenceSource;
  evidenceCompleted: number;
  evidenceTotal: number;
  businessChannelCount: number;
  linkedTradeRecordCount: number;
  tradeReviewPriority: TradeReviewPriority | null;
  candidateScore: number;
  intelligenceManagerTaskId: string;
  intelligenceStatus: BossAiExecutionStatus | "not-started";
  salesManagerTaskId: string;
  salesStatus: BossAiExecutionStatus | "not-started";
  blockers: ProspectAccountReview["blockers"];
}

export interface ProspectOwnerDecisionRecord {
  schema: "bossai.prospect-owner-decision.v1";
  id: string;
  prospectId: string;
  decision: ProspectOwnerDecisionKind;
  reasonCode: ProspectOwnerDecisionReasonCode;
  note: string;
  actorType: "owner-admin";
  previousStatus: ProspectStatus;
  targetStatus: "READY_FOR_SALES" | "REJECTED";
  decidedAt: string;
  snapshot: ProspectOwnerDecisionSnapshot;
  truthBoundary: {
    decisionIsSalesProbability: false;
    purchaseIntentInferred: false;
    closeProbabilityInferred: false;
    nextPurchaseDatePredicted: false;
    crmRecordCreated: false;
    outreachExecuted: false;
  };
}

export type ProspectSalesAuthorizationStatus =
  | "not-applicable"
  | "missing-owner-approval"
  | "intelligence-mismatch"
  | "approved"
  | "sales-bound"
  | "sales-unbound-legacy"
  | "sales-lineage-mismatch";

export interface ProspectSalesAuthorizationLineage {
  schema: "bossai.prospect-sales-authorization-lineage.v1";
  status: ProspectSalesAuthorizationStatus;
  ownerDecisionId: string;
  ownerDecisionAt: string;
  ownerDecisionReasonCode: ProspectOwnerDecisionReasonCode | "";
  intelligenceManagerTaskId: string;
  decisionIntelligenceManagerTaskId: string;
  salesManagerTaskId: string;
  salesDelegationOwnerDecisionId: string;
  validForSalesQualification: boolean;
  salesTaskBoundToApproval: boolean;
  requiresOwnerReconfirmation: boolean;
  truthBoundary: {
    authorizesSalesQualificationOnly: true;
    outreachAuthorized: false;
    crmWriteAuthorized: false;
    purchaseIntentInferred: false;
    closeProbabilityInferred: false;
    nextPurchaseDatePredicted: false;
  };
}

export type ProspectSalesQualificationDisposition =
  | "qualification-allowed"
  | "blocked-browser-evidence"
  | "blocked-verified-website"
  | "unstructured";

export type ProspectSalesQualificationFieldKey = "real-need" | "buyer-authority" | "timing" | "budget";
export type ProspectSalesQualificationFieldState = "unknown" | "reported-evidence" | "not-structured";

export interface ProspectSalesQualificationField {
  key: ProspectSalesQualificationFieldKey;
  state: ProspectSalesQualificationFieldState;
  reportedValue: string;
  source: "sales-manager-result";
}

export type ProspectOutcomeEvidenceState = "UNKNOWN" | "REPORTED" | "OBSERVED" | "CONFIRMED";
export type ProspectOutcomeReviewDecision = "confirm-outcome" | "no-value" | "observe";
export type ProspectOutcomeAttributionStatus =
  | "not-ready"
  | "awaiting-owner-review"
  | "confirmed-outcome"
  | "no-value"
  | "observing";

export interface ProspectOutcomeReviewSnapshot {
  schema: "bossai.prospect-outcome-review-snapshot.v1";
  generatedAt: string;
  intelligenceManagerTaskId: string;
  ownerDecisionId: string;
  salesManagerTaskId: string;
  salesDisposition: ProspectSalesQualificationDisposition;
  salesReportedWebsiteEvidenceStatus: ProspectWebsiteEvidenceStatus | "not-structured";
  qualificationStates: Record<ProspectSalesQualificationFieldKey, ProspectSalesQualificationFieldState>;
  employeeReportedValueClaim: string;
}

export interface ProspectOutcomeReviewRecord {
  schema: "bossai.prospect-outcome-review.v1";
  id: string;
  prospectId: string;
  salesManagerTaskId: string;
  ownerDecisionId: string;
  decision: ProspectOutcomeReviewDecision;
  evidenceState: "OBSERVED" | "CONFIRMED";
  summary: string;
  businessValueAmount: number | null;
  businessValueCurrency: string;
  businessValueBasis: "owner-entered" | "none";
  actorType: "owner-admin";
  reviewedAt: string;
  snapshot: ProspectOutcomeReviewSnapshot;
  truthBoundary: {
    salesCompletionIsRevenue: false;
    qualificationIsRevenue: false;
    employeeReportedValueIsConfirmed: false;
    businessValueAutoEstimated: false;
    purchaseIntentInferred: false;
    closeProbabilityInferred: false;
    nextPurchaseDatePredicted: false;
    crmRecordCreated: false;
    outreachExecuted: false;
  };
}

export interface ProspectOutcomeAttribution {
  schema: "bossai.prospect-outcome-attribution.v1";
  prospectId: string;
  generatedAt: string;
  status: ProspectOutcomeAttributionStatus;
  lineage: {
    intelligenceManagerTaskId: string;
    ownerDecisionId: string;
    salesManagerTaskId: string;
    valid: boolean;
  };
  salesResultEvidence: {
    state: ProspectOutcomeEvidenceState;
    sourceAuthority: "bossai-manager";
    disposition: ProspectSalesQualificationDisposition | "not-ready";
    employeeReportedValueClaim: string;
  };
  ownerReview: ProspectOutcomeReviewRecord | null;
  businessValue: {
    amount: number;
    currency: string;
    basis: "owner-entered";
  } | null;
  reviewHistory: ProspectOutcomeReviewRecord[];
  truthBoundary: {
    salesCompletionIsRevenue: false;
    qualificationIsRevenue: false;
    employeeReportedValueIsConfirmed: false;
    businessValueAutoEstimated: false;
    purchaseIntentInferred: false;
    closeProbabilityInferred: false;
    nextPurchaseDatePredicted: false;
    crmRecordCreated: false;
    outreachExecuted: false;
  };
}

export interface ProspectOutcomePortfolioSummary {
  schema: "bossai.prospect-outcome-portfolio.v1";
  generatedAt: string;
  completedSalesTasks: number;
  confirmedOutcomes: number;
  awaitingOwnerReview: number;
  observing: number;
  noValue: number;
  unclosed: number;
  ownerEnteredValueByCurrency: Record<string, number>;
  truthBoundary: {
    salesCompletionIsRevenue: false;
    qualificationIsRevenue: false;
    portfolioValueIsAutoEstimated: false;
    employeeReportedValueIncluded: false;
    purchaseIntentInferred: false;
    closeProbabilityInferred: false;
    crmRecordCreated: false;
    outreachExecuted: false;
  };
}

export type ProspectOutcomeLearningStatus = "descriptive" | "insufficient-sample";
export type ProspectOutcomeLearningOutcomeState = "confirmed" | "no-value" | "observing" | "awaiting-owner-review";
export type ProspectOutcomeLearningDimensionKey =
  | "discovery-source"
  | "website-evidence-source"
  | "business-channel-role"
  | "icp-lexical-coverage";

export interface ProspectOutcomeLearningCohort {
  key: string;
  sampleCount: number;
  confirmedCount: number;
  noValueCount: number;
  observingCount: number;
  awaitingCount: number;
  ownerEnteredValueByCurrency: Record<string, number>;
  status: ProspectOutcomeLearningStatus;
}

export interface ProspectOutcomeLearningDimension {
  key: ProspectOutcomeLearningDimensionKey;
  cohorts: ProspectOutcomeLearningCohort[];
}

export interface ProspectOutcomeLearningDrilldownItem {
  prospectId: string;
  companyName: string;
  domain: string;
  contributionState: ProspectOutcomeLearningOutcomeState;
}

export interface ProspectOutcomeLearningDrilldown {
  schema: "bossai.prospect-outcome-learning-drilldown.v1";
  generatedAt: string;
  dimension: ProspectOutcomeLearningDimensionKey;
  cohortKey: string;
  outcomeStateFilter: ProspectOutcomeLearningOutcomeState | null;
  cohortSampleCount: number;
  sampleCount: number;
  items: ProspectOutcomeLearningDrilldownItem[];
  truthBoundary: {
    currentEligibleSamplesOnly: true;
    alphabeticalOrderingOnly: true;
    rankingPerformed: false;
    causalityInferred: false;
    closeProbabilityInferred: false;
    purchaseIntentInferred: false;
    nextPurchaseDatePredicted: false;
    businessValueIncluded: false;
    ownerReviewNoteIncluded: false;
    scoreMutationPerformed: false;
    managerTaskCreated: false;
    modelCalled: false;
    crmRecordCreated: false;
  };
}

export interface ProspectOutcomeLearningMembership {
  schema: "bossai.prospect-outcome-learning-membership.v1";
  prospectId: string;
  eligible: boolean;
  sampleContributionState: ProspectOutcomeLearningOutcomeState | "excluded";
  eligibilityReason:
    | "current-sales-lineage-completed"
    | "sales-not-completed"
    | "authorization-lineage-invalid"
    | "sales-task-lineage-mismatch";
  cohorts: {
    discoverySource: {
      key: string;
      sourceUrl: string;
      sourceTitle: string;
    };
    websiteEvidenceSource: {
      key: ProspectWebsiteEvidenceSource;
      evidenceStatus: ProspectWebsiteEvidenceStatus;
    };
    businessChannelRoles: Array<CompanyContactBusinessRole | "none">;
    icpLexicalCoverage: {
      key: string;
      score: number | null;
      matchedCount: number;
      termCount: number;
    };
  };
  truthBoundary: {
    cohortMembershipIsNotRanking: true;
    historicalDescriptionOnly: true;
    causalityInferred: false;
    closeProbabilityInferred: false;
    purchaseIntentInferred: false;
    nextPurchaseDatePredicted: false;
    scoreMutationPerformed: false;
    modelCalled: false;
  };
}

export interface ProspectOutcomeLearning {
  schema: "bossai.prospect-outcome-learning.v1";
  generatedAt: string;
  status: ProspectOutcomeLearningStatus;
  minimumSampleSize: number;
  sampleCount: number;
  dimensions: ProspectOutcomeLearningDimension[];
  truthBoundary: {
    historicalDescriptionOnly: true;
    causalityInferred: false;
    closeProbabilityInferred: false;
    purchaseIntentInferred: false;
    nextPurchaseDatePredicted: false;
    scoreMutationPerformed: false;
    crmRecordCreated: false;
    managerTaskCreated: false;
    modelCalled: false;
    businessValueAutoEstimated: false;
    employeeReportedValueIncluded: false;
    cohortMembershipMayOverlap: true;
  };
}

export interface ProspectSalesHandoffBrief {
  schema: "bossai.prospect-sales-handoff-brief.v1";
  prospectId: string;
  generatedAt: string;
  managerTaskId: string;
  managerStatus: BossAiExecutionStatus;
  managerReviewStatus: BossAiReviewStatus;
  managerUpdatedAt: string;
  sourceAuthority: "bossai-manager";
  artifactDescriptorId: "sales.lead-qualification.md";
  disposition: ProspectSalesQualificationDisposition;
  dispositionMarker: string;
  sourceReportedWebsiteEvidence: {
    status: ProspectWebsiteEvidenceStatus | "not-structured";
    source: ProspectWebsiteEvidenceSource | "not-structured";
  };
  currentWebsiteEvidence: {
    status: ProspectWebsiteEvidenceStatus;
    source: ProspectWebsiteEvidenceSource;
  };
  qualificationFields: ProspectSalesQualificationField[];
  ownerApproval: { id: string; reasonCode: string; note: string; decidedAt: string } | null;
  nextOwnerAction: "review-result" | "recover-browser-evidence" | "verify-website" | "decide-outreach-separately";
  authoritativeOutput: string;
  truthBoundary: {
    handoffBriefIsOwnerApproval: false;
    qualificationIsCloseProbability: false;
    outreachAuthorized: false;
    crmWriteAuthorized: false;
    purchaseIntentInferred: false;
    closeProbabilityInferred: false;
    nextPurchaseDatePredicted: false;
    crmRecordCreated: false;
    outreachExecuted: false;
  };
}

export interface ProspectAccountReview {
  schema: "bossai.prospect-account-review.v1";
  prospectId: string;
  generatedAt: string;
  stage: ProspectAccountReviewStage;
  prospectStatus: ProspectStatus;
  company: {
    name: string;
    domain: string;
    websiteUrl: string;
    description: string;
    productSignals: string[];
    discoverySourceUrl: string;
    evidenceUrls: string[];
    candidateScore: number;
    firstSeenAt: string;
    lastSeenAt: string;
    icpFitScore: number | null;
    icpFitMatches: string[];
    icpFitTerms: string[];
  };
  websiteEvidence: {
    status: ProspectWebsiteEvidenceStatus;
    source: ProspectWebsiteEvidenceSource;
    verifiedAt: string;
    latestBrowserRequest: Pick<ProspectBrowserEvidenceRequest, "id" | "status" | "requestedAt" | "updatedAt" | "submittedAt" | "pageUrl"> | null;
  };
  businessChannels: {
    total: number;
    roles: CompanyContactBusinessRole[];
    channels: CompanyContactChannel[];
  };
  tradeHistory: {
    recordCount: number;
    firstTradeDate: string;
    latestTradeDate: string;
    daysSinceLatestTrade: number | null;
    historicalCadence: TradeHistoricalCadence;
    reviewPriority: TradeReviewPriority | null;
    countries: string[];
    roles: TradeRecordRole[];
    hsCodes: string[];
    productDescriptions: string[];
    amountByCurrency: Record<string, number>;
    records: TradeRecord[];
  };
  workflow: {
    intelligence: BossAiDelegation | null;
    sales: BossAiDelegation | null;
    salesAuthorization: ProspectSalesAuthorizationLineage;
    steps: Array<{
      id: "discovery" | "website" | "browser-evidence" | "intelligence" | "owner-decision" | "sales";
      status: ProspectAccountReviewStepStatus;
    }>;
  };
  evidenceChecklist: {
    completed: number;
    total: number;
    items: Array<{
      id: "official-website" | "company-offering" | "business-channel" | "historical-trade" | "intelligence-review" | "sales-qualification";
      complete: boolean;
    }>;
  };
  qualificationUnknowns: Array<"buyer-authority" | "real-need" | "timing" | "budget">;
  blockers: Array<
    | "website-unverified"
    | "browser-evidence-required"
    | "intelligence-not-completed"
    | "intelligence-execution-failed"
    | "intelligence-execution-cancelled"
    | "owner-sales-decision-required"
    | "sales-owner-approval-lineage-required"
    | "sales-qualification-not-completed"
    | "sales-execution-failed"
    | "sales-execution-cancelled"
    | "prospect-rejected"
  >;
  actions: ProspectAccountReviewActionKind[];
  ownerDecisionJournal: ProspectOwnerDecisionRecord[];
  outcomeReview: {
    status: ProspectOutcomeAttributionStatus;
    currentSalesManagerTaskId: string;
    currentOwnerDecisionId: string;
    latestReview: ProspectOutcomeReviewRecord | null;
  };
  outcomeLearningMembership: ProspectOutcomeLearningMembership;
  truthBoundary: {
    purchaseIntentInferred: false;
    closeProbabilityInferred: false;
    nextPurchaseDatePredicted: false;
    crmRecordCreated: false;
    outreachExecuted: false;
  };
}

export interface ProspectOwnerReviewQueueItem {
  prospectId: string;
  companyName: string;
  domain: string;
  stage: ProspectAccountReviewStage;
  prospectStatus: ProspectStatus;
  attention: ProspectOwnerAttention;
  handlingPriority: ProspectOwnerHandlingPriority;
  handlingOrder: number;
  ownerDecisionRequired: boolean;
  ownerActionRequired: boolean;
  waitingOnEmployee: boolean;
  evidenceCompleted: number;
  evidenceTotal: number;
  primaryAction: ProspectAccountReviewActionKind | null;
  blockers: ProspectAccountReview["blockers"];
  executionException: {
    employee: "intelligence" | "sales";
    status: "failed" | "cancelled";
    runId: string;
    errorCode: string;
    errorMessage: string;
    retryAction: "retry-intelligence" | "retry-sales";
  } | null;
  candidateScore: number;
  tradeReviewPriority: TradeReviewPriority | null;
  latestObservedAt: string;
}

export interface ProspectOwnerReviewQueue {
  schema: "bossai.prospect-owner-review-queue.v1";
  generatedAt: string;
  items: ProspectOwnerReviewQueueItem[];
  summary: {
    total: number;
    ownerDecisionRequired: number;
    executionExceptions: number;
    resultReviewRequired: number;
    actionReady: number;
    waitingOnEmployee: number;
    closed: number;
    byHandlingPriority: Record<ProspectOwnerHandlingPriority, number>;
  };
  truthBoundary: {
    handlingPriorityIsSalesProbability: false;
    automaticRetryExecuted: false;
    purchaseIntentInferred: false;
    closeProbabilityInferred: false;
    nextPurchaseDatePredicted: false;
    crmRecordCreated: false;
    outreachExecuted: false;
  };
}

export interface ProspectDiscoveryChannelStatus {
  channel: "directory" | "web" | "maps";
  status: "success" | "partial" | "failed" | "skipped";
  candidateCount: number;
  errorCount: number;
  durationMs: number;
}

export interface ProspectDiscoveryOutcome {
  status: "success" | "partial" | "failed" | "skipped";
  candidates: ProspectDiscoveryCandidate[];
  errors: string[];
  durationMs: number;
  channels?: ProspectDiscoveryChannelStatus[];
}

export type TradeRecordRole = "buyer" | "importer" | "supplier" | "exporter" | "unknown";

export interface TradeRecord {
  id: string;
  fingerprint: string;
  companyName: string;
  role: TradeRecordRole;
  country: string;
  productDescription: string;
  hsCode: string;
  tradeDate: string;
  quantity: string;
  amount: number | null;
  currency: string;
  websiteUrl: string;
  sourceLabel: string;
  sourceRow: number;
  importedAt: string;
}

export interface TradeRecordImportResult {
  headers: string[];
  mapping: Record<string, string>;
  records: TradeRecord[];
  rejectedRows: number;
  warnings: string[];
}

export interface TradeRecordFilters {
  query?: string;
  country?: string;
  hsCode?: string;
  role?: TradeRecordRole;
  dateFrom?: string;
  dateTo?: string;
}

export type TradeHistoricalCadence = "insufficient" | "single-gap" | "regular" | "variable";
export type TradeReviewPriority = "REVIEW_FIRST" | "REVIEW_SOON" | "REVIEW_LATER";

export interface TradeCompanySummary {
  companyName: string;
  recordCount: number;
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
  websiteUrl: string;
  websiteCount: number;
  countries: string[];
  roles: TradeRecordRole[];
  hsCodes: string[];
  productCount: number;
  amountByCurrency: Record<string, number>;
}

export interface RawItem {
  source: SourceName;
  externalId: string;
  title: string;
  body: string;
  url: string;
  author: string;
  publishedAt: string;
  engagement: number;
  query: string;
  community?: string;
  sourceContext?: RedditCommunityContext;
  websiteContext?: BusinessWebsiteContext;
  isDemo?: boolean;
}

export interface ScoredEvidence extends RawItem {
  isDemo: boolean;
  fingerprint: string;
  painScore: number;
  paymentScore: number;
  competitionScore: number;
  urgencyScore: number;
  totalScore: number;
  category: string;
  tags: string[];
}

export interface SavedEvidence extends ScoredEvidence {
  id: number;
  isDemo: boolean;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  category: string;
  title: string;
  summary: string;
  targetCustomer: string;
  problem: string;
  evidenceCount: number;
  sourceCount: number;
  avgEvidenceScore: number;
  score: number;
  decision: Decision;
  priceHint: string;
  mvpPlan: string[];
  evidenceIds: number[];
  isDemo: boolean;
  createdAt: string;
}

export interface BriefItem extends ScoredEvidence {
  tier: BriefTier;
  reason: string;
}

export interface DailyBrief {
  generatedAt: string;
  mustRead: BriefItem[];
  quickScan: BriefItem[];
  skip: BriefItem[];
  contentIdeas: string[];
  counts: Record<BriefTier, number>;
}

export interface SourceOutcome {
  source: SourceName;
  status: "success" | "partial" | "failed" | "skipped";
  items: RawItem[];
  error?: string;
  durationMs: number;
}

export interface ScanRunSummary {
  id: number;
  trigger: ScanTrigger;
  status: "running" | "success" | "partial" | "failed";
  startedAt: string;
  finishedAt?: string;
  collectedCount: number;
  evidenceCount: number;
  opportunityCount: number;
  errors: string[];
}

export interface Report {
  id: number;
  runId: number;
  generatedAt: string;
  executiveSummary: string;
  markdown: string;
  brief: DailyBrief | null;
  markdownEnglish: string | null;
  briefEnglish: DailyBrief | null;
}

export interface AiOpportunityNarrative {
  title: string;
  summary: string;
  targetCustomer: string;
  problem: string;
  priceHint: string;
  mvpPlan: string[];
}

export type BossAiExecutionStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type BossAiReviewStatus = "not_required" | "pending" | "approved" | "rejected" | "changes_requested";

export interface BossAiDelegation {
  id: number;
  sourceType: "opportunity" | "prospect" | "prospect-sales";
  sourceRecordId: string;
  sourceOperationId: string;
  bossaiRunId: string;
  bossaiAgentId: string;
  status: BossAiExecutionStatus;
  reviewStatus: BossAiReviewStatus;
  submittedAt: string;
  updatedAt: string;
  resultImportedAt: string | null;
  errorCode: string;
  errorMessage: string;
  ownerDecisionId?: string;
}

export type LeadIntent = "commercial" | "pro-waitlist" | "white-label" | "managed-service";
export type LeadStatus = "NEW" | "WAITLIST" | "QUALIFIED" | "CONTACTED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
export type LeadPriority = "HOT" | "WARM" | "COOL";
export type LeadActivityType = "NOTE" | "EMAIL" | "CALL" | "MEETING" | "QUOTE" | "STATUS";

export interface LeadInput {
  intent: LeadIntent;
  name: string;
  company?: string;
  contact: string;
  teamSize: string;
  timeline: string;
  deployment: string;
  budget: string;
  scenario: string;
  requirements?: string;
  language: "zh" | "en";
  consent: boolean;
  website?: string;
}

export interface Lead {
  id: string;
  intent: LeadIntent;
  name: string;
  company: string;
  contact: string;
  teamSize: string;
  timeline: string;
  deployment: string;
  budget: string;
  scenario: string;
  requirements: string;
  language: "zh" | "en";
  source: string;
  status: LeadStatus;
  priority: LeadPriority;
  score: number;
  owner: string;
  quoteAmount: number | null;
  quoteCurrency: string;
  nextFollowUpAt: string | null;
  consentAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: number;
  leadId: string;
  type: LeadActivityType;
  content: string;
  createdAt: string;
}

export interface LeadStats {
  total: number;
  active: number;
  won: number;
  lost: number;
  waitlist: number;
  hot: number;
  quotedValue: number;
  wonValue: number;
  quotedByCurrency: Record<string, number>;
  wonByCurrency: Record<string, number>;
  byStatus: Record<LeadStatus, number>;
  byIntent: Record<LeadIntent, number>;
}

export type FollowUpBucket = "OVERDUE" | "TODAY" | "UPCOMING" | "UNSCHEDULED";

export interface FollowUpDraft {
  language: "zh" | "en";
  subject: string;
  message: string;
  recommendedAction: string;
  suggestedStatus: LeadStatus;
  suggestedFollowUpAt: string;
}

export interface FollowUpItem {
  lead: Lead;
  bucket: FollowUpBucket;
  dueAt: string | null;
  daysDelta: number | null;
  urgencyScore: number;
  reason: string;
  recommendedAction: string;
  draft: FollowUpDraft;
}

export interface FollowUpStats {
  total: number;
  overdue: number;
  today: number;
  upcoming: number;
  unscheduled: number;
  hot: number;
}

export interface FollowUpQueue {
  generatedAt: string;
  windowDays: number;
  stats: FollowUpStats;
  items: FollowUpItem[];
}
