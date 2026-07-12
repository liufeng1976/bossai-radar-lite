import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";

const ADMIN_KEY = "followup-smoke-admin";

test("serves bilingual follow-up queues, drafts, reports, calendar and workspace pages", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-followup-api-"));
  const port = await findFreePort();
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "0.0.0.0",
      DATA_DIR: dataDir,
      RADAR_AUTO_SCAN: "false",
      RADAR_RUN_ON_STARTUP: "false",
      RADAR_ADMIN_API_KEY: ADMIN_KEY,
      COMMERCIAL_LEAD_CAPTURE_ENABLED: "true",
      COMMERCIAL_LEAD_ADMIN_ENABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { output += chunk.toString(); });

  context.after(async () => {
    await stopChild(child);
    rmSync(dataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, child, () => output);
  const adminHeaders = { "x-radar-key": ADMIN_KEY };
  const jsonHeaders = { ...adminHeaders, "Content-Type": "application/json" };

  const chineseId = await submitLead(baseUrl, {
    intent: "managed-service",
    name: "Chinese Buyer",
    contact: "china@example.com",
    language: "zh",
  });
  const englishId = await submitLead(baseUrl, {
    intent: "commercial",
    name: "English Buyer",
    contact: "english@example.com",
    language: "en",
  });
  const waitlistId = await submitLead(baseUrl, {
    intent: "pro-waitlist",
    name: "Waitlist Buyer",
    contact: "waitlist@example.com",
    language: "en",
    timeline: "research",
    budget: "unknown",
  });
  const wonId = await submitLead(baseUrl, {
    intent: "commercial",
    name: "Won Buyer",
    contact: "won@example.com",
    language: "en",
  });

  await patchLead(baseUrl, chineseId, {
    status: "PROPOSAL",
    nextFollowUpAt: new Date(Date.now() - 86_400_000).toISOString(),
    quoteAmount: 28_800,
    quoteCurrency: "CNY",
  }, jsonHeaders);
  await patchLead(baseUrl, englishId, {
    status: "CONTACTED",
    nextFollowUpAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  }, jsonHeaders);
  await patchLead(baseUrl, wonId, {
    status: "WON",
    nextFollowUpAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  }, jsonHeaders);

  const zhResponse = await fetch(`${baseUrl}/api/admin/followups?days=7&lang=zh`, { headers: adminHeaders });
  const enResponse = await fetch(`${baseUrl}/api/admin/followups?days=7&lang=en`, { headers: adminHeaders });
  assert.equal(zhResponse.status, 200);
  assert.equal(enResponse.status, 200);
  const zh = await zhResponse.json() as FollowUpPayload;
  const en = await enResponse.json() as FollowUpPayload;

  assert.equal(zh.stats.total, 3);
  assert.equal(zh.stats.overdue, 1);
  assert.equal(zh.stats.unscheduled, 1);
  assert.ok(zh.items.some((item) => item.lead.id === waitlistId && item.bucket === "UNSCHEDULED"));
  assert.equal(zh.items.some((item) => item.lead.id === wonId), false);
  assert.ok(zh.items.every((item) => /[\u4e00-\u9fff]/.test(item.reason)));
  assert.ok(en.items.every((item) => /[A-Za-z]/.test(item.reason)));
  assert.ok(en.items.some((item) => item.lead.id === chineseId && /proposal/i.test(item.recommendedAction)));

  const draftResponse = await fetch(`${baseUrl}/api/admin/leads/${chineseId}/followup-draft`, { headers: adminHeaders });
  assert.equal(draftResponse.status, 200);
  const draft = await draftResponse.json() as { language: string; message: string; suggestedStatus: string };
  assert.equal(draft.language, "zh");
  assert.match(draft.message, /你好/);
  assert.equal(draft.suggestedStatus, "NEGOTIATION");

  const enReport = await fetch(`${baseUrl}/api/admin/followups/report.md?lang=en`, { headers: adminHeaders });
  const zhReport = await fetch(`${baseUrl}/api/admin/followups/report.md?lang=zh`, { headers: adminHeaders });
  assert.equal(enReport.status, 200);
  assert.equal(zhReport.status, 200);
  assert.match(await enReport.text(), /Commercial Lead Follow-Up Brief/);
  assert.match(await zhReport.text(), /商业线索跟进日报/);

  const calendar = await fetch(`${baseUrl}/api/admin/followups/calendar.ics`, { headers: adminHeaders });
  assert.equal(calendar.status, 200);
  const calendarText = await calendar.text();
  assert.match(calendarText, /^BEGIN:VCALENDAR/);
  assert.equal((calendarText.match(/BEGIN:VEVENT/g) || []).length, 2);

  for (const page of ["/leads.html?lang=zh", "/leads.html?lang=en", "/commercial.html?lang=zh", "/commercial.html?lang=en"]) {
    const response = await fetch(`${baseUrl}${page}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
  }
  const leadPage = await (await fetch(`${baseUrl}/leads.html?lang=en`)).text();
  assert.match(leadPage, /followupQueue/);
  assert.match(leadPage, /downloadFollowupCalendar/);
});

async function submitLead(
  baseUrl: string,
  overrides: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "commercial",
      name: "Buyer",
      company: "Example Co",
      contact: "buyer@example.com",
      teamSize: "6-20",
      timeline: "30-days",
      deployment: "own-cloud",
      budget: "5000-20000",
      scenario: "We need a bilingual opportunity radar and a disciplined sales follow-up workflow for our ecommerce team.",
      requirements: "Private deployment, reports, lead management and follow-up reminders.",
      language: "en",
      consent: true,
      website: "",
      ...overrides,
    }),
  });
  assert.equal(response.status, 201);
  const payload = await response.json() as { id: string };
  return payload.id;
}

async function patchLead(
  baseUrl: string,
  id: string,
  patch: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/admin/leads/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
  });
  assert.equal(response.status, 200);
}

interface FollowUpPayload {
  stats: { total: number; overdue: number; unscheduled: number };
  items: Array<{
    lead: { id: string };
    bucket: string;
    reason: string;
    recommendedAction: string;
  }>;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a test port"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess, output: () => string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited before health check:\n${output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server:\n${output()}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
