import { config } from "./config.js";
import { deterministicNarrative } from "./scoring.js";
import type { AiOpportunityNarrative, Opportunity, SavedEvidence } from "./types.js";

export async function enrichOpportunity(
  opportunity: Opportunity,
  evidence: SavedEvidence[],
): Promise<Opportunity> {
  if (!config.ai.apiKey || config.ai.provider !== "openai-compatible") return opportunity;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.ai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.ai.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
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
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI provider returned no content");
    return validateNarrative(parseJsonObject(content), opportunity, evidence);
  } finally {
    clearTimeout(timeout);
  }
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

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}
