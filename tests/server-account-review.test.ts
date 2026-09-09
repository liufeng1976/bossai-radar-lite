import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RadarDatabase } from "../src/database.js";
import type { TradeRecord } from "../src/types.js";

const ADMIN_KEY = "account-review-admin-key-1234567890";

test("real Account Review HTTP entry joins private trade evidence and Manager references without creating CRM or outreach state", async (context) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "radar-account-review-http-"));
  const port = await findFreePort();
  const db = new RadarDatabase(dataDir);
  const prospect = db.saveProspectCandidate({
    id: "prospect-account-review-http",
    domain: "account-review.example",
    websiteUrl: "https://account-review.example/",
    companyName: "Account Review Export",
    description: "Industrial components for distributors.",
    discoverySourceUrl: "https://expo.example/account-review",
    discoverySourceTitle: "Expo exhibitor",
    discoveryQuery: "industrial component distributors",
    publicEmails: ["sales@account-review.example"],
    publicPhones: [],
    contactUrls: ["https://account-review.example/contact"],
    officialProfileUrls: [],
    publicMessagingUrls: [],
    companyContactChannels: [{
      type: "email",
      value: "sales@account-review.example",
      url: "mailto:sales@account-review.example",
      sourcePageUrl: "https://account-review.example/contact",
      sourceKind: "jsonld-contact-point",
      businessRole: "sales",
      confidence: "high",
      verificationStatus: "official-site-structured",
    }],
    productSignals: ["Industrial components"],
    evidenceUrls: ["https://expo.example/account-review", "https://account-review.example/"],
    websiteEvidenceStatus: "verified",
    websiteEvidenceSource: "static-http",
    websiteVerifiedAt: "2026-08-18T04:00:00.000Z",
    score: 80,
    reasons: ["official website exposes public business evidence"],
    fitScore: 50,
    fitTerms: ["industrial", "distributor"],
    fitMatches: ["industrial"],
    discoveredAt: "2026-08-18T03:00:00.000Z",
  });
  db.updateProspectStatus(prospect.id, "REVIEW_REQUIRED");

  const trade: TradeRecord = {
    id: "trade-account-review-http",
    fingerprint: "trade-account-review-http-fingerprint",
    companyName: "Account Review Export",
    role: "buyer",
    country: "US",
    productDescription: "Industrial components",
    hsCode: "848390",
    tradeDate: "2026-05-20",
    quantity: "10",
    amount: 12_500,
    currency: "USD",
    websiteUrl: "https://account-review.example/",
    sourceLabel: "authorized-account-review.csv",
    sourceRow: 2,
    importedAt: "2026-08-18T03:30:00.000Z",
  };
  db.saveTradeRecords([trade]);
  db.linkProspectTradeEvidence(prospect.id, trade.id, "2026-08-18T04:05:00.000Z");
  db.saveBossAiDelegation({
    sourceType: "prospect",
    sourceRecordId: prospect.id,
    sourceOperationId: "account-review-intelligence-operation",
    bossaiRunId: "account-review-intelligence-task",
    bossaiAgentId: "bossai-intelligence-agent",
    status: "completed",
    reviewStatus: "pending",
    submittedAt: "2026-08-18T04:10:00.000Z",
    updatedAt: "2026-08-18T04:20:00.000Z",
    errorCode: "",
    errorMessage: "",
  });
  db.close();

  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "0.0.0.0",
      DATA_DIR: dataDir,
      RADAR_AUTO_SCAN: "false",
      RADAR_RUN_ON_STARTUP: "false",
      RADAR_DEMO_ENABLED: "false",
      RADAR_ADMIN_API_KEY: ADMIN_KEY,
      COMMERCIAL_LEAD_ADMIN_ENABLED: "true",
      AI_PROVIDER: "deterministic",
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

  const dashboardHtml = await (await fetch(`${baseUrl}/`)).text();
  assert.match(dashboardHtml, /id="ownerReviewQueuePanel"/u);
  assert.match(dashboardHtml, /id="ownerReviewQueueList"/u);
  assert.match(dashboardHtml, /id="ownerReviewQueueMore"/u);
  assert.match(dashboardHtml, /id="prospectGridMore"/u);
  assert.match(dashboardHtml, /id="ownerDecisionDialog"/u);
  assert.match(dashboardHtml, /id="ownerDecisionReason"/u);
  assert.match(dashboardHtml, /id="outcomeSummaryPanel"/u);
  assert.match(dashboardHtml, /id="outcomeLearningPanel"/u);
  assert.match(dashboardHtml, /id="outcomeLearningViews"/u);
  assert.match(dashboardHtml, /id="outcomeLearningReadiness"/u);
  assert.match(dashboardHtml, /id="outcomeLearningReviewPending"/u);
  assert.match(dashboardHtml, /id="outcomeLearningDrilldown"/u);
  assert.match(dashboardHtml, /id="outcomeReviewDialog"/u);
  assert.match(dashboardHtml, /id="outcomeReviewDecision"/u);
  assert.match(dashboardHtml, /data-owner-queue-filter="execution-exception"/u);
  const dashboardJs = await (await fetch(`${baseUrl}/app.js`)).text();
  assert.match(dashboardJs, /\/api\/admin\/prospects\/account-review-queue/u);
  assert.match(dashboardJs, /\/owner-decision/u);
  assert.match(dashboardJs, /refreshOwnerReviewQueue/u);
  assert.match(dashboardJs, /\/api\/admin\/prospects\/\$\{encodeURIComponent\(prospectId\)\}\/sales-handoff-brief/u);
  assert.match(dashboardJs, /loadSalesHandoffBrief/u);
  assert.match(dashboardJs, /retryFailedRunId/u);
  assert.match(dashboardJs, /executionException/u);
  assert.match(dashboardJs, /salesAuthorization/u);
  assert.match(dashboardJs, /reconfirm-sales-authorization/u);
  assert.match(dashboardJs, /reconfirmSalesAuthorization/u);
  assert.match(dashboardJs, /\/outcome-attribution/u);
  assert.match(dashboardJs, /\/outcome-review/u);
  assert.match(dashboardJs, /\/outcome-summary/u);
  assert.match(dashboardJs, /\/api\/admin\/prospects\/outcome-learning/u);
  assert.match(dashboardJs, /\/api\/admin\/prospects\/outcome-learning\/drilldown/u);
  assert.match(dashboardJs, /data-outcome-learning-drilldown/u);
  assert.match(dashboardJs, /data-outcome-learning-state/u);
  assert.match(dashboardJs, /params\.set\("state", outcomeState\)/u);
  assert.match(dashboardJs, /data-outcome-learning-account/u);
  assert.match(dashboardJs, /renderOutcomeLearningDrilldown/u);
  assert.match(dashboardJs, /renderOutcomeSummary/u);
  assert.match(dashboardJs, /renderOutcomeLearning/u);
  assert.match(dashboardJs, /refreshOutcomeTruthSurfaces/u);
  assert.match(dashboardJs, /Promise\.all\(\[loadOutcomeSummary\(\), loadOutcomeLearning\(\), loadOwnerReviewQueue\(state\.ownerReviewQueueFilter\)\]\)/u);
  assert.match(dashboardJs, /jumpToOutcomeResultReviewQueue/u);
  assert.match(dashboardJs, /outcomeLearningViewBoundary/u);
  assert.match(dashboardJs, /readinessInsufficient/u);
  assert.match(dashboardJs, /applyOwnerReviewQueueFilter\("result-review"\)/u);
  assert.match(dashboardJs, /params\.set\("attention", attention\)/u);
  assert.match(dashboardJs, /createLatestRequestGate/u);
  assert.match(dashboardJs, /latestRequest\.dashboard\.next\(\)/u);
  assert.match(dashboardJs, /latestRequest\.tradeRecords\.next\(\)/u);
  assert.match(dashboardJs, /latestRequest\.bossAiDelegations\.next\(\)/u);
  assert.match(dashboardJs, /latestRequest\.outcomeSummary\.next\(\)/u);
  assert.match(dashboardJs, /latestRequest\.outcomeLearning\.next\(\)/u);
  assert.match(dashboardJs, /latestRequest\.ownerReviewQueue\.next\(\)/u);
  assert.match(dashboardJs, /latestRequest\.outcomeLearningDrilldown\.next\(\)/u);
  assert.match(dashboardJs, /latestRequest\.outcomeLearningDrilldown\.invalidate\(\)/u);
  assert.match(dashboardJs, /latestRequest\.accountReview\.next\(\)/u);
  assert.match(dashboardJs, /latestRequest\.accountReview\.invalidate\(\)/u);
  assert.match(dashboardJs, /latestRequest\.accountReviewManagerResult\.next\(\)/u);
  assert.match(dashboardJs, /latestRequest\.accountReviewManagerResult\.invalidate\(\)/u);
  assert.match(dashboardJs, /\.isCurrent\(requestSequence\)/u);
  assert.match(dashboardJs, /state\.ownerReviewQueueFilter === requestedFilter/u);
  assert.match(dashboardJs, /invalidateOutcomeLearningDrilldown/u);
  assert.match(dashboardJs, /ownerReviewQueueVisibleLimit/u);
  assert.match(dashboardJs, /limit:\s*"500"/u);
  assert.match(dashboardJs, /ownerQueueMoreRemaining/u);
  assert.match(dashboardJs, /prospectVisibleLimit/u);
  assert.match(dashboardJs, /\/api\/prospects\?limit=500/u);
  assert.match(dashboardJs, /prospect\.moreRemaining/u);
  assert.match(dashboardJs, /\/api\/admin\/bossai\/delegations\?limit=200/u);
  assert.match(dashboardJs, /delegationCoverageComplete/u);
  assert.match(dashboardJs, /payload\.truncated !== true/u);
  assert.match(dashboardJs, /prospect\.employeeStateUnknownAction/u);
  assert.match(dashboardJs, /data-outcome-review-queue/u);
  assert.match(dashboardJs, /outcomeLearningMembership/u);
  assert.match(dashboardJs, /sampleContributionState/u);
  assert.match(dashboardJs, /outcomeLearning\.contributionTitle/u);
  assert.match(dashboardJs, /membershipEligibility/u);
  assert.match(dashboardJs, /insufficient-sample/u);
  assert.match(dashboardJs, /openOutcomeReviewDialog/u);
  assert.match(dashboardJs, /businessValueAmount/u);
  assert.equal(dashboardJs.includes("loadData()"), false);
  assert.equal(dashboardJs.includes("patchWithAdminKey"), false);
  assert.equal(dashboardJs.includes("data-approve-prospect-sales"), false);
  assert.equal(dashboardJs.includes("data-reject-prospect"), false);
  const dashboardCss = await (await fetch(`${baseUrl}/styles.css`)).text();
  assert.match(dashboardCss, /\.outcome-learning-views\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/su);
  assert.match(dashboardCss, /\.outcome-learning-cohort\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/su);
  assert.match(dashboardCss, /\.outcome-learning-membership-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/su);
  assert.match(dashboardCss, /\.outcome-learning-membership-grid\s*>\s*div\s*\{[^}]*min-width:\s*0/su);
  assert.match(dashboardCss, /\.outcome-learning-drilldown-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[^}]*min-width:\s*0/su);
  assert.match(dashboardCss, /\.outcome-learning-views,\s*\.outcome-learning-drilldown-list\s*\{\s*grid-template-columns:\s*1fr;/u);

  const unauthorized = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/account-review`);
  assert.equal(unauthorized.status, 401);
  const noSalesHandoff = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/sales-handoff-brief`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  assert.equal(noSalesHandoff.status, 404);
  assert.equal((await noSalesHandoff.json() as { code: string }).code, "PROSPECT_SALES_QUALIFICATION_NOT_FOUND");
  const unauthorizedCrmHandoff = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/crm-handoff-proposal`);
  assert.equal(unauthorizedCrmHandoff.status, 401);
  const blockedCrmHandoff = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/crm-handoff-proposal`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const blockedCrmHandoffPayload = await blockedCrmHandoff.json() as {
    proposal: { schema: string; status: string; blockers: string[]; authority: { crmWriteAuthorized: boolean; requiresCrmAcceptance: boolean; externalActionsExecuted: boolean } };
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(blockedCrmHandoff.status, 200);
  assert.equal(blockedCrmHandoffPayload.proposal.schema, "bossai.prospect-crm-handoff.v1");
  assert.equal(blockedCrmHandoffPayload.proposal.status, "blocked");
  assert.ok(blockedCrmHandoffPayload.proposal.blockers.includes("completed-sales-qualification-required"));
  assert.equal(blockedCrmHandoffPayload.proposal.authority.crmWriteAuthorized, false);
  assert.equal(blockedCrmHandoffPayload.proposal.authority.requiresCrmAcceptance, true);
  assert.equal(blockedCrmHandoffPayload.proposal.authority.externalActionsExecuted, false);
  assert.equal(blockedCrmHandoffPayload.crmRecordCreated, false);
  assert.equal(blockedCrmHandoffPayload.externalActionsExecuted, false);
  const unauthorizedOwnerDecisionProjection = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/owner-decision-projection`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: {} }),
  });
  assert.equal(unauthorizedOwnerDecisionProjection.status, 401);
  const ownerDecisionProjection = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/owner-decision-projection`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      decision: {
        schema: "bossai.owner-business-decision.v1",
        id: "audit-prospect-1",
        decisionId: `radar-${prospect.id}-sales-authorization-v1`,
        domain: "sales-prospect",
        subject: { type: "prospect", id: prospect.id },
        decisionType: "authorize-sales-qualification",
        reasonCode: "reviewed-intelligence-ready",
        decidedAt: "2026-08-20T09:00:00.000Z",
        authority: "bossai-os",
        actorType: "user",
        actorId: "owner-1",
        automaticExecutionAuthorized: false,
        externalActionsExecuted: false,
      },
    }),
  });
  const ownerDecisionProjectionPayload = await ownerDecisionProjection.json() as {
    projection: { schema: string; decision: { radarCompatibilityDecision: string }; authority: { sourceOfDecisionTruth: string; radarPersistenceAuthorized: boolean; salesTaskCreationAuthorizedByProjectionAlone: boolean } };
    radarOwnerDecisionJournalMutationPerformed: boolean;
    salesTaskCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(ownerDecisionProjection.status, 200);
  assert.equal(ownerDecisionProjectionPayload.projection.schema, "bossai.owner-decision-projection.v1");
  assert.equal(ownerDecisionProjectionPayload.projection.decision.radarCompatibilityDecision, "approve-sales");
  assert.equal(ownerDecisionProjectionPayload.projection.authority.sourceOfDecisionTruth, "bossai-os");
  assert.equal(ownerDecisionProjectionPayload.projection.authority.radarPersistenceAuthorized, false);
  assert.equal(ownerDecisionProjectionPayload.projection.authority.salesTaskCreationAuthorizedByProjectionAlone, false);
  assert.equal(ownerDecisionProjectionPayload.radarOwnerDecisionJournalMutationPerformed, false);
  assert.equal(ownerDecisionProjectionPayload.salesTaskCreated, false);
  assert.equal(ownerDecisionProjectionPayload.externalActionsExecuted, false);
  const unauthorizedOsOutcome = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/os-outcome-projection`);
  assert.equal(unauthorizedOsOutcome.status, 401);
  const osOutcome = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/os-outcome-projection`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const osOutcomePayload = await osOutcome.json() as {
    projection: { schema: string; status: string; attribution: unknown; authority: { radarPersistenceAuthorized: boolean; bossaiOsExecutionLineageAuthority: boolean; bossaiWorkCanonicalOwnerSurface: boolean } };
    radarOutcomeJournalMutationPerformed: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(osOutcome.status, 200);
  assert.equal(osOutcomePayload.projection.schema, "bossai.outcome-projection.v1");
  assert.equal(osOutcomePayload.projection.status, "not-ready");
  assert.equal(osOutcomePayload.projection.attribution, null);
  assert.equal(osOutcomePayload.projection.authority.radarPersistenceAuthorized, false);
  assert.equal(osOutcomePayload.projection.authority.bossaiOsExecutionLineageAuthority, true);
  assert.equal(osOutcomePayload.projection.authority.bossaiWorkCanonicalOwnerSurface, true);
  assert.equal(osOutcomePayload.radarOutcomeJournalMutationPerformed, false);
  assert.equal(osOutcomePayload.externalActionsExecuted, false);
  const unauthorizedQueue = await fetch(`${baseUrl}/api/admin/prospects/account-review-queue`);
  assert.equal(unauthorizedQueue.status, 401);
  assert.equal(unauthorizedQueue.headers.get("cache-control"), "no-store, private");
  assert.equal(unauthorizedQueue.headers.get("pragma"), "no-cache");
  const unauthorizedOutcomeSummary = await fetch(`${baseUrl}/api/admin/prospects/outcome-summary`);
  assert.equal(unauthorizedOutcomeSummary.status, 401);
  const unauthorizedOutcomeLearning = await fetch(`${baseUrl}/api/admin/prospects/outcome-learning`);
  assert.equal(unauthorizedOutcomeLearning.status, 401);

  const queueResponse = await fetch(`${baseUrl}/api/admin/prospects/account-review-queue?attention=decision-required&limit=10`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const queueText = await queueResponse.text();
  assert.equal(queueResponse.status, 200, queueText);
  assert.equal(queueResponse.headers.get("cache-control"), "no-store, private");
  assert.equal(queueResponse.headers.get("pragma"), "no-cache");
  const queuePayload = JSON.parse(queueText) as {
    queue: {
      schema: string;
      items: Array<{
        prospectId: string;
        attention: string;
        handlingPriority: string;
        ownerDecisionRequired: boolean;
        primaryAction: string | null;
        candidateScore: number;
      }>;
      summary: { total: number; ownerDecisionRequired: number };
      truthBoundary: Record<string, boolean>;
    };
    filter: { attention: string | null; limit: number };
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(queuePayload.queue.schema, "bossai.prospect-owner-review-queue.v1");
  assert.equal(queuePayload.queue.summary.total, 1);
  assert.equal(queuePayload.queue.summary.ownerDecisionRequired, 1);
  assert.equal(queuePayload.queue.items[0]?.prospectId, prospect.id);
  assert.equal(queuePayload.queue.items[0]?.attention, "decision-required");
  assert.equal(queuePayload.queue.items[0]?.handlingPriority, "P0_OWNER_DECISION");
  assert.equal(queuePayload.queue.items[0]?.ownerDecisionRequired, true);
  assert.equal(queuePayload.queue.items[0]?.primaryAction, "review-intelligence-result");
  assert.equal(queuePayload.queue.items[0]?.candidateScore, 80);
  assert.equal(queuePayload.queue.truthBoundary.handlingPriorityIsSalesProbability, false);
  assert.equal(queuePayload.queue.truthBoundary.purchaseIntentInferred, false);
  assert.equal(queuePayload.queue.truthBoundary.closeProbabilityInferred, false);
  assert.equal(queuePayload.queue.truthBoundary.nextPurchaseDatePredicted, false);
  assert.equal(queuePayload.filter.attention, "decision-required");
  assert.equal(queuePayload.crmRecordCreated, false);
  assert.equal(queuePayload.externalActionsExecuted, false);

  const queueMaxResponse = await fetch(`${baseUrl}/api/admin/prospects/account-review-queue?limit=999`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const queueMaxPayload = await queueMaxResponse.json() as { filter: { limit: number } };
  assert.equal(queueMaxResponse.status, 200);
  assert.equal(queueMaxPayload.filter.limit, 500);

  const response = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/account-review`, {
    headers: { "x-radar-key": ADMIN_KEY },
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const payload = JSON.parse(text) as {
    review: {
      schema: string;
      stage: string;
      tradeHistory: { recordCount: number; amountByCurrency: Record<string, number>; records: TradeRecord[] };
      workflow: { intelligence: { bossaiRunId: string; status: string } | null; sales: unknown };
      outcomeLearningMembership: {
        schema: string;
        eligible: boolean;
        sampleContributionState: string;
        eligibilityReason: string;
        cohorts: { discoverySource: { key: string }; businessChannelRoles: string[] };
        truthBoundary: { cohortMembershipIsNotRanking: boolean; closeProbabilityInferred: boolean };
      };
      actions: string[];
      truthBoundary: Record<string, boolean>;
    };
    crmRecordCreated: boolean;
    externalActionsExecuted: boolean;
  };
  assert.equal(payload.review.schema, "bossai.prospect-account-review.v1");
  assert.equal(payload.review.stage, "owner-decision");
  assert.equal(payload.review.tradeHistory.recordCount, 1);
  assert.equal(payload.review.tradeHistory.amountByCurrency.USD, 12_500);
  assert.equal(payload.review.tradeHistory.records[0]?.sourceLabel, "authorized-account-review.csv");
  assert.equal(payload.review.workflow.intelligence?.bossaiRunId, "account-review-intelligence-task");
  assert.equal(payload.review.workflow.intelligence?.status, "completed");
  assert.equal(payload.review.workflow.sales, null);
  assert.equal(payload.review.outcomeLearningMembership.schema, "bossai.prospect-outcome-learning-membership.v1");
  assert.equal(payload.review.outcomeLearningMembership.eligible, false);
  assert.equal(payload.review.outcomeLearningMembership.sampleContributionState, "excluded");
  assert.equal(payload.review.outcomeLearningMembership.eligibilityReason, "sales-not-completed");
  assert.equal(payload.review.outcomeLearningMembership.cohorts.discoverySource.key, "expo.example");
  assert.deepEqual(payload.review.outcomeLearningMembership.cohorts.businessChannelRoles, ["sales"]);
  assert.equal(payload.review.outcomeLearningMembership.truthBoundary.cohortMembershipIsNotRanking, true);
  assert.equal(payload.review.outcomeLearningMembership.truthBoundary.closeProbabilityInferred, false);
  assert.deepEqual(payload.review.actions, ["review-intelligence-result", "approve-sales", "reject-prospect"]);
  assert.equal(payload.review.truthBoundary.purchaseIntentInferred, false);
  assert.equal(payload.review.truthBoundary.closeProbabilityInferred, false);
  assert.equal(payload.review.truthBoundary.nextPurchaseDatePredicted, false);
  assert.equal(payload.crmRecordCreated, false);
  assert.equal(payload.externalActionsExecuted, false);

  const directReject = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}`, {
    method: "PATCH",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "REJECTED" }),
  });
  assert.equal(directReject.status, 409);
  assert.equal((await directReject.json() as { code: string }).code, "PROSPECT_OWNER_DECISION_REQUIRED");

  const rejected = await fetch(`${baseUrl}/api/admin/prospects/${encodeURIComponent(prospect.id)}/owner-decision`, {
    method: "POST",
    headers: { "x-radar-key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      decision: "reject-prospect",
      reasonCode: "low-fit",
      note: "老板复核后认为当前业务匹配度较低，停止推进。",
    }),
  });
  const rejectedText = await rejected.text();
  assert.equal(rejected.status, 200, rejectedText);
  const rejectedPayload = JSON.parse(rejectedText) as {
    prospect: { status: string };
    decision: { decision: string; reasonCode: string; snapshot: { linkedTradeRecordCount: number }; truthBoundary: { decisionIsSalesProbability: boolean } };
    review: { stage: string; ownerDecisionJournal: Array<{ note: string }> };
  };
  assert.equal(rejectedPayload.prospect.status, "REJECTED");
  assert.equal(rejectedPayload.decision.decision, "reject-prospect");
  assert.equal(rejectedPayload.decision.reasonCode, "low-fit");
  assert.equal(rejectedPayload.decision.snapshot.linkedTradeRecordCount, 1);
  assert.equal(rejectedPayload.decision.truthBoundary.decisionIsSalesProbability, false);
  assert.equal(rejectedPayload.review.stage, "rejected");
  assert.equal(rejectedPayload.review.ownerDecisionJournal.length, 1);

  const publicProspects = await fetch(`${baseUrl}/api/prospects?limit=10`);
  const publicPayload = await publicProspects.json() as { items: unknown[] };
  const publicSerialized = JSON.stringify(publicPayload);
  assert.equal(publicSerialized.includes("authorized-account-review.csv"), false);
  assert.equal(publicSerialized.includes("account-review-intelligence-task"), false);
  assert.equal(publicSerialized.includes("老板复核后认为当前业务匹配度较低"), false);
  assert.equal(publicSerialized.includes("bossai.prospect-outcome-learning-membership.v1"), false);
  assert.equal(publicSerialized.includes("outcomeLearningMembership"), false);
});

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
