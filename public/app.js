import {
  applyI18n,
  categoryLabel,
  decisionLabel,
  getLanguage,
  initLanguageToggle,
  t,
} from "./i18n.js";

const language = getLanguage();
applyI18n(document, language);
initLanguageToggle();
document.title = t("dashboard.title", {}, language);
const description = document.querySelector('meta[name="description"]');
if (description) description.setAttribute("content", t("dashboard.description", {}, language));

const state = {
  overview: null,
  opportunities: [],
  evidence: [],
  runs: [],
  delegations: [],
  adminKey: sessionStorage.getItem("radar-admin-key") || "",
};
let toastTimer;

const demoEvidenceTitles = {
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

const els = {
  scanButton: document.querySelector("#scanButton"),
  scanButtonLabel: document.querySelector("#scanButton .button-label"),
  demoButton: document.querySelector("#demoButton"),
  licenseButton: document.querySelector("#licenseButton"),
  licenseDialog: document.querySelector("#licenseDialog"),
  licenseContact: document.querySelector("#licenseContact"),
  leadWorkspaceButton: document.querySelector("#leadWorkspaceButton"),
  leadNavItem: document.querySelector("#leadNavItem"),
  reportButton: document.querySelector("#reportButton"),
  refreshButton: document.querySelector("#refreshButton"),
  systemStatus: document.querySelector("#systemStatus"),
  lastRunText: document.querySelector("#lastRunText"),
  executiveSummary: document.querySelector("#executiveSummary"),
  topScore: document.querySelector("#topScore"),
  evidenceMetric: document.querySelector("#evidenceMetric"),
  opportunityMetric: document.querySelector("#opportunityMetric"),
  sourceMetric: document.querySelector("#sourceMetric"),
  runMetric: document.querySelector("#runMetric"),
  briefGeneratedAt: document.querySelector("#briefGeneratedAt"),
  mustReadMetric: document.querySelector("#mustReadMetric"),
  quickScanMetric: document.querySelector("#quickScanMetric"),
  skipMetric: document.querySelector("#skipMetric"),
  mustReadList: document.querySelector("#mustReadList"),
  quickScanList: document.querySelector("#quickScanList"),
  contentIdeasList: document.querySelector("#contentIdeasList"),
  opportunityGrid: document.querySelector("#opportunityGrid"),
  evidenceList: document.querySelector("#evidenceList"),
  sourceList: document.querySelector("#sourceList"),
  nextRunText: document.querySelector("#nextRunText"),
  scheduleText: document.querySelector("#scheduleText"),
  runHistory: document.querySelector("#runHistory"),
  toast: document.querySelector("#toast"),
};

els.reportButton.href = `/api/report/latest.md?lang=${language}`;
els.scanButton.addEventListener("click", runScan);
els.demoButton.addEventListener("click", seedDemo);
els.licenseButton.addEventListener("click", () => els.licenseDialog.showModal());
els.refreshButton.addEventListener("click", loadDashboard);
els.opportunityGrid.addEventListener("click", (event) => {
  const redditGeoButton = event.target.closest("[data-delegate-reddit-geo]");
  if (redditGeoButton) {
    void delegateOpportunity(redditGeoButton.dataset.delegateRedditGeo, redditGeoButton, "reddit-geo");
    return;
  }
  const button = event.target.closest("[data-delegate-opportunity]");
  if (button) void delegateOpportunity(button.dataset.delegateOpportunity, button, "opportunity");
});

async function loadDashboard({ quiet = false } = {}) {
  try {
    const [overview, opportunities, evidence, runs] = await Promise.all([
      api("/api/overview"),
      api("/api/opportunities?limit=12"),
      api("/api/evidence?limit=8"),
      api("/api/runs?limit=5"),
    ]);
    state.overview = overview;
    state.opportunities = opportunities.items || [];
    state.evidence = evidence.items || [];
    state.runs = runs.items || [];
    await loadBossAiDelegations(overview);
    render();
  } catch (error) {
    setStatus(t("status.connectionFailed"), "error");
    if (!quiet) showToast(error.message || t("refresh.failed"), true);
  }
}

async function loadBossAiDelegations(overview) {
  state.delegations = [];
  if (!overview?.config?.ai?.employeeDelegationConfigured) return;
  try {
    const payload = await api("/api/admin/bossai/delegations?limit=100", {
      headers: state.adminKey ? { "x-radar-key": state.adminKey } : {},
    });
    state.delegations = payload.items || [];
  } catch (error) {
    if (error.status !== 401) console.warn("[BossAI OS] Delegation status unavailable", error);
  }
}

async function seedDemo() {
  if (els.demoButton.disabled) return;
  setActionLoading(true);
  showToast(t("demo.start"));
  try {
    const result = await postWithAdminKey("/api/demo/seed");
    showToast(t("demo.done", {
      evidence: result.run.evidenceCount,
      opportunities: result.run.opportunityCount,
    }));
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || t("demo.failed"), true);
  } finally {
    setActionLoading(false);
  }
}

async function runScan() {
  if (els.scanButton.disabled) return;
  setScanLoading(true);
  setStatus(t("status.scanning"), "running");
  showToast(t("scan.start"));
  try {
    const result = await postWithAdminKey("/api/scan");
    showToast(t("scan.done", {
      collected: result.run.collectedCount,
      opportunities: result.run.opportunityCount,
    }));
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || t("scan.failed"), true);
    await loadDashboard({ quiet: true });
  } finally {
    setScanLoading(false);
  }
}

function render() {
  const overview = state.overview;
  const stats = overview?.stats || {};
  const latestRun = overview?.latestRun;
  const top = state.opportunities[0];
  configureCommercialContact(overview?.config?.commercial);
  const leadAdminEnabled = overview?.config?.commercial?.leadAdminEnabled !== false;
  els.leadWorkspaceButton.hidden = !leadAdminEnabled;
  els.leadNavItem.hidden = !leadAdminEnabled;
  els.demoButton.hidden = overview?.config?.demoEnabled === false;

  els.evidenceMetric.textContent = formatNumber(stats.evidence || 0);
  els.opportunityMetric.textContent = formatNumber(stats.opportunities || 0);
  els.sourceMetric.textContent = formatNumber(stats.sources || 0);
  els.runMetric.textContent = formatNumber(stats.runs || 0);
  els.topScore.textContent = top ? String(top.score) : "--";
  els.executiveSummary.textContent = localizedExecutiveSummary(overview, top);
  els.lastRunText.textContent = latestRun
    ? localizedLastRun(latestRun)
    : t("status.noRun");

  if (overview?.running) {
    setStatus(t("status.scanning"), "running");
    setScanLoading(true);
  } else if (latestRun?.status === "failed") {
    setStatus(t("status.error"), "error");
    setScanLoading(false);
  } else {
    setStatus(t("status.online"), "");
    setScanLoading(false);
  }

  renderOpportunities();
  renderBrief();
  renderEvidence();
  renderSources();
  renderSchedule();
  renderRuns();
}

function renderBrief() {
  const report = state.overview?.latestReport;
  const localizedStructuredBrief = language === "en" ? normalizeBrief(report?.briefEnglish) : null;
  const brief = localizedStructuredBrief
    || normalizeBrief(report?.brief)
    || parseBriefMarkdown(language === "en" ? report?.markdownEnglish : report?.markdown)
    || parseBriefMarkdown(report?.markdown);
  const useProvidedCopy = language === "zh" || Boolean(localizedStructuredBrief);
  const counts = brief?.counts || {};
  els.mustReadMetric.textContent = formatNumber(counts.MUST_READ || 0);
  els.quickScanMetric.textContent = formatNumber(counts.QUICK_SCAN || 0);
  els.skipMetric.textContent = formatNumber(counts.SKIP || 0);
  els.briefGeneratedAt.textContent = report?.generatedAt
    ? t("brief.generated", { time: formatDateTime(report.generatedAt) })
    : t("brief.waiting");

  renderBriefItems(els.mustReadList, brief?.mustRead || [], "brief.emptyMustRead", useProvidedCopy);
  renderBriefItems(els.quickScanList, brief?.quickScan || [], "brief.emptyQuickScan", useProvidedCopy);

  const ideas = localizedContentIdeas(brief, useProvidedCopy);
  els.contentIdeasList.innerHTML = ideas.length
    ? ideas.map((idea) => `<li>${escapeHtml(idea)}</li>`).join("")
    : `<li class="brief-empty">${escapeHtml(t("brief.emptyIdeas"))}</li>`;
}

function renderBriefItems(container, items, emptyKey, useProvidedCopy) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t(emptyKey))}</div>`;
    return;
  }
  container.innerHTML = items.slice(0, 8).map((item) => {
    const title = String(item.title || t("common.unknown"));
    const url = safeRawUrl(item.url);
    const titleMarkup = url === "#"
      ? `<span class="brief-item-title">${escapeHtml(title)}</span>`
      : `<a class="brief-item-title" href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`;
    return `
      <article class="brief-item">
        <div class="brief-item-top">
          <span class="source-badge">${escapeHtml(item.source || t("common.unknown"))}</span>
          <strong>${number(item.totalScore)}</strong>
        </div>
        ${titleMarkup}
        <p>${escapeHtml(localizedBriefReason(item, useProvidedCopy))}</p>
      </article>
    `;
  }).join("");
}

function localizedBriefReason(item, useProvidedCopy) {
  if (useProvidedCopy && item.reason) return item.reason;
  const signals = [];
  if (number(item.paymentScore) >= 14) signals.push(t("brief.signalPayment"));
  if (number(item.painScore) >= 18) signals.push(t("brief.signalPain"));
  if (number(item.urgencyScore) >= 10) signals.push(t("brief.signalUrgency"));
  if (number(item.engagement) >= 20) signals.push(t("brief.signalEngagement"));
  if (signals.length) return signals.slice(0, 2).join(" · ");
  return t("brief.signalScore", { score: number(item.totalScore) });
}

function localizedContentIdeas(brief, useProvidedCopy) {
  if (useProvidedCopy) return brief?.contentIdeas || [];
  const ideas = [];
  for (const opportunity of state.opportunities.slice(0, 3)) {
    const display = localizedOpportunity(opportunity);
    ideas.push(t("brief.ideaOpportunity", {
      title: display.title,
      decision: decisionLabel(opportunity.decision, language),
    }));
  }
  for (const item of [...(brief?.mustRead || []), ...(brief?.quickScan || [])]) {
    if (ideas.length >= 6) break;
    ideas.push(t("brief.ideaEvidence", { title: truncateText(item.title, 72) }));
  }
  return [...new Set(ideas)].slice(0, 6);
}

function normalizeBrief(value) {
  if (!value || typeof value !== "object") return null;
  const mustRead = Array.isArray(value.mustRead) ? value.mustRead : [];
  const quickScan = Array.isArray(value.quickScan) ? value.quickScan : [];
  const skip = Array.isArray(value.skip) ? value.skip : [];
  const counts = value.counts && typeof value.counts === "object" ? value.counts : {};
  return {
    mustRead,
    quickScan,
    skip,
    contentIdeas: Array.isArray(value.contentIdeas)
      ? value.contentIdeas.filter((idea) => typeof idea === "string" && idea.trim()).map((idea) => idea.trim())
      : [],
    counts: {
      MUST_READ: number(counts.MUST_READ ?? mustRead.length),
      QUICK_SCAN: number(counts.QUICK_SCAN ?? quickScan.length),
      SKIP: number(counts.SKIP ?? skip.length),
    },
  };
}

function parseBriefMarkdown(markdown) {
  if (typeof markdown !== "string" || !markdown.includes("## 今日信息分级")) return null;
  const counts = {
    MUST_READ: markdownCount(markdown, "必读"),
    QUICK_SCAN: markdownCount(markdown, "速览"),
    SKIP: markdownCount(markdown, "可跳过"),
  };
  return {
    counts,
    mustRead: parseMarkdownBriefSection(markdown, "必读", "速览"),
    quickScan: parseMarkdownBriefSection(markdown, "速览", "可跳过"),
    skip: parseMarkdownBriefSection(markdown, "可跳过", "可直接转化的内容选题"),
    contentIdeas: parseMarkdownIdeas(markdown),
  };
}

function markdownCount(markdown, label) {
  const match = markdown.match(new RegExp(`^- ${label}：\\s*(\\d+)\\s*条`, "m"));
  return number(match?.[1]);
}

function parseMarkdownBriefSection(markdown, heading, nextHeading) {
  const start = markdown.indexOf(`### ${heading}`);
  if (start < 0) return [];
  const bodyStart = start + `### ${heading}`.length;
  const end = markdown.indexOf(`### ${nextHeading}`, bodyStart);
  const body = markdown.slice(bodyStart, end < 0 ? markdown.length : end);
  const pattern = /^\d+\.\s+\*\*\[([^\]]+)]\s+(.+?)\*\*\s{2}\r?\n\s*(.+?)；评分\s+(\d+)\/100；\[查看原文]\((https?:\/\/\S+)\)\s*$/gm;
  return [...body.matchAll(pattern)].map((match) => ({
    source: match[1],
    title: unescapeMarkdown(match[2]),
    reason: match[3],
    totalScore: number(match[4]),
    url: match[5],
  }));
}

function parseMarkdownIdeas(markdown) {
  const marker = "### 可直接转化的内容选题";
  const start = markdown.indexOf(marker);
  if (start < 0) return [];
  return markdown.slice(start + marker.length)
    .split(/\r?\n/)
    .map((line) => line.match(/^-\s+(.+)/)?.[1]?.trim())
    .filter((idea) => idea && !idea.startsWith("暂无"));
}

function unescapeMarkdown(value) {
  return String(value || "").replace(/\\([\\`*_{}\[\]()#+.!|-])/g, "$1");
}

function renderOpportunities() {
  if (!state.opportunities.length) {
    els.opportunityGrid.innerHTML = `<div class="empty-state">${escapeHtml(t("empty.opportunities"))}</div>`;
    return;
  }
  const delegationConfigured = state.overview?.config?.ai?.employeeDelegationConfigured === true;
  els.opportunityGrid.innerHTML = state.opportunities.slice(0, 9).map((item) => {
    const display = localizedOpportunity(item);
    const delegation = latestDelegation(item.id);
    return `
      <article class="opportunity-card">
        <div class="opportunity-top">
          <span class="decision ${decisionClass(item.decision)}">${escapeHtml(decisionLabel(item.decision, language))}</span>
          ${item.isDemo ? `<span class="demo-badge">${escapeHtml(t("common.demo"))}</span>` : ""}
          <span class="score-label"><strong>${number(item.score)}</strong> / 100</span>
        </div>
        <h4>${escapeHtml(display.title)}</h4>
        <p>${escapeHtml(display.summary)}</p>
        <div class="opportunity-meta">
          <span>${escapeHtml(t("evidence.items", { count: number(item.evidenceCount) }))}</span>
          <span>${escapeHtml(t("evidence.sources", { count: number(item.sourceCount) }))}</span>
          <span>${escapeHtml(categoryLabel(item.category, language))}</span>
        </div>
        <div class="score-track" aria-label="${escapeAttribute(`${display.title} ${number(item.score)}/100`)}"><span style="width:${Math.max(0, Math.min(100, Number(item.score) || 0))}%"></span></div>
        <div class="price-row">
          <span>${escapeHtml(t("opportunity.validation"))}</span>
          <strong>${escapeHtml(display.priceHint)}</strong>
        </div>
        ${delegationConfigured && !item.isDemo ? `
          <div class="employee-action-row">
            <div>
              <span class="employee-status ${escapeAttribute(delegation?.status || "idle")}">${escapeHtml(employeeStatusLabel(delegation))}</span>
              ${delegation ? `<small>${escapeHtml(t("employee.review", { status: reviewStatusLabel(delegation.reviewStatus) }))}</small>` : `<small>${escapeHtml(t("employee.safeNote"))}</small>`}
            </div>
            <div class="employee-button-stack">
              <button class="text-button employee-delegate-button" type="button" data-delegate-opportunity="${escapeAttribute(item.id)}" ${["queued", "running"].includes(delegation?.status) ? "disabled" : ""}>
                ${escapeHtml(delegation ? t("employee.refreshOrRerun") : t("employee.delegate"))}
              </button>
              <button class="text-button employee-delegate-button reddit-geo-button" type="button" data-delegate-reddit-geo="${escapeAttribute(item.id)}" ${["queued", "running"].includes(delegation?.status) ? "disabled" : ""}>
                ${escapeHtml(t("employee.delegateRedditGeo"))}
              </button>
            </div>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function latestDelegation(opportunityId) {
  return state.delegations
    .filter((item) => item.sourceType === "opportunity" && item.sourceRecordId === opportunityId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
}

function employeeStatusLabel(delegation) {
  if (!delegation) return t("employee.ready");
  return t(`employee.status.${delegation.status}`);
}

function reviewStatusLabel(status) {
  return t(`employee.reviewStatus.${status || "pending"}`);
}

async function delegateOpportunity(opportunityId, button, mode = "opportunity") {
  if (!opportunityId || button.disabled) return;
  const opportunity = state.opportunities.find((item) => item.id === opportunityId);
  if (!opportunity || opportunity.isDemo) {
    showToast(t("employee.demoBlocked"), true);
    return;
  }
  button.disabled = true;
  button.textContent = t("employee.submitting");
  try {
    const objective = mode === "reddit-geo"
      ? language === "en"
        ? `Ask BossAI Intelligence Agent to analyze the verified Radar evidence for Reddit communities and GEO opportunities around “${opportunity.title}”, identify community-rule gaps, and produce a review-gated bossai.intelligence-handoff.v1 package. Do not scan, post, message users or change Radar data.`
        : `让 BossAI Intelligence Agent 基于 Radar 已验证机会“${opportunity.title}”的证据分析 Reddit 社区信号和 GEO 内容机会，标出版规缺口并生成需人工审核的 bossai.intelligence-handoff.v1 交接包。不得扫描、发帖、私信或修改 Radar 数据。`
      : language === "en"
        ? `Ask BossAI Intelligence Agent to review the verified Radar opportunity “${opportunity.title}”, its evidence, payment signals and competition, then produce a reviewable BUILD / SELL_SERVICE / WATCH / IGNORE decision framework.`
        : `让 BossAI Intelligence Agent 复核 Radar 已验证机会“${opportunity.title}”的证据、付费信号和竞争情况，形成可供老板审核的 BUILD / SELL_SERVICE / WATCH / IGNORE 判断框架。`;
    const result = await postWithAdminKey(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/delegate`, { objective });
    const delegation = result.delegation;
    state.delegations = [
      delegation,
      ...state.delegations.filter((item) => item.sourceOperationId !== delegation.sourceOperationId),
    ];
    showToast(t("employee.submitted", { status: t(`employee.status.${delegation.status}`) }));
    renderOpportunities();
  } catch (error) {
    showToast(error.message || t("employee.failed"), true);
    button.disabled = false;
    button.textContent = t(mode === "reddit-geo" ? "employee.delegateRedditGeo" : "employee.delegate");
  }
}

function renderEvidence() {
  if (!state.evidence.length) {
    els.evidenceList.innerHTML = `<div class="empty-state">${escapeHtml(t("empty.evidence"))}</div>`;
    return;
  }
  els.evidenceList.innerHTML = state.evidence.map((item) => {
    const title = localizedEvidenceTitle(item);
    const detail = [
      item.isDemo ? t("evidence.demoPrefix") : null,
      categoryLabel(item.category, language),
      relativeTime(item.publishedAt),
      t("evidence.engagement", { count: number(item.engagement) }),
    ].filter(Boolean).join(" · ");
    return `
      <article class="evidence-item">
        <span class="source-badge">${escapeHtml(item.source)}</span>
        <div class="evidence-copy">
          ${item.isDemo
            ? `<span class="evidence-title">${escapeHtml(title)}</span>`
            : `<a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`}
          <p>${escapeHtml(detail)}</p>
        </div>
        <span class="evidence-score">${number(item.totalScore)}</span>
      </article>
    `;
  }).join("");
}

function renderSources() {
  const latest = state.overview?.sourceStatus || [];
  const expected = ["reddit", "hackernews", "github", "arxiv", "rss"];
  const names = [...new Set([...expected, ...latest.map((item) => item?.source).filter(Boolean)])];
  els.sourceList.innerHTML = names.map((name) => {
    const item = latest.find((source) => source.source === name);
    const status = sourceStatusClass(item?.status);
    const detail = sourceDetail(name, item);
    return `
      <div class="source-row" title="${escapeAttribute(item?.error || "")}">
        <i class="source-status ${escapeAttribute(status)}"></i>
        <strong>${escapeHtml(sourceLabel(name))}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
    `;
  }).join("");
}

function sourceDetail(name, item) {
  if (item?.status === "skipped") return t("source.skipped");
  if (item) {
    return t("source.result", {
      count: formatNumber(item.items?.length || 0),
      duration: formatNumber(item.durationMs || 0),
    });
  }
  if (name === "rss" && number(state.overview?.config?.sources?.rssFeedCount) === 0) {
    return t("source.notConfigured");
  }
  return t("source.waiting");
}

function sourceLabel(name) {
  const key = `source.name.${name}`;
  const translated = t(key);
  return translated === key ? name : translated;
}

function sourceStatusClass(status) {
  return ["success", "partial", "failed", "skipped"].includes(status) ? status : "idle";
}

function renderSchedule() {
  const scheduler = state.overview?.scheduler;
  if (!scheduler?.enabled) {
    els.nextRunText.textContent = t("schedule.disabled");
    els.scheduleText.textContent = scheduler?.runOnStartup
      ? (language === "en" ? "Startup scan enabled · Daily schedule disabled" : "启动扫描已启用 · 每日定时未启用")
      : (language === "en" ? "Startup scan and daily schedule are disabled" : "启动扫描与每日定时均未启用");
    return;
  }
  els.nextRunText.textContent = scheduler.nextRunAt ? formatDateTime(scheduler.nextRunAt) : t("schedule.calculating");
  const time = `${pad(scheduler.dailyHour)}:${pad(scheduler.dailyMinute)}`;
  const base = t("schedule.daily", { time, timezone: scheduler.timeZone });
  const startup = language === "en"
    ? `Startup scan ${scheduler.runOnStartup ? "on" : "off"}`
    : `启动扫描${scheduler.runOnStartup ? "开启" : "关闭"}`;
  els.scheduleText.textContent = `${base} · ${startup}`;
}

function renderRuns() {
  if (!state.runs.length) {
    els.runHistory.innerHTML = "";
    return;
  }
  els.runHistory.innerHTML = state.runs.map((run) => {
    const countText = language === "en" ? `${number(run.collectedCount)} items` : `${number(run.collectedCount)} 条`;
    return `
      <div class="run-item">
        <strong>#${number(run.id)} · ${escapeHtml(localizedTrigger(run.trigger))}</strong>
        <span>${escapeHtml(localizedRunStatus(run.status))} · ${escapeHtml(countText)} · ${escapeHtml(relativeTime(run.startedAt))}</span>
      </div>
    `;
  }).join("");
}

function localizedExecutiveSummary(overview, top) {
  if (language === "zh") return overview?.latestReport?.executiveSummary || t("status.noReport");
  if (!top) return t("status.noReport");
  const display = localizedOpportunity(top);
  const run = overview?.latestRun;
  const demoPrefix = run?.trigger === "demo" ? "Demo data: " : "";
  return `${demoPrefix}${run?.collectedCount ?? 0} public items produced ${run?.opportunityCount ?? state.opportunities.length} opportunities. The current top priority is “${display.title}” (${top.score}/100, ${decisionLabel(top.decision, language)}).`;
}

function localizedLastRun(run) {
  if (language === "en") return `Last scan ${relativeTime(run.finishedAt || run.startedAt)} · ${localizedRunStatus(run.status)}`;
  return `上次扫描 ${relativeTime(run.finishedAt || run.startedAt)} · ${localizedRunStatus(run.status)}`;
}

function localizedOpportunity(item) {
  if (language === "zh") {
    return { title: item.title, summary: item.summary, priceHint: item.priceHint };
  }
  const definitions = {
    "customer-support": ["AI Customer Support Copilot", "Generate reviewable support replies, refund guidance and logistics actions for ecommerce teams."],
    "content-video": ["Ecommerce Content & Short-Video Assistant", "Turn product information into scripts, hooks, shot plans and publishing assets."],
    "listing-seo": ["Listing & Keyword Optimization Tool", "Improve titles, bullets, keywords and multilingual product descriptions at scale."],
    "ads-growth": ["Ads Diagnosis & Growth Assistant", "Translate campaign performance into actionable budget, audience and creative decisions."],
    "store-automation": ["Ecommerce Operations Automation Workspace", "Detect order, inventory and workflow exceptions and generate clear operational actions."],
    "analytics-research": ["Overseas Demand & Competitor Intelligence Radar", "Collect public market evidence and turn it into ranked opportunities and action reports."],
    "developer-tools": ["AI Ecommerce Integration Toolkit", "Provide reusable APIs, workflow templates and observable integration components."],
    general: ["AI Business Opportunity Validation", "Validate a recurring business pain with evidence before committing to product development."],
  };
  const [title, offer] = definitions[item.category] || definitions.general;
  const actions = {
    BUILD: "The evidence clears the build threshold; create a focused MVP and pursue the first paid users.",
    SELL_SERVICE: "Start with a human-assisted paid service to validate willingness to pay before productizing.",
    WATCH: "Continue collecting cross-source and explicit budget evidence before investing in development.",
    IGNORE: "Evidence is currently too weak to justify development resources.",
  };
  return {
    title,
    summary: `${offer} ${actions[item.decision]} Evidence: ${item.evidenceCount} items across ${item.sourceCount} sources.`,
    priceHint: englishPriceHint(item.category, item.decision),
  };
}

function englishPriceHint(category, decision) {
  if (decision === "IGNORE") return "No offer yet";
  if (decision === "WATCH") return "Interviews or low-cost validation";
  if (decision === "SELL_SERVICE") return category === "ads-growth" ? "$299–$999/month service" : "$149–$599 validation service";
  return category === "developer-tools" ? "$29–$99/month" : "$99–$499/year or usage-based";
}

function localizedEvidenceTitle(item) {
  if (language === "en" && item.isDemo) return demoEvidenceTitles[item.externalId] || item.title;
  return item.title;
}

function localizedTrigger(trigger) {
  if (language === "zh") return ({ manual: "手动", startup: "启动", scheduled: "定时", demo: "演示" })[trigger] || trigger;
  return ({ manual: "manual", startup: "startup", scheduled: "scheduled", demo: "demo" })[trigger] || trigger;
}

function localizedRunStatus(status) {
  if (language === "zh") return ({ running: "运行中", success: "成功", partial: "部分成功", failed: "失败" })[status] || status;
  return ({ running: "RUNNING", success: "SUCCESS", partial: "PARTIAL", failed: "FAILED" })[status] || status;
}

function setActionLoading(loading) {
  els.scanButton.disabled = Boolean(loading);
  els.demoButton.disabled = Boolean(loading);
}

function setScanLoading(loading) {
  setActionLoading(loading);
  els.scanButton.classList.toggle("loading", Boolean(loading));
  els.scanButtonLabel.textContent = loading ? t("button.scanning") : t("button.scan");
}

function setStatus(text, kind) {
  els.systemStatus.textContent = text;
  els.systemStatus.className = `status-pill${kind ? ` ${kind}` : ""}`;
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show${error ? " error" : ""}`;
  toastTimer = setTimeout(() => {
    els.toast.className = "toast";
  }, 4_500);
}

async function postWithAdminKey(url, body, retry = true) {
  try {
    return await api(url, {
      method: "POST",
      headers: {
        ...(state.adminKey ? { "x-radar-key": state.adminKey } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (retry && error.status === 401) {
      const key = window.prompt(t("admin.prompt"), state.adminKey);
      if (key?.trim()) {
        state.adminKey = key.trim();
        sessionStorage.setItem("radar-admin-key", state.adminKey);
        return postWithAdminKey(url, body, false);
      }
    }
    throw error;
  }
}

function configureCommercialContact(commercial) {
  const url = typeof commercial?.url === "string" ? commercial.url.trim() : "";
  els.licenseContact.href = url ? safeRawUrl(url) : `/commercial.html?intent=commercial&lang=${language}`;
  els.licenseContact.textContent = url ? (language === "en" ? "Open Commercial License Page" : "打开商业授权页面") : t("license.apply");
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(typeof payload === "string" ? payload : payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function decisionClass(decision) {
  return String(decision || "").toLowerCase().replaceAll("_", "-");
}

function formatNumber(value) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", {
    notation: Number(value) > 9999 ? "compact" : "standard",
  }).format(Number(value) || 0);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: language === "en",
  }).format(date);
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(language === "en" ? "en-US" : "zh-CN", { numeric: "auto" });
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86_400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86_400), "day");
}

function safeRawUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "#";
  } catch {
    return "#";
  }
}

function safeUrl(value) {
  return escapeAttribute(safeRawUrl(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function pad(value) {
  return String(number(value)).padStart(2, "0");
}

function truncateText(value, max) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1))}…`;
}

await loadDashboard();
setInterval(async () => {
  if (state.overview?.running) await loadDashboard({ quiet: true });
}, 12_000);
