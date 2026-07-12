import type { LeadInput, LeadIntent, LeadPriority, LeadStatus } from "./types.js";

const INTENTS = new Set<LeadIntent>(["commercial", "pro-waitlist", "white-label", "managed-service"]);
const TEAM_SIZES = new Set(["1", "2-5", "6-20", "21-100", "100+"]);
const TIMELINES = new Set(["now", "30-days", "1-3-months", "later", "research"]);
const DEPLOYMENTS = new Set(["local", "intranet", "own-cloud", "bossai-managed", "unknown"]);
const BUDGETS = new Set(["unknown", "under-1000", "1000-5000", "5000-20000", "20000+"]);

export interface ValidatedLeadInput extends LeadInput {
  company: string;
  requirements: string;
  source: string;
  score: number;
  priority: LeadPriority;
  initialStatus: LeadStatus;
}

export class LeadValidationError extends Error {
  constructor(public readonly fields: Record<string, string>) {
    super("Lead application validation failed");
    this.name = "LeadValidationError";
  }
}

export function validateLeadInput(value: unknown, source = "commercial-page"): ValidatedLeadInput {
  const input = isRecord(value) ? value : {};
  const fields: Record<string, string> = {};

  const intent = cleanEnum(input.intent, INTENTS);
  const name = cleanText(input.name, 60);
  const company = cleanText(input.company, 100);
  const contact = cleanText(input.contact, 120);
  const teamSize = cleanEnum(input.teamSize, TEAM_SIZES);
  const timeline = cleanEnum(input.timeline, TIMELINES);
  const deployment = cleanEnum(input.deployment, DEPLOYMENTS);
  const budget = cleanEnum(input.budget, BUDGETS);
  const scenario = cleanText(input.scenario, 1_200);
  const requirements = cleanText(input.requirements, 1_000);
  const language = input.language === "en" ? "en" : "zh";
  const consent = input.consent === true;
  const website = cleanText(input.website, 200);

  if (!intent) fields.intent = "INVALID_INTENT";
  if (name.length < 2) fields.name = "NAME_TOO_SHORT";
  if (contact.length < 5) fields.contact = "CONTACT_REQUIRED";
  if (!teamSize) fields.teamSize = "INVALID_TEAM_SIZE";
  if (!timeline) fields.timeline = "INVALID_TIMELINE";
  if (!deployment) fields.deployment = "INVALID_DEPLOYMENT";
  if (!budget) fields.budget = "INVALID_BUDGET";
  if (scenario.length < 20) fields.scenario = "SCENARIO_TOO_SHORT";
  if (!consent) fields.consent = "CONSENT_REQUIRED";
  if (website) fields.website = "SPAM_DETECTED";

  if (Object.keys(fields).length) throw new LeadValidationError(fields);

  const normalized: LeadInput = {
    intent: intent!,
    name,
    company,
    contact,
    teamSize: teamSize!,
    timeline: timeline!,
    deployment: deployment!,
    budget: budget!,
    scenario,
    requirements,
    language,
    consent,
    website: "",
  };
  const score = scoreLead(normalized);
  return {
    ...normalized,
    company,
    requirements,
    source: cleanText(source, 80) || "commercial-page",
    score,
    priority: priorityForScore(score),
    initialStatus: intent === "pro-waitlist" ? "WAITLIST" : "NEW",
  };
}

export function scoreLead(input: LeadInput): number {
  let score = 10;

  score += ({
    commercial: 16,
    "pro-waitlist": 5,
    "white-label": 24,
    "managed-service": 22,
  } satisfies Record<LeadIntent, number>)[input.intent] ?? 0;

  score += ({
    "1": 2,
    "2-5": 6,
    "6-20": 11,
    "21-100": 16,
    "100+": 20,
  } as Record<string, number>)[input.teamSize] ?? 0;

  score += ({
    now: 18,
    "30-days": 14,
    "1-3-months": 9,
    later: 4,
    research: 0,
  } as Record<string, number>)[input.timeline] ?? 0;

  score += ({
    "20000+": 22,
    "5000-20000": 16,
    "1000-5000": 9,
    "under-1000": 3,
    unknown: 0,
  } as Record<string, number>)[input.budget] ?? 0;

  if (input.deployment === "bossai-managed") score += 10;
  if (input.deployment === "intranet" || input.deployment === "own-cloud") score += 6;
  if ((input.requirements || "").trim().length >= 80) score += 5;
  if (input.scenario.trim().length >= 180) score += 5;

  return Math.max(0, Math.min(100, score));
}

export function priorityForScore(score: number): LeadPriority {
  if (score >= 70) return "HOT";
  if (score >= 45) return "WARM";
  return "COOL";
}

export function normalizeLeadPatch(value: unknown): {
  status?: LeadStatus;
  priority?: LeadPriority;
  owner?: string;
  quoteAmount?: number | null;
  quoteCurrency?: string;
  nextFollowUpAt?: string | null;
} {
  const input = isRecord(value) ? value : {};
  const result: {
    status?: LeadStatus;
    priority?: LeadPriority;
    owner?: string;
    quoteAmount?: number | null;
    quoteCurrency?: string;
    nextFollowUpAt?: string | null;
  } = {};

  if (input.status !== undefined) {
    const statuses = new Set<LeadStatus>(["NEW", "WAITLIST", "QUALIFIED", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]);
    const status = typeof input.status === "string" && statuses.has(input.status as LeadStatus)
      ? input.status as LeadStatus
      : null;
    if (!status) throw new LeadValidationError({ status: "INVALID_STATUS" });
    result.status = status;
  }
  if (input.priority !== undefined) {
    const priorities = new Set<LeadPriority>(["HOT", "WARM", "COOL"]);
    const priority = typeof input.priority === "string" && priorities.has(input.priority as LeadPriority)
      ? input.priority as LeadPriority
      : null;
    if (!priority) throw new LeadValidationError({ priority: "INVALID_PRIORITY" });
    result.priority = priority;
  }
  if (input.owner !== undefined) result.owner = cleanText(input.owner, 80);
  if (input.quoteAmount !== undefined) {
    if (input.quoteAmount === null || input.quoteAmount === "") result.quoteAmount = null;
    else {
      const amount = Number(input.quoteAmount);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
        throw new LeadValidationError({ quoteAmount: "INVALID_QUOTE_AMOUNT" });
      }
      result.quoteAmount = Math.round(amount * 100) / 100;
    }
  }
  if (input.quoteCurrency !== undefined) {
    const currency = cleanText(input.quoteCurrency, 8).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new LeadValidationError({ quoteCurrency: "INVALID_CURRENCY" });
    result.quoteCurrency = currency;
  }
  if (input.nextFollowUpAt !== undefined) {
    if (input.nextFollowUpAt === null || input.nextFollowUpAt === "") result.nextFollowUpAt = null;
    else {
      const date = new Date(String(input.nextFollowUpAt));
      if (Number.isNaN(date.getTime())) throw new LeadValidationError({ nextFollowUpAt: "INVALID_DATE" });
      result.nextFollowUpAt = date.toISOString();
    }
  }
  return result;
}

export function normalizeActivityInput(value: unknown): { type: "NOTE" | "EMAIL" | "CALL" | "MEETING" | "QUOTE" | "STATUS"; content: string } {
  const input = isRecord(value) ? value : {};
  const allowed = new Set(["NOTE", "EMAIL", "CALL", "MEETING", "QUOTE", "STATUS"]);
  const type = typeof input.type === "string" && allowed.has(input.type) ? input.type as "NOTE" | "EMAIL" | "CALL" | "MEETING" | "QUOTE" | "STATUS" : null;
  const content = cleanText(input.content, 2_000);
  const fields: Record<string, string> = {};
  if (!type) fields.type = "INVALID_ACTIVITY_TYPE";
  if (content.length < 2) fields.content = "CONTENT_REQUIRED";
  if (Object.keys(fields).length) throw new LeadValidationError(fields);
  return { type: type!, content };
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .trim()
    .slice(0, maxLength);
}

function cleanEnum<T extends string>(value: unknown, allowed: Set<T>): T | null {
  return typeof value === "string" && allowed.has(value as T) ? value as T : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
