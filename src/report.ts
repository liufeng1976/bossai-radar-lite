import type { Opportunity, SavedEvidence, ScanRunSummary, SourceOutcome } from "./types.js";

export function createReport(
  runId: number,
  opportunities: Opportunity[],
  sourceOutcomes: SourceOutcome[],
  collectedCount: number,
  evidenceCount: number,
): { executiveSummary: string; markdown: string } {
  const generatedAt = new Date();
  const actionable = opportunities.filter((item) => item.decision === "BUILD" || item.decision === "SELL_SERVICE");
  const top = opportunities[0];
  const executiveSummary = top
    ? `本轮采集 ${collectedCount} 条公开信息，沉淀 ${evidenceCount} 条证据，形成 ${opportunities.length} 个机会。当前最高优先级是“${top.title}”（${top.score}分，${top.decision}）。`
    : `本轮采集 ${collectedCount} 条公开信息，尚未形成达到观察门槛的商业机会。`;

  const sourceTable = sourceOutcomes
    .map((source) => `| ${source.source} | ${source.status} | ${source.items.length} | ${source.durationMs}ms | ${escapeCell(source.error || "-")} |`)
    .join("\n");

  const opportunitySections = opportunities.slice(0, 10).map((item, index) => `
## ${index + 1}. ${item.title}

- **决策**：${item.decision}
- **机会评分**：${item.score}/100
- **证据数量**：${item.evidenceCount} 条，${item.sourceCount} 个来源
- **目标客户**：${item.targetCustomer}
- **核心问题**：${item.problem}
- **建议报价**：${item.priceHint}
- **判断摘要**：${item.summary}

### 7天动作

${item.mvpPlan.map((step) => `- ${step}`).join("\n")}
`).join("\n");

  const noAction = opportunities
    .filter((item) => item.decision === "IGNORE")
    .slice(0, 5)
    .map((item) => `- ${item.title}：${item.score}分，证据不足，暂不投入。`)
    .join("\n");

  const markdown = `# BossAI Radar Lite 商业机会日报

> 扫描编号：#${runId}  
> 生成时间：${formatDate(generatedAt)}  
> 许可：仅限非商业使用；商业使用须获得 BossAI 商业授权。

## CEO 结论

${executiveSummary}

- 可立即行动机会：${actionable.length} 个
- BUILD：${opportunities.filter((item) => item.decision === "BUILD").length} 个
- SELL_SERVICE：${opportunities.filter((item) => item.decision === "SELL_SERVICE").length} 个
- WATCH：${opportunities.filter((item) => item.decision === "WATCH").length} 个
- IGNORE：${opportunities.filter((item) => item.decision === "IGNORE").length} 个

## 来源运行情况

| 来源 | 状态 | 采集数 | 耗时 | 错误 |
|---|---:|---:|---:|---|
${sourceTable || "| - | - | 0 | - | 未运行 |"}

## 机会优先级

${opportunitySections || "本轮没有达到最低证据门槛的机会。"}

## 明确不做

${noAction || "- 暂无额外放弃项。"}

## 使用说明

本报告来自公开信息自动采集与确定性评分。AI 只负责解释证据，不负责篡改机会分数和决策门槛。任何收入、预算和市场规模结论都应回到原始链接人工核验。
`;

  return { executiveSummary, markdown };
}

export function createEnglishReport(
  run: ScanRunSummary,
  opportunities: Opportunity[],
  evidence: SavedEvidence[],
): { executiveSummary: string; markdown: string } {
  const generatedAt = new Date();
  const top = opportunities[0];
  const isDemo = run.trigger === "demo";
  const actionable = opportunities.filter((item) => item.decision === "BUILD" || item.decision === "SELL_SERVICE");
  const prefix = isDemo ? "Synthetic demo: " : "";
  const executiveSummary = top
    ? `${prefix}${run.collectedCount} public items produced ${opportunities.length} opportunities. The current top priority is “${englishOpportunity(top).title}” (${top.score}/100, ${top.decision}).`
    : `${prefix}${run.collectedCount} public items were collected, but no opportunity reached the watch threshold.`;

  const opportunitySections = opportunities.slice(0, 10).map((item, index) => {
    const localized = englishOpportunity(item);
    return `
## ${index + 1}. ${localized.title}

- **Decision:** ${item.decision}
- **Opportunity score:** ${item.score}/100
- **Evidence:** ${item.evidenceCount} items across ${item.sourceCount} sources
- **Target customer:** ${localized.targetCustomer}
- **Core problem:** ${localized.problem}
- **Suggested offer:** ${localized.priceHint}
- **Assessment:** ${localized.summary}

### 7-Day Action Plan

${localized.mvpPlan.map((step) => `- ${step}`).join("\n")}
`;
  }).join("\n");

  const evidenceRows = evidence.slice(0, 15).map((item) =>
    `| ${item.source} | ${escapeCell(englishEvidenceTitle(item))} | ${item.totalScore} | ${item.isDemo ? "DEMO" : "LIVE"} |`,
  ).join("\n");

  const noAction = opportunities
    .filter((item) => item.decision === "IGNORE")
    .slice(0, 5)
    .map((item) => `- ${englishOpportunity(item).title}: ${item.score}/100; evidence is too weak for investment.`)
    .join("\n");

  const reportTitle = isDemo
    ? "BossAI Radar Lite Synthetic Demo Report"
    : "BossAI Radar Lite Business Opportunity Report";
  const demoNotice = isDemo
    ? "> **Demo notice: all records in this report are synthetic examples and do not represent real posts, customers or budgets.**\n\n"
    : "";
  const markdown = `# ${reportTitle}

${demoNotice}> Run: #${run.id}
>
> Generated: ${formatEnglishDate(generatedAt)}
>
> License: non-commercial use only; commercial use requires written BossAI authorization.

## CEO Decision

${executiveSummary}

- Actionable opportunities: ${actionable.length}
- BUILD: ${opportunities.filter((item) => item.decision === "BUILD").length}
- SELL_SERVICE: ${opportunities.filter((item) => item.decision === "SELL_SERVICE").length}
- WATCH: ${opportunities.filter((item) => item.decision === "WATCH").length}
- IGNORE: ${opportunities.filter((item) => item.decision === "IGNORE").length}

## Opportunity Priority

${opportunitySections || "No opportunity reached the minimum evidence threshold in this run."}

## High-Value Evidence

| Source | Evidence | Score | Type |
|---|---|---:|---|
${evidenceRows || "| - | No evidence | 0 | - |"}

## Explicit Do-Not-Build List

${noAction || "- No additional rejection item."}

## Method and Verification

This report is generated from public evidence and deterministic scoring. AI may explain evidence, but it cannot override opportunity scores or decision gates. Revenue, budget, customer-count and market-size claims must be verified through the original source before business use.
`;

  return { executiveSummary, markdown };
}

function englishEvidenceTitle(item: SavedEvidence): string {
  if (!item.isDemo) return item.title;
  const titles: Record<string, string> = {
    "demo-support-1": "More than 200 Shopify after-sales messages a day; the team will pay for AI reply drafts",
    "demo-support-2": "Order status, tracking and refund policy need to live in one support workspace",
    "demo-support-3": "Small ecommerce teams need controllable AI support, not fully autonomous replies",
    "demo-content-1": "Too many products and too little time: the team needs batch short-video production",
    "demo-content-2": "Batch ecommerce video generation lacks asset tracking and failure recovery",
    "demo-content-3": "Sellers need a product-to-publishing workflow, not another isolated video model",
    "demo-research-1": "Manual Reddit and competitor-review research is slow and lacks a shared evidence library",
    "demo-research-2": "Founder intelligence tools need evidence, scoring and a clear do-not-build list",
    "demo-research-3": "The radar needs source-level failure isolation, deduplication and auditable scoring",
  };
  return titles[item.externalId] ?? item.title;
}

function englishOpportunity(item: Opportunity): {
  title: string;
  targetCustomer: string;
  problem: string;
  summary: string;
  priceHint: string;
  mvpPlan: string[];
} {
  const definitions: Record<string, { title: string; targetCustomer: string; offer: string; problem: string }> = {
    "customer-support": {
      title: "AI Customer Support & After-Sales Copilot",
      targetCustomer: "Shopify, Amazon and multi-channel ecommerce teams",
      offer: "Generate reviewable replies, refund guidance and logistics actions.",
      problem: "Support teams lose time and sales to repetitive order, tracking, return and policy questions.",
    },
    "content-video": {
      title: "Ecommerce Content & Short-Video Assistant",
      targetCustomer: "Sellers and small teams that need continuous social content",
      offer: "Turn product information into scripts, hooks, shot plans and publishing assets.",
      problem: "Manual content production is slow, fragmented and difficult to scale across products and channels.",
    },
    "listing-seo": {
      title: "Listing & Keyword Optimization Tool",
      targetCustomer: "Amazon, Shopify and marketplace operators",
      offer: "Improve titles, bullets, keywords and multilingual product descriptions at scale.",
      problem: "Large catalogs make consistent listing quality, localization and keyword coverage expensive.",
    },
    "ads-growth": {
      title: "Ads Diagnosis & Growth Assistant",
      targetCustomer: "Small ecommerce teams without a dedicated media buyer",
      offer: "Translate campaign data into budget, audience and creative actions.",
      problem: "Teams see metrics but cannot reliably decide what to pause, scale or test next.",
    },
    "store-automation": {
      title: "Ecommerce Operations Automation Workspace",
      targetCustomer: "Ecommerce teams burdened by orders, inventory and repetitive workflows",
      offer: "Detect operational exceptions and generate clear processing tasks.",
      problem: "Manual cross-system work causes delays, missed exceptions and inconsistent execution.",
    },
    "analytics-research": {
      title: "Overseas Demand & Competitor Intelligence Radar",
      targetCustomer: "Founders, service providers and ecommerce operators seeking validated opportunities",
      offer: "Collect public market evidence and turn it into ranked opportunities and action reports.",
      problem: "Manual market research is slow, unstructured and often confuses popularity with willingness to pay.",
    },
    "developer-tools": {
      title: "AI Ecommerce Integration Toolkit",
      targetCustomer: "Development teams integrating AI and ecommerce platforms",
      offer: "Provide reusable APIs, workflow templates and observable integration components.",
      problem: "Teams repeatedly rebuild authentication, retries, data mapping, safety and monitoring layers.",
    },
    general: {
      title: "AI Business Opportunity Validation",
      targetCustomer: "Founders and small businesses validating a new product or service",
      offer: "Validate a recurring pain with evidence before committing to product development.",
      problem: "Teams invest in product ideas before confirming repeat pain, urgency and willingness to pay.",
    },
  };
  const definition = definitions[item.category] ?? definitions.general!;
  const actions: Record<Opportunity["decision"], string> = {
    BUILD: "Evidence clears the build threshold. Create a focused MVP and pursue the first paid users.",
    SELL_SERVICE: "Start with a human-assisted paid service to validate willingness to pay before productizing.",
    WATCH: "Continue collecting cross-source and explicit budget evidence before investing in development.",
    IGNORE: "Evidence is currently too weak to justify development resources.",
  };
  const plans: Record<Opportunity["decision"], string[]> = {
    BUILD: [
      "Day 1: review the strongest evidence and select one customer segment.",
      "Day 2: create a clickable demo and one outcome-based offer.",
      "Days 3–4: interview ten prospects using the original evidence.",
      "Day 5: deliver one human-assisted result and document the workflow.",
      "Day 6: automate the repeatable steps and add failure handling.",
      "Day 7: use the real result to run the first paid sales test.",
    ],
    SELL_SERVICE: [
      "Package the pain as a narrow done-for-you service.",
      "Contact ten prospects and request a paid pilot, not only feedback.",
      "Document delivery time, objections and repeated manual steps.",
      "Productize only after repeatable paid demand is confirmed.",
    ],
    WATCH: [
      "Add evidence from at least two independent sources.",
      "Confirm three explicit budget or willingness-to-pay statements.",
      "Review competitor pricing and recurring negative reviews.",
    ],
    IGNORE: [
      "Archive the current evidence.",
      "Re-scan after 30 days.",
      "Do not allocate development resources now.",
    ],
  };
  return {
    title: definition.title,
    targetCustomer: definition.targetCustomer,
    problem: definition.problem,
    summary: `${definition.offer} ${actions[item.decision]} Evidence: ${item.evidenceCount} items across ${item.sourceCount} sources.`,
    priceHint: englishPriceHint(item.category, item.decision),
    mvpPlan: plans[item.decision],
  };
}

function englishPriceHint(category: string, decision: Opportunity["decision"]): string {
  if (decision === "IGNORE") return "No offer yet";
  if (decision === "WATCH") return "Interviews or low-cost validation";
  if (decision === "SELL_SERVICE") return category === "ads-growth" ? "$299–$999/month service" : "$149–$599 validation service";
  return category === "developer-tools" ? "$29–$99/month" : "$99–$499/year or usage-based";
}

function formatEnglishDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "medium",
    hour12: true,
  }).format(date);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "medium",
    hour12: false,
  }).format(date);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 160);
}
