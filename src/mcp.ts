import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { APP_NAME, APP_VERSION } from "./version.js";
import { RadarApiClient, RadarApiError, type LeadPatch, type RadarClient } from "./radar-api-client.js";
import type { LeadActivityType, LeadIntent, LeadPriority, LeadStatus } from "./types.js";

export interface RadarMcpOptions {
  allowScan?: boolean;
  allowLeadWrite?: boolean;
  defaultLanguage?: "zh" | "en";
}

const leadStatuses = ["NEW", "WAITLIST", "QUALIFIED", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
const leadPriorities = ["HOT", "WARM", "COOL"] as const;
const leadIntents = ["commercial", "pro-waitlist", "white-label", "managed-service"] as const;
const activityTypes = ["NOTE", "EMAIL", "CALL", "MEETING", "QUOTE", "STATUS"] as const;

export function createRadarMcpServer(
  client: RadarClient = new RadarApiClient(),
  options: RadarMcpOptions = {},
): McpServer {
  const allowScan = options.allowScan ?? boolFromEnv("RADAR_MCP_ALLOW_SCAN", false);
  const allowLeadWrite = options.allowLeadWrite ?? boolFromEnv("RADAR_MCP_ALLOW_LEAD_WRITE", false);
  const defaultLanguage = options.defaultLanguage ?? languageFromEnv();
  const server = new McpServer({
    name: "bossai-radar-lite",
    version: APP_VERSION,
    title: "BossAI Radar Lite MCP",
    description: "Business opportunity intelligence, commercial lead pipeline, and human-reviewed follow-up tools.",
  });

  server.registerTool("radar_health", {
    title: "Radar Health",
    description: "Check whether BossAI Radar Lite is reachable and return its version and scan status.",
    annotations: readOnlyAnnotations(),
  }, async () => toolCall("Radar health", () => client.health()));

  server.registerTool("radar_overview", {
    title: "Radar CEO Overview",
    description: "Read the current Radar statistics, scheduler state, latest scan, source health, and executive report summary.",
    annotations: readOnlyAnnotations(),
  }, async () => toolCall("Radar overview", () => client.overview()));

  server.registerTool("radar_list_opportunities", {
    title: "List Business Opportunities",
    description: "List scored opportunities ordered by priority. Use this before deciding what product or service to build.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(200).default(20).describe("Maximum number of opportunities"),
    }),
    annotations: readOnlyAnnotations(),
  }, async ({ limit }) => toolCall("Business opportunities", () => client.listOpportunities(limit)));

  server.registerTool("radar_list_evidence", {
    title: "List Opportunity Evidence",
    description: "Read high-value public evidence with source links and deterministic scores. Optionally filter by category.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(500).default(30),
      category: z.string().trim().min(1).max(80).optional(),
    }),
    annotations: readOnlyAnnotations(),
  }, async ({ limit, category }) => toolCall("Opportunity evidence", () => client.listEvidence(limit, category)));

  server.registerTool("radar_latest_report", {
    title: "Get Latest Radar Report",
    description: "Download the latest CEO opportunity report in Chinese or English Markdown.",
    inputSchema: z.object({
      language: z.enum(["zh", "en"]).default(defaultLanguage),
    }),
    annotations: readOnlyAnnotations(),
  }, async ({ language }) => toolCall("Latest Radar report", () => client.latestReport(language), { rawText: true }));

  server.registerTool("radar_lead_stats", {
    title: "Commercial Lead Statistics",
    description: "Read the commercial lead funnel, HOT lead count, and quote/won totals separated by currency.",
    annotations: adminReadAnnotations(),
  }, async () => toolCall("Commercial lead statistics", () => client.leadStats()));

  server.registerTool("radar_list_leads", {
    title: "List Commercial Leads",
    description: "List and filter commercial-license, Pro waitlist, white-label, and managed-service leads.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(500).default(50),
      status: z.enum(leadStatuses).optional(),
      intent: z.enum(leadIntents).optional(),
      priority: z.enum(leadPriorities).optional(),
      query: z.string().trim().max(160).optional(),
    }),
    annotations: adminReadAnnotations(),
  }, async ({ limit, status, intent, priority, query }) => toolCall(
    "Commercial leads",
    () => client.listLeads({
      limit,
      status: status as LeadStatus | undefined,
      intent: intent as LeadIntent | undefined,
      priority: priority as LeadPriority | undefined,
      query,
    }),
  ));

  server.registerTool("radar_followups", {
    title: "Daily Follow-Up Queue",
    description: "Get OVERDUE, TODAY, UNSCHEDULED, and UPCOMING sales follow-ups, ordered by urgency. Customer drafts remain human-reviewed.",
    inputSchema: z.object({
      language: z.enum(["zh", "en"]).default(defaultLanguage).describe("Language for administrative reasons and actions"),
      days: z.number().int().min(1).max(60).default(7),
      includeUnscheduled: z.boolean().default(true),
    }),
    annotations: adminReadAnnotations(),
  }, async ({ language, days, includeUnscheduled }) => toolCall(
    "Daily follow-up queue",
    () => client.followups(language, days, includeUnscheduled),
  ));

  server.registerTool("radar_followup_draft", {
    title: "Generate Lead Follow-Up Draft",
    description: "Generate a personalized human-reviewed customer message, recommended action, next stage, and next follow-up date for one lead.",
    inputSchema: z.object({
      leadId: z.string().trim().min(1).max(120),
      language: z.enum(["zh", "en"]).optional().describe("Override customer draft language; omit to use the lead language"),
    }),
    annotations: adminReadAnnotations(),
  }, async ({ leadId, language }) => toolCall("Lead follow-up draft", () => client.followupDraft(leadId, language)));

  if (allowScan) {
    server.registerTool("radar_run_scan", {
      title: "Run Live Radar Scan",
      description: "Run a live public-source scan and generate a new report. This changes the local Radar database and can make network/API calls.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }, async () => toolCall("Live Radar scan", () => client.runScan()));
  }

  if (allowLeadWrite) {
    server.registerTool("radar_update_lead", {
      title: "Update Commercial Lead",
      description: "Update a lead stage, priority, owner, quote, currency, or next follow-up. Human approval should be obtained before changing deal state.",
      inputSchema: z.object({
        leadId: z.string().trim().min(1).max(120),
        status: z.enum(leadStatuses).optional(),
        priority: z.enum(leadPriorities).optional(),
        owner: z.string().trim().max(120).optional(),
        quoteAmount: z.number().nonnegative().nullable().optional(),
        quoteCurrency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
        nextFollowUpAt: z.string().datetime().nullable().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    }, async ({ leadId, ...values }) => {
      const patch = stripUndefined(values) as LeadPatch;
      return toolCall("Updated commercial lead", () => client.updateLead(leadId, patch));
    });

    server.registerTool("radar_add_lead_activity", {
      title: "Record Lead Activity",
      description: "Append a human-reviewed call, email, meeting, quote, status, or note activity to a commercial lead.",
      inputSchema: z.object({
        leadId: z.string().trim().min(1).max(120),
        type: z.enum(activityTypes),
        content: z.string().trim().min(2).max(4_000),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    }, async ({ leadId, type, content }) => toolCall(
      "Recorded lead activity",
      () => client.addLeadActivity(leadId, type as LeadActivityType, content),
    ));
  }

  server.registerPrompt("radar_daily_brief", {
    title: "BossAI Radar Daily Brief",
    description: "Prepare a CEO-level daily opportunity and commercial follow-up brief using Radar tools.",
    argsSchema: {
      language: z.enum(["zh", "en"]).default(defaultLanguage),
      focus: z.string().trim().max(240).optional(),
    },
  }, ({ language, focus }) => ({
    description: "Use Radar data to produce an evidence-grounded daily executive brief.",
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: language === "en"
          ? `Use radar_overview, radar_list_opportunities, and radar_followups to prepare today's CEO brief. Separate verified evidence from inference, rank the top three actions, and never send customer messages automatically.${focus ? ` Focus: ${focus}` : ""}`
          : `使用 radar_overview、radar_list_opportunities 和 radar_followups 生成今天的 CEO 简报。明确区分公开证据与推断，给出前三项行动，绝不自动向客户发送消息。${focus ? `重点：${focus}` : ""}`,
      },
    }],
  }));

  server.registerPrompt("radar_opportunity_to_mvp", {
    title: "Opportunity to MVP",
    description: "Turn a high-scoring Radar opportunity into an evidence-grounded seven-day MVP plan.",
    argsSchema: {
      language: z.enum(["zh", "en"]).default(defaultLanguage),
      opportunityId: z.string().trim().min(1).max(120),
    },
  }, ({ language, opportunityId }) => ({
    description: "Create an MVP plan without inventing market proof.",
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: language === "en"
          ? `Find opportunity ${opportunityId} with radar_list_opportunities, inspect its evidence with radar_list_evidence, then produce a seven-day MVP and first-sale plan. Do not invent customers, revenue, budgets, or market size.`
          : `使用 radar_list_opportunities 找到机会 ${opportunityId}，再用 radar_list_evidence 核对证据，输出 7 天 MVP 与首单验证方案。不得虚构客户、收入、预算或市场规模。`,
      },
    }],
  }));

  return server;
}

async function toolCall<T>(
  title: string,
  operation: () => Promise<T>,
  options: { rawText?: boolean } = {},
) {
  try {
    const data = await operation();
    const text = options.rawText && typeof data === "string"
      ? data
      : `${title}\n${JSON.stringify(data, null, 2)}`;
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: typeof data === "object" && data !== null ? { data } : { text: data },
    };
  } catch (error) {
    const detail = error instanceof RadarApiError
      ? { message: error.message, status: error.status, code: error.code }
      : { message: error instanceof Error ? error.message : String(error) };
    return {
      isError: true,
      content: [{ type: "text" as const, text: `${title} failed: ${detail.message}` }],
      structuredContent: { error: detail },
    };
  }
}

function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  } as const;
}

function adminReadAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  } as const;
}

function languageFromEnv(): "zh" | "en" {
  return process.env.RADAR_MCP_LANGUAGE?.trim().toLowerCase() === "en" ? "en" : "zh";
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

export const RADAR_MCP_CAPABILITIES = {
  name: APP_NAME,
  version: APP_VERSION,
  defaultTools: [
    "radar_health",
    "radar_overview",
    "radar_list_opportunities",
    "radar_list_evidence",
    "radar_latest_report",
    "radar_lead_stats",
    "radar_list_leads",
    "radar_followups",
    "radar_followup_draft",
  ],
  optionalTools: {
    scan: ["radar_run_scan"],
    leadWrite: ["radar_update_lead", "radar_add_lead_activity"],
  },
} as const;
