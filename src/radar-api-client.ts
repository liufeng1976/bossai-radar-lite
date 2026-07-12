import type {
  FollowUpDraft,
  FollowUpQueue,
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadIntent,
  LeadPriority,
  LeadStats,
  LeadStatus,
  Opportunity,
  Report,
  SavedEvidence,
  ScanRunSummary,
  SourceOutcome,
} from "./types.js";

export interface RadarApiClientOptions {
  baseUrl?: string;
  adminApiKey?: string;
  timeoutMs?: number;
}

export interface RadarHealth {
  ok: boolean;
  service: string;
  version: string;
  time: string;
  running: boolean;
  license?: string;
}

export interface RadarOverview {
  stats: {
    runs: number;
    evidence: number;
    opportunities: number;
    reports: number;
    sources: number;
  };
  config: Record<string, unknown>;
  running: boolean;
  scheduler: Record<string, unknown>;
  sourceStatus: SourceOutcome[];
  latestRun: ScanRunSummary | null;
  latestReport: Report | null;
}

export interface RadarScanResult {
  run: ScanRunSummary;
  report: Report | null;
  opportunities: Opportunity[];
  sources: SourceOutcome[];
}

export interface LeadListFilters {
  limit?: number;
  status?: LeadStatus;
  intent?: LeadIntent;
  priority?: LeadPriority;
  query?: string;
}

export interface LeadPatch {
  status?: LeadStatus;
  priority?: LeadPriority;
  owner?: string;
  quoteAmount?: number | null;
  quoteCurrency?: string;
  nextFollowUpAt?: string | null;
}

export class RadarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "RadarApiError";
  }
}

export interface RadarClient {
  health(): Promise<RadarHealth>;
  overview(): Promise<RadarOverview>;
  listOpportunities(limit?: number): Promise<Opportunity[]>;
  listEvidence(limit?: number, category?: string): Promise<SavedEvidence[]>;
  latestReport(language?: "zh" | "en"): Promise<string>;
  runScan(): Promise<RadarScanResult>;
  leadStats(): Promise<LeadStats>;
  listLeads(filters?: LeadListFilters): Promise<Lead[]>;
  getLead(id: string): Promise<{ lead: Lead; activities: LeadActivity[] }>;
  followups(language?: "zh" | "en", days?: number, includeUnscheduled?: boolean): Promise<FollowUpQueue>;
  followupDraft(id: string, language?: "zh" | "en"): Promise<FollowUpDraft>;
  updateLead(id: string, patch: LeadPatch): Promise<{ lead: Lead; activities: LeadActivity[] }>;
  addLeadActivity(id: string, type: LeadActivityType, content: string): Promise<{ activity: LeadActivity; lead: Lead | null }>;
}

export class RadarApiClient implements RadarClient {
  readonly baseUrl: string;
  readonly adminApiKey: string;
  readonly timeoutMs: number;

  constructor(options: RadarApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || process.env.RADAR_API_URL || "http://127.0.0.1:3080");
    this.adminApiKey = options.adminApiKey ?? process.env.RADAR_ADMIN_API_KEY?.trim() ?? "";
    this.timeoutMs = normalizeInt(options.timeoutMs ?? Number(process.env.RADAR_MCP_TIMEOUT_MS), 20_000, 1_000, 120_000);
  }

  health(): Promise<RadarHealth> {
    return this.requestJson<RadarHealth>("/api/health");
  }

  overview(): Promise<RadarOverview> {
    return this.requestJson<RadarOverview>("/api/overview");
  }

  listOpportunities(limit = 20): Promise<Opportunity[]> {
    return this.requestJson<{ items: Opportunity[] }>(`/api/opportunities?limit=${normalizeInt(limit, 20, 1, 200)}`)
      .then((payload) => payload.items);
  }

  listEvidence(limit = 30, category?: string): Promise<SavedEvidence[]> {
    const params = new URLSearchParams({ limit: String(normalizeInt(limit, 30, 1, 500)) });
    if (category?.trim()) params.set("category", category.trim());
    return this.requestJson<{ items: SavedEvidence[] }>(`/api/evidence?${params.toString()}`)
      .then((payload) => payload.items);
  }

  latestReport(language: "zh" | "en" = "zh"): Promise<string> {
    return this.requestText(`/api/report/latest.md?lang=${language}`);
  }

  runScan(): Promise<RadarScanResult> {
    return this.requestJson<RadarScanResult>("/api/scan", { method: "POST", admin: true });
  }

  leadStats(): Promise<LeadStats> {
    return this.requestJson<LeadStats>("/api/admin/leads/stats", { admin: true });
  }

  listLeads(filters: LeadListFilters = {}): Promise<Lead[]> {
    const params = new URLSearchParams({ limit: String(normalizeInt(filters.limit, 50, 1, 500)) });
    if (filters.status) params.set("status", filters.status);
    if (filters.intent) params.set("intent", filters.intent);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.query?.trim()) params.set("q", filters.query.trim());
    return this.requestJson<{ items: Lead[] }>(`/api/admin/leads?${params.toString()}`, { admin: true })
      .then((payload) => payload.items);
  }

  getLead(id: string): Promise<{ lead: Lead; activities: LeadActivity[] }> {
    return this.requestJson<{ lead: Lead; activities: LeadActivity[] }>(`/api/admin/leads/${encodeURIComponent(requireId(id))}`, { admin: true });
  }

  followups(
    language: "zh" | "en" = "zh",
    days = 7,
    includeUnscheduled = true,
  ): Promise<FollowUpQueue> {
    const params = new URLSearchParams({
      lang: language,
      days: String(normalizeInt(days, 7, 1, 60)),
      includeUnscheduled: String(includeUnscheduled),
    });
    return this.requestJson<FollowUpQueue>(`/api/admin/followups?${params.toString()}`, { admin: true });
  }

  followupDraft(id: string, language?: "zh" | "en"): Promise<FollowUpDraft> {
    const params = new URLSearchParams();
    if (language) params.set("lang", language);
    const suffix = params.size ? `?${params.toString()}` : "";
    return this.requestJson<FollowUpDraft>(`/api/admin/leads/${encodeURIComponent(requireId(id))}/followup-draft${suffix}`, { admin: true });
  }

  updateLead(id: string, patch: LeadPatch): Promise<{ lead: Lead; activities: LeadActivity[] }> {
    if (!Object.keys(patch).length) throw new Error("At least one lead field must be supplied");
    return this.requestJson<{ lead: Lead; activities: LeadActivity[] }>(`/api/admin/leads/${encodeURIComponent(requireId(id))}`, {
      method: "PATCH",
      admin: true,
      body: patch,
    });
  }

  addLeadActivity(id: string, type: LeadActivityType, content: string): Promise<{ activity: LeadActivity; lead: Lead | null }> {
    const normalized = content.trim();
    if (normalized.length < 2) throw new Error("Activity content must contain at least 2 characters");
    return this.requestJson<{ activity: LeadActivity; lead: Lead | null }>(`/api/admin/leads/${encodeURIComponent(requireId(id))}/activities`, {
      method: "POST",
      admin: true,
      body: { type, content: normalized },
    });
  }

  private async requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.request(path, options);
    try {
      return await response.json() as T;
    } catch (error) {
      throw new RadarApiError("Radar returned an invalid JSON response", response.status, undefined, error);
    }
  }

  private async requestText(path: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.request(path, options);
    return response.text();
  }

  private async request(path: string, options: RequestOptions): Promise<Response> {
    if (options.admin && !this.adminApiKey && !isLoopbackUrl(this.baseUrl)) {
      throw new RadarApiError(
        "RADAR_ADMIN_API_KEY is required for administrator endpoints on a non-loopback Radar URL",
        401,
        "RADAR_ADMIN_KEY_REQUIRED",
      );
    }
    const headers: Record<string, string> = {
      Accept: options.accept || "application/json",
    };
    if (this.adminApiKey) headers["x-radar-key"] = this.adminApiKey;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new RadarApiError(
        `Could not reach BossAI Radar at ${this.baseUrl}: ${detail}`,
        503,
        "RADAR_UNREACHABLE",
        error,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      let payload: { error?: string; code?: string } | undefined;
      try {
        payload = JSON.parse(text) as { error?: string; code?: string };
      } catch {
        payload = undefined;
      }
      throw new RadarApiError(
        payload?.error || text || `Radar returned HTTP ${response.status}`,
        response.status,
        payload?.code,
        payload ?? text,
      );
    }
    return response;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  admin?: boolean;
  body?: unknown;
  accept?: string;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("RADAR_API_URL must use http or https");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function isLoopbackUrl(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
}

function requireId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Lead id is required");
  return normalized;
}

function normalizeInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value as number)));
}
