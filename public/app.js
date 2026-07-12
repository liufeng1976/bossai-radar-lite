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
  adminKey: sessionStorage.getItem("radar-admin-key") || "",
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

await loadDashboard();
setInterval(async () => {
  if (state.overview?.running) await loadDashboard({ quiet: true });
}, 12_000);

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
    render();
  } catch (error) {
    setStatus(t("status.connectionFailed"), "error");
    if (!quiet) showToast(error.message || t("refresh.failed"), true);
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
  renderEvidence();
  renderSources();
  renderSchedule();
  renderRuns();
}

function renderOpportunities() {
  if (!state.opportunities.length) {
    els.opportunityGrid.innerHTML = `<div class="empty-state">${escapeHtml(t("empty.opportunities"))}</div>`;
    return;
  }
  els.opportunityGrid.innerHTML = state.opportunities.slice(0, 9).map((item) => {
    const display = localizedOpportunity(item);
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
      </article>
    `;
  }).join("");
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
            : `<a href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`}
          <p>${escapeHtml(detail)}</p>
        </div>
        <span class="evidence-score">${number(item.totalScore)}</span>
      </article>
    `;
  }).join("");
}

function renderSources() {
  const latest = state.overview?.sourceStatus || [];
  const names = ["reddit", "hackernews", "github"];
  els.sourceList.innerHTML = names.map((name) => {
    const item = latest.find((source) => source.source === name);
    const status = item?.status || "idle";
    const detail = item
      ? `${formatNumber(item.items?.length || 0)} ${language === "en" ? "items" : "条"} · ${formatNumber(item.durationMs || 0)}ms`
      : t("source.waiting");
    return `
      <div class="source-row" title="${escapeAttribute(item?.error || "")}">
        <i class="source-status ${escapeHtml(status)}"></i>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
    `;
  }).join("");
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

let toastTimer;
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show${error ? " error" : ""}`;
  toastTimer = setTimeout(() => {
    els.toast.className = "toast";
  }, 4_500);
}

async function postWithAdminKey(url, retry = true) {
  try {
    return await api(url, {
      method: "POST",
      headers: state.adminKey ? { "x-radar-key": state.adminKey } : {},
    });
  } catch (error) {
    if (retry && error.status === 401) {
      const key = window.prompt(t("admin.prompt"), state.adminKey);
      if (key?.trim()) {
        state.adminKey = key.trim();
        sessionStorage.setItem("radar-admin-key", state.adminKey);
        return postWithAdminKey(url, false);
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
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
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
