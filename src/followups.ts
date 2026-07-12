import type {
  FollowUpBucket,
  FollowUpDraft,
  FollowUpItem,
  FollowUpQueue,
  Lead,
  LeadIntent,
  LeadPriority,
  LeadStatus,
} from "./types.js";

const TERMINAL_STATUSES = new Set<LeadStatus>(["WON", "LOST"]);

export function buildFollowUpQueue(
  leads: Lead[],
  options: { now?: Date; windowDays?: number; includeUnscheduled?: boolean; displayLanguage?: "zh" | "en" } = {},
): FollowUpQueue {
  const now = options.now ?? new Date();
  const windowDays = clampInt(options.windowDays ?? 7, 1, 60);
  const includeUnscheduled = options.includeUnscheduled ?? true;
  const items = leads
    .filter((lead) => !TERMINAL_STATUSES.has(lead.status))
    .map((lead) => createFollowUpItem(lead, now, options.displayLanguage))
    .filter((item) => {
      if (item.bucket === "UNSCHEDULED") return includeUnscheduled;
      if (item.bucket === "OVERDUE" || item.bucket === "TODAY") return true;
      return (item.daysDelta ?? windowDays + 1) <= windowDays;
    })
    .sort(compareFollowUps);

  return {
    generatedAt: now.toISOString(),
    windowDays,
    stats: {
      total: items.length,
      overdue: items.filter((item) => item.bucket === "OVERDUE").length,
      today: items.filter((item) => item.bucket === "TODAY").length,
      upcoming: items.filter((item) => item.bucket === "UPCOMING").length,
      unscheduled: items.filter((item) => item.bucket === "UNSCHEDULED").length,
      hot: items.filter((item) => item.lead.priority === "HOT").length,
    },
    items,
  };
}

export function createFollowUpItem(lead: Lead, now = new Date(), displayLanguage: "zh" | "en" = lead.language): FollowUpItem {
  const classification = classifyDueDate(lead.nextFollowUpAt, now);
  const urgencyScore = calculateUrgencyScore(lead, classification.bucket, classification.daysDelta);
  const draft = createFollowUpDraft(lead, now);
  return {
    lead,
    bucket: classification.bucket,
    dueAt: lead.nextFollowUpAt,
    daysDelta: classification.daysDelta,
    urgencyScore,
    reason: reasonFor(lead, classification.bucket, classification.daysDelta, displayLanguage),
    recommendedAction: recommendedAction(lead, displayLanguage),
    draft,
  };
}

export function createFollowUpDraft(lead: Lead, now = new Date(), language: "zh" | "en" = lead.language): FollowUpDraft {
  const suggestedStatus = nextStatusFor(lead.status);
  const suggestedFollowUpAt = nextFollowUpDate(lead, now).toISOString();
  const company = lead.company || lead.name;
  const quote = lead.quoteAmount === null
    ? ""
    : formatQuote(lead.quoteAmount, lead.quoteCurrency, language);
  const intent = intentLabel(lead.intent, language);
  const status = statusLabel(lead.status, language);
  const action = recommendedAction(lead, language);

  if (language === "en") {
    const subject = subjectForEnglish(lead, company, intent);
    const message = messageForEnglish(lead, company, intent, status, quote);
    return {
      language,
      subject,
      message,
      recommendedAction: action,
      suggestedStatus,
      suggestedFollowUpAt,
    };
  }

  const subject = subjectForChinese(lead, company, intent);
  const message = messageForChinese(lead, company, intent, status, quote);
  return {
    language,
    subject,
    message,
    recommendedAction: action,
    suggestedStatus,
    suggestedFollowUpAt,
  };
}

export function createFollowUpReport(queue: FollowUpQueue, language: "zh" | "en"): string {
  const generated = new Date(queue.generatedAt);
  if (language === "en") return createEnglishReport(queue, generated);
  return createChineseReport(queue, generated);
}

export function createFollowUpCalendar(queue: FollowUpQueue, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BossAI//Radar Lite Follow-ups//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  let offsetMinutes = 15;
  for (const item of queue.items.filter((entry) => entry.bucket !== "UNSCHEDULED")) {
    const original = item.dueAt ? new Date(item.dueAt) : now;
    const start = original.getTime() > now.getTime()
      ? original
      : new Date(now.getTime() + offsetMinutes * 60_000);
    offsetMinutes += 15;
    const end = new Date(start.getTime() + 30 * 60_000);
    const language = item.lead.language;
    const title = language === "en"
      ? `Follow up: ${item.lead.name}${item.lead.company ? ` · ${item.lead.company}` : ""}`
      : `跟进：${item.lead.name}${item.lead.company ? ` · ${item.lead.company}` : ""}`;
    const description = [
      item.draft.recommendedAction,
      `${language === "en" ? "Contact" : "联系方式"}: ${item.lead.contact}`,
      `${language === "en" ? "Status" : "状态"}: ${statusLabel(item.lead.status, language)}`,
      `${language === "en" ? "Priority" : "优先级"}: ${item.lead.priority}`,
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(item.lead.id)}@bossai-radar-lite`,
      `DTSTAMP:${formatIcsDate(now)}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcs(title)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function classifyDueDate(value: string | null, now: Date): { bucket: FollowUpBucket; daysDelta: number | null } {
  if (!value) return { bucket: "UNSCHEDULED", daysDelta: null };
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return { bucket: "UNSCHEDULED", daysDelta: null };
  const todayStart = startOfLocalDay(now);
  const dueStart = startOfLocalDay(due);
  const daysDelta = Math.round((dueStart.getTime() - todayStart.getTime()) / 86_400_000);
  if (daysDelta < 0) return { bucket: "OVERDUE", daysDelta };
  if (daysDelta === 0) return { bucket: "TODAY", daysDelta };
  return { bucket: "UPCOMING", daysDelta };
}

function calculateUrgencyScore(lead: Lead, bucket: FollowUpBucket, daysDelta: number | null): number {
  let score = ({ HOT: 35, WARM: 22, COOL: 10 } satisfies Record<LeadPriority, number>)[lead.priority];
  score += ({
    OVERDUE: 45,
    TODAY: 35,
    UNSCHEDULED: 20,
    UPCOMING: Math.max(0, 18 - Math.max(0, daysDelta ?? 0) * 2),
  } satisfies Record<FollowUpBucket, number>)[bucket];
  score += ({
    NEW: 13,
    QUALIFIED: 12,
    CONTACTED: 11,
    PROPOSAL: 16,
    NEGOTIATION: 20,
    WAITLIST: 3,
    WON: 0,
    LOST: 0,
  } satisfies Record<LeadStatus, number>)[lead.status];
  if (lead.timeline === "now") score += 12;
  else if (lead.timeline === "30-days") score += 7;
  if (lead.quoteAmount !== null) score += 5;
  return Math.min(100, score);
}

function compareFollowUps(a: FollowUpItem, b: FollowUpItem): number {
  const bucketRank: Record<FollowUpBucket, number> = { OVERDUE: 0, TODAY: 1, UNSCHEDULED: 2, UPCOMING: 3 };
  return bucketRank[a.bucket] - bucketRank[b.bucket]
    || b.urgencyScore - a.urgencyScore
    || priorityRank(a.lead.priority) - priorityRank(b.lead.priority)
    || compareDates(a.dueAt, b.dueAt)
    || b.lead.updatedAt.localeCompare(a.lead.updatedAt);
}

function priorityRank(priority: LeadPriority): number {
  return ({ HOT: 0, WARM: 1, COOL: 2 } satisfies Record<LeadPriority, number>)[priority];
}

function compareDates(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

function nextStatusFor(status: LeadStatus): LeadStatus {
  return ({
    NEW: "QUALIFIED",
    WAITLIST: "WAITLIST",
    QUALIFIED: "CONTACTED",
    CONTACTED: "PROPOSAL",
    PROPOSAL: "NEGOTIATION",
    NEGOTIATION: "WON",
    WON: "WON",
    LOST: "LOST",
  } satisfies Record<LeadStatus, LeadStatus>)[status];
}

function nextFollowUpDate(lead: Lead, now: Date): Date {
  const baseDays = ({ HOT: 1, WARM: 3, COOL: 7 } satisfies Record<LeadPriority, number>)[lead.priority];
  const statusAdjustment = ({
    NEW: 0,
    QUALIFIED: 0,
    CONTACTED: 1,
    PROPOSAL: 1,
    NEGOTIATION: 0,
    WAITLIST: 21,
    WON: 30,
    LOST: 30,
  } satisfies Record<LeadStatus, number>)[lead.status];
  const date = new Date(now);
  date.setDate(date.getDate() + baseDays + statusAdjustment);
  date.setHours(10, 0, 0, 0);
  return date;
}

function recommendedAction(lead: Lead, language: "zh" | "en"): string {
  const zh: Record<LeadStatus, string> = {
    NEW: "先确认真实使用场景、决策人和预算，再决定是否进入有效商机。",
    WAITLIST: "发送 Pro 进展更新，并确认需求是否仍然存在、预计何时启动。",
    QUALIFIED: "安排需求沟通，锁定交付范围、上线时间和采购决策流程。",
    CONTACTED: "根据已确认需求发送一页式方案、价格区间和下一步时间。",
    PROPOSAL: "确认客户是否已查看方案，集中处理预算、部署和授权异议。",
    NEGOTIATION: "明确最终条款、付款节点、上线日期和签署负责人，推动成交。",
    WON: "进入交付和客户成功流程。",
    LOST: "记录流失原因并设定适当的重新激活时间。",
  };
  const en: Record<LeadStatus, string> = {
    NEW: "Confirm the real use case, decision maker and budget before qualifying the opportunity.",
    WAITLIST: "Share a Pro progress update and confirm whether the need and target timing are still active.",
    QUALIFIED: "Schedule discovery and lock down scope, target launch date and the buying process.",
    CONTACTED: "Send a one-page solution, price range and a concrete next-step date.",
    PROPOSAL: "Confirm the proposal was reviewed and resolve budget, deployment and licensing objections.",
    NEGOTIATION: "Confirm final terms, payment milestone, launch date and signing owner to close the deal.",
    WON: "Move the account into delivery and customer success.",
    LOST: "Record the loss reason and choose an appropriate reactivation date.",
  };
  return language === "en" ? en[lead.status] : zh[lead.status];
}

function reasonFor(lead: Lead, bucket: FollowUpBucket, daysDelta: number | null, language: "zh" | "en"): string {
  if (language === "en") {
    if (bucket === "OVERDUE") return `Follow-up is ${Math.abs(daysDelta ?? 0)} day(s) overdue.`;
    if (bucket === "TODAY") return "Follow-up is due today.";
    if (bucket === "UPCOMING") return `Follow-up is due in ${daysDelta ?? 0} day(s).`;
    return lead.priority === "HOT"
      ? "This HOT lead has no scheduled follow-up."
      : "This active lead has no scheduled follow-up.";
  }
  if (bucket === "OVERDUE") return `已逾期 ${Math.abs(daysDelta ?? 0)} 天。`;
  if (bucket === "TODAY") return "今天必须跟进。";
  if (bucket === "UPCOMING") return `${daysDelta ?? 0} 天后到期。`;
  return lead.priority === "HOT" ? "HOT 线索尚未安排跟进。" : "活跃线索尚未安排跟进。";
}

function subjectForChinese(lead: Lead, company: string, intent: string): string {
  if (lead.status === "WAITLIST") return `[BossAI Radar Pro] ${company}需求进展确认`;
  if (lead.status === "PROPOSAL") return `[BossAI Radar] ${company}方案与报价下一步`;
  if (lead.status === "NEGOTIATION") return `[BossAI Radar] ${company}合作条款与上线时间确认`;
  return `[BossAI Radar] 关于${company}的${intent}申请`;
}

function subjectForEnglish(lead: Lead, company: string, intent: string): string {
  if (lead.status === "WAITLIST") return `[BossAI Radar Pro] ${company} requirement check-in`;
  if (lead.status === "PROPOSAL") return `[BossAI Radar] Next step on the ${company} proposal`;
  if (lead.status === "NEGOTIATION") return `[BossAI Radar] Confirming terms and launch timing for ${company}`;
  return `[BossAI Radar] Follow-up on ${company}'s ${intent} application`;
}

function messageForChinese(lead: Lead, company: string, intent: string, status: string, quote: string): string {
  const greeting = `${lead.name}，你好：`;
  const context = `感谢你提交 BossAI Radar 的${intent}申请。我们记录到当前项目状态为“${status}”，计划上线时间为“${timelineLabel(lead.timeline, "zh")}”。`;
  const quoteLine = quote ? `目前记录的方案报价为 ${quote}。` : "";
  const statusBody: Record<LeadStatus, string> = {
    NEW: `为了判断最合适的授权和部署方案，想先确认三个问题：\n1. ${company}最希望先解决的一个业务结果是什么？\n2. 谁负责最终决策和验收？\n3. 预算和上线时间是否已经确定？`,
    WAITLIST: "BossAI Radar Pro 正在按真实企业需求确定优先级。想确认你目前最需要的数据源、团队人数和预计启动时间是否有变化。",
    QUALIFIED: "基于你提交的场景，下一步建议安排一次需求沟通，把使用人数、数据源、部署方式、交付范围和验收标准一次确认清楚。",
    CONTACTED: "根据前面的沟通，我们可以整理一页式实施方案，明确功能范围、价格区间、部署方式和首个可交付结果。请告知你方便确认方案的时间。",
    PROPOSAL: `想确认你是否已经看过方案${quote ? `和 ${quote} 的报价` : ""}。目前是否还有预算、部署、数据源或授权范围方面的疑问？我们可以集中一次处理。`,
    NEGOTIATION: "为了推动项目落地，建议本次直接确认最终范围、付款节点、上线日期以及负责签署和验收的人员。",
    WON: "感谢确认合作。下一步我们将进入部署、交付和客户成功流程。",
    LOST: "感谢此前沟通。为便于后续改进，想了解这次没有继续推进的主要原因；条件变化时也可以重新联系。",
  };
  return [greeting, "", context, quoteLine, "", statusBody[lead.status], "", "你回复一个方便的时间或直接回复关键答案即可。", "", "刘风 / BossAI"].filter(Boolean).join("\n");
}

function messageForEnglish(lead: Lead, company: string, intent: string, status: string, quote: string): string {
  const greeting = `Hi ${lead.name},`;
  const context = `Thank you for submitting a BossAI Radar ${intent} application. We currently have the opportunity at “${status}”, with a target timeline of “${timelineLabel(lead.timeline, "en")}”.`;
  const quoteLine = quote ? `The current recorded proposal value is ${quote}.` : "";
  const statusBody: Record<LeadStatus, string> = {
    NEW: `To identify the right licensing and deployment path, could you confirm three points?\n1. What is the first business outcome ${company} needs?\n2. Who owns the final decision and acceptance?\n3. Are the budget and launch date already confirmed?`,
    WAITLIST: "BossAI Radar Pro priorities are being set from real company requirements. Has anything changed in the data sources, team size or target start date you need?",
    QUALIFIED: "The next useful step is a short discovery session to confirm users, data sources, deployment, delivery scope and acceptance criteria.",
    CONTACTED: "Based on the initial discussion, we can prepare a one-page solution with scope, price range, deployment path and the first deliverable. Please share a suitable time to review it.",
    PROPOSAL: `I wanted to confirm whether you have reviewed the proposal${quote ? ` and the ${quote} quote` : ""}. Are there any remaining questions around budget, deployment, data sources or license scope?`,
    NEGOTIATION: "To move the project forward, the next step is to confirm final scope, payment milestones, launch date and the person responsible for signing and acceptance.",
    WON: "Thank you for confirming the partnership. We will now move into deployment, delivery and customer success.",
    LOST: "Thank you for the earlier discussion. It would help us improve to understand the main reason the project did not move forward; we can reconnect if conditions change.",
  };
  return [greeting, "", context, quoteLine, "", statusBody[lead.status], "", "Reply with a suitable time or the key answers directly.", "", "Feng Liu / BossAI"].filter(Boolean).join("\n");
}

function createChineseReport(queue: FollowUpQueue, generated: Date): string {
  const sections = (["OVERDUE", "TODAY", "UNSCHEDULED", "UPCOMING"] as FollowUpBucket[])
    .map((bucket) => renderReportSection(queue.items.filter((item) => item.bucket === bucket), bucket, "zh"))
    .filter(Boolean)
    .join("\n\n");
  return `# BossAI Radar 商业线索跟进日报\n\n> 生成时间：${formatDate(generated, "zh")}  \n> 范围：未来 ${queue.windowDays} 天，并包含逾期与未排期活跃线索。\n\n## 今日结论\n\n- 逾期：${queue.stats.overdue}\n- 今天到期：${queue.stats.today}\n- 未来到期：${queue.stats.upcoming}\n- 未排期：${queue.stats.unscheduled}\n- HOT：${queue.stats.hot}\n\n${sections || "当前没有需要跟进的活跃线索。"}\n\n## 执行原则\n\n先处理逾期和 HOT，再处理今天到期；每次联系后更新状态、记录结果并安排下一次跟进时间。\n`;
}

function createEnglishReport(queue: FollowUpQueue, generated: Date): string {
  const sections = (["OVERDUE", "TODAY", "UNSCHEDULED", "UPCOMING"] as FollowUpBucket[])
    .map((bucket) => renderReportSection(queue.items.filter((item) => item.bucket === bucket), bucket, "en"))
    .filter(Boolean)
    .join("\n\n");
  return `# BossAI Radar Commercial Lead Follow-Up Brief\n\n> Generated: ${formatDate(generated, "en")}  \n> Window: next ${queue.windowDays} days, plus overdue and unscheduled active leads.\n\n## Executive Queue\n\n- Overdue: ${queue.stats.overdue}\n- Due today: ${queue.stats.today}\n- Upcoming: ${queue.stats.upcoming}\n- Unscheduled: ${queue.stats.unscheduled}\n- HOT: ${queue.stats.hot}\n\n${sections || "There are no active leads requiring follow-up."}\n\n## Execution Rule\n\nHandle overdue and HOT leads first, then today's queue. After every contact, update the stage, record the outcome and schedule the next follow-up.\n`;
}

function renderReportSection(items: FollowUpItem[], bucket: FollowUpBucket, language: "zh" | "en"): string {
  if (!items.length) return "";
  const title = bucketLabel(bucket, language);
  const rows = items.map((item, index) => {
    const lead = item.lead;
    const due = item.dueAt ? formatDate(new Date(item.dueAt), language) : (language === "en" ? "Not scheduled" : "未排期");
    if (language === "en") {
      return `${index + 1}. **${lead.name}${lead.company ? ` · ${lead.company}` : ""}** — ${lead.priority} / ${statusLabel(lead.status, "en")}\n   - Due: ${due}\n   - Contact: ${lead.contact}\n   - Reason: ${reasonFor(lead, item.bucket, item.daysDelta, "en")}\n   - Action: ${recommendedAction(lead, "en")}`;
    }
    return `${index + 1}. **${lead.name}${lead.company ? ` · ${lead.company}` : ""}** — ${lead.priority} / ${statusLabel(lead.status, "zh")}\n   - 到期：${due}\n   - 联系方式：${lead.contact}\n   - 原因：${reasonFor(lead, item.bucket, item.daysDelta, "zh")}\n   - 动作：${recommendedAction(lead, "zh")}`;
  });
  return `## ${title}\n\n${rows.join("\n\n")}`;
}

function bucketLabel(bucket: FollowUpBucket, language: "zh" | "en"): string {
  const zh: Record<FollowUpBucket, string> = { OVERDUE: "逾期队列", TODAY: "今日待办", UPCOMING: "未来到期", UNSCHEDULED: "未排期活跃线索" };
  const en: Record<FollowUpBucket, string> = { OVERDUE: "Overdue", TODAY: "Due Today", UPCOMING: "Upcoming", UNSCHEDULED: "Active but Unscheduled" };
  return language === "en" ? en[bucket] : zh[bucket];
}

function statusLabel(status: LeadStatus, language: "zh" | "en"): string {
  const zh: Record<LeadStatus, string> = { NEW: "新线索", WAITLIST: "等待名单", QUALIFIED: "已筛选", CONTACTED: "已联系", PROPOSAL: "已报价", NEGOTIATION: "谈判中", WON: "已成交", LOST: "已流失" };
  const en: Record<LeadStatus, string> = { NEW: "New", WAITLIST: "Waitlist", QUALIFIED: "Qualified", CONTACTED: "Contacted", PROPOSAL: "Proposal", NEGOTIATION: "Negotiation", WON: "Won", LOST: "Lost" };
  return language === "en" ? en[status] : zh[status];
}

function intentLabel(intent: LeadIntent, language: "zh" | "en"): string {
  const zh: Record<LeadIntent, string> = { commercial: "商业授权", "pro-waitlist": "Pro 等待名单", "white-label": "白标 / 转售", "managed-service": "托管实施" };
  const en: Record<LeadIntent, string> = { commercial: "commercial license", "pro-waitlist": "Pro waitlist", "white-label": "white-label / resale", "managed-service": "managed implementation" };
  return language === "en" ? en[intent] : zh[intent];
}

function timelineLabel(value: string, language: "zh" | "en"): string {
  const zh: Record<string, string> = { now: "立即", "30-days": "30 天内", "1-3-months": "1–3 个月", later: "3 个月以后", research: "暂时调研" };
  const en: Record<string, string> = { now: "immediately", "30-days": "within 30 days", "1-3-months": "within 1–3 months", later: "after 3 months", research: "research stage" };
  return language === "en" ? en[value] || value : zh[value] || value;
}

function formatQuote(value: number, currency: string, language: "zh" | "en"): string {
  try {
    return new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", {
      style: "currency",
      currency: currency || "CNY",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || "CNY"} ${value.toLocaleString()}`;
  }
}

function formatDate(value: Date, language: "zh" | "en"): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: language === "en",
  }).format(value);
}

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
