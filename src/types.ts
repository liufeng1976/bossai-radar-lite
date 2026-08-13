export type SourceName = "reddit" | "hackernews" | "github" | "arxiv" | "rss";
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
  sourceType: "opportunity";
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
