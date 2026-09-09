import {
  applyI18n,
  categoryLabel,
  decisionLabel,
  getLanguage,
  initLanguageToggle,
  t,
} from "./i18n.js";
import { createLatestRequestGate } from "./latest-request.js";

const language = getLanguage();
applyI18n(document, language);
initLanguageToggle();
document.title = t("dashboard.title", {}, language);
const description = document.querySelector('meta[name="description"]');
if (description) description.setAttribute("content", t("dashboard.description", {}, language));

const state = {
  overview: null,
  opportunities: [],
  prospects: [],
  prospectVisibleLimit: 12,
  tradeRecords: [],
  tradeRecordResultCount: 0,
  tradeRecordFilters: {},
  tradeCompanySummaries: [],
  tradeRecordAuthorized: null,
  tradeImportPreview: null,
  tradeImportPreviewFileKey: "",
  tradeWebsiteSuggestions: {},
  tradeCompanyWebsiteSuggestions: {},
  evidence: [],
  runs: [],
  delegations: [],
  delegationCoverageComplete: true,
  ownerReviewQueue: null,
  ownerReviewQueueAuthorized: null,
  ownerReviewQueueFilter: "all",
  ownerReviewQueueVisibleLimit: 10,
  outcomeSummary: null,
  outcomeSummaryAuthorized: null,
  outcomeLearning: null,
  outcomeLearningAuthorized: null,
  outcomeLearningDrilldown: null,
  outcomeLearningDrilldownVisibleLimit: 12,
  outcomeReviewAttribution: null,
  browserEvidenceRequest: null,
  accountReview: null,
  ownerDecisionDraft: null,
  adminKey: sessionStorage.getItem("radar-admin-key") || "",
};
const latestRequest = {
  dashboard: createLatestRequestGate(),
  tradeRecords: createLatestRequestGate(),
  bossAiDelegations: createLatestRequestGate(),
  ownerReviewQueue: createLatestRequestGate(),
  outcomeSummary: createLatestRequestGate(),
  outcomeLearning: createLatestRequestGate(),
  outcomeLearningDrilldown: createLatestRequestGate(),
  accountReview: createLatestRequestGate(),
  accountReviewManagerResult: createLatestRequestGate(),
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
  prospectGrid: document.querySelector("#prospectGrid"),
  prospectGridMore: document.querySelector("#prospectGridMore"),
  prospectDiscoveryStatus: document.querySelector("#prospectDiscoveryStatus"),
  prospectChannelStatus: document.querySelector("#prospectChannelStatus"),
  outcomeSummaryPanel: document.querySelector("#outcomeSummaryPanel"),
  outcomeSummaryCards: document.querySelector("#outcomeSummaryCards"),
  outcomeSummaryValue: document.querySelector("#outcomeSummaryValue"),
  outcomeLearningPanel: document.querySelector("#outcomeLearningPanel"),
  outcomeLearningReadiness: document.querySelector("#outcomeLearningReadiness"),
  outcomeLearningViews: document.querySelector("#outcomeLearningViews"),
  outcomeLearningDrilldown: document.querySelector("#outcomeLearningDrilldown"),
  outcomeLearningReviewPending: document.querySelector("#outcomeLearningReviewPending"),
  ownerReviewQueuePanel: document.querySelector("#ownerReviewQueuePanel"),
  ownerReviewQueueSummary: document.querySelector("#ownerReviewQueueSummary"),
  ownerReviewQueueFilters: document.querySelector("#ownerReviewQueueFilters"),
  ownerReviewQueueList: document.querySelector("#ownerReviewQueueList"),
  ownerReviewQueueMore: document.querySelector("#ownerReviewQueueMore"),
  prospectSearchForm: document.querySelector("#prospectSearchForm"),
  prospectSearchInput: document.querySelector("#prospectSearchInput"),
  prospectPlanButton: document.querySelector("#prospectPlanButton"),
  prospectPlanSuggestions: document.querySelector("#prospectPlanSuggestions"),
  prospectSearchButton: document.querySelector("#prospectSearchButton"),
  prospectSearchHint: document.querySelector("#prospectSearchHint"),
  accountReviewDialog: document.querySelector("#accountReviewDialog"),
  accountReviewClose: document.querySelector("#accountReviewClose"),
  accountReviewTitle: document.querySelector("#accountReviewTitle"),
  accountReviewSubtitle: document.querySelector("#accountReviewSubtitle"),
  accountReviewStage: document.querySelector("#accountReviewStage"),
  accountReviewBody: document.querySelector("#accountReviewBody"),
  accountReviewResult: document.querySelector("#accountReviewResult"),
  accountReviewActions: document.querySelector("#accountReviewActions"),
  ownerDecisionDialog: document.querySelector("#ownerDecisionDialog"),
  ownerDecisionForm: document.querySelector("#ownerDecisionForm"),
  ownerDecisionClose: document.querySelector("#ownerDecisionClose"),
  ownerDecisionCancel: document.querySelector("#ownerDecisionCancel"),
  ownerDecisionTitle: document.querySelector("#ownerDecisionTitle"),
  ownerDecisionIntro: document.querySelector("#ownerDecisionIntro"),
  ownerDecisionContext: document.querySelector("#ownerDecisionContext"),
  ownerDecisionReason: document.querySelector("#ownerDecisionReason"),
  ownerDecisionNote: document.querySelector("#ownerDecisionNote"),
  ownerDecisionSubmit: document.querySelector("#ownerDecisionSubmit"),
  outcomeReviewDialog: document.querySelector("#outcomeReviewDialog"),
  outcomeReviewForm: document.querySelector("#outcomeReviewForm"),
  outcomeReviewClose: document.querySelector("#outcomeReviewClose"),
  outcomeReviewCancel: document.querySelector("#outcomeReviewCancel"),
  outcomeReviewContext: document.querySelector("#outcomeReviewContext"),
  outcomeReviewDecision: document.querySelector("#outcomeReviewDecision"),
  outcomeReviewSummary: document.querySelector("#outcomeReviewSummary"),
  outcomeValueFields: document.querySelector("#outcomeValueFields"),
  outcomeReviewValueAmount: document.querySelector("#outcomeReviewValueAmount"),
  outcomeReviewValueCurrency: document.querySelector("#outcomeReviewValueCurrency"),
  outcomeReviewSubmit: document.querySelector("#outcomeReviewSubmit"),
  browserEvidenceDialog: document.querySelector("#browserEvidenceDialog"),
  browserEvidenceForm: document.querySelector("#browserEvidenceForm"),
  browserEvidenceClose: document.querySelector("#browserEvidenceClose"),
  browserEvidenceCancel: document.querySelector("#browserEvidenceCancel"),
  browserEvidenceSubmit: document.querySelector("#browserEvidenceSubmit"),
  browserEvidenceContract: document.querySelector("#browserEvidenceContract"),
  browserEvidencePageUrl: document.querySelector("#browserEvidencePageUrl"),
  browserEvidenceSourceReference: document.querySelector("#browserEvidenceSourceReference"),
  browserEvidenceHtml: document.querySelector("#browserEvidenceHtml"),
  tradeRecordFile: document.querySelector("#tradeRecordFile"),
  tradeRecordPreviewButton: document.querySelector("#tradeRecordPreviewButton"),
  tradeRecordImportButton: document.querySelector("#tradeRecordImportButton"),
  tradeRecordPreview: document.querySelector("#tradeRecordPreview"),
  tradeRecordStats: document.querySelector("#tradeRecordStats"),
  tradeRecordImportNote: document.querySelector("#tradeRecordImportNote"),
  tradeRecordFilterForm: document.querySelector("#tradeRecordFilterForm"),
  tradeRecordQuery: document.querySelector("#tradeRecordQuery"),
  tradeRecordHs: document.querySelector("#tradeRecordHs"),
  tradeRecordCountry: document.querySelector("#tradeRecordCountry"),
  tradeRecordRole: document.querySelector("#tradeRecordRole"),
  tradeRecordDateFrom: document.querySelector("#tradeRecordDateFrom"),
  tradeRecordDateTo: document.querySelector("#tradeRecordDateTo"),
  tradeRecordFilterReset: document.querySelector("#tradeRecordFilterReset"),
  tradeCompanySummary: document.querySelector("#tradeCompanySummary"),
  tradeRecordList: document.querySelector("#tradeRecordList"),
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
els.prospectSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void discoverProspectsFromSearch();
});
els.prospectPlanButton.addEventListener("click", () => void planProspectSearchDirections());
els.outcomeLearningReviewPending.addEventListener("click", jumpToOutcomeResultReviewQueue);
els.outcomeLearningPanel.addEventListener("click", (event) => {
  const drilldownButton = event.target.closest("[data-outcome-learning-drilldown]");
  if (drilldownButton) {
    void loadOutcomeLearningDrilldown(
      drilldownButton.dataset.outcomeLearningDimension || "",
      drilldownButton.dataset.outcomeLearningCohort || "",
      drilldownButton,
      drilldownButton.dataset.outcomeLearningState || "",
    );
    return;
  }
  const accountButton = event.target.closest("[data-outcome-learning-account]");
  if (accountButton) {
    void openAccountReview(accountButton.dataset.outcomeLearningAccount || "", accountButton);
    return;
  }
  if (event.target.closest("[data-outcome-learning-more]")) {
    state.outcomeLearningDrilldownVisibleLimit += 12;
    renderOutcomeLearningDrilldown();
  }
});
els.outcomeSummaryPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-outcome-review-queue]")) jumpToOutcomeResultReviewQueue();
});
els.ownerReviewQueueMore.addEventListener("click", () => {
  state.ownerReviewQueueVisibleLimit += 10;
  renderOwnerReviewQueue();
});
els.ownerReviewQueuePanel.addEventListener("click", (event) => {
  const filterButton = event.target.closest("[data-owner-queue-filter]");
  if (filterButton) {
    void applyOwnerReviewQueueFilter(filterButton.dataset.ownerQueueFilter || "all");
    return;
  }
  const openButton = event.target.closest("[data-owner-queue-open]");
  if (openButton) void openAccountReview(openButton.dataset.ownerQueueOpen, openButton);
});
els.accountReviewClose.addEventListener("click", closeAccountReview);
els.accountReviewDialog.addEventListener("close", resetAccountReview);
els.accountReviewActions.addEventListener("click", (event) => void handleAccountReviewAction(event));
els.ownerDecisionClose.addEventListener("click", closeOwnerDecisionDialog);
els.ownerDecisionCancel.addEventListener("click", closeOwnerDecisionDialog);
els.ownerDecisionDialog.addEventListener("close", resetOwnerDecisionDialog);
els.ownerDecisionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitOwnerDecision();
});
els.outcomeReviewClose.addEventListener("click", closeOutcomeReviewDialog);
els.outcomeReviewCancel.addEventListener("click", closeOutcomeReviewDialog);
els.outcomeReviewDialog.addEventListener("close", resetOutcomeReviewDialog);
els.outcomeReviewDecision.addEventListener("change", updateOutcomeValueFields);
els.outcomeReviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitOutcomeReview();
});
els.browserEvidenceClose.addEventListener("click", closeBrowserEvidenceDialog);
els.browserEvidenceCancel.addEventListener("click", closeBrowserEvidenceDialog);
els.browserEvidenceDialog.addEventListener("close", resetBrowserEvidenceDialog);
els.browserEvidenceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitBrowserEvidence();
});
els.tradeRecordFile.addEventListener("change", resetTradeImportPreview);
els.tradeRecordPreviewButton.addEventListener("click", () => void previewTradeRecords());
els.tradeRecordImportButton.addEventListener("click", () => void importTradeRecords());
els.tradeRecordFilterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void loadTradeRecords({ fromFilters: true }).then((applied) => { if (applied) renderTradeRecords(); });
});
els.tradeRecordFilterReset.addEventListener("click", () => {
  els.tradeRecordFilterForm.reset();
  void loadTradeRecords({ fromFilters: true }).then((applied) => { if (applied) renderTradeRecords(); });
});
els.tradeCompanySummary.addEventListener("click", (event) => {
  const prospectButton = event.target.closest("[data-trade-company-prospect]");
  if (prospectButton) {
    void createProspectFromTradeCompany(
      prospectButton.dataset.tradeCompanyProspect || "",
      prospectButton.dataset.tradeCompanyCountry || "",
      prospectButton,
      prospectButton.dataset.tradeCompanyWebsiteUrl || "",
    );
    return;
  }
  const resolveButton = event.target.closest("[data-resolve-trade-company-website]");
  if (resolveButton) {
    void resolveTradeCompanyWebsite(
      resolveButton.dataset.resolveTradeCompanyWebsite || "",
      resolveButton.dataset.tradeCompanyCountry || "",
      resolveButton,
    );
  }
});
els.tradeRecordList.addEventListener("click", (event) => {
  const prospectButton = event.target.closest("[data-trade-record-prospect]");
  if (prospectButton) {
    void createProspectFromTradeRecord(
      prospectButton.dataset.tradeRecordProspect,
      prospectButton,
      prospectButton.dataset.tradeWebsiteUrl || "",
    );
    return;
  }
  const resolveButton = event.target.closest("[data-resolve-trade-website]");
  if (resolveButton) void resolveTradeRecordWebsite(resolveButton.dataset.resolveTradeWebsite, resolveButton);
});
els.prospectPlanSuggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-prospect-plan-query]");
  if (!button) return;
  els.prospectSearchInput.value = button.dataset.prospectPlanQuery || "";
  els.prospectSearchInput.focus();
});
els.prospectGridMore.addEventListener("click", () => {
  state.prospectVisibleLimit += 12;
  renderProspects();
});
els.prospectGrid.addEventListener("click", (event) => {
  const accountReviewButton = event.target.closest("[data-open-account-review]");
  if (accountReviewButton) {
    void openAccountReview(accountReviewButton.dataset.openAccountReview, accountReviewButton);
    return;
  }
  const verifyWebsiteButton = event.target.closest("[data-verify-prospect-website]");
  if (verifyWebsiteButton) {
    void verifyProspectWebsite(verifyWebsiteButton.dataset.verifyProspectWebsite, verifyWebsiteButton);
    return;
  }
  const browserEvidenceButton = event.target.closest("[data-request-browser-evidence]");
  if (browserEvidenceButton) {
    void requestBrowserEvidence(browserEvidenceButton.dataset.requestBrowserEvidence, browserEvidenceButton);
    return;
  }
  const refreshButton = event.target.closest("[data-refresh-prospect-run]");
  if (refreshButton) {
    void refreshProspectRun(refreshButton.dataset.refreshProspectRun, refreshButton);
    return;
  }
  const qualifyButton = event.target.closest("[data-qualify-prospect]");
  if (qualifyButton) {
    void qualifyProspect(qualifyButton.dataset.qualifyProspect, qualifyButton);
    return;
  }
  const button = event.target.closest("[data-delegate-prospect]");
  if (button) void delegateProspect(button.dataset.delegateProspect, button);
});
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
  const requestSequence = latestRequest.dashboard.next();
  try {
    const [overview, opportunities, prospects, evidence, runs] = await Promise.all([
      api("/api/overview"),
      api("/api/opportunities?limit=12"),
      api("/api/prospects?limit=500"),
      api("/api/evidence?limit=8"),
      api("/api/runs?limit=5"),
    ]);
    if (!latestRequest.dashboard.isCurrent(requestSequence)) return false;
    state.overview = overview;
    state.opportunities = opportunities.items || [];
    state.prospects = prospects.items || [];
    state.evidence = evidence.items || [];
    state.runs = runs.items || [];
    await Promise.all([loadBossAiDelegations(overview), loadTradeRecords(), loadOwnerReviewQueue(), loadOutcomeSummary(), loadOutcomeLearning()]);
    if (!latestRequest.dashboard.isCurrent(requestSequence)) return false;
    render();
    return true;
  } catch (error) {
    if (!latestRequest.dashboard.isCurrent(requestSequence)) return false;
    setStatus(t("status.connectionFailed"), "error");
    if (!quiet) showToast(error.message || t("refresh.failed"), true);
    return false;
  }
}

async function loadTradeRecords({ fromFilters = false } = {}) {
  const requestSequence = latestRequest.tradeRecords.next();
  state.tradeRecords = [];
  state.tradeRecordResultCount = 0;
  state.tradeCompanySummaries = [];
  const params = new URLSearchParams({ limit: "100" });
  if (fromFilters || Object.keys(state.tradeRecordFilters).length > 0) {
    const filters = {
      q: String(els.tradeRecordQuery.value || "").trim(),
      hs: String(els.tradeRecordHs.value || "").trim(),
      country: String(els.tradeRecordCountry.value || "").trim(),
      role: String(els.tradeRecordRole.value || "").trim(),
      dateFrom: String(els.tradeRecordDateFrom.value || "").trim(),
      dateTo: String(els.tradeRecordDateTo.value || "").trim(),
    };
    state.tradeRecordFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  }
  for (const [key, value] of Object.entries(state.tradeRecordFilters)) params.set(key, value);
  try {
    const payload = await api(`/api/admin/trade-records?${params.toString()}`, {
      headers: state.adminKey ? { "x-radar-key": state.adminKey } : {},
    });
    if (!latestRequest.tradeRecords.isCurrent(requestSequence)) return false;
    state.tradeRecordAuthorized = true;
    state.tradeRecords = payload.items || [];
    state.tradeRecordResultCount = Number(payload.resultCount || 0);
    state.tradeCompanySummaries = Array.isArray(payload.companySummaries) ? payload.companySummaries : [];
    state.tradeRecordFilters = payload.filters && typeof payload.filters === "object"
      ? Object.fromEntries(Object.entries(payload.filters).filter(([, value]) => value))
      : state.tradeRecordFilters;
    return true;
  } catch (error) {
    if (!latestRequest.tradeRecords.isCurrent(requestSequence)) return false;
    state.tradeRecordAuthorized = error.status === 401 ? false : null;
    if (error.status !== 401) console.warn("[Trade Records] Evidence list unavailable", error);
    return false;
  }
}

async function loadOwnerReviewQueue(attention = "") {
  const requestSequence = latestRequest.ownerReviewQueue.next();
  state.ownerReviewQueue = null;
  const params = new URLSearchParams({ limit: "500" });
  if (attention && attention !== "all") params.set("attention", attention);
  try {
    const payload = await api(`/api/admin/prospects/account-review-queue?${params.toString()}`, {
      headers: state.adminKey ? { "x-radar-key": state.adminKey } : {},
    });
    if (!latestRequest.ownerReviewQueue.isCurrent(requestSequence)) return false;
    state.ownerReviewQueueAuthorized = true;
    state.ownerReviewQueue = payload.queue || null;
    return true;
  } catch (error) {
    if (!latestRequest.ownerReviewQueue.isCurrent(requestSequence)) return false;
    state.ownerReviewQueueAuthorized = error.status === 401 ? false : null;
    if (error.status !== 401) console.warn("[Account Review Queue] Queue unavailable", error);
    return false;
  }
}

async function refreshOwnerReviewQueue() {
  if (await loadOwnerReviewQueue(state.ownerReviewQueueFilter)) renderOwnerReviewQueue();
}

async function applyOwnerReviewQueueFilter(filter) {
  const requestedFilter = filter || "all";
  state.ownerReviewQueueFilter = requestedFilter;
  state.ownerReviewQueueVisibleLimit = 10;
  renderOwnerReviewQueue();
  const applied = await loadOwnerReviewQueue(requestedFilter);
  if (applied && state.ownerReviewQueueFilter === requestedFilter) renderOwnerReviewQueue();
}

async function loadOutcomeSummary() {
  const requestSequence = latestRequest.outcomeSummary.next();
  state.outcomeSummary = null;
  try {
    const payload = await api("/api/admin/prospects/outcome-summary", {
      headers: state.adminKey ? { "x-radar-key": state.adminKey } : {},
    });
    if (!latestRequest.outcomeSummary.isCurrent(requestSequence)) return false;
    state.outcomeSummaryAuthorized = true;
    state.outcomeSummary = payload.summary || null;
    return true;
  } catch (error) {
    if (!latestRequest.outcomeSummary.isCurrent(requestSequence)) return false;
    state.outcomeSummaryAuthorized = error.status === 401 ? false : null;
    if (error.status !== 401) console.warn("[Business Outcomes] Summary unavailable", error);
    return false;
  }
}

async function refreshOutcomeSummary() {
  if (await loadOutcomeSummary()) renderOutcomeSummary();
}

function invalidateOutcomeLearningDrilldown() {
  latestRequest.outcomeLearningDrilldown.invalidate();
  state.outcomeLearningDrilldown = null;
  state.outcomeLearningDrilldownVisibleLimit = 12;
}

async function loadOutcomeLearning() {
  const requestSequence = latestRequest.outcomeLearning.next();
  state.outcomeLearning = null;
  invalidateOutcomeLearningDrilldown();
  try {
    const payload = await api("/api/admin/prospects/outcome-learning", {
      headers: state.adminKey ? { "x-radar-key": state.adminKey } : {},
    });
    if (!latestRequest.outcomeLearning.isCurrent(requestSequence)) return false;
    state.outcomeLearningAuthorized = true;
    state.outcomeLearning = payload.learning || null;
    return true;
  } catch (error) {
    if (!latestRequest.outcomeLearning.isCurrent(requestSequence)) return false;
    state.outcomeLearningAuthorized = error.status === 401 ? false : null;
    if (error.status !== 401) console.warn("[Outcome Learning] Descriptive cohorts unavailable", error);
    return false;
  }
}

async function refreshOutcomeLearning() {
  if (await loadOutcomeLearning()) renderOutcomeLearning();
}

async function refreshOutcomeTruthSurfaces() {
  await Promise.all([loadOutcomeSummary(), loadOutcomeLearning(), loadOwnerReviewQueue(state.ownerReviewQueueFilter)]);
  invalidateOutcomeLearningDrilldown();
  renderOutcomeSummary();
  renderOutcomeLearning();
  renderOutcomeLearningDrilldown();
  renderOwnerReviewQueue();
}

async function loadBossAiDelegations(overview) {
  const requestSequence = latestRequest.bossAiDelegations.next();
  state.delegations = [];
  state.delegationCoverageComplete = true;
  if (!overview?.config?.ai?.employeeDelegationConfigured) return true;
  try {
    const payload = await api("/api/admin/bossai/delegations?limit=200", {
      headers: state.adminKey ? { "x-radar-key": state.adminKey } : {},
    });
    if (!latestRequest.bossAiDelegations.isCurrent(requestSequence)) return false;
    state.delegations = payload.items || [];
    state.delegationCoverageComplete = payload.truncated !== true;
    return true;
  } catch (error) {
    if (!latestRequest.bossAiDelegations.isCurrent(requestSequence)) return false;
    state.delegationCoverageComplete = false;
    if (error.status !== 401) console.warn("[BossAI OS] Delegation status unavailable", error);
    return false;
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
  renderOutcomeSummary();
  renderOutcomeLearning();
  renderOutcomeLearningDrilldown();
  renderOwnerReviewQueue();
  renderProspects();
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

function renderTradeRecords() {
  const stats = state.overview?.tradeRecordStats || {};
  const sourcesConfig = state.overview?.config?.sources || {};
  const resolverConfigured = sourcesConfig.prospectSearchConfigured === true || sourcesConfig.prospectMapConfigured === true;
  const total = number(stats.total);
  const filtered = Object.keys(state.tradeRecordFilters).length > 0;
  els.tradeRecordStats.textContent = total > 0
    ? filtered
      ? t("trade.statsFiltered", { result: number(state.tradeRecordResultCount), total, companies: number(stats.companies) })
      : t("trade.stats", { total, companies: number(stats.companies), unresolved: number(stats.unresolvedCompanies) })
    : t("trade.emptyStats");
  els.tradeCompanySummary.innerHTML = state.tradeCompanySummaries.map((summary) => {
    const amountText = Object.entries(summary.amountByCurrency || {}).slice(0, 3)
      .map(([currency, amount]) => `${formatNumber(amount)} ${currency}`)
      .join(" · ") || t("trade.amountUnknown");
    const hsText = Array.isArray(summary.hsCodes) && summary.hsCodes.length
      ? summary.hsCodes.slice(0, 4).join(" / ")
      : t("trade.hsUnknown");
    const roleText = Array.isArray(summary.roles) && summary.roles.length
      ? summary.roles.slice(0, 3).map((role) => t(`trade.role.${role}`)).join(" / ")
      : t("trade.role.unknown");
    const cadence = t(`trade.cadence.${summary.historicalCadence || "insufficient"}`);
    const cadenceInterval = summary.medianIntervalDays === null || summary.medianIntervalDays === undefined
      ? t("trade.cadenceNoInterval")
      : t("trade.cadenceInterval", {
        median: formatNumber(summary.medianIntervalDays),
        min: formatNumber(summary.minIntervalDays),
        max: formatNumber(summary.maxIntervalDays),
      });
    const reviewPriority = String(summary.reviewPriority || "REVIEW_LATER");
    const reviewPriorityClass = reviewPriority.toLowerCase().replaceAll("_", "-");
    const recency = summary.daysSinceLatestTrade === null || summary.daysSinceLatestTrade === undefined
      ? t("trade.recencyUnknown")
      : t("trade.recencyDays", { days: formatNumber(summary.daysSinceLatestTrade) });
    const countries = Array.isArray(summary.countries) ? summary.countries : [];
    const companyCountry = countries.length === 1 ? countries[0] || "" : "";
    const companyIdentity = [companyCountry || t("trade.countryUnknown"), roleText].filter(Boolean).join(" · ");
    const companySuggestionKey = tradeCompanySuggestionKey(summary.companyName || "", companyCountry);
    const companySuggestions = Array.isArray(state.tradeCompanyWebsiteSuggestions[companySuggestionKey])
      ? state.tradeCompanyWebsiteSuggestions[companySuggestionKey]
      : [];
    const canPromoteCompany = countries.length <= 1 && number(summary.websiteCount) === 1 && Boolean(summary.websiteUrl);
    const canResolveCompany = countries.length <= 1 && (number(summary.websiteCount) > 1 || resolverConfigured);
    const promotionBoundary = countries.length > 1
      ? t("trade.companyCountryAmbiguous")
      : number(summary.websiteCount) > 1
        ? t("trade.companyWebsiteAmbiguous")
        : !summary.websiteUrl
          ? t("trade.companyWebsiteRequired")
          : "";
    return `
      <article class="trade-company-card">
        <div class="trade-company-heading">
          <strong>${escapeHtml(summary.companyName || t("common.unknown"))}</strong>
          <span class="trade-review-priority ${escapeAttribute(reviewPriorityClass)}">${escapeHtml(t(`trade.reviewPriority.${reviewPriority}`))}</span>
        </div>
        <small>${escapeHtml(t("trade.companySummaryMeta", { records: number(summary.recordCount), latest: summary.latestTradeDate || t("common.unknown"), products: number(summary.productCount) }))}</small>
        <small>${escapeHtml(t("trade.companyHistoryWindow", {
          first: summary.firstTradeDate || t("common.unknown"),
          latest: summary.latestTradeDate || t("common.unknown"),
          dated: number(summary.datedRecordCount),
          records: number(summary.recordCount),
        }))}</small>
        <div class="trade-cadence-row">
          <span>${escapeHtml(t("trade.cadenceLabel", { cadence }))}</span>
          <span>${escapeHtml(recency)}</span>
        </div>
        <small>${escapeHtml(cadenceInterval)}</small>
        <small>${escapeHtml(t("trade.companySummaryHs", { hs: hsText }))}</small>
        <small>${escapeHtml(t("trade.companySummaryAmount", { amount: amountText }))}</small>
        <div class="trade-company-footer">
          <span>${escapeHtml(companyIdentity)}</span>
          <span class="trade-company-website ${summary.websiteUrl ? "known" : "unresolved"}">${escapeHtml(number(summary.websiteCount) > 1 ? t("trade.companyWebsiteMultiple") : summary.websiteUrl ? t("trade.companyWebsiteKnown") : t("trade.companyWebsiteUnresolved"))}</span>
        </div>
        ${companySuggestions.length
          ? `<div class="trade-company-suggestions">
              ${companySuggestions.slice(0, 3).map((candidate) => `<button class="text-button" type="button" data-trade-company-prospect="${escapeAttribute(summary.companyName || "")}" data-trade-company-country="${escapeAttribute(companyCountry)}" data-trade-company-website-url="${escapeAttribute(candidate.websiteUrl || "")}">${escapeHtml(candidate.domain || t("trade.useWebsite"))}</button>`).join("")}
            </div>`
          : canPromoteCompany
            ? `<button class="text-button trade-company-promote" type="button" data-trade-company-prospect="${escapeAttribute(summary.companyName || "")}" data-trade-company-country="${escapeAttribute(companyCountry)}">${escapeHtml(t("trade.companyCreateProspect"))}</button>`
            : canResolveCompany
              ? `<button class="text-button trade-company-promote" type="button" data-resolve-trade-company-website="${escapeAttribute(summary.companyName || "")}" data-trade-company-country="${escapeAttribute(companyCountry)}">${escapeHtml(t("trade.companyResolveWebsite"))}</button>`
              : promotionBoundary ? `<small class="trade-company-identity-warning">${escapeHtml(promotionBoundary)}</small>` : ""}
        <small class="trade-review-boundary">${escapeHtml(t("trade.reviewPriorityBoundary"))}</small>
      </article>
    `;
  }).join("");
  if (!state.tradeRecords.length) {
    const emptyMessage = state.tradeRecordAuthorized === false
      ? t("trade.adminRequired")
      : filtered
        ? t("trade.noMatches")
        : total > 0 ? t("trade.noVisibleRecords") : "";
    els.tradeRecordList.innerHTML = emptyMessage
      ? `<div class="empty-state compact-empty">${escapeHtml(emptyMessage)}</div>`
      : "";
    return;
  }
  els.tradeRecordList.innerHTML = state.tradeRecords.slice(0, 30).map((item) => {
    const role = t(`trade.role.${item.role || "unknown"}`);
    const context = [role, item.country].filter(Boolean).join(" · ");
    const product = [item.productDescription, item.hsCode ? `HS ${item.hsCode}` : null].filter(Boolean).join(" · ");
    const website = safeRawUrl(item.websiteUrl);
    const suggestions = Array.isArray(state.tradeWebsiteSuggestions[item.id]) ? state.tradeWebsiteSuggestions[item.id] : [];
    return `
      <div class="trade-record-row">
        <strong>${escapeHtml(item.companyName || t("common.unknown"))}</strong>
        <span>${escapeHtml(context || t("trade.role.unknown"))}</span>
        <span>${escapeHtml(product || t("trade.productUnknown"))}</span>
        ${website === "#"
          ? `<div class="trade-record-actions trade-resolver">
              <span>${escapeHtml(item.tradeDate || t("trade.websiteUnresolved"))}</span>
              ${suggestions.length
                ? suggestions.slice(0, 3).map((candidate) => `<button class="text-button" type="button" data-trade-record-prospect="${escapeAttribute(item.id)}" data-trade-website-url="${escapeAttribute(candidate.websiteUrl || "")}">${escapeHtml(candidate.domain || t("trade.useWebsite"))}</button>`).join("")
                : resolverConfigured
                  ? `<button class="text-button" type="button" data-resolve-trade-website="${escapeAttribute(item.id)}">${escapeHtml(t("trade.resolveWebsite"))}</button>`
                  : `<small>${escapeHtml(t("trade.resolverNotConfigured"))}</small>`}
            </div>`
          : `<div class="trade-record-actions">
              <a href="${escapeAttribute(website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.tradeDate || t("trade.websiteKnown"))}</a>
              <button class="text-button" type="button" data-trade-record-prospect="${escapeAttribute(item.id)}">${escapeHtml(t("trade.createProspect"))}</button>
            </div>`}
      </div>
    `;
  }).join("");
}

function renderOutcomeSummary() {
  if (state.outcomeSummaryAuthorized === false) {
    els.outcomeSummaryCards.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t("outcome.summaryAdminRequired"))}</div>`;
    els.outcomeSummaryValue.innerHTML = "";
    return;
  }
  const summary = state.outcomeSummary;
  if (!summary) {
    els.outcomeSummaryCards.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t("outcome.summaryUnavailable"))}</div>`;
    els.outcomeSummaryValue.innerHTML = "";
    return;
  }
  const cards = [
    ["confirmed", summary.confirmedOutcomes || 0],
    ["awaiting", summary.awaitingOwnerReview || 0],
    ["observing", summary.observing || 0],
    ["no-value", summary.noValue || 0],
    ["unclosed", summary.unclosed || 0],
  ];
  els.outcomeSummaryCards.innerHTML = cards.map(([kind, count]) => {
    const actionable = ["awaiting", "observing"].includes(kind) && Number(count) > 0;
    const tag = actionable ? "button" : "div";
    return `
      <${tag} class="outcome-summary-card ${escapeAttribute(kind)}${actionable ? " actionable" : ""}"${actionable ? ' type="button" data-outcome-review-queue="true"' : ""}>
        <span>${escapeHtml(t(`outcome.summary.${kind}`))}</span>
        <strong>${number(count)}</strong>
        ${actionable ? `<small>${escapeHtml(t("outcome.summaryOpenReviewQueue"))}</small>` : ""}
      </${tag}>
    `;
  }).join("");
  const values = Object.entries(summary.ownerEnteredValueByCurrency || {})
    .filter(([, amount]) => Number(amount) > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  els.outcomeSummaryValue.innerHTML = `
    <div>
      <span>${escapeHtml(t("outcome.summaryCompletedSales", { count: number(summary.completedSalesTasks) }))}</span>
      <small>${escapeHtml(t("outcome.summaryValueBoundary"))}</small>
    </div>
    <strong>${values.length
      ? values.map(([currency, amount]) => `${escapeHtml(formatNumber(amount))} ${escapeHtml(currency)}`).join(" · ")
      : escapeHtml(t("outcome.summaryNoOwnerValue"))}</strong>
  `;
}

function renderOutcomeLearning() {
  if (!els.outcomeLearningViews) return;
  const pendingResultReviews = Number(state.ownerReviewQueue?.summary?.resultReviewRequired || 0);
  if (els.outcomeLearningReviewPending) {
    els.outcomeLearningReviewPending.hidden = state.ownerReviewQueueAuthorized !== true || pendingResultReviews <= 0;
    els.outcomeLearningReviewPending.textContent = t("outcomeLearning.reviewPending", { count: number(pendingResultReviews) });
  }
  if (els.outcomeLearningReadiness) els.outcomeLearningReadiness.innerHTML = "";
  if (state.outcomeLearningAuthorized === false) {
    els.outcomeLearningViews.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t("outcomeLearning.adminRequired"))}</div>`;
    return;
  }
  const learning = state.outcomeLearning;
  if (els.outcomeLearningReadiness) {
    els.outcomeLearningReadiness.innerHTML = learning
      ? `<strong>${escapeHtml(t(learning.status === "insufficient-sample" ? "outcomeLearning.readinessInsufficient" : "outcomeLearning.readinessReady", {
          count: number(learning.sampleCount || 0),
          minimum: number(learning.minimumSampleSize || 0),
        }))}</strong>`
      : "";
  }
  if (!learning) {
    els.outcomeLearningViews.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t("outcomeLearning.unavailable"))}</div>`;
    return;
  }
  const dimensions = Array.isArray(learning.dimensions) ? learning.dimensions : [];
  if (!dimensions.length) {
    els.outcomeLearningViews.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t("outcomeLearning.empty"))}</div>`;
    return;
  }
  els.outcomeLearningViews.innerHTML = dimensions.map((dimension) => {
    const cohorts = Array.isArray(dimension.cohorts) ? dimension.cohorts : [];
    const cohortMarkup = cohorts.length
      ? cohorts.map((cohort) => {
          const values = Object.entries(cohort.ownerEnteredValueByCurrency || {})
            .filter(([, amount]) => Number(amount) > 0)
            .sort(([left], [right]) => left.localeCompare(right));
          return `
            <div class="outcome-learning-cohort">
              <div class="outcome-learning-cohort-heading">
                <strong>${escapeHtml(outcomeLearningCohortLabel(dimension.key, cohort.key))}</strong>
                <span>${escapeHtml(t("outcomeLearning.sampleCount", { count: number(cohort.sampleCount || 0) }))}</span>
              </div>
              <div class="outcome-learning-counts">
                ${renderOutcomeLearningStateCount(dimension.key, cohort.key, "confirmed", cohort.confirmedCount || 0, t("outcomeLearning.confirmed", { count: number(cohort.confirmedCount || 0) }))}
                ${renderOutcomeLearningStateCount(dimension.key, cohort.key, "no-value", cohort.noValueCount || 0, t("outcomeLearning.noValue", { count: number(cohort.noValueCount || 0) }))}
                ${renderOutcomeLearningStateCount(dimension.key, cohort.key, "observing", cohort.observingCount || 0, t("outcomeLearning.observing", { count: number(cohort.observingCount || 0) }))}
                ${renderOutcomeLearningStateCount(dimension.key, cohort.key, "awaiting-owner-review", cohort.awaitingCount || 0, t("outcomeLearning.awaiting", { count: number(cohort.awaitingCount || 0) }))}
              </div>
              ${cohort.status === "insufficient-sample"
                ? `<small class="outcome-learning-insufficient">${escapeHtml(t("outcomeLearning.insufficient"))}</small>`
                : `<small>${escapeHtml(t("outcomeLearning.descriptiveOnly"))}</small>`}
              ${values.length
                ? `<small>${escapeHtml(t("outcomeLearning.ownerValue"))}: ${values.map(([currency, amount]) => `${escapeHtml(formatNumber(amount))} ${escapeHtml(currency)}`).join(" · ")}</small>`
                : ""}
              ${Number(cohort.sampleCount || 0) > 0 ? `<button class="text-button outcome-learning-drilldown-button" type="button" data-outcome-learning-drilldown data-outcome-learning-dimension="${escapeAttribute(dimension.key || "")}" data-outcome-learning-cohort="${escapeAttribute(cohort.key || "")}">${escapeHtml(t("outcomeLearning.drilldownOpen", { count: number(cohort.sampleCount || 0) }))}</button>` : ""}
            </div>
          `;
        }).join("")
      : `<div class="empty-state compact-empty">${escapeHtml(t("outcomeLearning.noSamples"))}</div>`;
    return `
      <section class="outcome-learning-view" data-outcome-learning-dimension="${escapeAttribute(dimension.key || "unknown")}">
        <div class="outcome-learning-view-heading">
          <strong>${escapeHtml(t(`outcomeLearning.dimension.${dimension.key}`))}</strong>
          <small>${escapeHtml(outcomeLearningViewBoundary(dimension.key))}</small>
        </div>
        <div class="outcome-learning-cohorts">${cohortMarkup}</div>
      </section>
    `;
  }).join("");
}

function renderOutcomeLearningStateCount(dimension, cohortKey, outcomeState, count, label) {
  if (Number(count) <= 0) return `<span>${escapeHtml(label)}</span>`;
  return `<button class="outcome-learning-state-button" type="button" data-outcome-learning-drilldown data-outcome-learning-dimension="${escapeAttribute(dimension || "")}" data-outcome-learning-cohort="${escapeAttribute(cohortKey || "")}" data-outcome-learning-state="${escapeAttribute(outcomeState)}">${escapeHtml(label)}</button>`;
}

async function loadOutcomeLearningDrilldown(dimension, cohortKey, button, outcomeState = "") {
  if (!dimension || !cohortKey || button?.disabled) return;
  const requestSequence = latestRequest.outcomeLearningDrilldown.next();
  const originalLabel = button?.textContent || "";
  state.outcomeLearningDrilldown = null;
  state.outcomeLearningDrilldownVisibleLimit = 12;
  renderOutcomeLearningDrilldown();
  if (button) {
    button.disabled = true;
    button.textContent = t("outcomeLearning.drilldownLoading");
  }
  try {
    const params = new URLSearchParams({ dimension, cohort: cohortKey });
    if (outcomeState) params.set("state", outcomeState);
    const payload = await requestWithAdminKey(`/api/admin/prospects/outcome-learning/drilldown?${params.toString()}`);
    if (!latestRequest.outcomeLearningDrilldown.isCurrent(requestSequence)) return;
    state.outcomeLearningDrilldown = payload.drilldown || null;
    state.outcomeLearningDrilldownVisibleLimit = 12;
    renderOutcomeLearningDrilldown();
    els.outcomeLearningDrilldown?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    if (latestRequest.outcomeLearningDrilldown.isCurrent(requestSequence)) {
      showToast(error.message || t("outcomeLearning.drilldownFailed"), true);
    }
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = originalLabel || t("outcomeLearning.drilldownOpen", { count: 0 });
    }
  }
}

function renderOutcomeLearningDrilldown() {
  const container = els.outcomeLearningDrilldown;
  if (!container) return;
  const drilldown = state.outcomeLearningDrilldown;
  if (!drilldown) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  const items = Array.isArray(drilldown.items) ? drilldown.items : [];
  const visibleLimit = Math.max(12, Number(state.outcomeLearningDrilldownVisibleLimit) || 12);
  const visibleItems = items.slice(0, visibleLimit);
  const label = outcomeLearningCohortLabel(drilldown.dimension, drilldown.cohortKey);
  const stateFilter = drilldown.outcomeStateFilter || "";
  const filteredLabel = stateFilter ? `${label} · ${t(`outcomeLearning.contribution.${stateFilter}`)}` : label;
  const countLabel = stateFilter
    ? t("outcomeLearning.drilldownFilteredCount", { count: number(drilldown.sampleCount || 0), total: number(drilldown.cohortSampleCount || 0) })
    : t("outcomeLearning.drilldownCount", { count: number(drilldown.sampleCount || items.length) });
  container.hidden = false;
  container.innerHTML = `
    <div class="outcome-learning-drilldown-heading">
      <div>
        <small>${escapeHtml(t(`outcomeLearning.dimension.${drilldown.dimension}`))}</small>
        <strong>${escapeHtml(filteredLabel)}</strong>
      </div>
      <span>${escapeHtml(countLabel)}</span>
    </div>
    <p>${escapeHtml(t("outcomeLearning.drilldownIntro"))}</p>
    <div class="outcome-learning-drilldown-list">
      ${visibleItems.length ? visibleItems.map((item) => `
        <div class="outcome-learning-drilldown-item">
          <div>
            <strong>${escapeHtml(item.companyName || item.domain || item.prospectId)}</strong>
            <small>${escapeHtml(item.domain || "")}</small>
          </div>
          <span>${escapeHtml(t(`outcomeLearning.contribution.${item.contributionState || "awaiting-owner-review"}`))}</span>
          <button class="text-button" type="button" data-outcome-learning-account="${escapeAttribute(item.prospectId || "")}">${escapeHtml(t("outcomeLearning.drilldownAccount"))}</button>
        </div>
      `).join("") : `<div class="empty-state compact-empty">${escapeHtml(t("outcomeLearning.drilldownEmpty"))}</div>`}
    </div>
    ${items.length > visibleLimit ? `<div class="outcome-learning-drilldown-more"><button class="button ghost compact" type="button" data-outcome-learning-more>${escapeHtml(t("outcomeLearning.drilldownMore", { remaining: number(items.length - visibleLimit) }))}</button></div>` : ""}
    <small class="outcome-learning-drilldown-boundary">${escapeHtml(t("outcomeLearning.drilldownBoundary"))}</small>
  `;
}

function outcomeLearningViewBoundary(dimension) {
  return dimension === "business-channel-role"
    ? t("outcomeLearning.channelOverlapBoundary")
    : t("outcomeLearning.viewBoundary");
}

async function jumpToOutcomeResultReviewQueue() {
  await applyOwnerReviewQueueFilter("result-review");
  els.ownerReviewQueuePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  els.ownerReviewQueueFilters.querySelector('[data-owner-queue-filter="result-review"]')?.focus();
}

function outcomeLearningCohortLabel(dimension, key) {
  if (dimension === "website-evidence-source") {
    return t(`outcomeLearning.website.${key}`);
  }
  if (dimension === "business-channel-role") {
    return t(`outcomeLearning.channel.${key}`);
  }
  if (dimension === "icp-lexical-coverage") {
    return t(`outcomeLearning.icp.${key}`);
  }
  return String(key || t("outcomeLearning.unknown"));
}

function renderOwnerReviewQueue() {
  els.ownerReviewQueueMore.hidden = true;
  for (const button of els.ownerReviewQueueFilters.querySelectorAll("[data-owner-queue-filter]")) {
    button.classList.toggle("active", button.dataset.ownerQueueFilter === state.ownerReviewQueueFilter);
  }

  if (state.ownerReviewQueueAuthorized === false) {
    els.ownerReviewQueueSummary.innerHTML = "";
    els.ownerReviewQueueList.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t("prospect.ownerQueueAdminRequired"))}</div>`;
    return;
  }
  const queue = state.ownerReviewQueue;
  if (!queue) {
    els.ownerReviewQueueSummary.innerHTML = "";
    els.ownerReviewQueueList.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t("prospect.ownerQueueUnavailable"))}</div>`;
    return;
  }

  const summary = queue.summary || {};
  const summaryItems = [
    ["decision", summary.ownerDecisionRequired || 0],
    ["exception", summary.executionExceptions || 0],
    ["result", summary.resultReviewRequired || 0],
    ["action", summary.actionReady || 0],
    ["waiting", summary.waitingOnEmployee || 0],
  ];
  els.ownerReviewQueueSummary.innerHTML = summaryItems.map(([kind, count]) => `
    <div class="owner-review-summary-card ${escapeAttribute(kind)}">
      <span>${escapeHtml(t(`prospect.ownerQueueSummary.${kind}`))}</span>
      <strong>${number(count)}</strong>
    </div>
  `).join("");

  const activeItems = (Array.isArray(queue.items) ? queue.items : []).filter((item) => item.attention !== "closed");
  const filter = state.ownerReviewQueueFilter;
  const filteredItems = filter === "all"
    ? activeItems
    : activeItems.filter((item) => item.attention === filter);
  if (!filteredItems.length) {
    els.ownerReviewQueueList.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(t(filter === "all" ? "prospect.ownerQueueEmpty" : "prospect.ownerQueueFilteredEmpty"))}</div>`;
    return;
  }

  const visibleLimit = Math.max(10, Number(state.ownerReviewQueueVisibleLimit) || 10);
  const visibleItems = filteredItems.slice(0, visibleLimit);
  els.ownerReviewQueueList.innerHTML = visibleItems.map((item) => {
    const blocker = Array.isArray(item.blockers) ? item.blockers[0] : "";
    const primaryAction = item.primaryAction ? t(`prospect.accountReviewAction.${item.primaryAction}`) : t("prospect.ownerQueueNoAction");
    const tradePriority = item.tradeReviewPriority ? t(`trade.reviewPriority.${item.tradeReviewPriority}`) : "";
    const exception = item.executionException || null;
    const exceptionMessage = exception?.errorMessage ? String(exception.errorMessage).slice(0, 220) : "";
    return `
      <article class="owner-review-queue-card ${escapeAttribute(item.attention || "action-ready")}">
        <div class="owner-review-queue-card-top">
          <span class="owner-review-priority ${escapeAttribute(String(item.handlingPriority || "").toLowerCase().replaceAll("_", "-"))}">${escapeHtml(t(`prospect.ownerQueuePriority.${item.handlingPriority}`))}</span>
          <span class="owner-review-evidence">${escapeHtml(t("prospect.ownerQueueEvidence", { completed: number(item.evidenceCompleted), total: number(item.evidenceTotal) }))}</span>
        </div>
        <div class="owner-review-queue-card-heading">
          <div>
            <strong>${escapeHtml(item.companyName || item.domain)}</strong>
            <small>${escapeHtml(item.domain || "")}</small>
          </div>
          <span class="owner-review-stage-label">${escapeHtml(t(`prospect.accountReviewStage.${item.stage}`))}</span>
        </div>
        <div class="owner-review-queue-context">
          <span>${escapeHtml(t("prospect.ownerQueueNextAction", { action: primaryAction }))}</span>
          ${exception ? `<span class="owner-review-exception-detail">${escapeHtml(t("prospect.ownerQueueException", {
            employee: t(`prospect.accountReviewEmployee.${exception.employee}`),
            status: t(`employee.status.${exception.status}`),
            code: exception.errorCode || t("common.unknown"),
          }))}</span>` : ""}
          ${exceptionMessage ? `<span class="owner-review-exception-message">${escapeHtml(exceptionMessage)}</span>` : ""}
          ${blocker ? `<span>${escapeHtml(t("prospect.ownerQueueBlocker", { blocker: t(`prospect.accountReviewBlocker.${blocker}`) }))}</span>` : ""}
          ${tradePriority ? `<span>${escapeHtml(t("prospect.ownerQueueTradePriority", { priority: tradePriority }))}</span>` : ""}
        </div>
        <div class="owner-review-queue-card-footer">
          <div>
            <span>${escapeHtml(t("prospect.ownerQueueCandidateScore", { score: number(item.candidateScore) }))}</span>
            <small>${escapeHtml(t("prospect.ownerQueueLatest", { time: formatDateTime(item.latestObservedAt) }))}</small>
          </div>
          <button class="text-button owner-review-open" type="button" data-owner-queue-open="${escapeAttribute(item.prospectId)}">${escapeHtml(t("prospect.ownerQueueOpen"))}</button>
        </div>
      </article>
    `;
  }).join("");
  const remaining = Math.max(0, filteredItems.length - visibleItems.length);
  els.ownerReviewQueueMore.hidden = remaining === 0;
  els.ownerReviewQueueMore.textContent = remaining > 0
    ? t("prospect.ownerQueueMoreRemaining", { count: number(remaining) })
    : t("prospect.ownerQueueMore");
}

function renderProspects() {
  els.prospectGridMore.hidden = true;
  const discovery = state.overview?.prospectDiscovery;
  const sourcesConfig = state.overview?.config?.sources || {};
  const searchConfigured = sourcesConfig.prospectSearchConfigured === true || sourcesConfig.prospectMapConfigured === true;
  const directoryConfigured = number(sourcesConfig.prospectDiscoverySeedCount) > 0;
  const discoveryConfigured = directoryConfigured || searchConfigured;
  const channels = Array.isArray(discovery?.channels) ? discovery.channels : [];
  els.prospectChannelStatus.innerHTML = channels.map((channel) => `
    <span class="prospect-channel-chip ${escapeAttribute(channel.status || "skipped")}" title="${escapeAttribute(t("prospect.channelDetail", { errors: number(channel.errorCount), duration: number(channel.durationMs) }))}">
      <strong>${escapeHtml(t(`prospect.channel.${channel.channel}`))}</strong>
      ${escapeHtml(t(`prospect.channelStatus.${channel.status || "skipped"}`))} · ${escapeHtml(t("prospect.channelCandidates", { count: number(channel.candidateCount) }))}
    </span>
  `).join("");
  els.prospectSearchInput.disabled = !searchConfigured;
  els.prospectPlanButton.disabled = !searchConfigured;
  els.prospectSearchButton.disabled = !searchConfigured;
  els.prospectSearchHint.textContent = t(searchConfigured ? "prospect.searchConfigured" : "prospect.searchNotConfigured");
  renderTradeRecords();
  if (!discoveryConfigured) {
    els.prospectDiscoveryStatus.textContent = t("prospect.notConfigured");
  } else if (discovery?.status === "failed") {
    els.prospectDiscoveryStatus.textContent = t("prospect.discoveryFailed");
  } else {
    els.prospectDiscoveryStatus.textContent = t("prospect.discoveryResult", {
      count: number(discovery?.candidateCount),
      duration: formatNumber(discovery?.durationMs || 0),
    });
  }

  if (!state.prospects.length) {
    els.prospectGrid.innerHTML = `<div class="empty-state">${escapeHtml(t("empty.prospects"))}</div>`;
    return;
  }
  const delegationConfigured = state.overview?.config?.ai?.employeeDelegationConfigured === true;
  const visibleLimit = Math.max(12, Number(state.prospectVisibleLimit) || 12);
  const visibleProspects = state.prospects.slice(0, visibleLimit);
  els.prospectGrid.innerHTML = visibleProspects.map((item) => {
    const intelligenceDelegation = latestProspectDelegation(item.id);
    const salesDelegation = latestProspectSalesDelegation(item.id);
    const activeDelegation = salesDelegation || intelligenceDelegation;
    const delegationStateKnown = Boolean(activeDelegation) || state.delegationCoverageComplete;
    const companyChannels = Array.isArray(item.companyContactChannels) ? item.companyContactChannels : [];
    const legacyContactCount = (Array.isArray(item.publicEmails) ? item.publicEmails.length : 0) +
      (Array.isArray(item.publicPhones) ? item.publicPhones.length : 0) +
      (Array.isArray(item.publicMessagingUrls) ? item.publicMessagingUrls.length : 0);
    const contactCount = companyChannels.length || legacyContactCount;
    const channelRoles = [...new Set(companyChannels
      .map((channel) => String(channel?.businessRole || "unknown"))
      .filter((role) => !["unknown", "general"].includes(role)))]
      .slice(0, 3);
    const productCount = Array.isArray(item.productSignals) ? item.productSignals.length : 0;
    const profileCount = Array.isArray(item.officialProfileUrls) ? item.officialProfileUrls.length : 0;
    const sourceUrl = safeRawUrl(item.discoverySourceUrl);
    const websiteEvidenceStatus = item.websiteEvidenceStatus || "unverified";
    const staticEvidenceIncomplete = websiteEvidenceStatus === "static-incomplete"
      || (Array.isArray(item.reasons) && item.reasons.some((reason) => String(reason).includes("JavaScript-rendered")));
    return `
      <article class="opportunity-card">
        <div class="opportunity-top">
          <span class="decision watch">${escapeHtml(t(`prospect.status.${item.status || "DISCOVERED"}`))}</span>
          <span class="score-label"><strong>${number(item.score)}</strong> / 100</span>
        </div>
        <h4><a href="${safeUrl(item.websiteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.companyName || item.domain)}</a></h4>
        <div class="prospect-website-evidence ${escapeAttribute(websiteEvidenceStatus)}">${escapeHtml(t(`prospect.websiteEvidence.${websiteEvidenceStatus}`))}</div>
        ${websiteEvidenceStatus === "unverified" ? `<div class="prospect-evidence-warning">${escapeHtml(t("prospect.websiteEvidenceRequired"))}</div>` : ""}
        ${staticEvidenceIncomplete ? `<div class="prospect-evidence-warning">${escapeHtml(t("prospect.browserEvidenceRequired"))}</div>` : ""}
        <p>${escapeHtml(item.description || item.domain)}</p>
        <div class="opportunity-meta">
          <span>${escapeHtml(item.domain)}</span>
          ${item.websiteEvidenceSource === "browser-rendered" ? `<span>${escapeHtml(t("prospect.browserEvidenceSource"))}</span>` : ""}
          <span>${escapeHtml(t(companyChannels.length ? "prospect.businessChannels" : "prospect.contacts", { count: contactCount }))}</span>
          ${channelRoles.length ? `<span>${escapeHtml(t("prospect.channelRoles", { roles: channelRoles.map((role) => t(`prospect.channelRole.${role}`)).join(" · ") }))}</span>` : ""}
          <span>${escapeHtml(t("prospect.products", { count: productCount }))}</span>
          ${profileCount > 0 ? `<span>${escapeHtml(t("prospect.officialProfiles", { count: profileCount }))}</span>` : ""}
          ${item.fitScore === null || item.fitScore === undefined ? "" : `<span>${escapeHtml(t("prospect.icpFit", { score: number(item.fitScore), matched: Array.isArray(item.fitMatches) ? item.fitMatches.length : 0, total: Array.isArray(item.fitTerms) ? item.fitTerms.length : 0 }))}</span>`}
        </div>
        <div class="score-track" aria-label="${escapeAttribute(`${item.companyName || item.domain} ${number(item.score)}/100`)}"><span style="width:${Math.max(0, Math.min(100, Number(item.score) || 0))}%"></span></div>
        <div class="price-row">
          <span>${escapeHtml(t("prospect.source"))}</span>
          ${sourceUrl === "#"
            ? `<strong>${escapeHtml(item.discoverySourceTitle || item.discoverySourceUrl)}</strong>`
            : `<a href="${escapeAttribute(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.discoverySourceTitle || item.discoverySourceUrl)}</a>`}
        </div>
        <div class="employee-action-row">
          <div>
            <span class="employee-status ${escapeAttribute(activeDelegation?.status || "idle")}">${escapeHtml(activeDelegation ? employeeStatusLabel(activeDelegation) : delegationStateKnown ? t("prospect.crmSafe") : t("prospect.employeeStateUnknown"))}</span>
            <small>${escapeHtml(activeDelegation ? t("employee.review", { status: reviewStatusLabel(activeDelegation.reviewStatus) }) : delegationStateKnown ? t("employee.safeNote") : t("prospect.employeeStateUnknownNote"))}</small>
          </div>
          <div class="prospect-card-actions">
            <button class="text-button employee-delegate-button account-review-button" type="button" data-open-account-review="${escapeAttribute(item.id)}">${escapeHtml(t("prospect.accountReview"))}</button>
            ${prospectActionButtons(item, intelligenceDelegation, salesDelegation, delegationConfigured, state.delegationCoverageComplete)}
          </div>
        </div>
      </article>
    `;
  }).join("");
  const remaining = Math.max(0, state.prospects.length - visibleProspects.length);
  els.prospectGridMore.hidden = remaining === 0;
  els.prospectGridMore.textContent = remaining > 0
    ? t("prospect.moreRemaining", { count: number(remaining) })
    : t("prospect.more");
}

function prospectActionButtons(item, intelligenceDelegation, salesDelegation, delegationConfigured, delegationCoverageComplete) {
  if (item.status === "REJECTED") return "";
  const websiteEvidenceStatus = item.websiteEvidenceStatus || "unverified";
  if (websiteEvidenceStatus === "unverified") {
    return `<button class="text-button employee-delegate-button" type="button" data-verify-prospect-website="${escapeAttribute(item.id)}">${escapeHtml(t("prospect.verifyWebsite"))}</button>`;
  }
  const browserEvidenceAction = websiteEvidenceStatus === "static-incomplete"
    ? `<button class="text-button employee-delegate-button" type="button" data-request-browser-evidence="${escapeAttribute(item.id)}">${escapeHtml(t("prospect.requestBrowserEvidence"))}</button>`
    : "";
  if (!delegationConfigured) return browserEvidenceAction;
  if (item.status === "DISCOVERED") {
    if (!intelligenceDelegation && !delegationCoverageComplete) {
      return `<div class="prospect-review-actions">${browserEvidenceAction}<span class="employee-status idle">${escapeHtml(t("prospect.employeeStateUnknownAction"))}</span></div>`;
    }
    return `<div class="prospect-review-actions">${browserEvidenceAction}<button class="text-button employee-delegate-button" type="button" data-delegate-prospect="${escapeAttribute(item.id)}">${escapeHtml(t("prospect.delegate"))}</button></div>`;
  }
  if (item.status === "REVIEW_REQUIRED") {
    if (!intelligenceDelegation) {
      if (!delegationCoverageComplete) {
        return `<div class="prospect-review-actions">${browserEvidenceAction}<span class="employee-status idle">${escapeHtml(t("prospect.employeeStateUnknownAction"))}</span></div>`;
      }
      return `<div class="prospect-review-actions">${browserEvidenceAction}<button class="text-button employee-delegate-button" type="button" data-delegate-prospect="${escapeAttribute(item.id)}">${escapeHtml(t("prospect.delegate"))}</button></div>`;
    }
    if (["queued", "running"].includes(intelligenceDelegation.status)) {
      return `<div class="prospect-review-actions">${browserEvidenceAction}<button class="text-button employee-delegate-button" type="button" data-refresh-prospect-run="${escapeAttribute(intelligenceDelegation.bossaiRunId)}">${escapeHtml(t("prospect.refreshReview"))}</button></div>`;
    }
    if (intelligenceDelegation.status === "completed") {
      return `<div class="prospect-review-actions">${browserEvidenceAction}<span class="employee-status completed">${escapeHtml(t("prospect.ownerDecisionInAccountReview"))}</span></div>`;
    }
    return `<div class="prospect-review-actions">${browserEvidenceAction}<span class="employee-status ${escapeAttribute(intelligenceDelegation.status)}">${escapeHtml(t("prospect.ownerDecisionInAccountReview"))}</span></div>`;
  }
  if (item.status === "READY_FOR_SALES") {
    if (!salesDelegation) {
      if (!delegationCoverageComplete) {
        return `<span class="employee-status idle">${escapeHtml(t("prospect.employeeStateUnknownAction"))}</span>`;
      }
      return `<button class="text-button employee-delegate-button" type="button" data-qualify-prospect="${escapeAttribute(item.id)}">${escapeHtml(t("prospect.qualify"))}</button>`;
    }
    if (["queued", "running"].includes(salesDelegation.status)) {
      return `<button class="text-button employee-delegate-button" type="button" data-refresh-prospect-run="${escapeAttribute(salesDelegation.bossaiRunId)}">${escapeHtml(t("prospect.refreshSales"))}</button>`;
    }
    return `<span class="employee-status ${escapeAttribute(salesDelegation.status)}">${escapeHtml(t("prospect.salesQualificationComplete"))}</span>`;
  }
  return "";
}

function latestProspectDelegation(prospectId) {
  return state.delegations
    .filter((item) => item.sourceType === "prospect" && item.sourceRecordId === prospectId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
}

function latestProspectSalesDelegation(prospectId) {
  return state.delegations
    .filter((item) => item.sourceType === "prospect-sales" && item.sourceRecordId === prospectId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
}

async function resolveTradeCompanyWebsite(companyName, country, button) {
  if (!companyName || button.disabled) return;
  button.disabled = true;
  button.textContent = t("trade.companyResolvingWebsite");
  try {
    const result = await postWithAdminKey("/api/admin/trade-companies/resolve-website", { companyName, country });
    const key = tradeCompanySuggestionKey(companyName, country);
    state.tradeCompanyWebsiteSuggestions[key] = Array.isArray(result.suggestions) ? result.suggestions : [];
    showToast(t("trade.companyResolveDone", { count: state.tradeCompanyWebsiteSuggestions[key].length }));
    renderTradeRecords();
  } catch (error) {
    showToast(error.message || t("trade.companyResolveFailed"), true);
    button.disabled = false;
    button.textContent = t("trade.companyResolveWebsite");
  }
}

async function createProspectFromTradeCompany(companyName, country, button, websiteUrl = "") {
  if (!companyName || button.disabled) return;
  button.disabled = true;
  button.textContent = t("trade.companyCreatingProspect");
  try {
    const result = await postWithAdminKey("/api/admin/trade-companies/prospect", {
      companyName,
      country,
      ...(websiteUrl ? { websiteUrl } : {}),
    });
    delete state.tradeCompanyWebsiteSuggestions[tradeCompanySuggestionKey(companyName, country)];
    showToast(t("trade.companyProspectCreated", {
      company: result.prospect?.companyName || companyName,
      records: number(result.linkedTradeRecordCount),
    }));
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || t("trade.companyProspectFailed"), true);
    button.disabled = false;
    button.textContent = t("trade.companyCreateProspect");
  }
}

async function resolveTradeRecordWebsite(recordId, button) {
  if (!recordId || button.disabled) return;
  button.disabled = true;
  button.textContent = t("trade.resolvingWebsite");
  try {
    const result = await postWithAdminKey(`/api/admin/trade-records/${encodeURIComponent(recordId)}/resolve-website`);
    state.tradeWebsiteSuggestions[recordId] = Array.isArray(result.suggestions) ? result.suggestions : [];
    showToast(t("trade.resolveDone", { count: state.tradeWebsiteSuggestions[recordId].length }));
    renderTradeRecords();
  } catch (error) {
    showToast(error.message || t("trade.resolveFailed"), true);
    button.disabled = false;
    button.textContent = t("trade.resolveWebsite");
  }
}

async function createProspectFromTradeRecord(recordId, button, websiteUrl = "") {
  if (!recordId || button.disabled) return;
  button.disabled = true;
  button.textContent = t("trade.verifyingWebsite");
  try {
    const result = await postWithAdminKey(
      `/api/admin/trade-records/${encodeURIComponent(recordId)}/prospect`,
      websiteUrl ? { websiteUrl } : undefined,
    );
    delete state.tradeWebsiteSuggestions[recordId];
    showToast(t("trade.prospectCreated", { company: result.prospect?.companyName || t("common.unknown") }));
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || t("trade.prospectFailed"), true);
    button.disabled = false;
    button.textContent = t("trade.createProspect");
  }
}

function tradeImportFileKey(file) {
  return file ? `${file.name}:${file.size}:${file.lastModified}` : "";
}

function resetTradeImportPreview() {
  state.tradeImportPreview = null;
  state.tradeImportPreviewFileKey = "";
  els.tradeRecordPreview.hidden = true;
  els.tradeRecordPreview.innerHTML = "";
  els.tradeRecordImportButton.disabled = true;
  els.tradeRecordImportNote.textContent = t("trade.safeNote");
}

async function previewTradeRecords() {
  const file = els.tradeRecordFile.files?.[0];
  if (!file) {
    showToast(t("trade.fileRequired"), true);
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast(t("trade.fileTooLarge"), true);
    return;
  }
  els.tradeRecordPreviewButton.disabled = true;
  els.tradeRecordPreviewButton.textContent = t("trade.previewing");
  try {
    const content = await file.text();
    const type = file.name.toLowerCase().endsWith(".tsv") ? "text/tab-separated-values" : "text/csv";
    const result = await postTradePreview(content, file.name, type);
    state.tradeImportPreview = result;
    state.tradeImportPreviewFileKey = tradeImportFileKey(file);
    const mapping = Object.entries(result.mapping || {});
    const missingFields = Array.isArray(result.missingFields) ? result.missingFields : [];
    const ignoredHeaders = Array.isArray(result.ignoredHeaders) ? result.ignoredHeaders : [];
    const samples = Array.isArray(result.preview) ? result.preview.slice(0, 3) : [];
    els.tradeRecordPreview.innerHTML = `
      <div class="trade-mapping-grid">
        ${mapping.map(([field, header]) => `<span class="trade-mapping-chip">${escapeHtml(t(`trade.mapping.${field}`))} ← ${escapeHtml(header)}</span>`).join("")}
      </div>
      ${missingFields.length ? `<div class="trade-preview-alert"><strong>${escapeHtml(t("trade.previewMissing"))}</strong>${missingFields.map((field) => `<span class="trade-mapping-chip warning">${escapeHtml(t(`trade.mapping.${field}`))}</span>`).join("")}</div>` : ""}
      ${ignoredHeaders.length ? `<div class="trade-preview-alert"><strong>${escapeHtml(t("trade.previewIgnored"))}</strong>${ignoredHeaders.slice(0, 12).map((header) => `<span class="trade-mapping-chip ignored">${escapeHtml(header)}</span>`).join("")}</div>` : ""}
      <div class="trade-preview-samples">
        <small>${escapeHtml(t("trade.previewSummary", { records: number(result.recordCount), rejected: number(result.rejectedRows), fields: mapping.length }))}</small>
        ${samples.map((item) => `<small>${escapeHtml([item.companyName, item.country, item.productDescription, item.hsCode ? `HS ${item.hsCode}` : ""].filter(Boolean).join(" · "))}</small>`).join("")}
      </div>
    `;
    els.tradeRecordPreview.hidden = false;
    els.tradeRecordImportButton.disabled = false;
    els.tradeRecordImportNote.textContent = Array.isArray(result.warnings) && result.warnings.length
      ? result.warnings.join(" · ")
      : t("trade.previewReady");
  } catch (error) {
    resetTradeImportPreview();
    showToast(error.message || t("trade.previewFailed"), true);
  } finally {
    els.tradeRecordPreviewButton.disabled = false;
    els.tradeRecordPreviewButton.textContent = t("trade.previewButton");
  }
}

async function importTradeRecords() {
  const file = els.tradeRecordFile.files?.[0];
  if (!file) {
    showToast(t("trade.fileRequired"), true);
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast(t("trade.fileTooLarge"), true);
    return;
  }
  if (!state.tradeImportPreview || tradeImportFileKey(file) !== state.tradeImportPreviewFileKey) {
    showToast(t("trade.previewRequired"), true);
    return;
  }
  els.tradeRecordImportButton.disabled = true;
  els.tradeRecordImportButton.textContent = t("trade.importing");
  try {
    const content = await file.text();
    const type = file.name.toLowerCase().endsWith(".tsv") ? "text/tab-separated-values" : "text/csv";
    const result = await postTradeImport(content, file.name, type);
    showToast(t("trade.importDone", {
      imported: number(result.importedCount),
      duplicates: number(result.duplicateCount),
      rejected: number(result.rejectedRows),
    }));
    els.tradeRecordImportNote.textContent = Array.isArray(result.warnings) && result.warnings.length
      ? result.warnings.join(" · ")
      : t("trade.safeNote");
    els.tradeRecordFile.value = "";
    resetTradeImportPreview();
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || t("trade.importFailed"), true);
  } finally {
    els.tradeRecordImportButton.textContent = t("trade.importButton");
    els.tradeRecordImportButton.disabled = !state.tradeImportPreview || tradeImportFileKey(els.tradeRecordFile.files?.[0]) !== state.tradeImportPreviewFileKey;
  }
}

async function postTradePreview(content, sourceLabel, contentType) {
  return postTradeText("/api/admin/trade-records/preview", content, sourceLabel, contentType);
}

async function postTradeImport(content, sourceLabel, contentType) {
  return postTradeText("/api/admin/trade-records/import", content, sourceLabel, contentType);
}

async function postTradeText(path, content, sourceLabel, contentType, retry = true) {
  try {
    return await api(path, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "x-trade-source-label": sourceLabel,
        ...(state.adminKey ? { "x-radar-key": state.adminKey } : {}),
      },
      body: content,
    });
  } catch (error) {
    if (retry && error.status === 401) {
      const key = window.prompt(t("admin.prompt"), state.adminKey);
      if (key?.trim()) {
        state.adminKey = key.trim();
        sessionStorage.setItem("radar-admin-key", state.adminKey);
        return postTradeText(path, content, sourceLabel, contentType, false);
      }
    }
    throw error;
  }
}

async function planProspectSearchDirections() {
  const query = String(els.prospectSearchInput.value || "").replace(/\s+/g, " ").trim();
  if (query.length < 3) {
    showToast(t("prospect.searchQueryRequired"), true);
    els.prospectSearchInput.focus();
    return;
  }
  els.prospectPlanButton.disabled = true;
  els.prospectPlanButton.textContent = t("prospect.planning");
  try {
    const result = await postWithAdminKey("/api/admin/prospects/plan", { query });
    const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
    els.prospectPlanSuggestions.innerHTML = suggestions.map((item) => `
      <button class="prospect-plan-chip" type="button" data-prospect-plan-query="${escapeAttribute(item.query || "")}" title="${escapeAttribute(item.rationale || "")}">
        ${escapeHtml(item.angle || t("prospect.planAngle"))} · ${escapeHtml(item.query || "")}
      </button>
    `).join("");
    els.prospectPlanSuggestions.hidden = suggestions.length === 0;
    showToast(t("prospect.planDone", { count: suggestions.length, mode: result.mode === "bossai-gateway" ? "AI" : t("prospect.planLocal") }));
  } catch (error) {
    showToast(error.message || t("prospect.planFailed"), true);
  } finally {
    els.prospectPlanButton.textContent = t("prospect.planButton");
    renderProspects();
  }
}

async function discoverProspectsFromSearch() {
  const query = String(els.prospectSearchInput.value || "").replace(/\s+/g, " ").trim();
  if (query.length < 3) {
    showToast(t("prospect.searchQueryRequired"), true);
    els.prospectSearchInput.focus();
    return;
  }
  els.prospectSearchInput.disabled = true;
  els.prospectSearchButton.disabled = true;
  els.prospectSearchButton.textContent = t("prospect.searching");
  try {
    const result = await postWithAdminKey("/api/admin/prospects/discover", { query });
    showToast(t("prospect.searchDone", {
      count: number(result.discoveredCount),
      verified: number(result.verifiedWebsiteCount),
    }));
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || t("prospect.searchFailed"), true);
  } finally {
    els.prospectSearchButton.textContent = t("prospect.searchButton");
    renderProspects();
  }
}

async function verifyProspectWebsite(prospectId, button) {
  if (!prospectId || button.disabled) return;
  button.disabled = true;
  button.textContent = t("prospect.verifyingWebsite");
  try {
    const result = await postWithAdminKey(`/api/admin/prospects/${encodeURIComponent(prospectId)}/verify-website`);
    if (result.prospect) {
      state.prospects = state.prospects.map((item) => item.id === result.prospect.id ? result.prospect : item);
    }
    showToast(t(`prospect.websiteVerificationDone.${result.websiteEvidenceStatus || "verified"}`));
    renderProspects();
    await refreshOutcomeTruthSurfaces();
  } catch (error) {
    showToast(error.message || t("prospect.websiteVerificationFailed"), true);
    button.disabled = false;
    button.textContent = t("prospect.verifyWebsite");
  }
}

async function openAccountReview(prospectId, button) {
  if (!prospectId || button.disabled) return;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = t("prospect.accountReviewLoading");
  try {
    const applied = await loadAccountReview(prospectId);
    if (applied && !els.accountReviewDialog.open) els.accountReviewDialog.showModal();
  } catch (error) {
    showToast(error.message || t("prospect.accountReviewFailed"), true);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel || t("prospect.accountReview");
  }
}

async function loadAccountReview(prospectId) {
  const requestSequence = latestRequest.accountReview.next();
  latestRequest.accountReviewManagerResult.invalidate();
  try {
    const result = await requestWithAdminKey(`/api/admin/prospects/${encodeURIComponent(prospectId)}/account-review`);
    if (!latestRequest.accountReview.isCurrent(requestSequence)) return false;
    state.accountReview = result.review || null;
    renderAccountReview(state.accountReview);
    return true;
  } catch (error) {
    if (!latestRequest.accountReview.isCurrent(requestSequence)) return false;
    throw error;
  }
}

function renderAccountReview(review) {
  if (!review) {
    els.accountReviewBody.innerHTML = `<div class="empty-state">${escapeHtml(t("prospect.accountReviewUnavailable"))}</div>`;
    els.accountReviewActions.innerHTML = "";
    return;
  }
  const company = review.company || {};
  const website = review.websiteEvidence || {};
  const channels = review.businessChannels || { total: 0, roles: [], channels: [] };
  const trade = review.tradeHistory || { recordCount: 0, records: [], amountByCurrency: {} };
  const workflow = review.workflow || { steps: [], intelligence: null, sales: null, salesAuthorization: null };
  const salesAuthorization = workflow.salesAuthorization || null;
  const outcomeReview = review.outcomeReview || { status: "not-ready", currentSalesManagerTaskId: "", currentOwnerDecisionId: "", latestReview: null };
  const outcomeLearningMembership = review.outcomeLearningMembership || null;
  const checklist = review.evidenceChecklist || { completed: 0, total: 0, items: [] };
  const blockers = Array.isArray(review.blockers) ? review.blockers : [];
  const unknowns = Array.isArray(review.qualificationUnknowns) ? review.qualificationUnknowns : [];
  const ownerDecisionJournal = Array.isArray(review.ownerDecisionJournal) ? review.ownerDecisionJournal : [];
  const roleLabels = (channels.roles || []).map((role) => t(`prospect.channelRole.${role}`));
  const amountEntries = Object.entries(trade.amountByCurrency || {});
  const websiteUrl = safeRawUrl(company.websiteUrl);

  els.accountReviewTitle.textContent = company.name || company.domain || t("prospect.accountReviewTitle");
  els.accountReviewSubtitle.textContent = company.domain || t("prospect.accountReviewIntro");
  els.accountReviewStage.textContent = t(`prospect.accountReviewStage.${review.stage}`);
  els.accountReviewStage.className = `account-review-stage ${escapeAttribute(review.stage || "")}`;
  els.accountReviewResult.hidden = true;
  els.accountReviewResult.innerHTML = "";

  els.accountReviewBody.innerHTML = `
    <div class="account-review-progress">
      ${(workflow.steps || []).map((step) => `
        <div class="account-review-step ${escapeAttribute(step.status || "pending")}">
          <span></span>
          <div><strong>${escapeHtml(t(`prospect.accountReviewStep.${step.id}`))}</strong><small>${escapeHtml(t(`prospect.accountReviewStepStatus.${step.status || "pending"}`))}</small></div>
        </div>
      `).join("")}
    </div>

    <div class="account-review-summary-grid">
      <section class="account-review-section account-review-section-wide">
        <div class="account-review-section-heading">
          <div><small>${escapeHtml(t("prospect.accountReviewEvidenceCoverage"))}</small><strong>${escapeHtml(`${number(checklist.completed)}/${number(checklist.total)}`)}</strong></div>
          <span>${escapeHtml(t("prospect.accountReviewCoverageBoundary"))}</span>
        </div>
        <div class="account-review-checklist">
          ${(checklist.items || []).map((item) => `<span class="${item.complete ? "complete" : "missing"}">${escapeHtml(item.complete ? "✓" : "○")} ${escapeHtml(t(`prospect.accountReviewCheck.${item.id}`))}</span>`).join("")}
        </div>
      </section>

      <section class="account-review-section">
        <h4>${escapeHtml(t("prospect.accountReviewCompany"))}</h4>
        <dl>
          <div><dt>${escapeHtml(t("prospect.accountReviewWebsite"))}</dt><dd>${websiteUrl === "#" ? escapeHtml(company.websiteUrl || "-") : `<a href="${escapeAttribute(websiteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(company.domain || company.websiteUrl || "-")}</a>`}</dd></div>
          <div><dt>${escapeHtml(t("prospect.accountReviewCandidateScore"))}</dt><dd>${escapeHtml(`${number(company.candidateScore)}/100`)} <small>${escapeHtml(t("prospect.accountReviewScoreBoundary"))}</small></dd></div>
          <div><dt>${escapeHtml(t("prospect.accountReviewIcp"))}</dt><dd>${company.icpFitScore === null || company.icpFitScore === undefined ? escapeHtml(t("common.unknown")) : escapeHtml(`${number(company.icpFitScore)}% (${(company.icpFitMatches || []).length}/${(company.icpFitTerms || []).length})`)}</dd></div>
        </dl>
        <p>${escapeHtml(company.description || t("prospect.accountReviewNoDescription"))}</p>
        <div class="account-review-tags">${(company.productSignals || []).slice(0, 8).map((item) => `<span>${escapeHtml(item)}</span>`).join("") || `<small>${escapeHtml(t("prospect.accountReviewNoProducts"))}</small>`}</div>
      </section>

      <section class="account-review-section">
        <h4>${escapeHtml(t("prospect.accountReviewWebsiteEvidence"))}</h4>
        <dl>
          <div><dt>${escapeHtml(t("prospect.accountReviewEvidenceStatus"))}</dt><dd>${escapeHtml(t(`prospect.websiteEvidence.${website.status || "unverified"}`))}</dd></div>
          <div><dt>${escapeHtml(t("prospect.accountReviewEvidenceSource"))}</dt><dd>${escapeHtml(t(`prospect.accountReviewEvidenceSource.${website.source || "static-http"}`))}</dd></div>
          <div><dt>${escapeHtml(t("prospect.accountReviewVerifiedAt"))}</dt><dd>${escapeHtml(website.verifiedAt ? formatDateTime(website.verifiedAt) : t("common.unknown"))}</dd></div>
          ${website.latestBrowserRequest ? `<div><dt>${escapeHtml(t("prospect.accountReviewBrowserRequest"))}</dt><dd>${escapeHtml(t(`prospect.accountReviewBrowserStatus.${website.latestBrowserRequest.status}`))}</dd></div>` : ""}
        </dl>
      </section>

      <section class="account-review-section">
        <h4>${escapeHtml(t("prospect.accountReviewChannels", { count: number(channels.total) }))}</h4>
        <small>${escapeHtml(roleLabels.length ? roleLabels.join(" · ") : t("prospect.accountReviewNoChannelRoles"))}</small>
        <div class="account-review-channel-list">
          ${(channels.channels || []).slice(0, 8).map((channel) => `
            <div>
              <strong>${escapeHtml(t(`prospect.channelRole.${channel.businessRole || "general"}`))}</strong>
              <span>${escapeHtml(channel.type || "-")} · ${escapeHtml(channel.value || channel.url || "-")}</span>
              <small>${escapeHtml(t("prospect.accountReviewChannelEvidence", { confidence: channel.confidence || "-", source: channel.sourceKind || "-" }))}</small>
              ${renderAccountReviewSourceLink(channel.sourcePageUrl)}
            </div>
          `).join("") || `<div class="account-review-empty">${escapeHtml(t("prospect.accountReviewNoChannels"))}</div>`}
        </div>
        <p class="account-review-boundary">${escapeHtml(t("prospect.accountReviewChannelBoundary"))}</p>
      </section>

      <section class="account-review-section">
        <h4>${escapeHtml(t("prospect.accountReviewTrade", { count: number(trade.recordCount) }))}</h4>
        ${trade.recordCount ? `
          <dl>
            <div><dt>${escapeHtml(t("prospect.accountReviewTradeWindow"))}</dt><dd>${escapeHtml(`${trade.firstTradeDate || "?"} → ${trade.latestTradeDate || "?"}`)}</dd></div>
            <div><dt>${escapeHtml(t("prospect.accountReviewTradeCadence"))}</dt><dd>${escapeHtml(t(`trade.cadence.${trade.historicalCadence || "insufficient"}`))}</dd></div>
            <div><dt>${escapeHtml(t("prospect.accountReviewTradePriority"))}</dt><dd>${escapeHtml(trade.reviewPriority ? t(`trade.reviewPriority.${trade.reviewPriority}`) : t("common.unknown"))}</dd></div>
            ${amountEntries.length ? `<div><dt>${escapeHtml(t("prospect.accountReviewHistoricalAmount"))}</dt><dd>${amountEntries.map(([currency, amount]) => `${escapeHtml(formatNumber(amount))} ${escapeHtml(currency)}`).join(" · ")}</dd></div>` : ""}
          </dl>
          <div class="account-review-tags">${(trade.productDescriptions || []).slice(0, 6).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
          <div class="account-review-trade-list">
            ${(trade.records || []).slice(0, 5).map((record) => `
              <div>
                <strong>${escapeHtml(record.tradeDate || t("common.unknown"))} · ${escapeHtml(t(`trade.role.${record.role || "unknown"}`))}</strong>
                <span>${escapeHtml([record.country, record.productDescription, record.hsCode ? `HS ${record.hsCode}` : ""].filter(Boolean).join(" · "))}</span>
                <small>${record.amount === null || record.amount === undefined ? escapeHtml(t("trade.amountUnknown")) : `${escapeHtml(formatNumber(record.amount))} ${escapeHtml(record.currency || "")}`}</small>
              </div>
            `).join("")}
          </div>
        ` : `<p>${escapeHtml(t("prospect.accountReviewNoTrade"))}</p>`}
        <p class="account-review-boundary">${escapeHtml(t("prospect.accountReviewTradeBoundary"))}</p>
      </section>

      <section class="account-review-section account-review-section-wide">
        <h4>${escapeHtml(t("prospect.accountReviewEmployees"))}</h4>
        <div class="account-review-employee-grid">
          ${renderAccountReviewEmployee("intelligence", workflow.intelligence)}
          ${renderAccountReviewEmployee("sales", workflow.sales)}
        </div>
      </section>

      ${salesAuthorization && salesAuthorization.status !== "not-applicable" ? `
        <section class="account-review-section account-review-section-wide">
          <h4>${escapeHtml(t("prospect.salesAuthorizationTitle"))}</h4>
          <div class="sales-authorization-lineage ${escapeAttribute(salesAuthorization.status || "missing-owner-approval")}">
            <div><small>${escapeHtml(t("prospect.salesAuthorizationStatus"))}</small><strong>${escapeHtml(t(`prospect.salesAuthorizationStatus.${salesAuthorization.status || "missing-owner-approval"}`))}</strong></div>
            <div><small>${escapeHtml(t("prospect.salesAuthorizationDecision"))}</small><strong>${escapeHtml(salesAuthorization.ownerDecisionId || t("prospect.salesAuthorizationMissing"))}</strong></div>
            <div><small>${escapeHtml(t("prospect.salesAuthorizationIntelligence"))}</small><strong>${escapeHtml(salesAuthorization.decisionIntelligenceManagerTaskId || t("prospect.salesAuthorizationMissing"))}</strong></div>
            <div><small>${escapeHtml(t("prospect.salesAuthorizationSalesTask"))}</small><strong>${escapeHtml(salesAuthorization.salesManagerTaskId || t("prospect.salesAuthorizationNotStarted"))}</strong></div>
          </div>
          ${salesAuthorization.ownerDecisionReasonCode ? `<p class="sales-authorization-reason">${escapeHtml(t("prospect.salesAuthorizationReason", { reason: t(`prospect.ownerDecisionReason.${salesAuthorization.ownerDecisionReasonCode}`), time: salesAuthorization.ownerDecisionAt ? formatDateTime(salesAuthorization.ownerDecisionAt) : "-" }))}</p>` : ""}
          <p class="account-review-boundary">${escapeHtml(t("prospect.salesAuthorizationBoundary"))}</p>
        </section>
      ` : ""}

      ${workflow.sales ? `
        <section class="account-review-section account-review-section-wide">
          <h4>${escapeHtml(t("outcome.accountReviewTitle"))}</h4>
          <div class="outcome-attribution-lineage ${escapeAttribute(outcomeReview.status || "not-ready")}">
            <div><small>${escapeHtml(t("outcome.accountReviewStatus"))}</small><strong>${escapeHtml(t(`outcome.status.${outcomeReview.status || "not-ready"}`))}</strong></div>
            <div><small>${escapeHtml(t("outcome.accountReviewDecision"))}</small><strong>${escapeHtml(outcomeReview.currentOwnerDecisionId || t("common.unknown"))}</strong></div>
            <div><small>${escapeHtml(t("outcome.accountReviewSalesTask"))}</small><strong>${escapeHtml(outcomeReview.currentSalesManagerTaskId || t("common.unknown"))}</strong></div>
            <div><small>${escapeHtml(t("outcome.accountReviewEvidenceState"))}</small><strong>${escapeHtml(outcomeReview.latestReview?.evidenceState || (workflow.sales?.status === "completed" ? "REPORTED" : "UNKNOWN"))}</strong></div>
          </div>
          ${outcomeReview.latestReview ? `
            <div class="outcome-review-latest">
              <strong>${escapeHtml(t(`outcome.decision.${outcomeReview.latestReview.decision}`))}</strong>
              <span>${escapeHtml(outcomeReview.latestReview.summary || "")}</span>
              <small>${escapeHtml(t("outcome.reviewedAt", { time: formatDateTime(outcomeReview.latestReview.reviewedAt) }))}</small>
              ${outcomeReview.latestReview.businessValueAmount !== null ? `<small>${escapeHtml(t("outcome.ownerValue", { amount: formatNumber(outcomeReview.latestReview.businessValueAmount), currency: outcomeReview.latestReview.businessValueCurrency || "" }))}</small>` : ""}
            </div>
          ` : `<p class="account-review-boundary">${escapeHtml(t("outcome.accountReviewAwaiting"))}</p>`}
          <p class="account-review-boundary">${escapeHtml(t("outcome.accountReviewBoundary"))}</p>
        </section>
      ` : ""}

      ${outcomeLearningMembership ? `
        <section class="account-review-section account-review-section-wide outcome-learning-membership">
          <div class="account-review-section-heading">
            <div>
              <small>${escapeHtml(t("outcomeLearning.membershipEyebrow"))}</small>
              <strong>${escapeHtml(t("outcomeLearning.membershipTitle"))}</strong>
            </div>
            <span class="outcome-learning-membership-status ${outcomeLearningMembership.eligible ? "eligible" : "ineligible"}">${escapeHtml(t(`outcomeLearning.membershipEligibility.${outcomeLearningMembership.eligibilityReason}`))}</span>
          </div>
          <p>${escapeHtml(t("outcomeLearning.membershipIntro"))}</p>
          <div class="outcome-learning-contribution">
            <small>${escapeHtml(t("outcomeLearning.contributionTitle"))}</small>
            <strong>${escapeHtml(t(`outcomeLearning.contribution.${outcomeLearningMembership.sampleContributionState || "excluded"}`))}</strong>
            <span>${escapeHtml(t("outcomeLearning.contributionBoundary"))}</span>
          </div>
          <div class="outcome-learning-membership-grid">
            <div>
              <small>${escapeHtml(t("outcomeLearning.membership.discovery"))}</small>
              <strong>${escapeHtml(outcomeLearningMembership.cohorts?.discoverySource?.key || t("outcomeLearning.unknown"))}</strong>
              <span>${escapeHtml(outcomeLearningMembership.cohorts?.discoverySource?.sourceTitle || t("outcomeLearning.membership.sourceTitleMissing"))}</span>
              ${renderAccountReviewSourceLink(outcomeLearningMembership.cohorts?.discoverySource?.sourceUrl)}
            </div>
            <div>
              <small>${escapeHtml(t("outcomeLearning.membership.website"))}</small>
              <strong>${escapeHtml(t(`outcomeLearning.website.${outcomeLearningMembership.cohorts?.websiteEvidenceSource?.key || "static-http"}`))}</strong>
              <span>${escapeHtml(t(`prospect.websiteEvidence.${outcomeLearningMembership.cohorts?.websiteEvidenceSource?.evidenceStatus || "unverified"}`))}</span>
            </div>
            <div>
              <small>${escapeHtml(t("outcomeLearning.membership.channels"))}</small>
              <strong>${escapeHtml((outcomeLearningMembership.cohorts?.businessChannelRoles || ["none"]).map((role) => t(`outcomeLearning.channel.${role}`)).join(" · "))}</strong>
              <span>${escapeHtml(t("outcomeLearning.membership.channelsBoundary"))}</span>
            </div>
            <div>
              <small>${escapeHtml(t("outcomeLearning.membership.icp"))}</small>
              <strong>${escapeHtml(t(`outcomeLearning.icp.${outcomeLearningMembership.cohorts?.icpLexicalCoverage?.key || "not-configured"}`))}</strong>
              <span>${escapeHtml(t("outcomeLearning.membership.icpCoverage", { matched: number(outcomeLearningMembership.cohorts?.icpLexicalCoverage?.matchedCount || 0), total: number(outcomeLearningMembership.cohorts?.icpLexicalCoverage?.termCount || 0) }))}</span>
            </div>
          </div>
          <p class="account-review-boundary">${escapeHtml(t("outcomeLearning.membershipBoundary"))}</p>
        </section>
      ` : ""}

      <section class="account-review-section account-review-section-wide">
        <h4>${escapeHtml(t("prospect.ownerDecisionJournal"))}</h4>
        <div class="owner-decision-journal">
          ${ownerDecisionJournal.length ? ownerDecisionJournal.slice(0, 10).map((entry) => renderOwnerDecisionJournalEntry(entry)).join("") : `<div class="account-review-empty">${escapeHtml(t("prospect.ownerDecisionJournalEmpty"))}</div>`}
        </div>
        <p class="account-review-boundary">${escapeHtml(t("prospect.ownerDecisionJournalBoundary"))}</p>
      </section>

      <section class="account-review-section">
        <h4>${escapeHtml(t("prospect.accountReviewUnknowns"))}</h4>
        <div class="account-review-tags unknown">${unknowns.map((item) => `<span>${escapeHtml(t(`prospect.accountReviewUnknown.${item}`))}</span>`).join("")}</div>
        <p class="account-review-boundary">${escapeHtml(t("prospect.accountReviewUnknownBoundary"))}</p>
      </section>

      <section class="account-review-section">
        <h4>${escapeHtml(t("prospect.accountReviewBlockers"))}</h4>
        <div class="account-review-blockers">${blockers.length ? blockers.map((item) => `<span>${escapeHtml(t(`prospect.accountReviewBlocker.${item}`))}</span>`).join("") : `<span class="clear">${escapeHtml(t("prospect.accountReviewNoBlockers"))}</span>`}</div>
      </section>
    </div>

    <div class="account-review-truth-boundary">${escapeHtml(t("prospect.accountReviewTruthBoundary"))}</div>
  `;
  els.accountReviewActions.innerHTML = (review.actions || []).map((action) => `
    <button class="button ${["approve-sales", "reconfirm-sales-authorization", "qualify-sales"].includes(action) ? "primary" : "ghost"}" type="button" data-account-review-action="${escapeAttribute(action)}">${escapeHtml(t(`prospect.accountReviewAction.${action}`))}</button>
  `).join("") || `<span class="account-review-no-action">${escapeHtml(t("prospect.accountReviewNoAction"))}</span>`;
}

function renderOwnerDecisionJournalEntry(entry) {
  const snapshot = entry?.snapshot || {};
  const decision = entry?.decision || "reject-prospect";
  const reason = entry?.reasonCode || "owner-judgment";
  const evidence = `${number(snapshot.evidenceCompleted)}/${number(snapshot.evidenceTotal)}`;
  const websiteStatus = snapshot.websiteEvidenceStatus || "unverified";
  const intelligenceStatus = snapshot.intelligenceStatus || "not-started";
  return `
    <article class="owner-decision-entry ${escapeAttribute(decision)}">
      <div class="owner-decision-entry-heading">
        <strong>${escapeHtml(t(`prospect.ownerDecisionKind.${decision}`))}</strong>
        <time>${escapeHtml(entry?.decidedAt ? formatDateTime(entry.decidedAt) : "-")}</time>
      </div>
      <span>${escapeHtml(t(`prospect.ownerDecisionReason.${reason}`))}</span>
      ${entry?.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
      <small>${escapeHtml(t("prospect.ownerDecisionSnapshotSummary", {
        evidence,
        website: t(`prospect.websiteEvidence.${websiteStatus}`),
        trade: number(snapshot.linkedTradeRecordCount),
        intelligence: intelligenceStatus === "not-started" ? t("prospect.accountReviewEmployeeNotStarted") : t(`employee.status.${intelligenceStatus}`),
      }))}</small>
    </article>
  `;
}

function renderAccountReviewSourceLink(url) {
  const safe = safeRawUrl(url);
  if (safe === "#") return "";
  return `<a class="account-review-source-link" href="${escapeAttribute(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("prospect.accountReviewSourcePage"))}</a>`;
}

function renderAccountReviewEmployee(kind, delegation) {
  const label = t(`prospect.accountReviewEmployee.${kind}`);
  if (!delegation) {
    return `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(t("prospect.accountReviewEmployeeNotStarted"))}</span></div>`;
  }
  const exception = ["failed", "cancelled"].includes(delegation.status || "");
  const errorMessage = delegation.errorMessage ? String(delegation.errorMessage).slice(0, 320) : "";
  return `<div class="${exception ? "account-review-employee-exception" : ""}">
    <strong>${escapeHtml(label)}</strong>
    <span>${escapeHtml(t(`employee.status.${delegation.status || "queued"}`))} · ${escapeHtml(t(`employee.reviewStatus.${delegation.reviewStatus || "pending"}`))}</span>
    <small>${escapeHtml(t("prospect.accountReviewManagerTask", { id: delegation.bossaiRunId || "-" }))}</small>
    ${exception ? `<div class="account-review-employee-error">
      <span>${escapeHtml(t("prospect.accountReviewExecutionError", { code: delegation.errorCode || t("common.unknown") }))}</span>
      ${errorMessage ? `<small>${escapeHtml(errorMessage)}</small>` : `<small>${escapeHtml(t("prospect.accountReviewExecutionErrorNoMessage"))}</small>`}
    </div>` : ""}
  </div>`;
}

async function handleAccountReviewAction(event) {
  const button = event.target.closest("[data-account-review-action]");
  const review = state.accountReview;
  if (!button || !review || button.disabled) return;
  const action = button.dataset.accountReviewAction || "";
  const prospectId = review.prospectId;
  button.disabled = true;
  try {
    if (action === "review-intelligence-result") {
      await loadAccountReviewManagerResult(review.workflow?.intelligence?.bossaiRunId, "intelligence");
      return;
    }
    if (action === "review-sales-result") {
      await loadSalesHandoffBrief(prospectId);
      return;
    }
    if (action === "review-outcome") {
      await openOutcomeReviewDialog(prospectId);
      return;
    }
    if (action === "request-browser-evidence") {
      closeAccountReview();
      await requestBrowserEvidence(prospectId, button);
      return;
    }
    if (action === "verify-website") await verifyProspectWebsite(prospectId, button);
    else if (action === "delegate-intelligence") await delegateProspect(prospectId, button);
    else if (action === "retry-intelligence") await delegateProspect(prospectId, button, { retryFailedRunId: review.workflow?.intelligence?.bossaiRunId || "" });
    else if (action === "refresh-intelligence") await refreshProspectRun(review.workflow?.intelligence?.bossaiRunId, button);
    else if (action === "approve-sales") {
      openOwnerDecisionDialog(prospectId, "approve-sales");
      return;
    }
    else if (action === "reconfirm-sales-authorization") {
      openOwnerDecisionDialog(prospectId, "approve-sales", { reconfirmSalesAuthorization: true });
      return;
    }
    else if (action === "reject-prospect") {
      openOwnerDecisionDialog(prospectId, "reject-prospect");
      return;
    }
    else if (action === "qualify-sales") await qualifyProspect(prospectId, button);
    else if (action === "retry-sales") await qualifyProspect(prospectId, button, { retryFailedRunId: review.workflow?.sales?.bossaiRunId || "" });
    else if (action === "refresh-sales") await refreshProspectRun(review.workflow?.sales?.bossaiRunId, button);
    await loadAccountReview(prospectId);
  } catch (error) {
    showToast(error.message || t("prospect.accountReviewActionFailed"), true);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

async function loadAccountReviewManagerResult(runId, kind) {
  if (!runId) return;
  const requestSequence = latestRequest.accountReviewManagerResult.next();
  try {
    const payload = await requestWithAdminKey(`/api/admin/bossai/runs/${encodeURIComponent(runId)}`);
    if (!latestRequest.accountReviewManagerResult.isCurrent(requestSequence)) return;
    const run = payload.run || {};
    const output = String(run.editedOutput || run.output || "").trim();
    els.accountReviewResult.hidden = false;
    els.accountReviewResult.innerHTML = `
      <div class="account-review-result-heading">
        <strong>${escapeHtml(t(`prospect.accountReviewEmployee.${kind}`))}</strong>
        <span>${escapeHtml(t(`employee.status.${run.status || "queued"}`))} · ${escapeHtml(reviewStatusLabel(run.reviewStatus || "pending"))}</span>
      </div>
      <pre>${escapeHtml(output || t("prospect.accountReviewResultEmpty"))}</pre>
    `;
  } catch (error) {
    if (latestRequest.accountReviewManagerResult.isCurrent(requestSequence)) {
      showToast(error.message || t("prospect.accountReviewResultFailed"), true);
    }
  }
}

async function loadSalesHandoffBrief(prospectId) {
  if (!prospectId) return;
  try {
    const payload = await requestWithAdminKey(`/api/admin/prospects/${encodeURIComponent(prospectId)}/sales-handoff-brief`);
    const brief = payload.brief || null;
    if (!brief) throw new Error(t("prospect.salesHandoffUnavailable"));
    const fields = Array.isArray(brief.qualificationFields) ? brief.qualificationFields : [];
    const sourceWebsite = brief.sourceReportedWebsiteEvidence || {};
    const currentWebsite = brief.currentWebsiteEvidence || {};
    const approval = brief.ownerApproval || null;
    const output = String(brief.authoritativeOutput || "").trim();
    els.accountReviewResult.hidden = false;
    els.accountReviewResult.innerHTML = `
      <div class="account-review-result-heading sales-handoff-heading">
        <div>
          <strong>${escapeHtml(t("prospect.salesHandoffTitle"))}</strong>
          <small>${escapeHtml(t("prospect.salesHandoffAuthority", { id: brief.managerTaskId || "-" }))}</small>
        </div>
        <span>${escapeHtml(t(`employee.status.${brief.managerStatus || "queued"}`))} · ${escapeHtml(reviewStatusLabel(brief.managerReviewStatus || "pending"))}</span>
      </div>
      <div class="sales-handoff-summary">
        <div><small>${escapeHtml(t("prospect.salesHandoffDisposition"))}</small><strong>${escapeHtml(t(`prospect.salesHandoffDisposition.${brief.disposition || "unstructured"}`))}</strong></div>
        <div><small>${escapeHtml(t("prospect.salesHandoffNextAction"))}</small><strong>${escapeHtml(t(`prospect.salesHandoffNextAction.${brief.nextOwnerAction || "review-result"}`))}</strong></div>
        <div><small>${escapeHtml(t("prospect.salesHandoffSourceWebsite"))}</small><strong>${escapeHtml(sourceWebsite.status && sourceWebsite.status !== "not-structured" ? t(`prospect.websiteEvidence.${sourceWebsite.status}`) : t("prospect.salesHandoffNotStructured"))}</strong></div>
        <div><small>${escapeHtml(t("prospect.salesHandoffCurrentWebsite"))}</small><strong>${escapeHtml(t(`prospect.websiteEvidence.${currentWebsite.status || "unverified"}`))}</strong></div>
      </div>
      <section class="sales-handoff-section">
        <div class="sales-handoff-section-heading">
          <strong>${escapeHtml(t("prospect.salesHandoffQualificationMatrix"))}</strong>
          <small>${escapeHtml(t("prospect.salesHandoffQualificationBoundary"))}</small>
        </div>
        <div class="sales-handoff-fields">
          ${fields.map((field) => `
            <div class="sales-handoff-field ${escapeAttribute(field.state || "not-structured")}">
              <small>${escapeHtml(t(`prospect.salesHandoffField.${field.key}`))}</small>
              <strong>${escapeHtml(t(`prospect.salesHandoffFieldState.${field.state || "not-structured"}`))}</strong>
              ${field.reportedValue ? `<span>${escapeHtml(field.reportedValue)}</span>` : ""}
            </div>
          `).join("")}
        </div>
      </section>
      ${approval ? `
        <section class="sales-handoff-section">
          <div class="sales-handoff-section-heading"><strong>${escapeHtml(t("prospect.salesHandoffOwnerApproval"))}</strong><small>${escapeHtml(formatDateTime(approval.decidedAt))}</small></div>
          <div class="sales-handoff-approval">
            <span>${escapeHtml(t(`prospect.ownerDecisionReason.${approval.reasonCode}`))}</span>
            ${approval.note ? `<p>${escapeHtml(approval.note)}</p>` : ""}
          </div>
        </section>
      ` : ""}
      <div class="sales-handoff-boundary">${escapeHtml(t("prospect.salesHandoffTruthBoundary"))}</div>
      <details class="sales-handoff-raw">
        <summary>${escapeHtml(t("prospect.salesHandoffRawResult"))}</summary>
        <pre>${escapeHtml(output || t("prospect.accountReviewResultEmpty"))}</pre>
      </details>
    `;
  } catch (error) {
    showToast(error.message || t("prospect.salesHandoffFailed"), true);
  }
}

async function openOutcomeReviewDialog(prospectId) {
  if (!prospectId) return;
  const payload = await requestWithAdminKey(`/api/admin/prospects/${encodeURIComponent(prospectId)}/outcome-attribution`);
  const attribution = payload.attribution || null;
  if (!attribution || attribution.status === "not-ready") {
    throw new Error(t("outcome.notReady"));
  }
  state.outcomeReviewAttribution = attribution;
  const lineage = attribution.lineage || {};
  const salesEvidence = attribution.salesResultEvidence || {};
  const latest = attribution.ownerReview || null;
  const company = state.accountReview?.prospectId === prospectId
    ? state.accountReview?.company?.name || state.accountReview?.company?.domain
    : state.prospects.find((item) => item.id === prospectId)?.companyName;
  els.outcomeReviewContext.innerHTML = `
    <strong>${escapeHtml(company || prospectId)}</strong>
    <span>${escapeHtml(t("outcome.contextLineage", {
      decision: lineage.ownerDecisionId || "-",
      sales: lineage.salesManagerTaskId || "-",
    }))}</span>
    <small>${escapeHtml(t("outcome.contextReported", {
      state: salesEvidence.state || "UNKNOWN",
      disposition: salesEvidence.disposition ? t(`prospect.salesHandoffDisposition.${salesEvidence.disposition}`) : t("common.unknown"),
    }))}</small>
    ${salesEvidence.employeeReportedValueClaim ? `<div class="outcome-reported-claim"><span>${escapeHtml(t("outcome.employeeReportedClaim"))}</span><p>${escapeHtml(salesEvidence.employeeReportedValueClaim)}</p><small>${escapeHtml(t("outcome.employeeReportedClaimBoundary"))}</small></div>` : ""}
    ${latest ? `<div class="outcome-previous-review"><span>${escapeHtml(t("outcome.previousReview"))}</span><p>${escapeHtml(latest.summary || "")}</p><small>${escapeHtml(t("outcome.reviewedAt", { time: formatDateTime(latest.reviewedAt) }))}</small></div>` : ""}
  `;
  els.outcomeReviewDecision.value = attribution.status === "observing" ? "observe" : "confirm-outcome";
  els.outcomeReviewSummary.value = "";
  els.outcomeReviewValueAmount.value = "";
  els.outcomeReviewValueCurrency.value = "";
  els.outcomeReviewSubmit.disabled = false;
  els.outcomeReviewSubmit.textContent = t("outcome.reviewSubmit");
  updateOutcomeValueFields();
  els.outcomeReviewDialog.showModal();
}

function updateOutcomeValueFields() {
  const confirmOutcome = els.outcomeReviewDecision.value === "confirm-outcome";
  els.outcomeValueFields.hidden = !confirmOutcome;
  els.outcomeReviewValueAmount.disabled = !confirmOutcome;
  els.outcomeReviewValueCurrency.disabled = !confirmOutcome;
  if (!confirmOutcome) {
    els.outcomeReviewValueAmount.value = "";
    els.outcomeReviewValueCurrency.value = "";
  }
}

async function submitOutcomeReview() {
  const attribution = state.outcomeReviewAttribution;
  if (!attribution?.prospectId || els.outcomeReviewSubmit.disabled) return;
  const decision = String(els.outcomeReviewDecision.value || "").trim();
  const summary = String(els.outcomeReviewSummary.value || "").replace(/\s+/g, " ").trim();
  if (summary.length < 3) {
    showToast(t("outcome.reviewSummaryRequired"), true);
    els.outcomeReviewSummary.focus();
    return;
  }
  const body = { decision, summary };
  if (decision === "confirm-outcome" && String(els.outcomeReviewValueAmount.value || "").trim()) {
    const amount = Number(els.outcomeReviewValueAmount.value);
    const currency = String(els.outcomeReviewValueCurrency.value || "").trim().toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast(t("outcome.reviewValueInvalid"), true);
      els.outcomeReviewValueAmount.focus();
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      showToast(t("outcome.reviewCurrencyRequired"), true);
      els.outcomeReviewValueCurrency.focus();
      return;
    }
    body.businessValueAmount = amount;
    body.businessValueCurrency = currency;
  }
  const prospectId = attribution.prospectId;
  els.outcomeReviewSubmit.disabled = true;
  els.outcomeReviewSubmit.textContent = t("outcome.reviewSubmitting");
  try {
    const result = await postWithAdminKey(`/api/admin/prospects/${encodeURIComponent(prospectId)}/outcome-review`, body);
    state.outcomeReviewAttribution = result.attribution || attribution;
    closeOutcomeReviewDialog();
    await loadAccountReview(prospectId);
    await refreshOutcomeTruthSurfaces();
    showToast(t(`outcome.reviewSaved.${decision}`));
  } catch (error) {
    showToast(error.message || t("outcome.reviewFailed"), true);
  } finally {
    els.outcomeReviewSubmit.disabled = false;
    els.outcomeReviewSubmit.textContent = t("outcome.reviewSubmit");
  }
}

function closeOutcomeReviewDialog() {
  if (els.outcomeReviewDialog.open) els.outcomeReviewDialog.close();
  else resetOutcomeReviewDialog();
}

function resetOutcomeReviewDialog() {
  state.outcomeReviewAttribution = null;
  els.outcomeReviewContext.innerHTML = "";
  els.outcomeReviewDecision.value = "confirm-outcome";
  els.outcomeReviewSummary.value = "";
  els.outcomeReviewValueAmount.value = "";
  els.outcomeReviewValueCurrency.value = "";
  els.outcomeReviewSubmit.disabled = false;
  els.outcomeReviewSubmit.textContent = t("outcome.reviewSubmit");
  updateOutcomeValueFields();
}

function openOwnerDecisionDialog(prospectId, decision, options = {}) {
  if (!prospectId || !["approve-sales", "reject-prospect"].includes(decision)) return;
  const prospect = state.prospects.find((item) => item.id === prospectId);
  const review = state.accountReview?.prospectId === prospectId ? state.accountReview : null;
  const companyName = prospect?.companyName || review?.company?.name || prospect?.domain || prospectId;
  const reconfirmSalesAuthorization = decision === "approve-sales" && options.reconfirmSalesAuthorization === true;
  state.ownerDecisionDraft = { prospectId, decision, reconfirmSalesAuthorization };
  els.ownerDecisionTitle.textContent = t(reconfirmSalesAuthorization ? "prospect.ownerDecisionTitle.reconfirm-sales-authorization" : `prospect.ownerDecisionTitle.${decision}`);
  els.ownerDecisionIntro.textContent = t(reconfirmSalesAuthorization ? "prospect.ownerDecisionIntro.reconfirm-sales-authorization" : `prospect.ownerDecisionIntro.${decision}`);
  els.ownerDecisionContext.innerHTML = `
    <strong>${escapeHtml(companyName)}</strong>
    <span>${escapeHtml(review ? t(`prospect.accountReviewStage.${review.stage}`) : t("prospect.ownerDecisionContextFallback"))}</span>
    <small>${escapeHtml(t("prospect.ownerDecisionBoundary"))}</small>
  `;
  const reasons = decision === "approve-sales"
    ? ["intelligence-ready", "evidence-sufficient", "fit-reviewed", "owner-judgment", "other"]
    : ["low-fit", "evidence-insufficient", "wrong-company", "unsuitable-market", "duplicate", "owner-judgment", "other"];
  els.ownerDecisionReason.innerHTML = reasons.map((reason) => `<option value="${escapeAttribute(reason)}">${escapeHtml(t(`prospect.ownerDecisionReason.${reason}`))}</option>`).join("");
  els.ownerDecisionNote.value = "";
  els.ownerDecisionSubmit.textContent = t(reconfirmSalesAuthorization ? "prospect.ownerDecisionSubmit.reconfirm-sales-authorization" : `prospect.ownerDecisionSubmit.${decision}`);
  els.ownerDecisionDialog.showModal();
}

async function submitOwnerDecision() {
  const draft = state.ownerDecisionDraft;
  if (!draft?.prospectId || !draft?.decision || els.ownerDecisionSubmit.disabled) return;
  const reasonCode = String(els.ownerDecisionReason.value || "").trim();
  const note = String(els.ownerDecisionNote.value || "").trim();
  if (!reasonCode) {
    showToast(t("prospect.ownerDecisionReasonRequired"), true);
    return;
  }
  if (reasonCode === "other" && note.length < 3) {
    showToast(t("prospect.ownerDecisionOtherNoteRequired"), true);
    els.ownerDecisionNote.focus();
    return;
  }
  els.ownerDecisionSubmit.disabled = true;
  els.ownerDecisionSubmit.textContent = t("prospect.ownerDecisionSubmitting");
  try {
    const result = await postWithAdminKey(`/api/admin/prospects/${encodeURIComponent(draft.prospectId)}/owner-decision`, {
      decision: draft.decision,
      reasonCode,
      note,
      ...(draft.reconfirmSalesAuthorization ? { reconfirmSalesAuthorization: true } : {}),
    });
    if (result.prospect) {
      state.prospects = state.prospects.map((item) => item.id === result.prospect.id ? result.prospect : item);
    }
    if (result.review && state.accountReview?.prospectId === draft.prospectId) {
      state.accountReview = result.review;
      renderAccountReview(result.review);
    }
    closeOwnerDecisionDialog();
    await refreshOutcomeTruthSurfaces();
    renderProspects();
    showToast(t(draft.reconfirmSalesAuthorization ? "prospect.ownerDecisionSaved.reconfirm-sales-authorization" : `prospect.ownerDecisionSaved.${draft.decision}`));
  } catch (error) {
    showToast(error.message || t("prospect.ownerDecisionFailed"), true);
  } finally {
    els.ownerDecisionSubmit.disabled = false;
    if (state.ownerDecisionDraft?.decision) {
      els.ownerDecisionSubmit.textContent = t(state.ownerDecisionDraft.reconfirmSalesAuthorization ? "prospect.ownerDecisionSubmit.reconfirm-sales-authorization" : `prospect.ownerDecisionSubmit.${state.ownerDecisionDraft.decision}`);
    } else {
      els.ownerDecisionSubmit.textContent = t("prospect.ownerDecisionSubmit");
    }
  }
}

function closeOwnerDecisionDialog() {
  if (els.ownerDecisionDialog.open) els.ownerDecisionDialog.close();
  else resetOwnerDecisionDialog();
}

function resetOwnerDecisionDialog() {
  state.ownerDecisionDraft = null;
  els.ownerDecisionContext.innerHTML = "";
  els.ownerDecisionReason.innerHTML = "";
  els.ownerDecisionNote.value = "";
  els.ownerDecisionSubmit.disabled = false;
  els.ownerDecisionSubmit.textContent = t("prospect.ownerDecisionSubmit");
}

function closeAccountReview() {
  if (els.accountReviewDialog.open) els.accountReviewDialog.close();
  else resetAccountReview();
}

function resetAccountReview() {
  latestRequest.accountReview.invalidate();
  latestRequest.accountReviewManagerResult.invalidate();
  state.accountReview = null;
  els.accountReviewStage.textContent = "";
  els.accountReviewBody.innerHTML = "";
  els.accountReviewActions.innerHTML = "";
  els.accountReviewResult.hidden = true;
  els.accountReviewResult.innerHTML = "";
}

async function requestBrowserEvidence(prospectId, button) {
  if (!prospectId || button.disabled) return;
  button.disabled = true;
  button.textContent = t("prospect.requestingBrowserEvidence");
  try {
    const result = await postWithAdminKey(`/api/admin/prospects/${encodeURIComponent(prospectId)}/browser-evidence/request`, {});
    state.browserEvidenceRequest = {
      prospectId,
      request: result.request,
      captureContract: result.captureContract,
    };
    els.browserEvidencePageUrl.value = result.request?.targetUrl || "";
    els.browserEvidenceSourceReference.value = "";
    els.browserEvidenceHtml.value = "";
    const maxChars = number(result.captureContract?.constraints?.maxRenderedHtmlChars || 100000);
    els.browserEvidenceContract.innerHTML = `
      <strong>${escapeHtml(t("prospect.browserEvidenceRequestReady"))}</strong>
      <span>${escapeHtml(t("prospect.browserEvidenceRequestId", { id: result.request?.id || "-" }))}</span>
      <span>${escapeHtml(t("prospect.browserEvidenceTarget", { url: result.request?.targetUrl || "-" }))}</span>
      <span>${escapeHtml(t("prospect.browserEvidenceBound", { count: maxChars }))}</span>
      <small>${escapeHtml(t("prospect.browserEvidenceNoRuntime"))}</small>
    `;
    els.browserEvidenceDialog.showModal();
    showToast(t("prospect.browserEvidenceRequestCreated"));
  } catch (error) {
    showToast(error.message || t("prospect.browserEvidenceRequestFailed"), true);
  } finally {
    button.disabled = false;
    button.textContent = t("prospect.requestBrowserEvidence");
  }
}

async function submitBrowserEvidence() {
  const active = state.browserEvidenceRequest;
  if (!active?.request?.id || els.browserEvidenceSubmit.disabled) return;
  const pageUrl = String(els.browserEvidencePageUrl.value || "").trim();
  const sourceReference = String(els.browserEvidenceSourceReference.value || "").replace(/\s+/g, " ").trim();
  const renderedHtml = String(els.browserEvidenceHtml.value || "");
  if (!pageUrl || renderedHtml.length < 20) {
    showToast(t("prospect.browserEvidenceInputRequired"), true);
    return;
  }
  els.browserEvidenceSubmit.disabled = true;
  els.browserEvidenceSubmit.textContent = t("prospect.browserEvidenceSubmitting");
  try {
    const result = await postWithAdminKey(
      `/api/admin/prospects/${encodeURIComponent(active.prospectId)}/browser-evidence/${encodeURIComponent(active.request.id)}/submit`,
      {
        sourceKind: "owner-controlled-browser",
        sourceReference,
        pageUrl,
        renderedHtml,
        capturedAt: new Date().toISOString(),
      },
    );
    if (result.prospect) {
      state.prospects = state.prospects.map((item) => item.id === result.prospect.id ? result.prospect : item);
    }
    closeBrowserEvidenceDialog();
    showToast(t(result.upgraded ? "prospect.browserEvidenceUpgraded" : "prospect.browserEvidenceStillIncomplete"));
    renderProspects();
    await refreshOutcomeTruthSurfaces();
  } catch (error) {
    showToast(error.message || t("prospect.browserEvidenceSubmitFailed"), true);
  } finally {
    els.browserEvidenceSubmit.disabled = false;
    els.browserEvidenceSubmit.textContent = t("prospect.browserEvidenceSubmit");
  }
}

function closeBrowserEvidenceDialog() {
  if (els.browserEvidenceDialog.open) els.browserEvidenceDialog.close();
  else resetBrowserEvidenceDialog();
}

function resetBrowserEvidenceDialog() {
  state.browserEvidenceRequest = null;
  els.browserEvidenceContract.innerHTML = "";
  els.browserEvidencePageUrl.value = "";
  els.browserEvidenceSourceReference.value = "";
  els.browserEvidenceHtml.value = "";
}

async function delegateProspect(prospectId, button, { retryFailedRunId = "" } = {}) {
  if (!prospectId || button.disabled) return;
  const prospect = state.prospects.find((item) => item.id === prospectId);
  if (!prospect) return;
  button.disabled = true;
  button.textContent = t("employee.submitting");
  try {
    const objective = language === "en"
      ? `Review the public evidence for prospect candidate “${prospect.companyName || prospect.domain}”, distinguish verified facts from inference, identify fit and missing sales-qualification facts, and decide whether it is worth handing to Sales Employee for sales.lead.qualify. Do not contact the company or create a formal CRM lead.`
      : `复核潜客候选“${prospect.companyName || prospect.domain}”的公开企业证据，区分已验证事实与推断，判断匹配度和销售资格缺失字段，并判断是否值得交给 Sales Employee 做 sales.lead.qualify。不得联系企业，也不得自动创建 CRM 正式线索。`;
    const result = await postWithAdminKey(`/api/admin/prospects/${encodeURIComponent(prospectId)}/delegate`, {
      objective,
      ...(retryFailedRunId ? { retryFailedRunId } : {}),
    });
    const delegation = result.delegation;
    state.delegations = [
      delegation,
      ...state.delegations.filter((item) => item.sourceOperationId !== delegation.sourceOperationId),
    ];
    if (result.prospect) {
      state.prospects = state.prospects.map((item) => item.id === result.prospect.id ? result.prospect : item);
    }
    showToast(retryFailedRunId
      ? t("prospect.retrySubmitted", { employee: t("prospect.accountReviewEmployee.intelligence") })
      : t("employee.submitted", { status: t(`employee.status.${delegation.status}`) }));
    renderProspects();
    await refreshOutcomeTruthSurfaces();
  } catch (error) {
    showToast(error.message || t("employee.failed"), true);
    button.disabled = false;
    button.textContent = t("prospect.delegate");
  }
}

async function refreshProspectRun(runId, button) {
  if (!runId || button.disabled) return;
  button.disabled = true;
  button.textContent = t("prospect.refreshing");
  try {
    const result = await requestWithAdminKey(`/api/admin/bossai/runs/${encodeURIComponent(runId)}`);
    if (result.delegation) {
      state.delegations = [
        result.delegation,
        ...state.delegations.filter((item) => item.sourceOperationId !== result.delegation.sourceOperationId),
      ];
    }
    showToast(t("prospect.statusRefreshed"));
    renderProspects();
    await refreshOutcomeTruthSurfaces();
  } catch (error) {
    showToast(error.message || t("employee.failed"), true);
    button.disabled = false;
  }
}

async function qualifyProspect(prospectId, button, { retryFailedRunId = "" } = {}) {
  if (!prospectId || button.disabled) return;
  const prospect = state.prospects.find((item) => item.id === prospectId);
  if (!prospect) return;
  button.disabled = true;
  button.textContent = t("employee.submitting");
  try {
    const objective = language === "en"
      ? `Run sales.lead.qualify for the human-approved prospect candidate “${prospect.companyName || prospect.domain}” using only the supplied public facts. Keep authority, real need, timing and budget unknown unless evidence exists. Do not contact the prospect or create a formal CRM lead.`
      : `对已人工批准的潜客候选“${prospect.companyName || prospect.domain}”执行 sales.lead.qualify，只使用已提供的公开事实；决策权、真实需求、采购时间和预算没有证据时保持未知。不得联系潜客，也不得创建 CRM 正式线索。`;
    const result = await postWithAdminKey(`/api/admin/prospects/${encodeURIComponent(prospectId)}/qualify`, {
      objective,
      ...(retryFailedRunId ? { retryFailedRunId } : {}),
    });
    const delegation = result.delegation;
    state.delegations = [
      delegation,
      ...state.delegations.filter((item) => item.sourceOperationId !== delegation.sourceOperationId),
    ];
    showToast(retryFailedRunId
      ? t("prospect.retrySubmitted", { employee: t("prospect.accountReviewEmployee.sales") })
      : t("prospect.salesSubmitted"));
    renderProspects();
    await refreshOutcomeTruthSurfaces();
  } catch (error) {
    showToast(error.message || t("employee.failed"), true);
    button.disabled = false;
    button.textContent = t("prospect.qualify");
  }
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
    const websiteDetail = websiteEvidenceDetail(item);
    return `
      <article class="evidence-item">
        <span class="source-badge">${escapeHtml(item.source)}</span>
        <div class="evidence-copy">
          ${item.isDemo
            ? `<span class="evidence-title">${escapeHtml(title)}</span>`
            : `<a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`}
          <p>${escapeHtml(detail)}</p>
          ${websiteDetail ? `<p>${escapeHtml(websiteDetail)}</p>` : ""}
        </div>
        <span class="evidence-score">${number(item.totalScore)}</span>
      </article>
    `;
  }).join("");
}

function websiteEvidenceDetail(item) {
  const context = item?.websiteContext;
  if (!context || context.schema !== "bossai.business-website-context.v1") return "";
  const contacts = (Array.isArray(context.publicEmails) ? context.publicEmails.length : 0) +
    (Array.isArray(context.publicPhones) ? context.publicPhones.length : 0);
  const products = Array.isArray(context.productSignals) ? context.productSignals.length : 0;
  return [
    context.companyName ? t("evidence.websiteCompany", { name: context.companyName }) : null,
    contacts > 0 ? t("evidence.websiteContacts", { count: contacts }) : null,
    products > 0 ? t("evidence.websiteProducts", { count: products }) : null,
  ].filter(Boolean).join(" · ");
}

function renderSources() {
  const latest = state.overview?.sourceStatus || [];
  const expected = ["reddit", "hackernews", "github", "arxiv", "rss", "website"];
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

async function requestWithAdminKey(url, method = "GET", body, retry = true) {
  try {
    return await api(url, {
      method,
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
        return requestWithAdminKey(url, method, body, false);
      }
    }
    throw error;
  }
}

function postWithAdminKey(url, body, retry = true) {
  return requestWithAdminKey(url, "POST", body, retry);
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

function tradeCompanySuggestionKey(companyName, country) {
  return `${String(companyName || "").trim().toLowerCase()}\u0000${String(country || "").trim().toLowerCase()}`;
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
