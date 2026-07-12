import { applyI18n, getLanguage, initLanguageToggle, t } from "./i18n.js";

const language = getLanguage();
const STATUS_VALUES = ["NEW", "WAITLIST", "QUALIFIED", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

applyI18n(document, language);
initLanguageToggle();
document.title = t("leads.title", {}, language);
const description = document.querySelector('meta[name="description"]');
if (description) description.setAttribute("content", t("leads.description", {}, language));

const state = {
  adminKey: sessionStorage.getItem("radar-admin-key") || "",
  leads: [],
  stats: null,
  followups: null,
  current: null,
  currentDraft: null,
  loading: false,
};

const els = {
  authPanel: document.querySelector("#authPanel"),
  adminKeyInput: document.querySelector("#adminKeyInput"),
  connectButton: document.querySelector("#connectButton"),
  refreshButton: document.querySelector("#refreshLeadsButton"),
  exportButton: document.querySelector("#exportButton"),
  statusFilter: document.querySelector("#statusFilter"),
  intentFilter: document.querySelector("#intentFilter"),
  priorityFilter: document.querySelector("#priorityFilter"),
  searchInput: document.querySelector("#leadSearch"),
  totalMetric: document.querySelector("#leadTotal"),
  activeMetric: document.querySelector("#leadActive"),
  hotMetric: document.querySelector("#leadHot"),
  dueTodayMetric: document.querySelector("#leadDueToday"),
  overdueMetric: document.querySelector("#leadOverdue"),
  quotedMetric: document.querySelector("#leadQuoted"),
  wonMetric: document.querySelector("#leadWon"),
  followupQueue: document.querySelector("#followupQueue"),
  followupEmpty: document.querySelector("#followupEmpty"),
  downloadFollowupReport: document.querySelector("#downloadFollowupReport"),
  downloadFollowupCalendar: document.querySelector("#downloadFollowupCalendar"),
  funnel: document.querySelector("#leadFunnel"),
  rows: document.querySelector("#leadRows"),
  empty: document.querySelector("#leadEmpty"),
  pageStatus: document.querySelector("#leadStatus"),
  dialog: document.querySelector("#leadDialog"),
  detailForm: document.querySelector("#leadDetailForm"),
  detailName: document.querySelector("#detailName"),
  detailReference: document.querySelector("#detailReference"),
  detailScore: document.querySelector("#detailScore"),
  detailContact: document.querySelector("#detailContact"),
  detailIntent: document.querySelector("#detailIntent"),
  detailTeam: document.querySelector("#detailTeam"),
  detailTimeline: document.querySelector("#detailTimeline"),
  detailDeployment: document.querySelector("#detailDeployment"),
  detailBudget: document.querySelector("#detailBudget"),
  detailScenario: document.querySelector("#detailScenario"),
  detailRequirements: document.querySelector("#detailRequirements"),
  detailStatus: document.querySelector("#detailStatus"),
  detailPriority: document.querySelector("#detailPriority"),
  detailOwner: document.querySelector("#detailOwner"),
  detailQuote: document.querySelector("#detailQuote"),
  detailCurrency: document.querySelector("#detailCurrency"),
  detailFollowup: document.querySelector("#detailFollowup"),
  saveButton: document.querySelector("#saveLeadButton"),
  deleteButton: document.querySelector("#deleteLeadButton"),
  followupRecommendedAction: document.querySelector("#followupRecommendedAction"),
  followupSubject: document.querySelector("#followupSubject"),
  followupMessage: document.querySelector("#followupMessage"),
  copyFollowupDraft: document.querySelector("#copyFollowupDraft"),
  openFollowupEmail: document.querySelector("#openFollowupEmail"),
  applyFollowupSuggestion: document.querySelector("#applyFollowupSuggestion"),
  activityType: document.querySelector("#activityType"),
  activityContent: document.querySelector("#activityContent"),
  addActivityButton: document.querySelector("#addActivityButton"),
  activityList: document.querySelector("#activityList"),
};

wireEvents();
await loadWorkspace();

function wireEvents() {
  els.connectButton.addEventListener("click", async () => {
    state.adminKey = els.adminKeyInput.value.trim();
    if (state.adminKey) sessionStorage.setItem("radar-admin-key", state.adminKey);
    await loadWorkspace();
  });
  els.adminKeyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") els.connectButton.click();
  });
  els.refreshButton.addEventListener("click", loadWorkspace);
  els.exportButton.addEventListener("click", exportCsv);
  els.downloadFollowupReport.addEventListener("click", () => downloadProtectedFile(`/api/admin/followups/report.md?lang=${language}&days=7`, `bossai-followups-${language}.md`));
  els.downloadFollowupCalendar.addEventListener("click", () => downloadProtectedFile("/api/admin/followups/calendar.ics?days=30", "bossai-followups.ics"));
  els.statusFilter.addEventListener("change", loadLeadList);
  els.intentFilter.addEventListener("change", loadLeadList);
  els.priorityFilter.addEventListener("change", loadLeadList);
  let searchTimer;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadLeadList, 280);
  });
  els.detailForm.addEventListener("submit", (event) => event.preventDefault());
  els.saveButton.addEventListener("click", saveCurrentLead);
  els.deleteButton.addEventListener("click", deleteCurrentLead);
  els.copyFollowupDraft.addEventListener("click", copyCurrentDraft);
  els.openFollowupEmail.addEventListener("click", openCurrentDraftEmail);
  els.applyFollowupSuggestion.addEventListener("click", applyCurrentSuggestion);
  els.addActivityButton.addEventListener("click", addActivity);
}

async function loadWorkspace() {
  if (state.loading) return;
  setLoading(true);
  try {
    const [stats, list, followups] = await Promise.all([
      adminRequest("/api/admin/leads/stats"),
      adminRequest(`/api/admin/leads?${filterParams()}`),
      adminRequest(`/api/admin/followups?days=7&includeUnscheduled=true&lang=${language}`),
    ]);
    state.stats = stats;
    state.leads = list.items || [];
    state.followups = followups;
    els.authPanel.hidden = true;
    setPageStatus("", false);
    renderStats();
    renderFollowupQueue();
    renderFunnel();
    renderTable();
  } catch (error) {
    handleLoadError(error);
  } finally {
    setLoading(false);
  }
}

async function loadLeadList() {
  if (state.loading) return;
  setLoading(true);
  try {
    const list = await adminRequest(`/api/admin/leads?${filterParams()}`);
    state.leads = list.items || [];
    renderTable();
    setPageStatus("", false);
  } catch (error) {
    handleLoadError(error);
  } finally {
    setLoading(false);
  }
}

function handleLoadError(error) {
  if (error.status === 401) {
    els.authPanel.hidden = false;
    els.adminKeyInput.focus();
    setPageStatus(t("leads.unauthorized"), true);
  } else if (error.status === 404) {
    setPageStatus(t("leads.adminDisabled"), true);
  } else {
    setPageStatus(t("leads.loadFailed"), true);
  }
}

function renderStats() {
  const stats = state.stats || {};
  els.totalMetric.textContent = formatNumber(stats.total || 0);
  els.activeMetric.textContent = formatNumber(stats.active || 0);
  els.hotMetric.textContent = formatNumber(stats.hot || 0);
  els.dueTodayMetric.textContent = formatNumber(state.followups?.stats?.today || 0);
  els.overdueMetric.textContent = formatNumber(state.followups?.stats?.overdue || 0);
  els.quotedMetric.textContent = formatCurrencyBreakdown(stats.quotedByCurrency);
  els.wonMetric.textContent = formatCurrencyBreakdown(stats.wonByCurrency);
}

function renderFollowupQueue() {
  const items = state.followups?.items || [];
  els.followupEmpty.hidden = items.length > 0;
  els.followupQueue.innerHTML = items.map((item) => {
    const lead = item.lead;
    const due = item.dueAt ? formatDateTime(item.dueAt) : t("followup.unscheduled");
    return `
      <article class="followup-card bucket-${item.bucket.toLowerCase()}">
        <div class="followup-card-top">
          <span class="followup-bucket">${escapeHtml(followupBucketLabel(item.bucket))}</span>
          <span class="lead-priority priority-${lead.priority.toLowerCase()}">${escapeHtml(priorityLabel(lead.priority))}</span>
        </div>
        <h3>${escapeHtml(lead.name)}${lead.company ? ` · ${escapeHtml(lead.company)}` : ""}</h3>
        <p class="followup-reason">${escapeHtml(item.reason)}</p>
        <div class="followup-card-meta">
          <span>${escapeHtml(statusLabel(lead.status))}</span>
          <span>${escapeHtml(due)}</span>
          <span>${escapeHtml(t("followup.urgency", { score: item.urgencyScore }))}</span>
        </div>
        <p class="followup-action-text">${escapeHtml(item.recommendedAction)}</p>
        <div class="followup-card-actions">
          <button class="text-button" type="button" data-followup-open="${escapeAttribute(lead.id)}">${escapeHtml(t("leads.open"))}</button>
          <button class="text-button" type="button" data-followup-copy="${escapeAttribute(lead.id)}">${escapeHtml(t("followup.copyDraft"))}</button>
        </div>
      </article>
    `;
  }).join("");
  for (const button of els.followupQueue.querySelectorAll("[data-followup-open]")) {
    button.addEventListener("click", () => openLead(button.dataset.followupOpen || ""));
  }
  for (const button of els.followupQueue.querySelectorAll("[data-followup-copy]")) {
    button.addEventListener("click", async () => {
      const item = items.find((entry) => entry.lead.id === button.dataset.followupCopy);
      if (item) await copyText(`${item.draft.subject}\n\n${item.draft.message}`, t("followup.copied"), t("followup.copyFailed"));
    });
  }
}

function renderFunnel() {
  const counts = state.stats?.byStatus || {};
  els.funnel.innerHTML = STATUS_VALUES.map((status) => `
    <button class="funnel-stage status-${status.toLowerCase()}" type="button" data-status="${status}">
      <span>${escapeHtml(statusLabel(status))}</span>
      <strong>${formatNumber(counts[status] || 0)}</strong>
    </button>
  `).join("");
  for (const button of els.funnel.querySelectorAll("[data-status]")) {
    button.addEventListener("click", () => {
      els.statusFilter.value = button.dataset.status || "";
      void loadLeadList();
    });
  }
}

function renderTable() {
  els.empty.hidden = state.leads.length > 0;
  els.rows.innerHTML = state.leads.map((lead) => {
    const followUp = lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : t("leads.never");
    const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < Date.now() && !["WON", "LOST"].includes(lead.status);
    return `
      <tr>
        <td><strong>${escapeHtml(lead.name)}</strong><small>${escapeHtml(lead.company || lead.contact)}</small></td>
        <td>${escapeHtml(intentLabel(lead.intent))}</td>
        <td><span class="lead-priority priority-${lead.priority.toLowerCase()}">${escapeHtml(priorityLabel(lead.priority))}</span></td>
        <td><span class="lead-status status-${lead.status.toLowerCase()}">${escapeHtml(statusLabel(lead.status))}</span></td>
        <td>${escapeHtml(valueLabel("budget", lead.budget))}</td>
        <td class="${overdue ? "overdue" : ""}">${escapeHtml(followUp)}</td>
        <td>${escapeHtml(relativeTime(lead.updatedAt))}</td>
        <td><button class="text-button" type="button" data-lead-id="${escapeAttribute(lead.id)}">${escapeHtml(t("leads.open"))}</button></td>
      </tr>
    `;
  }).join("");
  for (const button of els.rows.querySelectorAll("[data-lead-id]")) {
    button.addEventListener("click", () => openLead(button.dataset.leadId || ""));
  }
}

async function openLead(id) {
  if (!id) return;
  try {
    const [detail, draft] = await Promise.all([
      adminRequest(`/api/admin/leads/${encodeURIComponent(id)}`),
      adminRequest(`/api/admin/leads/${encodeURIComponent(id)}/followup-draft`),
    ]);
    state.current = detail;
    state.currentDraft = draft;
    renderLeadDetail();
    els.dialog.showModal();
  } catch (error) {
    handleLoadError(error);
  }
}

function renderLeadDetail() {
  const detail = state.current;
  if (!detail?.lead) return;
  const lead = detail.lead;
  els.detailName.textContent = lead.company ? `${lead.name} · ${lead.company}` : lead.name;
  els.detailReference.textContent = `${t("leads.reference")}: ${lead.id}`;
  els.detailScore.textContent = String(lead.score);
  els.detailContact.textContent = lead.contact;
  els.detailIntent.textContent = intentLabel(lead.intent);
  els.detailTeam.textContent = valueLabel("team", lead.teamSize);
  els.detailTimeline.textContent = valueLabel("timeline", lead.timeline);
  els.detailDeployment.textContent = valueLabel("deployment", lead.deployment);
  els.detailBudget.textContent = valueLabel("budget", lead.budget);
  els.detailScenario.textContent = lead.scenario;
  els.detailRequirements.textContent = lead.requirements || t("leads.notSet");
  els.detailStatus.value = lead.status;
  els.detailPriority.value = lead.priority;
  els.detailOwner.value = lead.owner || "";
  els.detailQuote.value = lead.quoteAmount ?? "";
  els.detailCurrency.value = lead.quoteCurrency || "CNY";
  els.detailFollowup.value = toLocalDateTimeValue(lead.nextFollowUpAt);
  renderFollowupDraft();
  renderActivities(detail.activities || []);
}

function renderFollowupDraft() {
  const draft = state.currentDraft;
  els.followupRecommendedAction.textContent = draft?.recommendedAction || "—";
  els.followupSubject.textContent = draft?.subject || "—";
  els.followupMessage.textContent = draft?.message || "—";
  const email = extractEmail(state.current?.lead?.contact || "");
  els.openFollowupEmail.disabled = !email;
}

function renderActivities(activities) {
  if (!activities.length) {
    els.activityList.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t("leads.noActivities"))}</div>`;
    return;
  }
  els.activityList.innerHTML = activities.map((activity) => `
    <article class="lead-activity-item">
      <div><span class="activity-type">${escapeHtml(activityLabel(activity.type))}</span><time>${escapeHtml(formatDateTime(activity.createdAt))}</time></div>
      <p>${escapeHtml(localizeSystemActivity(activity.content))}</p>
    </article>
  `).join("");
}

async function saveCurrentLead() {
  const lead = state.current?.lead;
  if (!lead) return;
  const followUp = els.detailFollowup.value;
  const patch = {
    status: els.detailStatus.value,
    priority: els.detailPriority.value,
    owner: els.detailOwner.value.trim(),
    quoteAmount: els.detailQuote.value === "" ? null : Number(els.detailQuote.value),
    quoteCurrency: els.detailCurrency.value,
    nextFollowUpAt: followUp ? new Date(followUp).toISOString() : null,
  };
  setPageStatus(t("leads.saving"), false);
  try {
    const detail = await adminRequest(`/api/admin/leads/${encodeURIComponent(lead.id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    state.current = detail;
    renderLeadDetail();
    setPageStatus(t("leads.saved"), false);
    await refreshAfterMutation();
  } catch {
    setPageStatus(t("leads.saveFailed"), true);
  }
}

async function deleteCurrentLead() {
  const lead = state.current?.lead;
  if (!lead || !window.confirm(t("leads.deleteConfirm"))) return;
  try {
    const response = await adminFetch(`/api/admin/leads/${encodeURIComponent(lead.id)}`, { method: "DELETE" });
    if (!response.ok) throw await responseError(response);
    state.current = null;
    els.dialog.close();
    setPageStatus(t("leads.deleted"), false);
    await refreshAfterMutation();
  } catch {
    setPageStatus(t("leads.deleteFailed"), true);
  }
}

async function copyCurrentDraft() {
  const draft = state.currentDraft;
  if (!draft) return;
  await copyText(`${draft.subject}\n\n${draft.message}`, t("followup.copied"), t("followup.copyFailed"));
}

function openCurrentDraftEmail() {
  const lead = state.current?.lead;
  const draft = state.currentDraft;
  const email = extractEmail(lead?.contact || "");
  if (!draft || !email) {
    setPageStatus(t("followup.noEmail"), true);
    return;
  }
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.message)}`;
}

async function applyCurrentSuggestion() {
  const lead = state.current?.lead;
  const draft = state.currentDraft;
  if (!lead || !draft) return;
  try {
    const detail = await adminRequest(`/api/admin/leads/${encodeURIComponent(lead.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: draft.suggestedStatus,
        nextFollowUpAt: draft.suggestedFollowUpAt,
      }),
    });
    await adminRequest(`/api/admin/leads/${encodeURIComponent(lead.id)}/activities`, {
      method: "POST",
      body: JSON.stringify({ type: "NOTE", content: `${t("followup.appliedActivity")}: ${draft.recommendedAction}` }),
    });
    const [refreshed, nextDraft] = await Promise.all([
      adminRequest(`/api/admin/leads/${encodeURIComponent(lead.id)}`),
      adminRequest(`/api/admin/leads/${encodeURIComponent(lead.id)}/followup-draft`),
    ]);
    state.current = refreshed;
    state.currentDraft = nextDraft;
    renderLeadDetail();
    setPageStatus(t("followup.applied"), false);
    await refreshAfterMutation();
  } catch {
    setPageStatus(t("followup.applyFailed"), true);
  }
}

async function addActivity() {
  const lead = state.current?.lead;
  const content = els.activityContent.value.trim();
  if (!lead || content.length < 2) return;
  try {
    await adminRequest(`/api/admin/leads/${encodeURIComponent(lead.id)}/activities`, {
      method: "POST",
      body: JSON.stringify({ type: els.activityType.value, content }),
    });
    els.activityContent.value = "";
    const detail = await adminRequest(`/api/admin/leads/${encodeURIComponent(lead.id)}`);
    state.current = detail;
    renderLeadDetail();
    setPageStatus(t("leads.activityAdded"), false);
    await refreshAfterMutation();
  } catch {
    setPageStatus(t("leads.activityFailed"), true);
  }
}

async function refreshAfterMutation() {
  const [stats, list, followups] = await Promise.all([
    adminRequest("/api/admin/leads/stats"),
    adminRequest(`/api/admin/leads?${filterParams()}`),
    adminRequest(`/api/admin/followups?days=7&includeUnscheduled=true&lang=${language}`),
  ]);
  state.stats = stats;
  state.leads = list.items || [];
  state.followups = followups;
  renderStats();
  renderFollowupQueue();
  renderFunnel();
  renderTable();
}

async function downloadProtectedFile(url, fallbackName) {
  try {
    const response = await adminFetch(url);
    if (!response.ok) throw await responseError(response);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const disposition = response.headers.get("content-disposition") || "";
    const match = /filename=\"?([^\";]+)\"?/i.exec(disposition);
    anchor.href = objectUrl;
    anchor.download = match?.[1] || fallbackName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setPageStatus(t("followup.downloaded"), false);
  } catch (error) {
    if (error.status === 401) els.authPanel.hidden = false;
    setPageStatus(t("followup.downloadFailed"), true);
  }
}

async function exportCsv() {
  try {
    const response = await adminFetch(`/api/admin/leads/export.csv?${filterParams()}`);
    if (!response.ok) throw await responseError(response);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bossai-radar-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setPageStatus(t("leads.exported"), false);
  } catch (error) {
    if (error.status === 401) els.authPanel.hidden = false;
    setPageStatus(t("leads.exportFailed"), true);
  }
}

async function adminRequest(url, options = {}) {
  const response = await adminFetch(url, options);
  if (!response.ok) throw await responseError(response);
  return response.json();
}

function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(state.adminKey ? { "x-radar-key": state.adminKey } : {}),
      ...(options.headers || {}),
    },
  });
}

async function responseError(response) {
  let payload = {};
  try { payload = await response.json(); } catch { /* non-JSON response */ }
  const error = new Error(payload.error || `HTTP ${response.status}`);
  error.status = response.status;
  error.code = payload.code;
  return error;
}

function filterParams() {
  const params = new URLSearchParams({ limit: "500" });
  if (els.searchInput.value.trim()) params.set("q", els.searchInput.value.trim());
  if (els.statusFilter.value) params.set("status", els.statusFilter.value);
  if (els.intentFilter.value) params.set("intent", els.intentFilter.value);
  if (els.priorityFilter.value) params.set("priority", els.priorityFilter.value);
  return params.toString();
}

function followupBucketLabel(value) { return t(`followup.bucket.${value}`); }
function statusLabel(value) { return t(`lead.status.${value}`); }
function intentLabel(value) { return t(`lead.intent.${value}`); }
function priorityLabel(value) { return t(`lead.priority.${value}`); }
function activityLabel(value) { return t(`lead.activity.${value}`); }

function valueLabel(group, value) {
  const maps = {
    team: { "1": "form.team1", "2-5": "form.team2", "6-20": "form.team3", "21-100": "form.team4", "100+": "form.team5" },
    timeline: { now: "form.timelineNow", "30-days": "form.timeline30", "1-3-months": "form.timeline90", later: "form.timelineLater", research: "form.timelineResearch" },
    deployment: { local: "form.deployLocal", intranet: "form.deployIntranet", "own-cloud": "form.deployCloud", "bossai-managed": "form.deployManaged", unknown: "form.deployUnknown" },
    budget: { unknown: "form.budgetUnknown", "under-1000": "form.budget1", "1000-5000": "form.budget2", "5000-20000": "form.budget3", "20000+": "form.budget4" },
  };
  const key = maps[group]?.[value];
  return key ? t(key) : value || t("leads.notSet");
}

function localizeSystemActivity(content) {
  const created = /^Created as (\w+) with (\w+) priority \((\d+)\/100\)\.$/.exec(content);
  if (created) return t("leads.activityCreated", { status: statusLabel(created[1]), priority: priorityLabel(created[2]), score: created[3] });
  const priority = /^Priority (\w+) → (\w+)$/.exec(content);
  if (priority) return t("leads.activityPriority", { from: priorityLabel(priority[1]), to: priorityLabel(priority[2]) });
  const status = /^(\w+) → (\w+)$/.exec(content);
  if (status) return t("leads.activityStatus", { from: statusLabel(status[1]), to: statusLabel(status[2]) });
  const quote = /^Quote set to ([A-Z]{3}) (.+)$/.exec(content);
  if (quote) return t("leads.activityQuote", { value: `${quote[1]} ${quote[2]}` });
  if (content === "Quote cleared") return t("leads.activityQuoteCleared");
  return content;
}

async function copyText(value, successMessage, errorMessage) {
  try {
    await navigator.clipboard.writeText(value);
    setPageStatus(successMessage, false);
  } catch {
    setPageStatus(errorMessage, true);
  }
}

function extractEmail(value) {
  return String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function formatCurrencyBreakdown(values) {
  const entries = Object.entries(values || {}).filter(([, value]) => Number(value) > 0);
  if (!entries.length) return "—";
  return entries.map(([currency, value]) => formatMoney(value, currency)).join(" · ");
}

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", {
      style: "currency",
      currency: currency || "CNY",
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  } catch {
    return `${currency || "CNY"} ${Number(value || 0).toLocaleString()}`;
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN").format(Number(value) || 0);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: language === "en",
  }).format(date);
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  const seconds = Math.round((date.getTime() - Date.now()) / 1_000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(language === "en" ? "en-US" : "zh-CN", { numeric: "auto" });
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3_600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86_400) return formatter.format(Math.round(seconds / 3_600), "hour");
  return formatter.format(Math.round(seconds / 86_400), "day");
}

function toLocalDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function setLoading(value) {
  state.loading = Boolean(value);
  els.refreshButton.disabled = state.loading;
  els.exportButton.disabled = state.loading;
  els.saveButton.disabled = state.loading;
  els.deleteButton.disabled = state.loading;
  els.addActivityButton.disabled = state.loading;
  els.copyFollowupDraft.disabled = state.loading;
  els.applyFollowupSuggestion.disabled = state.loading;
  els.downloadFollowupReport.disabled = state.loading;
  els.downloadFollowupCalendar.disabled = state.loading;
}

function setPageStatus(message, error) {
  els.pageStatus.textContent = message;
  els.pageStatus.classList.toggle("error", Boolean(error));
}

function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}
