import { createHash } from "node:crypto";
import type { Decision, Opportunity, RawItem, SavedEvidence, ScoredEvidence } from "./types.js";

const PAIN_TERMS = [
  "problem", "pain", "frustrat", "hate", "broken", "difficult", "hard to", "struggle", "manual",
  "time-consuming", "waste time", "annoying", "doesn't work", "not working", "issue", "bug", "slow",
  "expensive", "overpriced", "missing", "need a better", "wish there was",
  "痛点", "困扰", "麻烦", "手工", "人工", "耗时", "影响", "问题", "缺少", "找不到", "太慢", "太贵",
];
const PAYMENT_TERMS = [
  "would pay", "willing to pay", "budget", "paid", "pricing", "price", "subscription", "hire", "contract",
  "bounty", "looking for a tool", "looking for someone", "need a developer", "purchase", "buy", "customer",
  "revenue", "mrr", "arr", "$", "usd", "per month", "/month",
  "愿意付费", "愿意采购", "预算", "订阅", "按月", "购买", "收费", "付费", "美元", "元/月",
];
const COMPETITION_TERMS = [
  "alternative", "competitor", "replace", "switch from", "migration", "comparison", "versus", "vs.",
  "shopify app", "plugin", "extension", "saas", "tool", "platform",
  "替代", "竞品", "插件", "工具", "平台", "方案",
];
const URGENCY_TERMS = [
  "urgent", "asap", "immediately", "today", "this week", "deadline", "blocked", "critical", "production",
  "losing sales", "churn", "refund", "chargeback", "downtime", "can't ship", "cannot ship",
  "紧急", "本周", "立即", "影响销售", "退款", "阻塞",
];

const CATEGORY_RULES: Array<{ name: string; terms: string[] }> = [
  { name: "customer-support", terms: ["customer support", "customer service", "helpdesk", "ticket", "reply", "chatbot", "refund", "return"] },
  { name: "content-video", terms: ["content", "video", "shorts", "tiktok", "reels", "creative", "copywriting", "social media"] },
  { name: "listing-seo", terms: ["listing", "seo", "keyword", "product description", "amazon seller", "marketplace"] },
  { name: "ads-growth", terms: ["ads", "advertising", "campaign", "roas", "cpc", "conversion", "growth", "attribution"] },
  { name: "store-automation", terms: ["shopify", "ecommerce", "e-commerce", "workflow", "automation", "order", "inventory", "fulfillment"] },
  { name: "analytics-research", terms: ["analytics", "dashboard", "research", "trend", "competitor", "market intelligence", "insight"] },
  { name: "developer-tools", terms: ["api", "sdk", "github", "integration", "developer", "webhook", "open source"] },
];

export function scoreEvidence(item: RawItem): ScoredEvidence {
  const text = `${item.title} ${item.body}`.toLowerCase();
  const painHits = findHits(text, PAIN_TERMS);
  const paymentHits = findHits(text, PAYMENT_TERMS);
  const competitionHits = findHits(text, COMPETITION_TERMS);
  const urgencyHits = findHits(text, URGENCY_TERMS);

  const painScore = Math.min(30, painHits.length * 6);
  const paymentScore = Math.min(25, paymentHits.length * 7);
  const competitionScore = Math.min(15, competitionHits.length * 4);
  const urgencyScore = Math.min(15, urgencyHits.length * 5);
  const engagementScore = Math.min(15, Math.round(Math.log2(Math.max(1, item.engagement + 1)) * 2.5));
  const contentQuality = Math.min(10, Math.round((item.title.length + Math.min(item.body.length, 600)) / 80));
  const totalScore = clamp(painScore + paymentScore + competitionScore + urgencyScore + engagementScore + contentQuality, 0, 100);
  const category = classifyCategory(`${item.query} ${text}`);
  const tags = [...new Set([...painHits, ...paymentHits, ...competitionHits, ...urgencyHits])].slice(0, 12);

  return {
    ...item,
    isDemo: item.isDemo === true,
    fingerprint: fingerprint(item),
    painScore,
    paymentScore,
    competitionScore,
    urgencyScore,
    totalScore,
    category,
    tags,
  };
}

export function buildOpportunities(evidence: SavedEvidence[]): Opportunity[] {
  const groups = new Map<string, SavedEvidence[]>();
  for (const item of evidence.filter((entry) => entry.totalScore >= 20)) {
    const key = item.category;
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }

  const createdAt = new Date().toISOString();
  return [...groups.entries()]
    .map(([category, items]) => {
      const sorted = [...items].sort((a, b) => b.totalScore - a.totalScore).slice(0, 30);
      const sources = new Set(sorted.map((item) => item.source));
      const avgEvidenceScore = round(sorted.reduce((sum, item) => sum + item.totalScore, 0) / sorted.length, 1);
      const explicitPaymentCount = sorted.filter((item) => item.paymentScore >= 7).length;
      const strongPainCount = sorted.filter((item) => item.painScore >= 12).length;
      const score = clamp(
        Math.round(
          avgEvidenceScore * 0.68 +
          Math.min(18, sources.size * 6) +
          Math.min(10, sorted.length * 1.5) +
          Math.min(8, explicitPaymentCount * 2) +
          Math.min(6, strongPainCount),
        ),
        0,
        100,
      );
      const decision = decisionFor(score, sources.size, explicitPaymentCount);
      const narrative = deterministicNarrative(category, sorted, decision);
      return {
        id: createHash("sha256").update(category).digest("hex").slice(0, 16),
        category,
        ...narrative,
        evidenceCount: sorted.length,
        sourceCount: sources.size,
        avgEvidenceScore,
        score,
        decision,
        evidenceIds: sorted.map((item) => item.id),
        isDemo: sorted.every((item) => item.isDemo),
        createdAt,
      } satisfies Opportunity;
    })
    .sort((a, b) => b.score - a.score);
}

export function decisionFor(score: number, sourceCount: number, paymentCount: number): Decision {
  if (score >= 80 && sourceCount >= 2 && paymentCount >= 1) return "BUILD";
  if (score >= 65 && paymentCount >= 1) return "SELL_SERVICE";
  if (score >= 45) return "WATCH";
  return "IGNORE";
}

export function deterministicNarrative(
  category: string,
  evidence: SavedEvidence[],
  decision: Decision,
): Pick<Opportunity, "title" | "summary" | "targetCustomer" | "problem" | "priceHint" | "mvpPlan"> {
  const strongest = evidence[0];
  const labels: Record<string, { title: string; customer: string; offer: string }> = {
    "customer-support": { title: "电商 AI 客服与售后副驾驶", customer: "独立站、Amazon 与多平台电商卖家", offer: "自动生成可审核的客服回复、退款与物流处理建议" },
    "content-video": { title: "电商内容与短视频生产助手", customer: "需要持续产出短视频和社媒内容的卖家与小团队", offer: "从商品资料生成脚本、标题、镜头与发布素材" },
    "listing-seo": { title: "商品 Listing 与关键词优化工具", customer: "Amazon、Shopify 与平台型电商运营者", offer: "批量优化标题、卖点、关键词和多语言描述" },
    "ads-growth": { title: "广告诊断与增长建议助手", customer: "缺少专职投手的中小电商团队", offer: "聚合广告表现并输出可执行的预算和素材建议" },
    "store-automation": { title: "电商运营自动化工作台", customer: "被订单、库存和重复流程拖累的电商团队", offer: "连接常见运营流程，自动发现异常并生成处理任务" },
    "analytics-research": { title: "海外需求与竞品情报雷达", customer: "寻找产品机会的创业者、服务商和电商老板", offer: "持续收集公开证据并输出机会评分和行动报告" },
    "developer-tools": { title: "AI 电商集成与开发者工具", customer: "需要快速接入 AI 和电商平台的开发团队", offer: "提供标准 API、工作流模板和可观测集成组件" },
    general: { title: "AI 商业机会验证服务", customer: "希望验证真实需求的创业者和中小企业", offer: "围绕高频痛点先提供人工增强服务，再沉淀为产品" },
  };
  const label = labels[category] ?? labels.general!;
  const evidenceHint = strongest ? `最强证据来自 ${strongest.source}：“${truncate(strongest.title, 90)}”` : "当前证据仍需补充";
  const actionText: Record<Decision, string> = {
    BUILD: "证据已达到开发门槛，应立即制作可演示 MVP 并获取首批付费用户。",
    SELL_SERVICE: "先以半人工服务成交，验证支付意愿和标准流程，再决定是否产品化。",
    WATCH: "保留观察，继续补充跨平台证据和明确预算，不进入重开发。",
    IGNORE: "证据强度不足，暂不投入开发资源。",
  };
  return {
    title: label.title,
    targetCustomer: label.customer,
    problem: strongest ? truncate(`${strongest.title} ${strongest.body}`, 240) : "尚未形成明确问题描述",
    summary: `${label.offer}。${actionText[decision]} ${evidenceHint}。`,
    priceHint: priceHint(category, decision),
    mvpPlan: mvpPlan(category, decision),
  };
}

function priceHint(category: string, decision: Decision): string {
  if (decision === "IGNORE") return "暂不报价";
  if (decision === "WATCH") return "先做免费访谈或低成本验证";
  if (decision === "SELL_SERVICE") return category === "ads-growth" ? "¥1,999–¥5,999/月服务费" : "¥999–¥3,999/次验证服务";
  return category === "developer-tools" ? "$29–$99/月" : "¥699–¥2,999/年或按量计费";
}

function mvpPlan(category: string, decision: Decision): string[] {
  if (decision === "IGNORE") return ["归档证据", "30 天后重新扫描", "不投入开发资源"];
  if (decision === "WATCH") return ["补充至少 2 个不同来源", "确认 3 个明确付费表达", "复核竞品定价与差评"];
  const core = [
    "第1天：整理最高分证据并锁定单一目标客户",
    "第2天：制作可点击演示和单一结果型报价",
    "第3-4天：联系10名潜在客户完成真实访谈",
    "第5天：交付一次半人工结果，记录全过程",
    "第6天：把重复步骤封装为自动工作流",
    "第7天：以真实案例完成首轮销售验证",
  ];
  if (category === "analytics-research") core[1] = "第2天：生成一份真实行业日报和机会榜单";
  return core;
}

function classifyCategory(text: string): string {
  let bestCategory = "general";
  let bestScore = 0;
  for (const rule of CATEGORY_RULES) {
    const score = rule.terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
    if (score > bestScore) {
      bestCategory = rule.name;
      bestScore = score;
    }
  }
  return bestCategory;
}

function findHits(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(term));
}

function fingerprint(item: RawItem): string {
  const normalized = `${item.source}|${item.externalId}|${item.url}`.toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits: number): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}
