const state = {
  overview: null,
  opportunities: [],
  evidence: [],
  runs: [],
  adminKey: sessionStorage.getItem("radar-admin-key") || "",
};

const els = {
  scanButton: document.querySelector("#scanButton"),
  demoButton: document.querySelector("#demoButton"),
  licenseButton: document.querySelector("#licenseButton"),
  licenseDialog: document.querySelector("#licenseDialog"),
  licenseContact: document.querySelector("#licenseContact"),
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
    setStatus("连接失败", "error");
    if (!quiet) showToast(error.message || "无法读取雷达数据", true);
  }
}

async function seedDemo() {
  if (els.demoButton.disabled) return;
  setActionLoading(true);
  showToast("正在载入明确标记的合成演示数据…");
  try {
    const result = await postWithAdminKey("/api/demo/seed");
    showToast(`演示数据已载入：${result.run.evidenceCount} 条证据，${result.run.opportunityCount} 个机会。`);
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || "演示数据载入失败", true);
  } finally {
    setActionLoading(false);
  }
}

async function runScan() {
  if (els.scanButton.disabled) return;
  setScanLoading(true);
  setStatus("扫描中", "running");
  showToast("正在采集 Reddit、Hacker News 和 GitHub 公开证据…");
  try {
    const result = await postWithAdminKey("/api/scan");
    showToast(`扫描完成：采集 ${result.run.collectedCount} 条，形成 ${result.run.opportunityCount} 个机会。`);
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || "扫描失败", true);
    await loadDashboard({ quiet: true });
  } finally {
    setScanLoading(false);
  }
}

function render() {
  const overview = state.overview;
  const stats = overview?.stats || {};
  const latestRun = overview?.latestRun;
  const latestReport = overview?.latestReport;
  const top = state.opportunities[0];
  configureCommercialContact(overview?.config?.commercial);
  els.demoButton.hidden = overview?.config?.demoEnabled === false;

  els.evidenceMetric.textContent = formatNumber(stats.evidence || 0);
  els.opportunityMetric.textContent = formatNumber(stats.opportunities || 0);
  els.sourceMetric.textContent = formatNumber(stats.sources || 0);
  els.runMetric.textContent = formatNumber(stats.runs || 0);
  els.topScore.textContent = top ? String(top.score) : "--";
  els.executiveSummary.textContent = latestReport?.executiveSummary || "尚未生成日报。系统将在首次扫描后给出 CEO 结论。";
  els.lastRunText.textContent = latestRun
    ? `上次扫描 ${relativeTime(latestRun.finishedAt || latestRun.startedAt)} · ${latestRun.status.toUpperCase()}`
    : "尚未执行扫描";

  if (overview?.running) {
    setStatus("扫描中", "running");
    setScanLoading(true);
  } else if (latestRun?.status === "failed") {
    setStatus("需检查", "error");
    setScanLoading(false);
  } else {
    setStatus("系统在线", "");
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
    els.opportunityGrid.innerHTML = '<div class="empty-state">尚无机会数据，首次自动扫描完成后会在这里显示。</div>';
    return;
  }
  els.opportunityGrid.innerHTML = state.opportunities.slice(0, 9).map((item) => `
    <article class="opportunity-card">
      <div class="opportunity-top">
        <span class="decision ${decisionClass(item.decision)}">${escapeHtml(item.decision.replace("_", " "))}</span>
        ${item.isDemo ? '<span class="demo-badge">DEMO</span>' : ""}
        <span class="score-label"><strong>${number(item.score)}</strong> / 100</span>
      </div>
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.summary)}</p>
      <div class="opportunity-meta">
        <span>${number(item.evidenceCount)} 条证据</span>
        <span>${number(item.sourceCount)} 个来源</span>
        <span>${escapeHtml(item.category)}</span>
      </div>
      <div class="score-track" aria-label="机会评分 ${number(item.score)}"><span style="width:${Math.max(0, Math.min(100, Number(item.score) || 0))}%"></span></div>
      <div class="price-row">
        <span>建议商业验证</span>
        <strong>${escapeHtml(item.priceHint)}</strong>
      </div>
    </article>
  `).join("");
}

function renderEvidence() {
  if (!state.evidence.length) {
    els.evidenceList.innerHTML = '<div class="empty-state">暂无证据。</div>';
    return;
  }
  els.evidenceList.innerHTML = state.evidence.map((item) => `
    <article class="evidence-item">
      <span class="source-badge">${escapeHtml(item.source)}</span>
      <div class="evidence-copy">
        ${item.isDemo
          ? `<span class="evidence-title">${escapeHtml(item.title)}</span>`
          : `<a href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>`}
        <p>${item.isDemo ? "演示数据 · " : ""}${escapeHtml(item.category)} · ${relativeTime(item.publishedAt)} · 互动 ${number(item.engagement)}</p>
      </div>
      <span class="evidence-score">${number(item.totalScore)}</span>
    </article>
  `).join("");
}

function renderSources() {
  const latest = state.overview?.sourceStatus || [];
  const names = ["reddit", "hackernews", "github"];
  els.sourceList.innerHTML = names.map((name) => {
    const item = latest.find((source) => source.source === name);
    const status = item?.status || "idle";
    const detail = item ? `${number(item.items?.length || 0)} 条 · ${number(item.durationMs || 0)}ms` : "等待首次扫描";
    return `
      <div class="source-row" title="${escapeHtml(item?.error || "")}">
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
    els.nextRunText.textContent = "定时扫描未启用";
    els.scheduleText.textContent = scheduler?.runOnStartup
      ? "启动扫描已启用 · 可在 .env 开启每日定时"
      : "启动扫描与每日定时均未启用";
    return;
  }
  els.nextRunText.textContent = scheduler.nextRunAt ? formatDateTime(scheduler.nextRunAt) : "正在计算";
  els.scheduleText.textContent = `每天 ${pad(scheduler.dailyHour)}:${pad(scheduler.dailyMinute)} · ${scheduler.timeZone} · 启动扫描${scheduler.runOnStartup ? "开启" : "关闭"}`;
}

function renderRuns() {
  if (!state.runs.length) {
    els.runHistory.innerHTML = "";
    return;
  }
  els.runHistory.innerHTML = state.runs.map((run) => `
    <div class="run-item">
      <strong>#${number(run.id)} · ${escapeHtml(run.trigger)}</strong>
      <span>${escapeHtml(run.status)} · ${number(run.collectedCount)} 条 · ${relativeTime(run.startedAt)}</span>
    </div>
  `).join("");
}

function setActionLoading(loading) {
  els.scanButton.disabled = Boolean(loading);
  els.demoButton.disabled = Boolean(loading);
}

function setScanLoading(loading) {
  setActionLoading(loading);
  els.scanButton.classList.toggle("loading", Boolean(loading));
  const textNode = [...els.scanButton.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.textContent = loading ? " 扫描中" : " 立即扫描";
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
      const key = window.prompt("请输入 RADAR_ADMIN_API_KEY。密钥只保存在本次浏览器会话中。", state.adminKey);
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
  const email = typeof commercial?.email === "string" ? commercial.email.trim() : "";
  const url = typeof commercial?.url === "string" ? commercial.url.trim() : "";
  if (url) {
    els.licenseContact.href = safeRawUrl(url);
    els.licenseContact.textContent = "打开商业授权页面";
    return;
  }
  if (email) {
    els.licenseContact.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("BossAI Radar Lite 商业授权咨询")}`;
    els.licenseContact.textContent = `邮件联系 ${email}`;
    return;
  }
  els.licenseContact.removeAttribute("href");
  els.licenseContact.textContent = "请在 .env 配置授权联系方式";
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
  return new Intl.NumberFormat("zh-CN", { notation: Number(value) > 9999 ? "compact" : "standard" }).format(Number(value) || 0);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
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
