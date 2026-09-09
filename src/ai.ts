import { BossAiOsClient } from "./bossai-os-client.js";
import { config } from "./config.js";
import { deterministicNarrative } from "./scoring.js";
import type { AiOpportunityNarrative, Opportunity, SavedEvidence } from "./types.js";

export interface ProspectQuerySuggestion {
  query: string;
  angle: string;
  rationale: string;
}

export interface ProspectQueryPlan {
  mode: "bossai-gateway" | "deterministic";
  suggestions: ProspectQuerySuggestion[];
}

const bossAiOs = new BossAiOsClient({
  baseUrl: config.bossAiOs.baseUrl,
  apiKey: config.bossAiOs.apiKey,
  model: config.bossAiOs.model,
  timeoutMs: config.bossAiOs.timeoutMs,
});

export async function planProspectQueries(goal: string): Promise<ProspectQueryPlan> {
  const deterministic = deterministicProspectQueryPlan(goal);
  if (config.ai.provider !== "bossai-gateway" || !bossAiOs.featureConfigured()) return deterministic;
  try {
    const content = await bossAiOs.chatCompletion({
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "你是 BossAI 外贸潜客搜索方向规划器。只规划公司级公开信息搜索，不执行搜索。",
            "基于老板目标生成 6 到 8 个互补查询，覆盖分销商/批发商/进口商/零售商/品牌商/行业场景等合理角度。",
            "不得生成个人姓名、个人邮箱、个人手机号，不要求登录 LinkedIn/Facebook/TikTok，不承诺购买意图、预算或成交概率。",
            "输出严格 JSON：{suggestions:[{query,angle,rationale}]}。query 适合 Web Search 和地图 Text Search，单条最多 180 字符。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            goal: normalizeProspectGoal(goal),
            ownerIcpTerms: config.radar.prospectIcpTerms.slice(0, 12),
            region: config.radar.prospectMapRegionCode || config.radar.prospectSearchCountry,
            language: config.radar.prospectMapLanguageCode || config.radar.prospectSearchLanguage,
          }),
        },
      ],
    });
    return validateProspectQueryPlan(parseJsonObject(content), deterministic);
  } catch (error) {
    console.warn("[AI] Prospect query planning failed; deterministic plan retained:", error);
    return deterministic;
  }
}

export function deterministicProspectQueryPlan(goal: string): ProspectQueryPlan {
  const normalizedGoal = normalizeProspectGoal(goal);
  const chinese = /[\p{Script=Han}]/u.test(normalizedGoal);
  const roles = chinese
    ? ["批发商", "经销商", "进口商", "零售商", "品牌商", "供应商"]
    : ["wholesaler", "distributor", "importer", "retailer", "brand", "supplier"];
  const icp = config.radar.prospectIcpTerms.slice(0, 4);
  const suggestions: ProspectQuerySuggestion[] = [];
  const seen = new Set<string>();
  const push = (query: string, angle: string, rationale: string) => {
    const clean = normalizeProspectQuery(query);
    const key = clean.toLocaleLowerCase("en-US");
    if (!clean || seen.has(key)) return;
    seen.add(key);
    suggestions.push({ query: clean, angle, rationale });
  };
  push(normalizedGoal, chinese ? "原始目标" : "base target", chinese ? "保留老板原始搜索意图" : "Preserve the owner's original search intent.");
  for (const role of roles) {
    push(`${normalizedGoal} ${role}`, role, chinese ? `从${role}角色寻找公司候选` : `Find company candidates through the ${role} role.`);
  }
  for (const term of icp) {
    if (suggestions.length >= 8) break;
    push(`${normalizedGoal} ${term}`, chinese ? `ICP：${term}` : `ICP: ${term}`, chinese ? "补充老板明确的目标客户词组" : "Add an owner-defined ICP phrase.");
  }
  return { mode: "deterministic", suggestions: suggestions.slice(0, 8) };
}

function validateProspectQueryPlan(value: unknown, fallback: ProspectQueryPlan): ProspectQueryPlan {
  if (!isRecord(value) || !Array.isArray(value.suggestions)) return fallback;
  const suggestions: ProspectQuerySuggestion[] = [];
  const seen = new Set<string>();
  for (const item of value.suggestions.slice(0, 10)) {
    if (!isRecord(item)) continue;
    const query = normalizeProspectQuery(item.query);
    if (!query || prospectQueryContainsPersonalTargeting(query)) continue;
    const key = query.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      query,
      angle: safeString(item.angle, "company discovery", 80),
      rationale: safeString(item.rationale, "Public company discovery direction.", 180),
    });
    if (suggestions.length >= 8) break;
  }
  return suggestions.length >= 3 ? { mode: "bossai-gateway", suggestions } : fallback;
}

function normalizeProspectGoal(value: string): string {
  const normalized = String(value || "").replace(/\s+/gu, " ").trim().slice(0, 400);
  return normalized || "B2B potential customers";
}

function normalizeProspectQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/gu, " ").trim().slice(0, 180);
}

function prospectQueryContainsPersonalTargeting(value: string): boolean {
  return /(?:personal email|personal phone|私人邮箱|个人邮箱|个人手机号|身份证|home address|家庭住址)/iu.test(value);
}

export async function enrichOpportunity(
  opportunity: Opportunity,
  evidence: SavedEvidence[],
): Promise<Opportunity> {
  if (config.ai.provider !== "bossai-gateway" || !bossAiOs.featureConfigured()) return opportunity;

  const related = evidence
    .filter((item) => opportunity.evidenceIds.includes(item.id))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 8);

  try {
    const narrative = await requestNarrative(opportunity, related);
    return {
      ...opportunity,
      title: narrative.title,
      summary: narrative.summary,
      targetCustomer: narrative.targetCustomer,
      problem: narrative.problem,
      priceHint: narrative.priceHint,
      mvpPlan: narrative.mvpPlan,
    };
  } catch (error) {
    console.warn("[AI] Opportunity enrichment failed; deterministic output retained:", error);
    return opportunity;
  }
}

async function requestNarrative(
  opportunity: Opportunity,
  evidence: SavedEvidence[],
): Promise<AiOpportunityNarrative> {
  const content = await bossAiOs.chatCompletion({
    temperature: 0.2,
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "你是BossAI商业情报分析员。只根据提供的公开证据，输出严格JSON。",
          "不得虚构收入、客户、预算或市场规模。不得修改系统给出的score和decision。",
          "输出字段：title, summary, targetCustomer, problem, priceHint, mvpPlan。",
          "mvpPlan必须是3到7条可执行中文步骤。summary必须明确说明证据强弱和下一步。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          authoritative: {
            category: opportunity.category,
            score: opportunity.score,
            decision: opportunity.decision,
            evidenceCount: opportunity.evidenceCount,
            sourceCount: opportunity.sourceCount,
          },
          evidence: evidence.map((item) => ({
            source: item.source,
            title: item.title,
            body: item.body.slice(0, 900),
            score: item.totalScore,
            painScore: item.painScore,
            paymentScore: item.paymentScore,
            engagement: item.engagement,
            url: item.url,
          })),
        }),
      },
    ],
  });
  return validateNarrative(parseJsonObject(content), opportunity, evidence);
}

function validateNarrative(
  value: unknown,
  opportunity: Opportunity,
  evidence: SavedEvidence[],
): AiOpportunityNarrative {
  const fallback = deterministicNarrative(opportunity.category, evidence, opportunity.decision);
  if (!isRecord(value)) return fallback;
  const mvpPlan = Array.isArray(value.mvpPlan)
    ? value.mvpPlan.filter((item): item is string => typeof item === "string" && item.trim().length > 3).slice(0, 7)
    : [];
  return {
    title: safeString(value.title, fallback.title, 80),
    summary: safeString(value.summary, fallback.summary, 500),
    targetCustomer: safeString(value.targetCustomer, fallback.targetCustomer, 160),
    problem: safeString(value.problem, fallback.problem, 320),
    priceHint: safeString(value.priceHint, fallback.priceHint, 100),
    mvpPlan: mvpPlan.length >= 3 ? mvpPlan : fallback.mvpPlan,
  };
}

function parseJsonObject(content: string): unknown {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("AI response was not valid JSON");
  }
}

function safeString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
