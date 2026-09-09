# BossAI Radar Lite → BossAI Manager / Intelligence Agent Migration

Status: Active Level 2 technical integration  
Effective: 2026-08-05  
Company authority: Company Constitution, Immutable Principles 002–005

## Product classification

BossAI Radar Lite remains an **AI Assistant and market-intelligence product**.

It is not an Agent Platform and does not own a general Agent Runtime.

## Capability ownership

### Remains in Radar Lite

- public-source collection;
- SSRF-protected RSS and source access;
- evidence normalization and scoring;
- deterministic opportunity generation;
- reports and daily briefs;
- lead workspace;
- product dashboard;
- local SQLite domain records;
- read-only MCP and explicitly permissioned Radar operations.

### Uses BossAI Central AI Gateway

Bounded opportunity narrative enrichment is an **AI Feature**.

Execution path:

```text
Radar Lite
→ BossAI OS `/v1/chat/completions`
→ customer-level `BOSSAI_OS_API_KEY`
→ public model alias such as `bossai-balanced`
```

Radar Lite no longer contains an approved direct DeepSeek/OpenAI-compatible Provider path for this feature.

When the Gateway is not configured or fails, Radar retains its deterministic narrative. It must not claim that an AI employee completed work.

### Delegates to BossAI Manager and the independent Intelligence Agent

Turning a verified opportunity into persistent employee work is an **AI Employee task**.

The independent package is:

```text
bossai-intelligence-agent@0.3.0
```

Execution path:

```text
verified non-Demo Radar opportunity
→ Radar admin delegation endpoint
→ exact Intelligence Agent installation check
→ version / signature / enabled / health / permission gate
→ POST `/api/manager/tasks`
→ `bossai-intelligence-agent`
→ explicit `manager.accept`
→ mandatory human approval
→ durable progress and reviewable result
```

Radar stores only the cross-product reference:

```text
sourceRecordId
sourceOperationId
managerTaskId
bossaiAgentId
lastKnown execution status
lastKnown review status
error reference
timestamps
```

The historical `bossai_run_id` column remains only as a compatibility name and now stores the Manager Task ID. Plugin-private pending execution state remains in BossAI OS Platform Storage.

BossAI OS owns task execution, approval, audit, event delivery, metering and points. Radar Lite remains authoritative for source collection, evidence records, deterministic scores, opportunity decisions, reports, leads and SQLite domain data.

## Configuration

```env
AI_PROVIDER=bossai-gateway
BOSSAI_OS_URL=http://127.0.0.1:3001
BOSSAI_OS_API_KEY=<customer-level-key-for-ai-features>
BOSSAI_OS_JWT=<approved-bossai-os-jwt-with-agents.read-and-agents.run>
BOSSAI_OS_AI_MODEL=bossai-balanced
BOSSAI_OS_TIMEOUT_MS=45000
```

`BOSSAI_OS_API_KEY` is for bounded `/v1/*` AI Feature calls.

`BOSSAI_OS_JWT` is an authenticated BossAI OS identity for employee delegation. It is not a Provider key and must not be exposed to the browser.

A generalized cross-product machine token exchange has not yet been implemented. Deployments must use an approved BossAI OS authenticated identity and must not describe this limitation as solved.

## Radar endpoints

### List local delegation references

```http
GET /api/admin/bossai/delegations
x-radar-key: <radar-admin-key>
```

### Delegate a verified opportunity

```http
POST /api/admin/opportunities/{opportunityId}/delegate
x-radar-key: <radar-admin-key>
Content-Type: application/json

{
  "objective": "复核证据、付费信号和竞争情况，形成待审核机会判断。",
  "sourceOperationId": "stable-source-operation-id"
}
```

The Intelligence Agent ID is fixed by the Radar server. Browser callers cannot select another employee.

Before task creation Radar verifies:

- exact ID `bossai-intelligence-agent`;
- version `0.3.0`;
- signature status `verified`;
- installation status `enabled`;
- health status `healthy`;
- declared `runtime.run`, `events.subscribe` and `events.publish` permissions.

The response is `202` for a new Manager task or `200` when the same source operation reuses the existing local reference.

For explicit Reddit/GEO objectives, Radar adds bounded `EVIDENCE_JSON` lines containing the selected live evidence title, excerpt, URL, derived subreddit, timestamp, engagement, deterministic Radar score, category, tags and query. The employee routes that intent to `intelligence.reddit-geo.brief` and returns `intelligence.reddit-geo-brief.md`. Generic tasks are not reclassified merely because a Reddit evidence record is attached.

This handoff does not grant the employee source-collection or publication permission. During its own authorized scan, Radar Lite may enrich a bounded number of observed subreddits from public Sidebar/About, rules and hot/pinned JSON endpoints, cache successful context for 24 hours and retry failed context after 15 minutes. Flair and identity-disclosure interpretation still require human review before a downstream content draft is considered ready.

Radar Lite may also collect explicitly configured public business-website seeds for foreign-trade/company research. The website collector is part of Radar's existing collection authority, not a second crawler platform: it is disabled until seeds are configured, stays on the configured website host, limits pages and crawl depth, applies SSRF and redirect validation, honors `robots.txt` by default (including a site-specific `BossAI-Radar-Lite` group over wildcard rules), follows bounded same-site Sitemap hints/fallback, caps HTML/robots response sizes, skips login/account/cart/checkout and common document/media paths, and does not bypass authentication, CAPTCHAs or access controls. Public company name, description, product/service signals, contact-page URLs, public business email/phone values, JSON-LD contact points, official-site-linked company profile URLs and public business-messaging URLs are stored as `bossai.business-website-context.v1` evidence context. Personal LinkedIn `/in/` profiles are excluded. Sparse JavaScript app shells are marked evidence-incomplete rather than silently interpreted as absence. That bounded context may be serialized into `EVIDENCE_JSON` for the Intelligence Agent, while source collection, evidence persistence and deterministic scoring remain Radar authority and customer outreach remains separately approval-gated.

The website contract now adds a bounded `CompanyContactChannel` layer for company-level public business routes. Each channel keeps `type`, `value/url`, the official `sourcePageUrl`, `sourceKind`, `businessRole`, evidence-only `confidence` and `verificationStatus`. Supported roles are `general`, `sales`, `export`, `wholesale`, `support`, `procurement`, `business-development` and `unknown`. Role-style mailboxes, bounded contact forms/pages, JSON-LD Organization/ContactPoint data, WhatsApp Business and official-site-linked company profiles can become structured channels; arbitrary personal-looking mailboxes and LinkedIn `/in/` pages are not promoted into this layer. `confidence` is never buyer intent, purchase probability, Sales score or close probability, and `procurement` only describes the company's published procurement/sourcing route. The channel contract is persisted with the prospect and is protected by the same verified-evidence non-downgrade rule.

Prospect discovery is an additional Radar collection mode, not an employee crawler. Explicit `RADAR_PROSPECT_DISCOVERY_SEEDS` may point to public company directories, exhibitor pages, member pages or supplier listings; optional Brave Web Search and Google Places Text Search adapters are separately disabled until configured. Radar merges candidates by company domain, then verifies websites through the same protected website collector. Owner-defined ICP lexical coverage stays separate from evidence-strength scoring. Results are stored in `prospect_candidates`, not CRM leads, with explicit `websiteEvidenceStatus=unverified|verified|static-incomplete` and `websiteVerifiedAt`. Search/map/directory discovery alone remains `unverified`; successful bounded website evidence upgrades the candidate to `verified`; JavaScript-shell evidence becomes `static-incomplete`. A later unverified rediscovery may refresh discovery metadata but may not downgrade or erase verified company/contact/product/channel facts. Resolver suggestions expose only domains that actually returned bounded `websiteContext` evidence. `unverified` candidates fail closed before Intelligence Manager creation; `static-incomplete` can be reviewed only as an evidence-gap state. The independent Intelligence Agent defensively emits `BLOCKED_PENDING_VERIFIED_WEBSITE_EVIDENCE` for unverified direct calls and `BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE` for static-incomplete evidence. Structured company channels are carried through the existing Manager evidence payload; the employee accepts only bounded channel types/roles, requires each `sourcePageUrl` to match the verified official-site host, rejects LinkedIn `/in/` values, and states that confidence/procurement labels do not prove intent. `READY_FOR_SALES` rechecks the website state and requires the authoritative Intelligence result to contain `READY_FOR_SALES_QUALIFICATION_REVIEW` plus an explicit human decision. Sales then independently parses the same website-evidence state and structured channel contract, again requires the channel source page to match the verified website host, rejects personal LinkedIn values and blocks direct unverified/static-incomplete bypass attempts. Neither stage creates or modifies a formal CRM record, and all outreach remains independently approval-gated. The UI also reports public-directory, Web-search and Maps channel outcomes separately so provider failures do not disappear inside one aggregate count.

### Browser-rendered official-site evidence

`static-incomplete` prospects now have a bounded recovery contract rather than a hidden assumption that Radar owns browser automation. An administrator/owner explicitly creates `bossai.prospect-browser-evidence-request.v1`; repeated requests reuse the same pending request. The capture contract requires the same official website host, HTTP(S), no embedded credentials, no login/CAPTCHA/access-control bypass, no form submission or outreach, a maximum 100000-character rendered HTML payload and `rawRenderedHtmlPersisted=false`. The current canonical BossAI OS source declares `browser.read`, but the inspected contract reports `executionAvailable=false`, so Radar does not call or simulate it and no OS source is changed.

The current fallback source is `owner-controlled-browser`. Radar accepts the rendered public page only after the owner request, rejects cross-host/stale/unsupported submissions, reuses the existing business-website parser, and stores only extracted `bossai.business-website-context.v1` evidence. `websiteEvidenceSource=browser-rendered` records provenance only. Sufficient rendered evidence may upgrade `websiteEvidenceStatus` to `verified`; sparse evidence becomes `browser-rendered-incomplete` and remains `static-incomplete`. Intelligence may still review the incomplete evidence, but `READY_FOR_SALES` directly rejects `static-incomplete`, and both Intelligence and Sales independently refuse to let a claimed browser-rendered source override the status gate. A future truly execution-available BossAI OS `browser.read` implementation can feed the same evidence contract without moving Browser Runtime ownership into Radar.

### Account Review / Customer 360 read model

Radar now exposes an administrator-only `GET /api/admin/prospects/:id/account-review` entry that returns `bossai.prospect-account-review.v1`. This is a derived read model, not a new sales pipeline or task state machine. It joins the existing prospect record with the latest browser-evidence request, private linked historical trade records, latest Intelligence delegation and latest Sales delegation, then derives the current owner-review stage and allowed next actions. No Account Review stage is persisted as execution truth.

The UI opens Account Review from every prospect card and presents the existing journey as `discovery → website verification → browser evidence when required → Intelligence review → explicit owner decision → Sales qualification`. It also shows a bounded evidence checklist, company/offering facts, website acquisition provenance, structured company business channels, historical trade window/cadence/amounts, Manager Task references, blockers and the qualification fields that remain unknown. The checklist measures only review-material coverage. It is never converted into purchase probability, close probability or Sales score.

When an Intelligence Manager task has completed, the owner may read its authoritative result through the existing Manager-read route before choosing `READY_FOR_SALES` or rejection. A completed Sales qualification can likewise be read from its authoritative Manager task. These readbacks do not copy Manager result state into a second authority and do not create a CRM record, message, quote or external action. The Account Review contract explicitly reports `purchaseIntentInferred=false`, `closeProbabilityInferred=false`, `nextPurchaseDatePredicted=false`, `crmRecordCreated=false` and `outreachExecuted=false`. Linked historical trade rows remain private to the administrator view and are still absent from public `/api/prospects` output.

### Owner Account Review Queue

Radar now exposes administrator-only `GET /api/admin/prospects/account-review-queue`, which derives `bossai.prospect-owner-review-queue.v1` from existing Account Review read models. The queue is not a CRM pipeline and persists no priority/stage truth. Its handling order is operational responsibility only: explicit owner decision, employee result review, evidence recovery, next-step-ready work, waiting on an employee, then closed. Rejected accounts remain represented as closed in the server summary but are excluded from the default active UI list.

The Prospect Candidates workbench shows decision/result/action/waiting summary counts and active account cards. Each card may show Account Review stage, material-coverage count, primary next action, first blocker, historical-trade human-review order, latest observation and the existing Radar evidence-ranking score. The score is labelled non-probabilistic. Queue cards only open the existing Account Review; they do not duplicate verify, approve, reject or employee-delegation controls. Account-changing actions refresh the queue from server truth even when initiated from the prospect card or Account Review.

The queue contract explicitly reports `handlingPriorityIsSalesProbability=false`, `purchaseIntentInferred=false`, `closeProbabilityInferred=false`, `nextPurchaseDatePredicted=false`, `crmRecordCreated=false` and `outreachExecuted=false`. Candidate score, checklist completion and historical-trade review priority therefore remain context only. P4 also removes a real browser-path failure where successful prospect discovery called nonexistent `loadData()`; the shipped dashboard now refreshes through `loadDashboard({ quiet: true })`, and the real HTTP regression verifies the served bundle contains no `loadData()` reference.

### Owner decision journal

P5 replaces bare owner `READY_FOR_SALES` / `REJECTED` HTTP status writes with administrator-only `POST /api/admin/prospects/:id/owner-decision`. The contract accepts `approve-sales` or `reject-prospect`, validates a bounded decision-specific reason code, requires a short note when `other` is selected, and writes `bossai.prospect-owner-decision.v1`. `GET /api/admin/prospects/:id/owner-decisions` exposes the private journal to the administrator only.

A journal entry stores the reason/note, `owner-admin` actor type, previous and target prospect status, decision time and a bounded `bossai.prospect-owner-decision-snapshot.v1`. The snapshot captures the review-time Account Review stage, website-evidence status/source, evidence-checklist count, company-channel count, linked historical-trade count/review priority, Radar candidate evidence score and current Intelligence/Sales Manager references. These values explain what the owner saw; they do not become buyer intent or a sales score. The record explicitly reports `decisionIsSalesProbability=false`, `purchaseIntentInferred=false`, `closeProbabilityInferred=false`, `nextPurchaseDatePredicted=false`, `crmRecordCreated=false` and `outreachExecuted=false`.

The decision row and the existing `ProspectCandidate.status` transition are committed inside one SQLite transaction with an expected-status check. A stale request writes neither. No duplicate pipeline stage or approval engine is introduced. Direct `PATCH` attempts to set `READY_FOR_SALES` or `REJECTED` now fail with `PROSPECT_OWNER_DECISION_REQUIRED`; `REVIEW_REQUIRED` still requires the Intelligence delegation route. `approve-sales` retains all existing verified-website, static-incomplete and authoritative Intelligence `READY_FOR_SALES_QUALIFICATION_REVIEW` gates.

Account Review displays decision history with reason, note, timestamp and bounded evidence summary. Prospect cards no longer contain direct approve/reject shortcuts; terminal human decisions are made inside Account Review. Decision notes/snapshots remain absent from public `/api/prospects`. The shipped dashboard contains the owner-decision dialog and no longer contains the old `patchWithAdminKey` helper or card-level approve/reject data attributes.

### Sales Qualification Handoff Brief

P6 adds administrator-only `GET /api/admin/prospects/:id/sales-handoff-brief` for completed `sales.lead.qualify` tasks. The endpoint resolves the latest local `prospect-sales` Manager reference, reads the current task from BossAI Manager, updates only that existing delegation state and derives `bossai.prospect-sales-handoff-brief.v1` in memory. The brief is never persisted (`briefPersisted=false`), so Radar does not become a second Sales-result authority. Missing Sales tasks return `PROSPECT_SALES_QUALIFICATION_NOT_FOUND`; queued/running tasks return `PROSPECT_SALES_QUALIFICATION_NOT_COMPLETED`.

The parser intentionally understands only explicit Sales Agent 0.2.0 cold-prospect markers: `HUMAN_REVIEWED_QUALIFICATION_ALLOWED`, `BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE`, `BLOCKED_PENDING_VERIFIED_WEBSITE_EVIDENCE`, structured website-evidence status/source and explicit Need / Authority / Timing / Budget lines. `UNKNOWN/未知` remains unknown. Non-UNKNOWN field text is preserved only as `sales-manager-result` reported evidence; it is not promoted to owner-verified fact. Unknown future artifact formats become `unstructured / not-structured` and retain the raw Manager output instead of triggering heuristic or model inference.

Account Review now renders the Sales Handoff Brief before the expandable raw Manager result. It shows source Manager Task, Sales-reported disposition, Sales-reported versus current Radar website evidence, the four qualification fields, the preceding private owner approval when available and a bounded next-owner-action hint. `qualification-allowed` means only that the Sales result may be reviewed for a separately governed next decision; it does not authorize outreach. The contract explicitly fixes `handoffBriefIsOwnerApproval=false`, `qualificationIsCloseProbability=false`, `outreachAuthorized=false`, `crmWriteAuthorized=false`, `purchaseIntentInferred=false`, `closeProbabilityInferred=false`, `nextPurchaseDatePredicted=false`, `crmRecordCreated=false` and `outreachExecuted=false`. No Handoff control can send a message, call a prospect, quote, change price or write CRM.

### Execution Exception Desk

P7 promotes failed/cancelled Intelligence and Sales Manager tasks into a separate owner-attention class instead of treating them as generic next-step-ready work. `bossai.prospect-owner-review-queue.v1` derives `execution-exception` from the latest existing `BossAiDelegation` reference and exposes employee kind, failed/cancelled status, Manager Task ID, bounded `errorCode/errorMessage` and the corresponding manual retry action. No exception state or retry schedule is persisted; the queue contract explicitly reports `automaticRetryExecuted=false`.

Account Review preserves the existing Manager reference and displays execution failure/cancellation as a specific blocker with the Manager error provenance. `retry-intelligence` and `retry-sales` are distinct from `refresh-intelligence` / `refresh-sales`: refresh only rereads current Manager truth, while retry is an explicit administrator/owner request for one new governed Manager task. Failure detection itself never creates a task.

Manual retry reuses the existing prospect delegation routes with optional `retryFailedRunId`. Radar, not the caller, owns the retry operation ID and deterministically derives it from the failed Manager Task reference; a caller-supplied `sourceOperationId` during retry is rejected. If that retry operation already exists, Radar reads back the existing Manager task and returns a deduplicated result. If it does not exist, only the latest relevant failed/cancelled task is eligible to create a new retry. This prevents stale-task retries and double-click task storms without adding an automatic retry loop. Sales retries continue to require `READY_FOR_SALES` and a completed Intelligence reference. All retry responses preserve `automaticRetryExecuted=false`, `crmRecordCreated=false` and `externalActionsExecuted=false`.

### Decision-to-Sales Authorization Lineage

P8 makes the human Sales gate traceable instead of relying on the mutable `READY_FOR_SALES` status alone. `bossai.prospect-sales-authorization-lineage.v1` derives the current authorization from the prospect, latest completed Intelligence delegation, Owner Decision Journal and latest Sales delegation. A Sales qualification may start only when the latest applicable `approve-sales` decision snapshot references the exact current completed Intelligence Manager Task. The authorization is intentionally narrow: `authorizesSalesQualificationOnly=true`, while outreach, CRM writes, quotes, pricing changes, contracts, payments, purchase intent, close probability and next-purchase prediction remain unauthorized/false.

A new non-destructive `bossai_delegations.owner_decision_id` column binds every newly created `prospect-sales` Manager reference to the exact Owner Decision that authorized it. The Sales Manager objective and `PROSPECT_FACT_JSON` carry the Decision ID, decision time, bounded reason code and predecessor Intelligence Manager Task ID. Free-form owner notes remain private in Radar and are not copied into the Sales employee execution context. Handoff Brief owner-approval context now resolves by the bound Decision ID; an explicitly unbound legacy Sales task does not inherit a newer approval by convenience.

Legacy `READY_FOR_SALES` records without an Owner Decision, approvals tied to a different Intelligence Task, and legacy Sales tasks without/mismatching `owner_decision_id` fail closed. Account Review enters `sales-authorization`, queues the account as an owner decision and exposes `reconfirm-sales-authorization`. Reconfirmation rereads the current authoritative Intelligence result, requires `READY_FOR_SALES_QUALIFICATION_REVIEW`, appends a new `approve-sales` journal record while leaving the prospect status READY, and allows only a fresh Sales task bound to that new Decision ID. No legacy Sales row is silently mutated or backfilled.

### Outcome / Business Value Attribution

P9 adds `bossai.prospect-outcome-attribution.v1` as a derived Decision → Sales → Outcome view. A completed authoritative Sales Manager result contributes `REPORTED` result evidence only; Sales completion, `HUMAN_REVIEWED_QUALIFICATION_ALLOWED`, historical trade and employee-written monetary claims never become revenue, ROI, deal value or a confirmed business outcome. Radar may preserve a bounded employee-reported value line for audit, but it performs no numeric extraction from that text.

The owner may explicitly record `confirm-outcome`, `no-value` or `observe` through the append-only `bossai.prospect-outcome-review.v1` journal. Every row binds the exact current Sales Manager Task and the P8 Owner Decision ID and stores a bounded review-time snapshot. `observe` is `OBSERVED`; confirm/no-value are human `CONFIRMED` judgments. An optional amount/currency is accepted only for `confirm-outcome`, is labelled `owner-entered`, and is never prefilled from the Sales result. A confirmed outcome without an entered amount keeps monetary value unknown; `no-value` is a business judgment, not a zero-revenue accounting entry.

Outcome writes revalidate the latest `prospect-sales` row in a SQLite `BEGIN IMMEDIATE` transaction. The exact Sales Task must still be latest, completed and bound to the same Owner Decision; otherwise no journal row is written. Derived attribution likewise ignores historical reviews when the P8 lineage is invalid or when their Sales Task/Decision IDs no longer match the current lineage. This prevents a later Sales run from inheriting an earlier result/value judgment.

Administrator-only endpoints are `GET /api/admin/prospects/:id/outcome-attribution`, `GET /api/admin/prospects/:id/outcome-reviews`, `POST /api/admin/prospects/:id/outcome-review` and `GET /api/admin/prospects/outcome-summary`. The portfolio summary counts completed Sales work as confirmed, awaiting owner review, observing, no-value or lineage-unclosed and aggregates only owner-entered confirmed amounts by currency. Account Review shows the Decision → Sales → Outcome lineage; awaiting/observing work makes `review-outcome` the primary result-review action. Confirmed/no-value work becomes closed in the default active owner queue. Public `/api/prospects` contains none of the private outcome notes, snapshots or amounts, and every outcome response preserves `crmRecordCreated=false` / `externalActionsExecuted=false`.

### Outcome Learning / historical descriptive cohorts

P10 adds administrator-only `GET /api/admin/prospects/outcome-learning`, returning derived/read-only `bossai.prospect-outcome-learning.v1`. It is not a scoring model, causal model, Sales pipeline, BI authority, Agent Runtime or CRM. A prospect enters the learning sample only when the latest local `prospect-sales` delegation is `completed`, P8 resolves to `sales-bound`, the Sales task is bound to the current Owner Decision, and the lineage Sales Manager Task ID equals the latest Sales delegation. P9 reviews are matched only by the exact current `Sales Manager Task ID + Owner Decision ID`, so an older confirmed review cannot attach to a newer Sales run and an invalid P8 lineage contributes no confirmed learning sample.

The contract currently exposes four descriptive dimensions: discovery-source host, website evidence source (`static-http` / `browser-rendered`), observed company business-channel roles, and ICP lexical-coverage bucket. Each cohort emits only `sampleCount`, `confirmedCount`, `noValueCount`, `observingCount`, `awaitingCount`, optional `ownerEnteredValueByCurrency`, and `status=descriptive|insufficient-sample`. The fixed minimum sample is 3; below that threshold the UI explicitly says the sample is insufficient and forms no judgment. Business-channel membership may overlap because one company may publish multiple business roles; that overlap is declared rather than normalized into a Sales score.

Only explicit owner-entered amounts from current-lineage `confirm-outcome` reviews enter `ownerEnteredValueByCurrency`. Employee-reported monetary claims are excluded; `no-value` increments only the no-value count and never creates `Revenue = 0`. The contract fixes `historicalDescriptionOnly=true`, `causalityInferred=false`, `closeProbabilityInferred=false`, `purchaseIntentInferred=false`, `nextPurchaseDatePredicted=false`, `scoreMutationPerformed=false`, `crmRecordCreated=false`, `managerTaskCreated=false`, `modelCalled=false` and `businessValueAutoEstimated=false`. Radar does not mutate `ProspectCandidate.score`, ICP coverage, Sales qualification or Manager state while building P10. The Prospect Candidates UI renders restrained white/gray cards and never labels a cohort as best, winner or most likely to close. Public `/api/prospects` exposes none of the private P10 aggregation or owner-entered values.

P10.1 adds derived `bossai.prospect-outcome-learning-membership.v1` to Account Review so the owner can see why one account belongs to the same descriptive cohorts. The read model exposes only existing source facts: bounded discovery-source host/title/URL, website evidence source plus evidence status, observed public company business-channel roles, ICP lexical-coverage bucket/counts, and current sample eligibility. Eligibility is true only when the current latest Sales task is completed and exactly matches the valid P8 `sales-bound` lineage; incomplete Sales, invalid authorization lineage, or a Sales-task lineage mismatch is explicitly excluded. `cohortMembershipIsNotRanking=true`, and the same non-causal/probability/model/score-mutation boundaries remain false. No new stage is persisted and no Manager/CRM/external action is created.

P10.2 adds `sampleContributionState` to the same single-account read model so Account Review can state exactly how the account contributes to the current Outcome Learning sample: `confirmed`, `no-value`, `observing`, `awaiting-owner-review`, or `excluded`. This state is derived from the exact current Sales Manager Task ID plus Owner Decision ID and the matching P9 review journal entry. A valid completed current Sales lineage with no matching review contributes `awaiting-owner-review`; a stale review bound to an older task/decision is ignored. Invalid/incomplete lineage contributes only `excluded`. The contribution state is not a score, account priority, Revenue, ROI, close probability, purchase intent, or causal explanation, and it triggers no write or external action.

P10.3 adds no new runtime authority or persisted domain stage; it makes the existing read-only review path actionable and statistically harder to misread. The Outcome Learning panel exposes global `sampleCount / minimumSampleSize` readiness, explicitly warns that business-channel role cohorts overlap, and links pending governed outcome work into the existing Owner Account Review Queue `result-review` attention class. Awaiting/observing Business Outcome cards use the same queue. Client filtering no longer relies on a mixed local slice: the UI sends `attention=<filter>` to `GET /api/admin/prospects/account-review-queue` before the current bounded 500-account read, while the server continues to derive the queue from current Account Review truth and returns the full summary. This change creates no second queue authority, score, prediction, Manager task, CRM state, or external action.

P10.4 hardens the same path against stale UI, hidden records, private-response caching, unordered review journals and incomplete global delegation coverage. P8/P9-changing UI actions refresh Business Outcomes, Outcome Learning and Owner Queue together. P9/P10 matching reviews are sorted internally by `reviewedAt DESC, id DESC`, making the newest owner judgment authoritative even when a caller supplies an unsorted journal. Owner Queue and Prospect Candidates retain compact initial views (10 and 12 records) but can progressively reveal their bounded result sets; the candidate/queue read boundary is 500. Administrator endpoints emit `Cache-Control: no-store, private` and `Pragma: no-cache`. `/api/admin/bossai/delegations` remains bounded to 200 records but returns `totalCount` and `truncated`; when truncated, the dashboard treats an absent delegation as unknown and withholds direct Intelligence/Sales creation until Account Review reads the source-specific authoritative state. No second Runtime, queue authority, score, probability, CRM write, Manager auto-task, model call or external action is introduced.

P10.5 adds a read-only evidence drill-down without introducing another analytics or workflow authority. `GET /api/admin/prospects/outcome-learning/drilldown?dimension=...&cohort=...` derives `bossai.prospect-outcome-learning-drilldown.v1` from the same latest Sales Task + P8 Owner Decision + P9 review truth used by P10/P10.1. Only current eligible sample accounts whose existing cohort membership matches the requested dimension/key are returned. Items contain prospect ID, company name, domain and contribution state only, are alphabetically ordered, and intentionally exclude owner-review notes, owner-entered business-value amounts, employee monetary claims and candidate ranking. The dashboard opens Account Review from the sample item to inspect authoritative evidence. Any result-truth refresh clears an open drill-down to avoid pairing refreshed cohorts with stale members. `rankingPerformed=false`, and no score mutation, probability, CRM write, Manager task, model call, Runtime ownership or external action is added.

P10.6 extends that same read-only drill-down with an optional exact outcome-state filter. `state=confirmed|no-value|observing|awaiting-owner-review` filters only after current P8/P9 eligibility and cohort membership are re-derived; the response reports filtered `sampleCount` plus unfiltered `cohortSampleCount`, so the denominator is never lost. Unknown states fail with `OUTCOME_LEARNING_STATE_INVALID`. The UI makes non-zero state counts actionable while zero counts remain labels. This remains evidence traceability rather than segmentation authority: alphabetical ordering, no candidate-score ranking, no value/note disclosure, no prediction, no CRM/Manager/Runtime ownership and no external action.

P10.7 adds browser-side latest-request-wins protection across overlapping read batches without creating a new runtime or state authority. `public/latest-request.js` provides a tiny monotonic request gate with executable Node regression coverage. Dashboard base reads, trade evidence, global BossAI delegation coverage, Owner Queue, Business Outcomes, Outcome Learning and cohort/state drill-down each use independent gates; stale responses and stale errors are ignored. Outcome truth reload explicitly invalidates in-flight drill-down reads, preventing a pre-refresh sample list from reappearing after the cohort truth has changed. No server contract, Manager task, Scheduler, Approval, CRM state, model call or external action is introduced.

P10.8 applies independent latest-request gates to Account Review detail and its BossAI Manager result pane. A newer account-detail read makes every older Account Review response/error stale; closing the dialog invalidates pending detail and Manager-result reads. Starting a fresh Account Review also invalidates the previous Manager-result sequence, so a slow employee result cannot cross account boundaries. The behavior is browser presentation safety only: it does not change the Account Review contract, Manager execution truth, owner approval authority, CRM authority, or outcome truth.

Trade/customs data remains Radar domain evidence rather than Agent-owned state. Authorized CSV/TSV files are first parsed through a no-write preview that exposes inferred field mapping, warnings, important missing fields, intentionally ignored source columns and bounded company-level samples; explicit confirmation then normalizes the file into a separate `trade_records` table containing company-level role, country, product, HS code, date, quantity, value/currency and optional website. Personal contact columns are not stored in this model. Radar may filter this evidence and compute descriptive historical summaries keyed by `company name + country/region`, preventing same-name cross-country histories, amounts or websites from being combined. Summaries expose observed first/latest dates, dated sample count, median/min/max historical interval when enough dates exist, `insufficient|single-gap|regular|variable` cadence, recency and `REVIEW_FIRST|REVIEW_SOON|REVIEW_LATER` only as a deterministic human-review ordering aid. No `intentScore`, `purchaseProbability`, `nextPurchaseDate`, current need, buyer authority or close probability is inferred. Import creates neither prospects nor CRM records. A single record with a known website may become a prospect only after explicit owner action plus bounded website verification. A company summary may also explicitly group one `company name + country/region` identity into a single candidate and privately link that identity's historical records without increasing the candidate score because of historical repetition. Same-name multi-country identities must be selected explicitly; multiple website domains require human selection; missing websites require explicit resolution. Record/company resolvers return only domains that actually pass bounded website collection and never auto-accept the first result. Explicit promotion creates a private `prospect_trade_evidence` relation rather than embedding raw trade history into the public prospect object. Administrator-triggered Intelligence review may read at most eight linked company-level trade records; the same bounded history reaches `sales.lead.qualify` only after the authoritative Intelligence result contains `READY_FOR_SALES_QUALIFICATION_REVIEW` and a human explicitly sets `READY_FOR_SALES`. Historical trade evidence is never converted into current purchase intent, budget, authority, predicted next order or sales readiness.

### Read real Manager state

```http
GET /api/admin/bossai/runs/{managerTaskId}
GET /api/admin/bossai/runs/{managerTaskId}/events
```

The local route name remains compatible, but the underlying authority is `GET /api/manager/tasks/{managerTaskId}`. Radar never fabricates progress. Execution status and review status remain separate.

The following legacy paths and built-in employee IDs are retired from active Radar code:

```text
POST /api/agents/:id/run
GET /api/workforce/runs/:id
GET /api/workforce/runs/:id/events
agent-content-employee
agent-private-domain-employee
agent-exposure-employee
```

## Safety and truth rules

- Demo opportunities return a blocking error and cannot create real Manager work.
- Missing BossAI OS employee authentication fails closed.
- Missing, outdated, unsigned, disabled, unhealthy or contract-incompatible Intelligence Agent installations fail before Manager task creation.
- Radar never falls back from a failed Manager task to a direct model call while presenting the result as the same employee task.
- `completed` means a reviewable result exists; it does not mean approved, published, sent or externally executed.
- Agent responses preserve `requiresHumanReview=true` and `externalActionsExecuted=false`.
- Radar deterministic scores and `BUILD / SELL_SERVICE / WATCH / IGNORE` thresholds remain authoritative. AI explanations cannot change them.
- Demo evidence remains labelled and cannot support real business execution.
- Publishing, customer messaging, purchases, payments, refunds, deletion and account changes require separate approved action contracts.
- The UI exposes employee state only when delegation is configured and hides the action for Demo opportunities.

## Acceptance evidence

The migration is accepted at technical Level 2 only when:

1. bounded narrative enrichment uses BossAI Central AI Gateway;
2. Radar checks the exact Intelligence Agent installation;
3. the Manager response routes only to `bossai-intelligence-agent`;
4. the returned Manager Task ID is persisted as the cross-product reference;
5. repeated source operation IDs reuse the existing local reference;
6. `queued/running/completed/failed/cancelled` are displayed truthfully;
7. execution and review state remain separate;
8. Demo delegation is blocked;
9. unsigned or unhealthy plugins are blocked before Manager task creation;
10. old Agent Run and Workforce Run paths are absent from active source;
11. the independent plugin passes package scan, mandatory approval, offline authorization and restart recovery tests;
12. Radar tests pass from the real server entry point;
13. search/map/directory-only prospect URLs remain `unverified` until bounded website evidence exists;
14. verified prospect facts cannot be downgraded or erased by a later unverified rediscovery;
15. trade-company cadence remains descriptive and produces no next-purchase or buyer-intent prediction;
16. company-level trade identity is separated by country/region and ambiguous websites require human selection;
17. company-level contact channels preserve official source-page provenance, business role and evidence confidence without creating buyer-intent fields;
18. arbitrary personal-looking mailboxes and LinkedIn `/in/` pages are not promoted into the structured company-channel layer;
19. Intelligence and Sales independently validate company-channel provenance and preserve the procurement/confidence non-intent boundary;
20. static-incomplete prospects require an explicit owner browser-evidence request before rendered evidence can be accepted;
21. browser-rendered evidence is same-host, bounded, post-request and raw HTML is not persisted;
22. sufficient browser evidence may upgrade to verified while sparse rendered evidence stays static-incomplete;
23. websiteEvidenceSource is provenance only and cannot bypass the static-incomplete Sales gate or create a Browser Runtime inside Radar;
24. Account Review is derived from existing prospect/evidence/delegation truth and does not persist a second workflow stage;
25. linked historical trade rows and Manager Task references are available only through the administrator Account Review and remain absent from the public prospect API;
26. Account Review evidence coverage is explicitly material coverage only and never purchase/close probability;
27. owner decision can read the authoritative Intelligence Manager result before Sales approval, and completed Sales qualification remains a reviewable Manager result rather than a CRM/outreach side effect;
28. buyer authority, real need, timing and budget remain unknown until separately evidenced, while purchaseIntentInferred, closeProbabilityInferred, nextPurchaseDatePredicted, crmRecordCreated and outreachExecuted stay false;
29. Owner Account Review Queue priority is derived operational handling order only and is never persisted as sales probability or pipeline truth;
30. owner-decision and result-review accounts are ordered before evidence/action/waiting work, while rejected accounts remain closed outside the default active queue;
31. queue cards open the existing Account Review rather than duplicating workflow controls, and prospect-stage-changing UI actions refresh the queue from server truth;
32. the real dashboard HTTP regression confirms the P4 queue entry is shipped and the frontend no longer calls nonexistent `loadData()`;
33. owner `approve-sales` / `reject-prospect` writes require the owner-decision contract and direct READY_FOR_SALES/REJECTED PATCH attempts fail closed;
34. decision reasons are bounded by decision type, `other` requires a note, and stale expected-status decisions write neither a journal entry nor a prospect status change;
35. approval through the journal preserves verified-website and authoritative Intelligence handoff gates rather than weakening them;
36. owner decision notes, snapshots, linked trade details and Manager references remain administrator-only and absent from public prospect output;
37. the shipped dashboard routes terminal owner decisions through Account Review plus the owner-decision dialog and contains neither card-level approve/reject shortcuts nor the old PATCH helper;
38. Sales Handoff Brief reads the authoritative completed BossAI Manager task live and is not persisted as a second Sales result;
39. missing and incomplete Sales tasks fail explicitly rather than producing fabricated qualification output;
40. qualification parsing is limited to explicit Sales markers/field lines, keeps UNKNOWN unknown and labels non-UNKNOWN values as Sales-reported rather than owner-verified;
41. unknown future Sales formats fall back to unstructured/raw Manager output instead of heuristic or AI inference;
42. Sales Handoff Brief grants neither outreach nor CRM-write authorization and creates no external action;
43. failed/cancelled Intelligence and Sales Manager tasks are classified as `execution-exception` with the authoritative Manager Task ID and bounded error provenance rather than ordinary action-ready work;
44. observing an execution exception never starts a retry and the queue explicitly reports `automaticRetryExecuted=false`;
45. manual retry operation IDs are server-managed from the failed Manager Task reference, only the latest failed/cancelled task may create a new retry, and repeated retry requests deduplicate to the same governed Manager task;
46. the real Account Review/dashboard path exposes execution-exception filtering, explicit retry versus refresh actions, and preserves `crmRecordCreated=false` / `externalActionsExecuted=false`;
47. `READY_FOR_SALES` alone is insufficient for Sales qualification; a current `approve-sales` Owner Decision tied to the exact completed Intelligence Manager Task is required;
48. new Sales delegation records persist the authorizing Owner Decision ID and send only bounded decision metadata—not the private free-form owner note—into the Manager execution context;
49. Sales operation idempotency includes the Owner Decision ID so a later explicit reconfirmation creates a fresh authorization lineage rather than reusing an older approval's task;
50. legacy READY rows and unbound/mismatched Sales tasks fail closed and surface `sales-authorization` / `reconfirm-sales-authorization` instead of silently qualifying or retrying;
51. explicit owner reconfirmation preserves the existing READY status, rereads the authoritative Intelligence result, journals a new approval and permits a fresh Sales task without rewriting the legacy task;
52. Handoff Brief approval context is resolved from the Sales delegation's bound Owner Decision ID; an explicitly unbound legacy task does not borrow a newer owner approval;
53. completed Sales work enters Outcome Attribution as `REPORTED` evidence only and does not become revenue, ROI, close probability or confirmed value;
54. employee-reported monetary/value text may be preserved for audit but is excluded from numeric business-value aggregation;
55. owner outcome reviews are append-only and bind the exact current Sales Manager Task plus P8 Owner Decision ID;
56. only `confirm-outcome` may carry an optional owner-entered amount/currency, while `observe` and `no-value` reject monetary values;
57. a stale, incomplete or newly superseded Sales task causes the atomic outcome write to fail without creating a journal row;
58. historical outcome reviews do not apply when the current Sales task, Owner Decision or P8 authorization lineage changes;
59. Business Outcomes portfolio totals aggregate only owner-entered confirmed values, while confirmed/no-value closes active owner work and observing remains reviewable;
60. the real Manager HTTP path proves an employee `100000 USD` claim stays REPORTED, only the owner's separately entered `4200 USD` becomes current value, and public prospect output leaks neither amount nor private outcome note.

This migration does not claim production deployment, formal Agent registration, release signing, generalized service-to-service identity, automatic external actions or real-user validation.
