import { applyI18n, getLanguage, initLanguageToggle, t } from "./i18n.js";

const DEFAULT_CONTACT_EMAIL = "liufeng420594566@gmail.com";
const language = getLanguage();

applyI18n(document, language);
initLanguageToggle();
document.title = t("commercial.title", {}, language);
const description = document.querySelector('meta[name="description"]');
if (description) description.setAttribute("content", t("commercial.description", {}, language));

const form = document.querySelector("#licenseForm");
const intentSelect = document.querySelector("#intentSelect");
const previewButton = document.querySelector("#previewButton");
const copyButton = document.querySelector("#copyButton");
const preview = document.querySelector("#applicationPreview");
const previewContent = document.querySelector("#previewContent");
const closePreviewButton = document.querySelector("#closePreviewButton");
const formStatus = document.querySelector("#formStatus");
const pageVersion = document.querySelector("#pageVersion");
const intentButtons = [...document.querySelectorAll(".intent-button")];

let contactEmail = DEFAULT_CONTACT_EMAIL;
let appVersion = "0.3.0";

applyQueryIntent();
await loadPublicConfig();

for (const button of intentButtons) {
  button.addEventListener("click", () => {
    const intent = button.dataset.intent || "commercial";
    intentSelect.value = intent;
    document.querySelector("#application")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus(intent === "pro-waitlist" ? t("form.selectedPro") : t("form.selectedCommercial"), false);
  });
}

previewButton.addEventListener("click", () => {
  if (!validateForm()) return;
  showPreview();
});

copyButton.addEventListener("click", async () => {
  if (!validateForm()) return;
  const application = buildApplication();
  try {
    await navigator.clipboard.writeText(application.body);
    showPreview(application);
    setStatus(t("form.copied"), false);
  } catch {
    showPreview(application);
    setStatus(t("form.copyDenied"), true);
  }
});

closePreviewButton.addEventListener("click", () => {
  preview.hidden = true;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateForm()) return;
  const application = buildApplication();
  showPreview(application);
  const mailto = `mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(application.subject)}&body=${encodeURIComponent(application.body)}`;
  setStatus(t("form.openingMail", { email: contactEmail }), false);
  window.location.href = mailto;
});

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/overview", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const payload = await response.json();
    const configuredEmail = payload?.config?.commercial?.email;
    const version = payload?.version || payload?.config?.version;
    if (typeof configuredEmail === "string" && configuredEmail.includes("@")) contactEmail = configuredEmail.trim();
    if (typeof version === "string" && version.trim()) appVersion = version.trim();
  } catch {
    // The application page remains usable as a static preview.
  }
  pageVersion.textContent = `v${appVersion}`;
}

function applyQueryIntent() {
  const intent = new URLSearchParams(window.location.search).get("intent");
  const allowed = new Set(["commercial", "pro-waitlist", "white-label", "managed-service"]);
  if (intent && allowed.has(intent)) intentSelect.value = intent;
}

function validateForm() {
  if (form.reportValidity()) return true;
  setStatus(t("form.invalid"), true);
  return false;
}

function showPreview(application = buildApplication()) {
  previewContent.textContent = `${application.subject}\n\n${application.body}`;
  preview.hidden = false;
  preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  setStatus(t("form.previewReady"), false);
}

function buildApplication() {
  const values = Object.fromEntries(new FormData(form).entries());
  const intentLabel = selectedText("intent");
  const name = clean(values.name);
  const company = clean(values.company) || (language === "en" ? "Individual" : "个人");
  const subject = t("form.emailSubject", { intent: intentLabel, name, company });
  const separator = language === "en" ? ": " : "：";
  const body = [
    t("form.emailHeader"),
    "",
    `${t("form.emailIntent")}${separator}${intentLabel}`,
    `${t("form.emailApplicant")}${separator}${name}`,
    `${t("form.emailCompany")}${separator}${company}`,
    `${t("form.emailContact")}${separator}${clean(values.contact)}`,
    `${t("form.emailTeam")}${separator}${selectedText("teamSize")}`,
    `${t("form.emailTimeline")}${separator}${selectedText("timeline")}`,
    `${t("form.emailDeployment")}${separator}${selectedText("deployment")}`,
    `${t("form.emailBudget")}${separator}${selectedText("budget")}`,
    "",
    `${t("form.emailScenario")}${separator}`,
    clean(values.scenario),
    "",
    `${t("form.emailRequirements")}${separator}`,
    clean(values.requirements) || t("form.emailNotProvided"),
    "",
    `${t("form.emailSource")}${separator}BossAI Radar Lite v${appVersion}`,
    `${t("form.emailSubmitted")}${separator}${new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
      dateStyle: "long",
      timeStyle: "medium",
      hour12: language === "en",
    }).format(new Date())}`,
    "",
    t("form.emailConsent"),
  ].join("\n");
  return { subject, body };
}

function selectedText(name) {
  const select = form.elements.namedItem(name);
  if (!(select instanceof HTMLSelectElement)) return "";
  return select.selectedOptions[0]?.textContent?.trim() || "";
}

function clean(value) {
  return String(value ?? "").replace(/\r/g, "").trim();
}

function setStatus(message, error) {
  formStatus.textContent = message;
  formStatus.classList.toggle("error", Boolean(error));
}
