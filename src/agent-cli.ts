import "./local-env.js";
import { RadarApiClient, RadarApiError, type LeadPatch } from "./radar-api-client.js";
import type { LeadActivityType, LeadIntent, LeadPriority, LeadStatus } from "./types.js";

const client = new RadarApiClient();
const { command, options } = parseArgs(process.argv.slice(2));

try {
  const result = await runCommand(command, options);
  process.stdout.write(`${JSON.stringify({ ok: true, command, data: result }, null, 2)}\n`);
} catch (error) {
  const detail = error instanceof RadarApiError
    ? { message: error.message, status: error.status, code: error.code }
    : { message: error instanceof Error ? error.message : String(error) };
  process.stderr.write(`${JSON.stringify({ ok: false, command, error: detail }, null, 2)}\n`);
  process.exitCode = 1;
}

async function runCommand(name: string, args: Record<string, string | boolean>) {
  switch (name) {
    case "health":
      return client.health();
    case "overview":
      return client.overview();
    case "opportunities":
      return client.listOpportunities(intOption(args.limit, 20, 1, 200));
    case "evidence":
      return client.listEvidence(intOption(args.limit, 30, 1, 500), stringOption(args.category));
    case "report":
      return { markdown: await client.latestReport(languageOption(args.lang)) };
    case "lead-stats":
      return client.leadStats();
    case "leads":
      return client.listLeads({
        limit: intOption(args.limit, 50, 1, 500),
        status: enumOption(args.status, ["NEW", "WAITLIST", "QUALIFIED", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const) as LeadStatus | undefined,
        intent: enumOption(args.intent, ["commercial", "pro-waitlist", "white-label", "managed-service"] as const) as LeadIntent | undefined,
        priority: enumOption(args.priority, ["HOT", "WARM", "COOL"] as const) as LeadPriority | undefined,
        query: stringOption(args.query),
      });
    case "followups":
      return client.followups(
        languageOption(args.lang),
        intOption(args.days, 7, 1, 60),
        booleanOption(args["include-unscheduled"], true),
      );
    case "draft":
      return client.followupDraft(requiredOption(args, "lead-id"), optionalLanguage(args.lang));
    case "scan":
      requirePermission("RADAR_SKILL_ALLOW_SCAN", "Live scanning is disabled for the agent CLI");
      return client.runScan();
    case "update-lead": {
      requirePermission("RADAR_SKILL_ALLOW_LEAD_WRITE", "Lead updates are disabled for the agent CLI");
      const patch: LeadPatch = {
        status: enumOption(args.status, ["NEW", "WAITLIST", "QUALIFIED", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const) as LeadStatus | undefined,
        priority: enumOption(args.priority, ["HOT", "WARM", "COOL"] as const) as LeadPriority | undefined,
        owner: stringOption(args.owner),
        quoteAmount: nullableNumberOption(args["quote-amount"]),
        quoteCurrency: normalizeCurrency(stringOption(args.currency)),
        nextFollowUpAt: nullableDateOption(args["follow-up-at"]),
      };
      return client.updateLead(requiredOption(args, "lead-id"), stripUndefined(patch));
    }
    case "add-activity":
      requirePermission("RADAR_SKILL_ALLOW_LEAD_WRITE", "Lead activity writes are disabled for the agent CLI");
      return client.addLeadActivity(
        requiredOption(args, "lead-id"),
        enumOption(args.type, ["NOTE", "EMAIL", "CALL", "MEETING", "QUOTE", "STATUS"] as const, true) as LeadActivityType,
        requiredOption(args, "content"),
      );
    case "help":
    case "":
      return { usage: usage() };
    default:
      throw new Error(`Unknown command: ${name}\n${usage()}`);
  }
}

function parseArgs(argv: string[]): { command: string; options: Record<string, string | boolean> } {
  const [command = "help", ...rest] = argv;
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] || "";
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const raw = token.slice(2);
    const equalsIndex = raw.indexOf("=");
    if (equalsIndex >= 0) {
      options[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      options[raw] = next;
      index += 1;
    } else {
      options[raw] = true;
    }
  }
  return { command, options };
}

function usage(): string {
  return [
    "BossAI Radar Agent CLI",
    "",
    "Read-only commands:",
    "  health",
    "  overview",
    "  opportunities [--limit 20]",
    "  evidence [--limit 30] [--category customer-support]",
    "  report [--lang zh|en]",
    "  lead-stats",
    "  leads [--status NEW] [--intent commercial] [--priority HOT] [--query text]",
    "  followups [--lang zh|en] [--days 7] [--include-unscheduled true|false]",
    "  draft --lead-id <id> [--lang zh|en]",
    "",
    "Optional write commands:",
    "  scan                                  requires RADAR_SKILL_ALLOW_SCAN=true",
    "  update-lead --lead-id <id> [...]      requires RADAR_SKILL_ALLOW_LEAD_WRITE=true",
    "  add-activity --lead-id <id> --type CALL --content <text>",
    "",
    "Environment:",
    "  RADAR_API_URL=http://127.0.0.1:3080",
    "  RADAR_ADMIN_API_KEY=<admin key>",
  ].join("\n");
}

function requiredOption(args: Record<string, string | boolean>, name: string): string {
  const value = stringOption(args[name]);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function stringOption(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function intOption(value: string | boolean | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(stringOption(value) || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function booleanOption(value: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function languageOption(value: string | boolean | undefined): "zh" | "en" {
  return optionalLanguage(value) || (process.env.RADAR_MCP_LANGUAGE?.trim().toLowerCase() === "en" ? "en" : "zh");
}

function optionalLanguage(value: string | boolean | undefined): "zh" | "en" | undefined {
  const normalized = stringOption(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "zh" || normalized === "en") return normalized;
  throw new Error(`Invalid language: ${normalized}`);
}

function enumOption<T extends readonly string[]>(
  value: string | boolean | undefined,
  allowed: T,
  required = false,
): T[number] | undefined {
  const normalized = stringOption(value);
  if (!normalized) {
    if (required) throw new Error(`A value is required; allowed values: ${allowed.join(", ")}`);
    return undefined;
  }
  if (!(allowed as readonly string[]).includes(normalized)) throw new Error(`Invalid value ${normalized}; allowed values: ${allowed.join(", ")}`);
  return normalized as T[number];
}

function nullableNumberOption(value: string | boolean | undefined): number | null | undefined {
  const normalized = stringOption(value);
  if (!normalized) return undefined;
  if (normalized.toLowerCase() === "null") return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid non-negative number: ${normalized}`);
  return parsed;
}

function nullableDateOption(value: string | boolean | undefined): string | null | undefined {
  const normalized = stringOption(value);
  if (!normalized) return undefined;
  if (normalized.toLowerCase() === "null") return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${normalized}`);
  return date.toISOString();
}

function normalizeCurrency(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be a three-letter ISO-style code");
  return normalized;
}

function requirePermission(name: string, message: string): void {
  const value = process.env[name]?.trim().toLowerCase();
  if (!["1", "true", "yes", "on"].includes(value || "")) throw new Error(`${message}. Set ${name}=true explicitly.`);
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
