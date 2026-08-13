import type { BriefItem, BriefTier, DailyBrief, Opportunity, ScoredEvidence } from "./types.js";

const MUST_READ_LIMIT = 8;
const QUICK_SCAN_LIMIT = 15;
const SKIP_LIMIT = 8;

export type BriefLanguage = "zh" | "en";

export interface DailyBriefOptions {
  language?: BriefLanguage;
  localizeEvidenceTitle?: (item: ScoredEvidence) => string;
  localizeOpportunityTitle?: (opportunity: Opportunity) => string;
}

export function classifyBriefTier(item: ScoredEvidence): BriefTier {
  if (
    item.totalScore >= 45 ||
    item.paymentScore >= 14 ||
    item.urgencyScore >= 10 ||
    (item.painScore >= 18 && item.totalScore >= 35)
  ) {
    return "MUST_READ";
  }
  if (item.totalScore >= 22 || item.engagement >= 20) return "QUICK_SCAN";
  return "SKIP";
}

export function buildDailyBrief(
  items: ScoredEvidence[],
  opportunities: Opportunity[],
  options: DailyBriefOptions = {},
): DailyBrief {
  const language = options.language ?? "zh";
  const ranked = [...items]
    .map((item) => toBriefItem(item, language, options.localizeEvidenceTitle))
    .sort((a, b) => b.totalScore - a.totalScore || b.engagement - a.engagement);

  const allMustRead = ranked.filter((item) => item.tier === "MUST_READ");
  const allQuickScan = ranked.filter((item) => item.tier === "QUICK_SCAN");
  const allSkip = ranked.filter((item) => item.tier === "SKIP");

  return {
    generatedAt: new Date().toISOString(),
    mustRead: allMustRead.slice(0, MUST_READ_LIMIT),
    quickScan: allQuickScan.slice(0, QUICK_SCAN_LIMIT),
    skip: allSkip.slice(0, SKIP_LIMIT),
    contentIdeas: buildContentIdeas(
      allMustRead,
      allQuickScan,
      opportunities,
      language,
      options.localizeOpportunityTitle,
    ),
    counts: {
      MUST_READ: allMustRead.length,
      QUICK_SCAN: allQuickScan.length,
      SKIP: allSkip.length,
    },
  };
}

export function renderDailyBriefMarkdown(brief: DailyBrief, language: BriefLanguage = "zh"): string {
  if (language === "en") return renderEnglishDailyBriefMarkdown(brief);
  return `## 今日信息分级

- 必读：${brief.counts.MUST_READ} 条
- 速览：${brief.counts.QUICK_SCAN} 条
- 可跳过：${brief.counts.SKIP} 条

### 必读

${renderItems(brief.mustRead, "本轮没有达到必读门槛的信息。")}

### 速览

${renderItems(brief.quickScan, "本轮没有需要速览的信息。")}

### 可跳过

${renderItems(brief.skip, "本轮没有明确可跳过的信息。")}

### 可直接转化的内容选题

${brief.contentIdeas.length > 0 ? brief.contentIdeas.map((idea) => `- ${idea}`).join("\n") : "- 暂无，建议扩大主题或信息源范围。"}
`;
}

function renderEnglishDailyBriefMarkdown(brief: DailyBrief): string {
  return `## Three-Tier Intelligence Brief

- MUST_READ: ${brief.counts.MUST_READ} items
- QUICK_SCAN: ${brief.counts.QUICK_SCAN} items
- SKIP: ${brief.counts.SKIP} items

### MUST_READ

${renderItems(brief.mustRead, "No item reached the MUST_READ threshold in this run.", "en")}

### QUICK_SCAN

${renderItems(brief.quickScan, "No item needs a quick scan in this run.", "en")}

### SKIP

${renderItems(brief.skip, "No item was classified as SKIP in this run.", "en")}

### Ready-to-Use Content Ideas

${brief.contentIdeas.length > 0 ? brief.contentIdeas.map((idea) => `- ${idea}`).join("\n") : "- None yet. Expand the topic or source coverage."}
`;
}

function toBriefItem(
  item: ScoredEvidence,
  language: BriefLanguage,
  localizeTitle?: (item: ScoredEvidence) => string,
): BriefItem {
  const tier = classifyBriefTier(item);
  return {
    ...item,
    title: localizeTitle?.(item) ?? item.title,
    tier,
    reason: reasonFor(item, tier, language),
  };
}

function reasonFor(item: ScoredEvidence, tier: BriefTier, language: BriefLanguage): string {
  if (language === "en") return englishReasonFor(item, tier);
  const signals: string[] = [];
  if (item.paymentScore >= 14) signals.push("出现明确付费信号");
  if (item.painScore >= 18) signals.push("痛点表达强");
  if (item.urgencyScore >= 10) signals.push("时效性高");
  if (item.engagement >= 20) signals.push("讨论热度较高");
  if (signals.length > 0) return signals.slice(0, 2).join("，");
  if (tier === "MUST_READ") return `综合证据分 ${item.totalScore}`;
  if (tier === "QUICK_SCAN") return `具备参考价值，综合证据分 ${item.totalScore}`;
  return `弱信号或重复性较高，综合证据分 ${item.totalScore}`;
}

function englishReasonFor(item: ScoredEvidence, tier: BriefTier): string {
  const signals: string[] = [];
  if (item.paymentScore >= 14) signals.push("explicit willingness to pay");
  if (item.painScore >= 18) signals.push("strong pain signal");
  if (item.urgencyScore >= 10) signals.push("high urgency");
  if (item.engagement >= 20) signals.push("high discussion activity");
  if (signals.length > 0) return signals.slice(0, 2).join("; ");
  if (tier === "MUST_READ") return `high overall evidence score (${item.totalScore})`;
  if (tier === "QUICK_SCAN") return `useful context with an evidence score of ${item.totalScore}`;
  return `weak or repetitive signal with an evidence score of ${item.totalScore}`;
}

function buildContentIdeas(
  mustRead: BriefItem[],
  quickScan: BriefItem[],
  opportunities: Opportunity[],
  language: BriefLanguage,
  localizeOpportunityTitle?: (opportunity: Opportunity) => string,
): string[] {
  const ideas: string[] = [];
  const seen = new Set<string>();

  for (const opportunity of opportunities.slice(0, 3)) {
    const title = localizeOpportunityTitle?.(opportunity) ?? opportunity.title;
    const idea = language === "en"
      ? `Create a decision-led piece around “${title}”: why it is worth ${decisionText(opportunity.decision, language)}.`
      : `围绕“${title}”做一条判断型内容：为什么现在值得${decisionText(opportunity.decision, language)}。`;
    addUnique(ideas, seen, idea);
  }

  for (const item of [...mustRead, ...quickScan]) {
    if (ideas.length >= 6) break;
    const title = truncate(item.title, 72);
    const idea = language === "en"
      ? `Use “${title}” to explain the user pain, gaps in current solutions, and practical next steps.`
      : `从“${title}”切入，拆解用户痛点、现有方案缺口和可执行建议。`;
    addUnique(ideas, seen, idea);
  }

  return ideas.slice(0, 6);
}

function decisionText(decision: Opportunity["decision"], language: BriefLanguage): string {
  if (language === "en") {
    const english: Record<Opportunity["decision"], string> = {
      BUILD: "building an MVP now",
      SELL_SERVICE: "selling a service first to validate demand",
      WATCH: "continuing to watch the signal",
      IGNORE: "setting the idea aside for now",
    };
    return english[decision];
  }
  switch (decision) {
    case "BUILD":
      return "立刻做 MVP";
    case "SELL_SERVICE":
      return "先卖服务验证";
    case "WATCH":
      return "继续观察";
    case "IGNORE":
      return "暂时放弃";
  }
}

function addUnique(items: string[], seen: Set<string>, value: string): void {
  const key = value.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  items.push(value);
}

function renderItems(items: BriefItem[], empty: string, language: BriefLanguage = "zh"): string {
  if (items.length === 0) return empty;
  return items
    .map((item, index) => {
      const originalLink = markdownSourceLink(item.url, language === "en" ? "View original" : "查看原文");
      const detail = language === "en"
        ? `${item.reason}; score ${item.totalScore}/100; ${originalLink}`
        : `${item.reason}；评分 ${item.totalScore}/100；${originalLink}`;
      return `${index + 1}. **[${item.source}] ${escapeMarkdown(item.title)}**  \n   ${detail}`;
    })
    .join("\n");
}

function markdownSourceLink(value: string, label: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `[${label}](<${value.replace(/>/g, "%3E")}>)`;
    }
  } catch {
    // Preserve malformed source values as text without turning them into active links.
  }
  return `${label}: ${escapeMarkdown(value)}`;
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+.!|-])/g, "\\$1");
}
