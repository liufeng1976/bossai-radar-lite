import { createHash } from "node:crypto";

export type BossAiExecutionStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type BossAiReviewStatus = "not_required" | "pending" | "approved" | "rejected" | "changes_requested";

export interface BossAiOsClientOptions {
  baseUrl: string;
  apiKey?: string;
  jwt?: string;
  workbenchKey?: string;
  model?: string;
  timeoutMs?: number;
}

export interface BossAiManagerOutcomeAttribution {
  schema: "bossai.manager-outcome-attribution.v1";
  taskId: string;
  resultRevision: number;
  generatedAt: string;
  authority: "bossai-os";
  kpiImpacts: Array<{
    kpiRef: string;
    label: string;
    direction: "increase" | "decrease" | "maintain";
    delta: number;
    unit: string;
    sourceRef: string;
  }>;
  businessValue: {
    valueType: "realized_revenue" | "realized_savings";
    amount: number;
    currency: string;
    method: "observed_source_system";
    sourceRef: string;
  } | null;
  evidenceRefs: string[];
  readOnly: true;
  mutationPerformed: false;
  persistedByBossAIWork: false;
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
  outcomeAttribution?: BossAiManagerOutcomeAttribution;
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
  outcomeAttribution?: unknown;
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
  private readonly workbenchKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: BossAiOsClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey?.trim() || "";
    this.jwt = options.jwt?.trim() || "";
    this.workbenchKey = options.workbenchKey?.trim() || "";
    this.model = options.model?.trim() || "bossai-balanced";
    this.timeoutMs = normalizeTimeout(options.timeoutMs);
  }

  featureConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  employeeConfigured(): boolean {
    return Boolean(this.baseUrl && this.jwt);
  }

  workbenchConfigured(): boolean {
    return Boolean(this.baseUrl && this.workbenchKey);
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
      agent: { id: agentId, name: agentDisplayName(agentId) },
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

  async ownerBusinessDecisionV2Supported(): Promise<boolean> {
    const payload = unwrapData(await this.requestJson("/health", { headers: { Accept: "application/json" } }));
    const record = isRecord(payload) ? payload : {};
    const contracts = isRecord(record.optionalContracts) ? record.optionalContracts : {};
    const declaration = isRecord(contracts.ownerBusinessDecisionsV2) ? contracts.ownerBusinessDecisionsV2 : {};
    return declaration.schemaVersion === "bossai.owner-business-decision-list.v2"
      && declaration.method === "GET"
      && declaration.path === "/api/owner/business-decisions/v2";
  }

  async listOwnerBusinessDecisionsV2(input: {
    prospectId: string;
    intelligenceManagerTaskId: string;
    limit?: number;
  }): Promise<unknown[]> {
    this.requireWorkbenchAuth();
    const prospectId = safeOpaqueToken(input.prospectId, 160, "BOSSAI_OWNER_DECISION_V2_PROSPECT_INVALID");
    const contextId = safeOpaqueToken(input.intelligenceManagerTaskId, 160, "BOSSAI_OWNER_DECISION_V2_CONTEXT_INVALID");
    const limit = Math.max(1, Math.min(20, Math.trunc(input.limit ?? 10)));
    const query = new URLSearchParams({
      domain: "sales-prospect",
      subjectType: "prospect",
      subjectId: prospectId,
      contextType: "intelligence-manager-task",
      contextId,
      limit: String(limit),
    });
    const payload = unwrapData(await this.requestJson(
      `/api/owner/business-decisions/v2?${query.toString()}`,
      { headers: this.workbenchHeaders(false) },
    ));
    const record = isRecord(payload) ? payload : {};
    if (
      record.schema !== "bossai.owner-business-decision-list.v2"
      || record.authority !== "bossai-os"
      || record.inferredDecisionsIncluded !== false
      || record.automaticExecutionAuthorized !== false
      || record.externalActionsExecuted !== false
      || !Array.isArray(record.decisions)
      || record.decisions.length > limit
    ) {
      throw new BossAiOsClientError(
        "BossAI OS returned an invalid owner business-decision v2 list.",
        "BOSSAI_OWNER_DECISION_V2_LIST_INVALID",
      );
    }
    return record.decisions;
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

  private requireWorkbenchAuth(): void {
    if (!this.workbenchConfigured()) {
      throw new BossAiOsClientError(
        "BossAI OS read-only Workbench key is not configured for owner decision projection.",
        "BOSSAI_WORKBENCH_AUTH_NOT_CONFIGURED",
      );
    }
  }

  private employeeHeaders(includeContentType = true): Record<string, string> {
    return {
      Authorization: `Bearer ${this.jwt}`,
      ...(includeContentType ? { "Content-Type": "application/json" } : {}),
    };
  }

  private workbenchHeaders(includeContentType = true): Record<string, string> {
    return {
      Authorization: `Bearer ${this.workbenchKey}`,
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
    ...(value.outcomeAttribution !== undefined
      ? { outcomeAttribution: parseManagerOutcomeAttribution(value.outcomeAttribution, value.task.id) }
      : {}),
  };
}

function parseManagerOutcomeAttribution(value: unknown, expectedTaskId: string): BossAiManagerOutcomeAttribution {
  const attribution = isRecord(value) ? value : {};
  const kpiImpacts = Array.isArray(attribution.kpiImpacts) ? attribution.kpiImpacts : [];
  const evidenceRefs = Array.isArray(attribution.evidenceRefs) ? attribution.evidenceRefs : [];
  if (
    attribution.schema !== "bossai.manager-outcome-attribution.v1"
    || attribution.authority !== "bossai-os"
    || attribution.taskId !== expectedTaskId
    || !Number.isInteger(attribution.resultRevision)
    || Number(attribution.resultRevision) < 1
    || typeof attribution.generatedAt !== "string"
    || !Number.isFinite(Date.parse(attribution.generatedAt))
    || attribution.readOnly !== true
    || attribution.mutationPerformed !== false
    || attribution.persistedByBossAIWork !== false
    || kpiImpacts.length > 8
    || evidenceRefs.length > 8
  ) {
    throw new BossAiOsClientError(
      "BossAI Manager returned an invalid outcome attribution boundary.",
      "BOSSAI_MANAGER_OUTCOME_ATTRIBUTION_INVALID",
    );
  }

  const parsedKpis = kpiImpacts.map((value) => {
    const impact = isRecord(value) ? value : {};
    const direction = stringValue(impact.direction);
    const delta = Number(impact.delta);
    const kpiRef = safeOpaqueRef(impact.kpiRef);
    const label = safePlainText(impact.label, 120);
    const unit = safePlainText(impact.unit, 24);
    const sourceRef = safeOpaqueRef(impact.sourceRef);
    if (
      !kpiRef
      || !label
      || !["increase", "decrease", "maintain"].includes(direction)
      || !Number.isFinite(delta)
      || !unit
      || !sourceRef
      || (direction === "increase" && delta < 0)
      || (direction === "decrease" && delta > 0)
      || (direction === "maintain" && delta !== 0)
    ) {
      throw new BossAiOsClientError(
        "BossAI Manager returned an invalid KPI outcome attribution.",
        "BOSSAI_MANAGER_OUTCOME_ATTRIBUTION_INVALID",
      );
    }
    return {
      kpiRef,
      label,
      direction: direction as "increase" | "decrease" | "maintain",
      delta,
      unit,
      sourceRef,
    };
  });

  let businessValue: BossAiManagerOutcomeAttribution["businessValue"] = null;
  if (attribution.businessValue !== null && attribution.businessValue !== undefined) {
    const candidate = isRecord(attribution.businessValue) ? attribution.businessValue : {};
    const valueType = stringValue(candidate.valueType);
    const amount = Number(candidate.amount);
    const currency = stringValue(candidate.currency).toUpperCase();
    const sourceRef = safeOpaqueRef(candidate.sourceRef);
    if (
      !["realized_revenue", "realized_savings"].includes(valueType)
      || !Number.isFinite(amount)
      || amount <= 0
      || !/^[A-Z]{3}$/u.test(currency)
      || candidate.method !== "observed_source_system"
      || !sourceRef
    ) {
      throw new BossAiOsClientError(
        "BossAI Manager returned an invalid realized business value attribution.",
        "BOSSAI_MANAGER_OUTCOME_ATTRIBUTION_INVALID",
      );
    }
    businessValue = {
      valueType: valueType as "realized_revenue" | "realized_savings",
      amount,
      currency,
      method: "observed_source_system",
      sourceRef,
    };
  }

  const parsedEvidenceRefs = evidenceRefs.map((value) => safeOpaqueRef(value));
  if (parsedEvidenceRefs.some((value) => !value) || new Set(parsedEvidenceRefs).size !== parsedEvidenceRefs.length) {
    throw new BossAiOsClientError(
      "BossAI Manager returned invalid outcome evidence references.",
      "BOSSAI_MANAGER_OUTCOME_ATTRIBUTION_INVALID",
    );
  }

  return {
    schema: "bossai.manager-outcome-attribution.v1",
    taskId: expectedTaskId,
    resultRevision: Number(attribution.resultRevision),
    generatedAt: attribution.generatedAt,
    authority: "bossai-os",
    kpiImpacts: parsedKpis,
    businessValue,
    evidenceRefs: parsedEvidenceRefs,
    readOnly: true,
    mutationPerformed: false,
    persistedByBossAIWork: false,
  };
}

function safePlainText(value: unknown, maximum: number): string {
  const normalized = stringValue(value);
  if (!normalized || normalized.length > maximum || /\u0000|[\r\n]/u.test(normalized)) return "";
  return normalized;
}

function safeOpaqueRef(value: unknown): string {
  const normalized = safePlainText(value, 160);
  if (!normalized || /\\|\/|\.\./u.test(normalized) || /^[A-Za-z]:/u.test(normalized)) return "";
  return normalized;
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
      `BossAI OS returned an invalid Agent installation for ${agentId}.`,
      "BOSSAI_AGENT_INSTALLATION_INVALID",
    );
  }
}

function agentDisplayName(agentId: string): string {
  if (agentId === "bossai-intelligence-agent") return "BossAI Intelligence Agent";
  if (agentId === "bossai-sales-agent") return "BossAI Sales Agent";
  return agentId;
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

function safeOpaqueToken(value: unknown, maximum: number, code: string): string {
  const normalized = stringValue(value);
  if (!normalized || normalized.length > maximum || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) {
    throw new BossAiOsClientError("BossAI OS authority reference is invalid.", code, 400);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
