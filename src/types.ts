export type SourceName = "reddit" | "hackernews" | "github";
export type Decision = "BUILD" | "SELL_SERVICE" | "WATCH" | "IGNORE";
export type ScanTrigger = "manual" | "startup" | "scheduled" | "demo";

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
}

export interface AiOpportunityNarrative {
  title: string;
  summary: string;
  targetCustomer: string;
  problem: string;
  priceHint: string;
  mvpPlan: string[];
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
