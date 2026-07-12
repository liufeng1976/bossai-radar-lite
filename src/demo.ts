import { RadarDatabase } from "./database.js";
import { createReport } from "./report.js";
import { buildOpportunities, scoreEvidence } from "./scoring.js";
import type { RawItem, SourceOutcome } from "./types.js";

const DEMO_NOTICE = "以下内容为 BossAI Radar Lite 合成演示数据，不代表真实帖子、真实客户或真实预算。";

const DEMO_ITEMS: RawItem[] = [
  {
    source: "reddit",
    externalId: "demo-support-1",
    title: "Shopify 售后消息每天超过 200 条，团队愿意为自动草稿付费",
    body: "退款、物流延误和重复 FAQ 全靠人工处理，流程手工、耗时、问题多，已经影响销售。团队缺少统一客服平台，预算约 99 美元/月，愿意采购并按月订阅替代方案，希望工具先生成回复草稿，由客服审核后发送。项目紧急，本周需要立即测试，当前流程已经阻塞客服。",
    url: "https://example.com/bossai-radar-demo/support-1",
    author: "demo-shop-owner",
    publishedAt: demoDate(1),
    engagement: 86,
    query: "customer support AI",
    isDemo: true,
  },
  {
    source: "github",
    externalId: "demo-support-2",
    title: "需要将订单状态、物流轨迹和退款政策统一进客服工作台",
    body: "当前客服必须在三个后台切换，手工复制订单信息，人工流程耗时且太慢，退款问题已经影响销售。团队缺少统一工具，正在寻找 API、插件或替代平台，预算 150 美元/月，愿意付费采购并订阅方案，希望本周立即上线，需求紧急。",
    url: "https://example.com/bossai-radar-demo/support-2",
    author: "demo-ops-team",
    publishedAt: demoDate(2),
    engagement: 53,
    query: "customer support AI",
    isDemo: true,
  },
  {
    source: "hackernews",
    externalId: "demo-support-3",
    title: "中小电商需要可控的 AI 客服，而不是完全自动回复",
    body: "现有 chatbot 经常答错退款政策，人工复核耗时，问题反复出现并影响销售。团队缺少可控方案，希望替代现有平台，愿意付费购买并按月订阅带证据引用、人工确认和审计记录的客服副驾驶。预算明确，项目紧急，希望立即开始测试。",
    url: "https://example.com/bossai-radar-demo/support-3",
    author: "demo-founder",
    publishedAt: demoDate(3),
    engagement: 74,
    query: "customer support AI",
    isDemo: true,
  },
  {
    source: "reddit",
    externalId: "demo-content-1",
    title: "商品很多但每天做短视频太耗时间，正在找批量内容工具",
    body: "运营团队每周要为 50 个 SKU 写脚本、标题和口播文案，流程手工且耗时，已经影响内容发布。团队愿意按月付费，但需要品牌语气和人工审核，希望本周测试。",
    url: "https://example.com/bossai-radar-demo/content-1",
    author: "demo-content-manager",
    publishedAt: demoDate(2),
    engagement: 67,
    query: "content automation",
    isDemo: true,
  },
  {
    source: "github",
    externalId: "demo-content-2",
    title: "批量生成电商短视频时缺少素材追踪和失败重试",
    body: "现有脚本遇到视频 API 超时就丢任务，人工排查耗时并阻塞发布，无法知道哪个 SKU 已完成。需要队列、状态看板、重试和可下载内容包，团队愿意采购工具，预算 79 美元。",
    url: "https://example.com/bossai-radar-demo/content-2",
    author: "demo-developer",
    publishedAt: demoDate(4),
    engagement: 42,
    query: "content automation",
    isDemo: true,
  },
  {
    source: "hackernews",
    externalId: "demo-content-3",
    title: "AI 视频工具很多，但卖家真正需要的是从商品到发布的完整工作流",
    body: "单次生成模型不是主要问题，人工拼接脚本、素材、字幕、封面和多平台发布很耗时，也缺少完整工作流。卖家愿意为可复用模板和稳定交付付费。",
    url: "https://example.com/bossai-radar-demo/content-3",
    author: "demo-saas-builder",
    publishedAt: demoDate(5),
    engagement: 91,
    query: "content automation",
    isDemo: true,
  },
  {
    source: "reddit",
    externalId: "demo-research-1",
    title: "每周人工翻 Reddit 和竞品评论找需求，耗时且没有统一证据库",
    body: "希望有工具自动收集重复抱怨、明确预算和竞品差评，再给出值得做什么。愿意先购买一份行业机会报告验证效果。",
    url: "https://example.com/bossai-radar-demo/research-1",
    author: "demo-agency-owner",
    publishedAt: demoDate(1),
    engagement: 58,
    query: "market intelligence",
    isDemo: true,
  },
  {
    source: "hackernews",
    externalId: "demo-research-2",
    title: "创业情报工具不应只是新闻摘要，需要证据、评分和明确的不做清单",
    body: "团队想看到痛点原文、付费意愿和跨来源验证。若能每周输出可执行机会清单，可以接受订阅或顾问服务。",
    url: "https://example.com/bossai-radar-demo/research-2",
    author: "demo-investigator",
    publishedAt: demoDate(3),
    engagement: 79,
    query: "market intelligence",
    isDemo: true,
  },
  {
    source: "github",
    externalId: "demo-research-3",
    title: "需要来源级失败隔离、去重和可审计的机会评分",
    body: "抓取任务经常因单个平台限流全部失败。希望每个来源独立运行并保留错误、耗时、原始链接和确定性评分规则。",
    url: "https://example.com/bossai-radar-demo/research-3",
    author: "demo-product-team",
    publishedAt: demoDate(6),
    engagement: 36,
    query: "market intelligence",
    isDemo: true,
  },
];

export function seedDemoData(db: RadarDatabase) {
  db.clearDemoEvidence();
  const run = db.startRun("demo");
  const saved = DEMO_ITEMS.map((item) => db.saveEvidence(scoreEvidence(item)));
  const opportunities = buildOpportunities(saved);
  db.replaceOpportunities(opportunities);

  const sourceOutcomes = buildSourceOutcomes();
  const baseReport = createReport(run.id, opportunities, sourceOutcomes, DEMO_ITEMS.length, saved.length);
  const executiveSummary = `【演示数据】${baseReport.executiveSummary}`;
  const markdown = baseReport.markdown.replace(
    "# BossAI Radar Lite 商业机会日报",
    `# BossAI Radar Lite 演示日报\n\n> **演示声明：${DEMO_NOTICE}**`,
  );
  const report = db.saveReport(run.id, executiveSummary, markdown);
  const finishedRun = db.finishRun(
    run.id,
    "success",
    {
      collectedCount: DEMO_ITEMS.length,
      evidenceCount: saved.length,
      opportunityCount: opportunities.length,
    },
    [],
  );

  return { run: finishedRun, report, opportunities, sources: sourceOutcomes };
}

function buildSourceOutcomes(): SourceOutcome[] {
  return (["reddit", "hackernews", "github"] as const).map((source) => ({
    source,
    status: "success",
    items: DEMO_ITEMS.filter((item) => item.source === source),
    error: DEMO_NOTICE,
    durationMs: 0,
  }));
}

function demoDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
}
