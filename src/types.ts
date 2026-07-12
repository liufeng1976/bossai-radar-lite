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
