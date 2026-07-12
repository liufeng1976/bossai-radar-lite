import type { Opportunity, SourceOutcome } from "./types.js";

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
