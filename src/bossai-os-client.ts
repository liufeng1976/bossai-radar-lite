import { createHash } from "node:crypto";

export type BossAiExecutionStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type BossAiReviewStatus = "not_required" | "pending" | "approved" | "rejected" | "changes_requested";

export interface BossAiOsClientOptions {
  baseUrl: string;
  apiKey?: string;
  jwt?: string;
  model?: string;
  timeoutMs?: number;
}

export interface BossAiManagerRun {
  id: string;
  status: BossAiExecutionStatus;
  reviewStatus: BossAiReviewStatus;
  output?: string;
  editedOutput?: string;
  errorCode?: string;
  errorMessage?: string;
  requiresHumanReview: true;
  externalActionsExecuted: false;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  phase?: string;
  progress?: number | null;
}

export interface BossAiManagerSubmission {
  agent: { id: string; name?: string };
  runtime: {
    platform: "bossai-os";
    harness: "hermes";
    profile: "bossaiworkforce";
    modelGateway: "bossai-os";
    managerContract: "bossai.manager-task.v1";
  };
  run: BossAiManagerRun;
  deduplicated: boolean;
  status: BossAiExecutionStatus;
  requiresHumanReview: true;
  externalActionsExecuted: false;
}

export interface BossAiAgentInstallation {
  status: string;
  signatureStatus: string;
  healthStatus: string;
  manifest: {
    id: string;
    version: string;
    permissions: string[];
    productStatus?: {
      completionLevel?: number;
      productionReady?: boolean;
      actuallyLaunched?: boolean;
      realUserValidated?: boolean;
      formalAIEmployeeRegistered?: boolean;
    };
  };
}

interface ManagerTaskSubmissionPayload {
  schema: "bossai.manager-task.v1";
  task: {
    id: string;
    status: string;
    riskLevel: string;
    requiresApproval: boolean;
    createdAt: string;
    updatedAt: string;
  };
  routing: {
    status: string;
    agentId?: string;
  };
  executionStarted: boolean;
  offerEventId?: string;
  deduplicated?: boolean;
}

interface ManagerTaskDetailPayload {
  schema: "bossai.manager-task-detail.v1";
  phase: string;
  task: {
    id: string;
    status: string;
    riskLevel?: string;
    requiresApproval: boolean;
    errorCode?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
  };
  run?: {
    agentId?: string;
    capability?: string;
  } | null;
  progress?: {
    progress?: number;
  } | null;
  result?: {
    summary?: string;
  } | null;
  events?: unknown[];
}

export class BossAiOsClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BossAiOsClientError";
  }
}

export class BossAiOsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly jwt: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: BossAiOsClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey?.trim() || "";
    this.jwt = options.jwt?.trim() || "";
    this.model = options.model?.trim() || "bossai-balanced";
    this.timeoutMs = normalizeTimeout(options.timeoutMs);
  }

  featureConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  employeeConfigured(): boolean {
    return Boolean(this.baseUrl && this.jwt);
  }

  async chatCompletion(input: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    responseFormat?: { type: "json_object" };
  }): Promise<string> {
    if (!this.featureConfigured()) {
      throw new BossAiOsClientError(
        "BossAI Central AI Gateway API key is not configured.",
        "BOSSAI_GATEWAY_NOT_CONFIGURED",
      );
    }
    const payload = await this.requestJson<{
      choices?: Array<{ message?: { content?: string } }>;
    }>("/v1/chat/completions", {
      method: "POST",
      headers: {
        "x-bossai-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: input.temperature ?? 0.2,
        response_format: input.responseFormat,
        messages: input.messages,
      }),
    });
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new BossAiOsClientError("BossAI Central AI Gateway returned no content.", "BOSSAI_GATEWAY_EMPTY_OUTPUT");
    }
    return content;
  }

  async getAgentInstallation(agentId: string): Promise<BossAiAgentInstallation> {
    this.requireEmployeeAuth();
    const payload = unwrapData(await this.requestJson(
      `/api/agents/${encodeURIComponent(agentId)}`,
      { headers: this.employeeHeaders(false) },
    ));
    validateInstallation(payload, agentId);
    return payload as BossAiAgentInstallation;
  }

  async queueManagerTask(agentId: string, objective: string): Promise<BossAiManagerSubmission> {
    this.requireEmployeeAuth();
    const payload = unwrapData(await this.requestJson(
      "/api/manager/tasks",
      {
        method: "POST",
        headers: this.employeeHeaders(),
        body: JSON.stringify({
          objective,
          priority: "high",
          riskLevel: "L2",
          requiresApproval: true,
        }),
      },
    ));
    validateManagerSubmission(payload, agentId);
    const submission = payload as ManagerTaskSubmissionPayload;
    const run = managerSubmissionToRun(submission);
    return {
      agent: { id: agentId, name: "BossAI Intelligence Agent" },
      runtime: {
        platform: "bossai-os",
        harness: "hermes",
        profile: "bossaiworkforce",
        modelGateway: "bossai-os",
        managerContract: "bossai.manager-task.v1",
      },
      run,
      deduplicated: Boolean(submission.deduplicated),
      status: run.status,
      requiresHumanReview: true,
      externalActionsExecuted: false,
    };
  }

  async getRun(runId: string): Promise<BossAiManagerRun> {
    this.requireEmployeeAuth();
    const payload = unwrapData(await this.requestJson(
      `/api/manager/tasks/${encodeURIComponent(runId)}`,
      { headers: this.employeeHeaders(false) },
    ));
    validateManagerDetail(payload);
    return managerDetailToRun(payload as ManagerTaskDetailPayload);
  }

  async getRunEvents(runId: string): Promise<{ success: true; data: unknown[] }> {
    this.requireEmployeeAuth();
    const payload = unwrapData(await this.requestJson(
      `/api/manager/tasks/${encodeURIComponent(runId)}`,
      { headers: this.employeeHeaders(false) },
    ));
    validateManagerDetail(payload);
    const detail = payload as ManagerTaskDetailPayload;
    return { success: true, data: Array.isArray(detail.events) ? detail.events : [] };
  }

  stableOperationId(parts: string[]): string {
    const digest = createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24);
    return `radar:${digest}`;
  }

  private requireEmployeeAuth(): void {
    if (!this.employeeConfigured()) {
      throw new BossAiOsClientError(
        "BossAI OS authenticated JWT is not configured for AI employee delegation.",
        "BOSSAI_EMPLOYEE_AUTH_NOT_CONFIGURED",
      );
    }
  }

  private employeeHeaders(includeContentType = true): Record<string, string> {
    return {
      Authorization: `Bearer ${this.jwt}`,
      ...(includeContentType ? { "Content-Type": "application/json" } : {}),
    };
  }

  private async requestJson<T = unknown>(pathname: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(init.headers || {}),
        },
      });
      const body = await response.text();
      const parsed = body ? parseJson(body) : {};
      if (!response.ok) {
        const record = isRecord(parsed) ? parsed : {};
        const nested = isRecord(record.error) ? record.error : {};
        const message = stringValue(record.message)
          || stringValue(record.error)
          || stringValue(nested.message)
          || `BossAI OS returned HTTP ${response.status}.`;
        const code = stringValue(record.code)
          || stringValue(nested.code)
          || `BOSSAI_OS_HTTP_${response.status}`;
        throw new BossAiOsClientError(message, code, response.status);
      }
      return parsed as T;
    } catch (error) {
      if (error instanceof BossAiOsClientError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new BossAiOsClientError("BossAI OS request timed out.", "BOSSAI_OS_TIMEOUT");
      }
      throw new BossAiOsClientError(
        error instanceof Error ? error.message : String(error),
        "BOSSAI_OS_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function managerSubmissionToRun(value: ManagerTaskSubmissionPayload): BossAiManagerRun {
  return {
    id: value.task.id,
    status: "queued",
    reviewStatus: "pending",
    requiresHumanReview: true,
    externalActionsExecuted: false,
    createdAt: value.task.createdAt,
    updatedAt: value.task.updatedAt,
    phase: "offered",
    progress: null,
  };
}

function managerDetailToRun(value: ManagerTaskDetailPayload): BossAiManagerRun {
  const phase = String(value.phase || "created");
  const taskStatus = String(value.task.status || "pending");
  const errorCode = stringValue(value.task.errorCode);
  const status: BossAiExecutionStatus = errorCode
    ? "failed"
    : phase === "completed" || taskStatus === "done" || taskStatus === "archived"
      ? "completed"
      : phase === "rejected" || taskStatus === "rejected"
        ? "cancelled"
        : ["authorized", "running"].includes(phase) || ["approved", "in_progress"].includes(taskStatus)
          ? "running"
          : "queued";
  const reviewStatus: BossAiReviewStatus = value.task.requiresApproval !== true
    ? "not_required"
    : phase === "rejected" || taskStatus === "rejected"
      ? "rejected"
      : ["authorized", "running", "completed"].includes(phase)
          || ["approved", "in_progress", "done", "archived"].includes(taskStatus)
        ? "approved"
        : "pending";
  return {
    id: value.task.id,
    status,
    reviewStatus,
    output: stringValue(value.result?.summary) || undefined,
    errorCode: errorCode || undefined,
    errorMessage: stringValue(value.task.errorMessage) || undefined,
    requiresHumanReview: true,
    externalActionsExecuted: false,
    createdAt: value.task.createdAt,
    updatedAt: value.task.updatedAt,
    completedAt: status === "completed" ? value.task.updatedAt : undefined,
    phase,
    progress: Number.isFinite(value.progress?.progress) ? Number(value.progress?.progress) : null,
  };
}

function validateInstallation(value: unknown, agentId: string): void {
  const installation = isRecord(value) ? value : {};
  const manifest = isRecord(installation.manifest) ? installation.manifest : {};
  if (
    manifest.id !== agentId
    || typeof manifest.version !== "string"
    || !Array.isArray(manifest.permissions)
    || typeof installation.status !== "string"
    || typeof installation.signatureStatus !== "string"
    || typeof installation.healthStatus !== "string"
  ) {
    throw new BossAiOsClientError(
      "BossAI OS returned an invalid Intelligence Agent installation.",
      "BOSSAI_INTELLIGENCE_AGENT_INSTALLATION_INVALID",
    );
  }
}

function validateManagerSubmission(value: unknown, agentId: string): void {
  const submission = isRecord(value) ? value : {};
  const task = isRecord(submission.task) ? submission.task : {};
  const routing = isRecord(submission.routing) ? submission.routing : {};
  if (
    submission.schema !== "bossai.manager-task.v1"
    || typeof task.id !== "string"
    || task.requiresApproval !== true
    || routing.status !== "matched"
    || routing.agentId !== agentId
    || submission.executionStarted !== false
    || typeof submission.offerEventId !== "string"
  ) {
    throw new BossAiOsClientError(
      "BossAI Manager did not reliably route the task to the Intelligence Agent.",
      "BOSSAI_MANAGER_ROUTING_INVALID",
    );
  }
}

function validateManagerDetail(value: unknown): void {
  const detail = isRecord(value) ? value : {};
  const task = isRecord(detail.task) ? detail.task : {};
  if (
    detail.schema !== "bossai.manager-task-detail.v1"
    || typeof detail.phase !== "string"
    || typeof task.id !== "string"
    || typeof task.status !== "string"
    || typeof task.requiresApproval !== "boolean"
    || typeof task.createdAt !== "string"
    || typeof task.updatedAt !== "string"
  ) {
    throw new BossAiOsClientError(
      "BossAI Manager returned an invalid Intelligence task detail.",
      "BOSSAI_MANAGER_RUN_INVALID",
    );
  }
}

function unwrapData(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (value.success === true && "data" in value) return value.data;
  if (value.ok === true && "data" in value) return value.data;
  return value;
}

function normalizeTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return 45_000;
  return Math.max(3_000, Math.min(120_000, Number(value)));
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new BossAiOsClientError("BossAI OS returned invalid JSON.", "BOSSAI_OS_INVALID_JSON");
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
