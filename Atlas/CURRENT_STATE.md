# BossAI Radar Lite Current State

Updated: 2026-08-18

## Product identity

```text
Product: BossAI Radar Lite
Version: 0.7.1
Path: D:\BossAI-Projects\bossai-radar-lite
Classification: AI Assistant / professional intelligence workbench
Local URL: http://127.0.0.1:3080
Completion Level: 2
```

## Current authority boundary

Radar Lite remains authoritative for public-source collection, SSRF protection, source health, evidence records and fingerprints, deterministic scoring, `BUILD / SELL_SERVICE / WATCH / IGNORE`, reports, leads and local SQLite. The public-source layer now also supports explicitly configured, bounded business-website seeds for foreign-trade/company research; this remains part of Radar rather than a second crawler platform.

Persistent intelligence employee work is packaged separately as:

```text
bossai-intelligence-agent@0.3.0
```

BossAI OS remains the only Agent Platform. Radar does not install, sign, enable, disable or run the plugin.

## Reddit/GEO structured evidence handoff

Radar Lite already owns the real Reddit Search JSON collector. Each scan can now enrich up to three observed subreddits with public Sidebar/About, rules and pinned-post context, using a 24-hour success cache and a 15-minute failure cache. The current integration passes bounded non-DEMO evidence to `bossai-intelligence-agent@0.3.0` as one `EVIDENCE_JSON` record per source item, including title, bounded excerpt, URL, derived subreddit, timestamp, engagement, Radar score, category, tags and query.

Explicit Reddit/GEO objectives are routed by the employee to `intelligence.reddit-geo.brief`. Generic opportunity objectives are not reclassified merely because a Reddit item appears in the evidence list.

Radar still does not let the employee crawl Reddit, write Radar records or change deterministic scores. Sidebar/About, rules and pinned-post context are now collected when public endpoints respond. Flair and identity-disclosure interpretation still require human review before downstream content becomes draft-ready.

## Business website crawler / foreign-trade prospect evidence

Radar now supports `website` as a first-class evidence source through `RADAR_WEBSITE_SEEDS`. The collector is disabled until seeds are configured and applies all of the following controls:

```text
same website host only
bounded pages per seed (default 5, maximum 20)
bounded crawl depth (default 1, maximum 2)
robots.txt respected by default, including BossAI-Radar-Lite-specific groups over wildcard groups
SSRF and private-address rejection
redirect validation, including cross-site redirect blocking before the external request
1 MiB HTML and 256 KiB robots.txt response limits
login / signup / account / cart / checkout paths skipped
common document / archive / media paths skipped
no authentication, CAPTCHA or access-control bypass
```

Each collected public page may attach `bossai.business-website-context.v1` with company name, description, product/service signals, contact-page URLs, public business email/phone values, JSON-LD `contactPoint`, official-site-linked external company profile URLs and public business-messaging URLs. LinkedIn personal `/in/` profiles are excluded from company-profile evidence. The same context is persisted with evidence and can be serialized into the bounded `EVIDENCE_JSON` sent to the Intelligence Agent. The Agent still receives no crawler authority and customer outreach remains outside this collection path.

The website context now also carries bounded `CompanyContactChannel` evidence with `type`, `value/url`, `sourcePageUrl`, `sourceKind`, `businessRole`, `confidence` and `verificationStatus`. Roles are limited to `general / sales / export / wholesale / support / procurement / business-development / unknown`. Mailto/visible-text emails are promoted into this structured company channel layer only when they are role-style business mailboxes; arbitrary personal-looking mailboxes are not promoted. JSON-LD Organization/ContactPoint declarations may provide structured company contact evidence, contact forms are detected but never submitted, WhatsApp Business/company-profile links retain the official source page, and LinkedIn `/in/` personal profiles remain rejected. `confidence` means only confidence that the observed endpoint is a public company-level channel; it is never purchase intent, purchase probability, Sales score or close probability.

Real-entry validation on 2026-08-16 used `https://trademate.tangmail.dpdns.org/` with bounded collection and no database write. The latest live validation returned `status=success` in about 1.9 seconds, preserved the public page title/description, reported `robotsPolicy=allowed`, and marked the page `renderingHint=javascript-likely`. It exposed no public email, phone, company-profile link, business-messaging URL or structured product signal through the static page, so Radar returned zero values instead of inventing data and treated the evidence as incomplete.

## Prospect discovery → website verification → Intelligence review

Radar now adds a separate foreign-trade prospect-candidate layer without turning candidates into CRM leads:

```text
explicit public directory / exhibitor / member / supplier page OR configured Brave Web Search OR configured Google Places
→ bounded/official discovery adapter
→ extract likely external company websites
→ merge/filter search / social / payment / site-builder / large-marketplace hosts
→ bounded official-website verification
→ public company / offering / contact evidence aggregation
→ deterministic candidate ranking
→ prospect_candidates (not CRM leads)
→ optional bossai-intelligence-agent review
→ intelligence.prospect.brief
→ bossai.intelligence-handoff.v1
→ authoritative Intelligence result must contain READY_FOR_SALES_QUALIFICATION_REVIEW
→ explicit human READY_FOR_SALES approval or REJECT
→ bossai-sales-agent
→ sales.lead.qualify
→ reviewable sales qualification result
→ still no automatic CRM write or outreach
```

`RADAR_PROSPECT_DISCOVERY_SEEDS` is disabled until explicitly configured. Discovery itself never requests candidate external websites; second-stage verification is performed through the existing SSRF/robots/redirect-protected business-website collector. Candidate scores rank public evidence strength only and must not be interpreted as purchase intent or close probability. Prospect records now persist an explicit `websiteEvidenceStatus` of `unverified`, `verified`, or `static-incomplete` plus `websiteVerifiedAt`. Search/map/directory discovery alone remains `unverified`; successful bounded website collection upgrades it to `verified`, while a JavaScript shell becomes `static-incomplete`. A later unverified rediscovery cannot downgrade or erase already verified company/contact/product evidence.

The UI now exposes a dedicated `潜客候选` section with candidate status, company website, evidence source, public-contact/business-channel count, official-site-linked company-profile count, product/service signal count, ICP website coverage and explicit website-evidence status. `unverified` candidates show a `核验官网` recovery action instead of an Intelligence action; the backend also rejects Intelligence delegation with `PROSPECT_WEBSITE_EVIDENCE_REQUIRED` before any Manager task is created. `static-incomplete` candidates may enter Intelligence only for evidence review and remain blocked by `BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE`. It also exposes one-shot search-direction planning and per-channel `公开名录 / Web 搜索 / 地图` status with candidate/error/duration evidence. Delegation sets a verified candidate to `REVIEW_REQUIRED` and returns `crmRecordCreated=false`. Task completion alone is insufficient for Sales: the authoritative result must contain `READY_FOR_SALES_QUALIFICATION_REVIEW`; both `BLOCKED_PENDING_VERIFIED_WEBSITE_EVIDENCE` and `BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE` remain blocked even after task completion. `READY_FOR_SALES` also rechecks website evidence so legacy records cannot bypass this boundary.

### Browser-rendered evidence supplementation

Radar now provides a controlled recovery path for `static-incomplete` official websites without creating a general Browser Agent Runtime. A prospect can create an explicit `bossai.prospect-browser-evidence-request.v1` pending request through the administrator/owner entry. The request returns a bounded capture contract: same official website host only, HTTP(S) only, no embedded credentials, no authentication/CAPTCHA/access-control bypass, no form submission, no outreach, maximum 100000 rendered-HTML characters and `rawRenderedHtmlPersisted=false`. Radar does not launch Chrome, Playwright, CDP, `agent-browser` or any other browser process in this batch.

The current canonical BossAI OS source declares `browser.read` as an Agent Tool contract, but its inspected contract currently has `executionAvailable=false` and no execution endpoint. Radar therefore does not pretend that BossAI OS browser execution exists. The current fallback is an owner-controlled browser: the owner opens the public official page, waits for rendering, and submits the same-host rendered HTML against the pending request. Radar reuses the existing business-website parser, persists only the extracted `bossai.business-website-context.v1` evidence and discards the raw rendered HTML. If the rendered evidence is substantively sufficient, the prospect can move from `static-incomplete` to `verified` with `websiteEvidenceSource=browser-rendered`; sparse rendered evidence becomes `browser-rendered-incomplete` and remains `static-incomplete`. A future real BossAI OS `browser.read` executor may feed the same evidence contract after its platform contract genuinely becomes execution-available.

The Browser Evidence dialog is available directly on static-incomplete prospect cards while the existing Intelligence evidence-review action remains available when employee delegation is configured. This preserves the P1 rule that Intelligence may explain incomplete evidence while preventing Sales readiness. `READY_FOR_SALES` now independently rejects `static-incomplete` with `PROSPECT_BROWSER_EVIDENCE_REQUIRED` before relying on any Intelligence result, so a stale or bypassed handoff cannot make incomplete website evidence Sales-ready. Cross-host, pre-request, unsupported-source and already-closed submissions fail closed; no CRM record or external commercial action is created.

### Prospect Account Review / Customer 360

Every prospect card now exposes `账户全景 / Account Review`. The administrator-only `GET /api/admin/prospects/:id/account-review` derives `bossai.prospect-account-review.v1` from existing authoritative records instead of creating a second workflow state machine. It joins the current `ProspectCandidate`, latest browser-evidence request, private linked company-level trade records, latest Intelligence Manager reference and latest Sales Manager reference. The public `/api/prospects` response remains unchanged and does not disclose private historical trade rows or Manager Task IDs.

The Account Review shows a six-step path (`发现企业 → 官网核验 → 浏览器补证据 → 情报复核 → 老板决定 → 销售资格判断`), a review-material checklist, verified company/offering facts, website provenance, structured company business channels, historical trade window/cadence/amounts, Intelligence/Sales state, blockers and the next governed action. The checklist count is explicitly evidence coverage only; it is not purchase probability, close probability or a sales score. `buyer authority / real need / timing / budget` stay visibly unknown until real governed evidence exists. Historical cadence/review priority remains descriptive only and company channel roles remain routing metadata only.

Account Review actions reuse the existing verification, browser-evidence, Intelligence, explicit `READY_FOR_SALES`, rejection, Sales qualification and Manager-read routes. No duplicate stage is persisted. When Intelligence is complete, the owner can read the authoritative BossAI Manager result inside Account Review before approving Sales. When Sales is complete, the qualification result can likewise be read without creating a CRM record, sending a message or representing the prospect as won. Opening, refreshing or acting through Account Review reports `purchaseIntentInferred=false`, `closeProbabilityInferred=false`, `nextPurchaseDatePredicted=false`, `crmRecordCreated=false` and `outreachExecuted=false`.

### Owner Account Review Queue / P4

The Prospect Candidates workbench now begins with an administrator-only `老板待审账户 / Owner Account Review Queue`. `GET /api/admin/prospects/account-review-queue` derives `bossai.prospect-owner-review-queue.v1` from the existing Account Review read models; no queue priority or stage is persisted. Operational handling order is fixed as `owner decision → employee execution exception → employee result review → evidence recovery → next-step-ready → waiting on employee → closed`. This order describes where responsibility sits, not lead value. The queue contract explicitly reports `handlingPriorityIsSalesProbability=false`, `purchaseIntentInferred=false`, `closeProbabilityInferred=false`, `nextPurchaseDatePredicted=false`, `crmRecordCreated=false` and `outreachExecuted=false`.

The UI shows five owner-work counts (`现在要你决定 / 员工执行异常 / 员工结果待审 / 可立即推进 / 员工执行中`), filter chips and active account cards. Closed/rejected accounts remain in server summary truth but are excluded from the default active work list. Each card shows current Account Review stage, review-material coverage, primary next action, first blocker, optional historical-trade human-review order, last observation and the Radar candidate evidence-ranking score with explicit `非成交概率 / not close probability` copy. The only action on a queue card is `打开账户全景 / Open Account Review`; verify/approve/reject/delegate actions continue to live in Account Review so the dashboard does not become a second workflow authority.

Website verification, browser-rendered evidence submission, Intelligence delegation/refresh, owner `READY_FOR_SALES` or rejection, and Sales delegation/refresh now refresh the queue from server truth even when the action starts from a prospect card rather than the queue. P4 also repaired a real browser-path regression: successful prospect discovery referenced nonexistent `loadData()` after the server request. The UI now uses the existing `loadDashboard({ quiet: true })` refresh path, and the real HTTP dashboard regression asserts the shipped bundle no longer contains `loadData()`.

### Owner Decision Journal / P5

Owner approval and rejection are now auditable human decisions rather than bare prospect-status writes. `POST /api/admin/prospects/:id/owner-decision` accepts only `approve-sales` or `reject-prospect`, requires a bounded decision reason, requires a note when `other` is selected, and writes `bossai.prospect-owner-decision.v1`. The application stores an `owner-admin` actor type because the current Radar administrator key does not identify a named human principal; it does not fabricate a person name.

Each decision persists the owner's reason/note plus a bounded `bossai.prospect-owner-decision-snapshot.v1` containing the pre-decision Account Review stage/status, website evidence status/source, evidence-checklist completion, business-channel count, linked historical-trade count/review priority, Radar candidate evidence score and current Intelligence/Sales Manager references. The snapshot is audit context only. The decision record explicitly reports `decisionIsSalesProbability=false`, `purchaseIntentInferred=false`, `closeProbabilityInferred=false`, `nextPurchaseDatePredicted=false`, `crmRecordCreated=false` and `outreachExecuted=false`.

The decision insert and existing `ProspectCandidate.status` transition occur in one SQLite transaction with an expected-status guard, so a stale decision writes neither the journal nor a status change. No second workflow stage, approval engine or CRM pipeline is created. Direct HTTP `PATCH` attempts to set `READY_FOR_SALES` or `REJECTED` now fail closed with `PROSPECT_OWNER_DECISION_REQUIRED`; Intelligence delegation still owns entry into `REVIEW_REQUIRED`. Approval through the new decision contract retains all previous website-evidence and authoritative Intelligence `READY_FOR_SALES_QUALIFICATION_REVIEW` gates.

The Account Review now displays the private owner-decision history with reason, note, timestamp and the bounded evidence snapshot summary. Prospect cards no longer expose direct approve/reject shortcuts; human terminal decisions are made from Account Review, where the evidence and Manager result are visible. The public `/api/prospects` response continues to exclude decision notes, snapshots, private trade rows and Manager Task IDs. The P5 UI ships a dedicated decision dialog and has no `patchWithAdminKey` helper or card-level approve/reject data attributes.

### Sales Qualification Handoff Brief / P6

Completed `sales.lead.qualify` work now has an administrator-only `GET /api/admin/prospects/:id/sales-handoff-brief` review entry. Radar fetches the current Sales Manager Task directly from BossAI OS, requires `status=completed`, updates only the existing local delegation reference/state, and derives `bossai.prospect-sales-handoff-brief.v1` in memory. The Handoff Brief is not persisted and `briefPersisted=false`; BossAI Manager remains the sole Sales result authority. Accounts with no Sales task return `PROSPECT_SALES_QUALIFICATION_NOT_FOUND`, while queued/running tasks return `PROSPECT_SALES_QUALIFICATION_NOT_COMPLETED` instead of a fabricated result.

The P6 parser is deliberately narrow and deterministic. It recognizes only the explicit cold-prospect markers currently emitted by Sales Agent 0.2.0: `HUMAN_REVIEWED_QUALIFICATION_ALLOWED`, `BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE`, `BLOCKED_PENDING_VERIFIED_WEBSITE_EVIDENCE`, structured website-evidence status/source, and explicit Need / Authority / Timing / Budget lines. `UNKNOWN/未知` stays unknown. A non-UNKNOWN field is labelled `Sales-reported evidence`, not owner-verified fact. Missing or future-unrecognized markers become `unstructured / not-structured`; Radar does not infer the missing qualification fact.

Inside Account Review, `查看销售资格结果 / View Sales Qualification Result` now opens a structured Handoff Brief before the raw Manager text. It shows Manager Task authority, Sales-reported disposition, Sales-reported versus current Radar website evidence, a four-field qualification matrix, the prior private owner approval when present, the next human-controlled action, and an expandable authoritative raw result. The contract keeps `handoffBriefIsOwnerApproval=false`, `qualificationIsCloseProbability=false`, `outreachAuthorized=false`, `crmWriteAuthorized=false`, `purchaseIntentInferred=false`, `closeProbabilityInferred=false`, `nextPurchaseDatePredicted=false`, `crmRecordCreated=false` and `outreachExecuted=false`. No Handoff Brief control sends email/WhatsApp/LinkedIn/phone messages, quotes, changes price or writes CRM.

### Execution Exception Desk / P7

Failed or cancelled Intelligence/Sales Manager tasks are now surfaced as a distinct `execution-exception` owner-attention class instead of falling into ordinary `action-ready` work. The queue keeps the Manager Task ID, employee kind, execution status, bounded `errorCode/errorMessage`, explicit retry action and `automaticRetryExecuted=false`. This is derived from the existing `BossAiDelegation` references; no exception queue state, retry scheduler or second workflow engine is persisted.

Account Review now shows failed/cancelled employee state as an explicit blocker (`intelligence-execution-failed|cancelled` or `sales-execution-failed|cancelled`) together with the Manager error provenance. The primary recovery action is `retry-intelligence` or `retry-sales`; `refresh-*` remains available as a separate state-read action. The UI therefore distinguishes “read the existing Manager state again” from “owner explicitly asks for one new governed Manager task.” No retry starts automatically when a failure is observed.

Manual retry reuses the existing `/api/admin/prospects/:id/delegate` or `/qualify` route with a bounded `retryFailedRunId`. Radar generates the retry operation ID from the failed Manager Task reference and rejects caller-controlled retry operation IDs. A new retry may be created only for the latest failed/cancelled relevant task. Repeated requests for the same failed Task ID resolve to the same deterministic retry operation and read back the existing retry task instead of creating another one. Sales retry still requires the existing `READY_FOR_SALES` human gate and a completed Intelligence reference. Retry responses keep `automaticRetryExecuted=false`, `crmRecordCreated=false` and `externalActionsExecuted=false`; no email, message, quote, CRM write or other customer action is performed.

### Decision-to-Sales Authorization Lineage / P8

`READY_FOR_SALES` is no longer sufficient by itself to create or retry a Sales qualification task. Radar now derives `bossai.prospect-sales-authorization-lineage.v1` from the current prospect, latest completed Intelligence delegation, owner decision journal and latest Sales delegation. A valid lineage requires an `approve-sales` owner decision whose decision-time snapshot references the exact current completed Intelligence Manager Task. The resulting authorization proves only that the owner allowed `sales.lead.qualify`; `outreachAuthorized=false`, `crmWriteAuthorized=false`, purchase intent, close probability and next-purchase prediction all remain false.

Each new `prospect-sales` delegation persists `ownerDecisionId` beside the BossAI Manager Task reference. The Manager objective and `PROSPECT_FACT_JSON` carry the exact owner Decision ID, decision time, bounded reason code and predecessor Intelligence Manager Task ID, creating an auditable `Intelligence Manager Task → Owner Decision → Sales Manager Task` chain. Free-form private owner notes are intentionally not copied into the Sales employee execution context. The `bossai_delegations.owner_decision_id` column is added non-destructively; legacy rows retain an empty binding rather than receiving a fabricated approval.

Legacy/pre-P5 `READY_FOR_SALES` rows with no owner approval, a mismatched Intelligence reference, or an unbound/mismatched legacy Sales task fail closed before Sales task creation. Account Review enters `sales-authorization`, shows the lineage status and exposes `reconfirm-sales-authorization` rather than `qualify-sales` or retry. Explicit reconfirmation reuses the existing Owner Decision Journal contract, rereads the authoritative current Intelligence result, requires `READY_FOR_SALES_QUALIFICATION_REVIEW`, records a new `approve-sales` decision while preserving the existing READY status, and then permits only a fresh Sales qualification task bound to that new Decision ID. No historical Sales delegation is silently rewritten or backfilled.

### Outcome / Business Value Attribution / P9

P9 extends the governed chain from `Intelligence Manager Task → Owner Decision → Sales Manager Task` to `→ Outcome Review` without turning Sales completion into revenue. `bossai.prospect-outcome-attribution.v1` treats a completed authoritative Sales result as `REPORTED` evidence only. Employee text may be preserved as a bounded reported-value claim for audit, but Radar never parses that text into confirmed money, ROI, deal value or revenue. Only an explicit owner review may change the current outcome state to `CONFIRMED` or `OBSERVED`.

Owner outcome reviews are append-only Radar domain records under `bossai.prospect-outcome-review.v1`. Every review binds to the exact current Sales Manager Task and P8 Owner Decision ID, stores a bounded review-time snapshot, and records one of `confirm-outcome`, `no-value` or `observe`. Optional monetary value is accepted only with `confirm-outcome`, must be explicitly entered by the owner with a currency, and is labelled `owner-entered`; leaving it blank means the outcome is confirmed while monetary value remains unknown. `no-value` does not create a zero-revenue record, and `observe` preserves an open human review responsibility.

The outcome write uses an immediate SQLite transaction and rechecks that the requested Sales Manager Task is still the latest `prospect-sales` task, is still completed, and is still bound to the same Owner Decision. A newer/running/rebound Sales task makes the stale outcome write a no-op. Old reviews remain historical but never attach to a newer Sales task or changed authorization lineage. Invalid P8 lineage also removes current owner-review/value context from the derived P9 read model instead of reusing historical data.

`GET /api/admin/prospects/:id/outcome-attribution`, `/outcome-reviews`, `POST /outcome-review` and `/api/admin/prospects/outcome-summary` are administrator-only. The Prospect Candidates workbench now shows `经营结果 / Business Outcomes` counts for confirmed, awaiting owner review, observing, no-value and lineage-unclosed completed Sales work. The only numeric portfolio value is `ownerEnteredValueByCurrency`; employee claims are explicitly excluded. Account Review shows Decision → Sales → Outcome lineage and makes `review-outcome` the primary action while a completed Sales result is awaiting/observing. Confirmed or no-value outcomes leave the default active owner queue as closed; observing stays result-review. Public `/api/prospects` exposes none of the private outcome notes, snapshots or amounts.

### Outcome Learning / P10

P10 adds `bossai.prospect-outcome-learning.v1` as a derived/read-only historical review over the current P8/P9 truth. A sample is admitted only when the latest `prospect-sales` delegation is completed, P8 is `sales-bound`, the Sales task remains bound to the current Owner Decision and the lineage Sales Manager Task ID equals the latest Sales Manager Task. P9 reviews are matched only on the exact current `Sales Manager Task ID + Owner Decision ID`; stale reviews remain historical but do not attach to a new Sales run, and invalid P8 lineage contributes no confirmed learning sample.

The private administrator endpoint `GET /api/admin/prospects/outcome-learning` returns four descriptive dimensions: discovery source, website evidence source, observed company business-channel role and ICP lexical-coverage bucket. Cohorts expose only sample count plus confirmed/no-value/observing/awaiting counts and optional owner-entered confirmed values by currency. The fixed minimum sample is 3; smaller cohorts return `insufficient-sample` and the shipped bilingual UI says that no judgment is formed. Multiple business-channel roles may create overlapping cohort membership, which is declared rather than normalized into a ranking.

P10 remains explicitly non-predictive and non-causal: `historicalDescriptionOnly=true`, `causalityInferred=false`, `closeProbabilityInferred=false`, `purchaseIntentInferred=false`, `nextPurchaseDatePredicted=false`, `scoreMutationPerformed=false`, `crmRecordCreated=false`, `managerTaskCreated=false`, `modelCalled=false`, `businessValueAutoEstimated=false`, and employee-reported monetary claims are excluded. `no-value` is only a count and never becomes Revenue=0. `ProspectCandidate.score`, ICP score, Sales qualification, Manager state and CRM state are not mutated. The Prospect Candidates UI uses white/gray responsive cards and does not emit best/winner/most-likely-to-close labels. Public `/api/prospects` exposes no P10 aggregation, P9 owner note or owner-entered value.

### Outcome Learning membership / P10.1

P10.1 adds `bossai.prospect-outcome-learning-membership.v1` directly to the private Account Review read model so the boss can answer “为什么这个账户进入这些复盘分组”. It exposes only existing source facts for that account: discovery-source host/title/URL, website-evidence source plus evidence status, observed public company business-channel roles, and ICP lexical-coverage bucket with matched/total owner-defined terms. It also derives current P10 sample eligibility from the same latest Sales delegation plus P8 authorization lineage; eligibility is true only for a completed latest Sales Task that still exactly matches the `sales-bound` Owner Decision lineage.

Incomplete Sales work, an invalid P8 authorization lineage, or a Sales-task lineage mismatch is explicitly labelled as excluded from the result sample rather than being silently grouped. `cohortMembershipIsNotRanking=true`; causality, purchase intent, close probability, next-purchase prediction, score mutation and model calls remain false. No new stage is persisted, no Manager task is created, and Account Review still performs no CRM or external action. The shipped white/gray membership grid uses bounded wrapping/min-width and collapses to one column on narrow screens.

### Outcome Learning contribution / P10.2

P10.2 extends the same single-account read model with `sampleContributionState` so Account Review can say how the exact current governed account is counted inside Outcome Learning: `confirmed`, `no-value`, `observing`, `awaiting-owner-review`, or `excluded`. The state is derived only from the latest completed Sales Manager Task, the exact current P8 Owner Decision binding and a matching P9 review carrying both the same Sales Task ID and Owner Decision ID. A valid current lineage without a matching owner review contributes awaiting-owner-review; historical reviews from older task/decision pairs remain historical and cannot change the new contribution state.

`excluded` means only that the current account does not enter the P10 result sample because Sales is incomplete or the authorization/task lineage is invalid; it is not a negative lead score. The UI presents the contribution state separately from cohort membership facts and explicitly says the state is not Revenue, ROI, close probability, purchase intent or a causal explanation. No database state, candidate score, Manager task, CRM record, model call or external action is created by reading this value.

### Outcome Learning actionability / P10.3

P10.3 closes the review-to-action gap without adding another workflow. Outcome Learning now shows the global eligible `sampleCount` against the fixed `minimumSampleSize`, so the boss can see immediately whether the current historical sample has reached the descriptive threshold. The business-channel dimension surfaces the already-declared overlap rule in user-facing copy: one account may belong to multiple company channel roles, so those cohort counts cannot be summed as unique accounts.

When current Owner Queue truth contains result-review work, Outcome Learning exposes a direct pending-review action, and awaiting/observing Business Outcome summary cards use the same bridge. Both set the existing Owner Queue attention to `result-review`; they do not create a new task, queue, stage or approval. Attention filtering is requested from `/api/admin/prospects/account-review-queue?attention=...&limit=500`, so the server filters the derived queue before limiting it. This prevents unrelated higher-priority items in a mixed slice from hiding matching result-review accounts. The server summary remains the full current queue summary, and CRM/outreach/prediction/runtime boundaries remain unchanged.

### Outcome Learning integrity and reachability / P10.4

P10.4 closes stale-read and hidden-record failure modes without changing P10's descriptive contract. Actions that can change P8/P9/P10 truth now refresh Business Outcomes, Outcome Learning and Owner Queue from server truth together. P9/P10 no longer trust caller-provided review-journal ordering: matching reviews are deterministically ordered by `reviewedAt DESC, id DESC`, so an older confirmed review or owner-entered value cannot override a newer observe/no-value decision merely because an input array arrives unsorted. The overall readiness copy also states that meeting the global sample threshold does not imply that every cohort has enough samples.

Owner Queue keeps 10 cards visible initially but can progressively reveal all returned active records; the API and current source both use a 500-account bound. Prospect Candidates similarly keeps 12 cards visible initially while loading the existing bounded 500-candidate result set and can reveal later candidates on demand. Administrator routes now emit `Cache-Control: no-store, private` plus `Pragma: no-cache`, covering private Account Review, owner notes, P9/P10 values and BossAI Manager state. The global delegation listing remains bounded to 200 records but now reports `totalCount` and `truncated`; when coverage is incomplete, an absent card-level delegation is treated as unknown rather than as proof that no employee task exists, and direct duplicate Intelligence/Sales creation is withheld until Account Review resolves the authoritative source-specific state.

### Outcome Learning cohort evidence drill-down / P10.5

P10.5 closes the portfolio-pattern → underlying-account-evidence path with read-only `bossai.prospect-outcome-learning-drilldown.v1`. A requested discovery-source, website-evidence-source, business-channel-role or ICP lexical-coverage cohort is re-derived from the same current latest Sales delegation, exact P8 Owner Decision lineage and matching P9 review truth used by P10. Only currently eligible accounts whose existing membership matches the requested cohort are returned. Items contain only prospect ID, company name, domain and current contribution state and are ordered alphabetically, never by candidate score, business value, close probability or purchase intent.

The administrator endpoint intentionally excludes owner Outcome Review notes, owner-entered business-value amounts and employee monetary claims, then lets the boss open the existing private Account Review for authoritative evidence. The responsive UI initially shows 12 sample accounts and can progressively reveal the remaining bounded items. Any P8/P9/P10 truth refresh clears an open drill-down so a refreshed cohort view cannot remain paired with stale members. `rankingPerformed=false`; no score mutation, new stage, Manager task, model call, CRM record or external action is created.

### Outcome Learning outcome-state evidence drill-down / P10.6

P10.6 makes each cohort result count independently auditable. The existing `bossai.prospect-outcome-learning-drilldown.v1` now accepts an optional exact current contribution-state filter: `confirmed`, `no-value`, `observing`, or `awaiting-owner-review`. Eligibility and cohort membership are still derived first from the latest completed Sales Task plus exact current P8 Owner Decision/P9 review lineage; only then is the state filter applied. The response reports filtered `sampleCount` and unfiltered `cohortSampleCount`, preserving the cohort denominator.

Non-zero state chips open that filtered evidence list; zero counts remain passive. Unknown states fail closed with `HTTP 400 / OUTCOME_LEARNING_STATE_INVALID`. Filtered accounts remain alphabetically ordered and expose only identity plus contribution state. Owner notes, owner-entered values, employee monetary claims, score ranking, probability, CRM, Manager tasks, model calls and external actions remain excluded.

### Dashboard read race safety / P10.7

P10.7 makes overlapping browser reads latest-request-wins. Manual refresh, post-scan quiet refresh, periodic dashboard reads, rapid Owner Queue filter changes, repeated Outcome Learning cohort/state clicks and P8/P9/P10 truth refreshes can overlap. A shared `public/latest-request.js` monotonic gate now protects Dashboard base reads, trade evidence, BossAI delegation coverage, Owner Queue, Business Outcomes, Outcome Learning and drill-down independently. A response or error from an older request sequence cannot write back after a newer sequence exists.

Outcome truth reload also invalidates any in-flight drill-down immediately and again at truth-surface completion, preventing an old sample response from repopulating a cohort after current truth has changed. The gate has executable Node regressions for newest-only acceptance and explicit invalidation, and `check:frontend` validates the shipped helper syntax. This is browser read-order control only: it creates no Runtime, task, workflow state machine, Scheduler, Approval authority, CRM state, model call or external action.

### Account Review read race safety / P10.8

P10.8 extends latest-request-wins protection to the private Account Review authority surface. Rapid account switching can no longer let an older account-detail response or error overwrite the newest requested account. Closing Account Review invalidates any in-flight detail request, so a slow response cannot repopulate a dialog the owner already closed.

BossAI Manager result reads inside Account Review use a separate gate. Starting or reloading Account Review invalidates the previous Manager-result sequence, and closing the dialog invalidates it again. A slow Intelligence/Sales result from account A therefore cannot render inside account B. These guards affect browser presentation only and do not change Account Review truth, Manager execution, Owner Decision authority, CRM authority, or outcome attribution.

The independent Intelligence employee now supports `intelligence.prospect.brief → intelligence.prospect-brief.md`. The Artifact separates verified company facts from inference, lists authority/need/timing/budget/fit gaps, and defensively parses `websiteEvidenceStatus` plus `websiteEvidenceSource`. `browser-rendered` is acquisition provenance only and never overrides the authoritative state: even if another caller bypasses Radar and claims a browser source, `unverified` produces `BLOCKED_PENDING_VERIFIED_WEBSITE_EVIDENCE`; `static-incomplete` produces `BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE`; only reviewed `verified` evidence can produce `READY_FOR_SALES_QUALIFICATION_REVIEW`. It never authorizes sales outreach or CRM creation.

After explicit `READY_FOR_SALES`, Radar can verify `bossai-sales-agent@0.2.0` and create a separate Manager task whose requested capability is `sales.lead.qualify`. The task preserves the Intelligence Manager Task reference, reviewed public prospect facts, `websiteEvidenceStatus`, `websiteEvidenceSource`, structured company contact channels and the human gate. The Sales employee now has a cold-prospect path that does not fabricate a previous conversation, keeps authority/need/timing/budget unknown without evidence, deliberately avoids a follow-up draft that implies prior contact, and does not create or modify CRM records. Sales also independently blocks direct `unverified` or `static-incomplete` prospect qualification attempts rather than trusting a URL or claimed browser-rendered source supplied by a bypassing caller; `static-incomplete` is explicitly reported as `BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE`. For structured contact channels, Sales accepts the source page only when it matches the verified official-site domain and independently rejects LinkedIn personal `/in/` pages; `businessRole=procurement` remains a routing label only and cannot become evidence that the company is buying BossAI's product.

## Trade / customs evidence

Radar now owns a separate local `trade_records` evidence pool for authorized CSV/TSV imports. It maps company-level buyer/importer/supplier/exporter role, country, product/commodity description, HS code, trade date, quantity, value/currency and optional website. Personal email/phone columns are intentionally outside this evidence model. The UI requires an import preview first: `/api/admin/trade-records/preview` returns inferred field mapping, warnings, important fields that were not detected, source columns intentionally not included in the trade-evidence model, and bounded company-level samples with `persisted=false`; only explicit confirmation writes the file. Imports are fingerprint-deduplicated and create neither prospects nor CRM records. Trade history can be filtered by company/product/source text, HS prefix, role, country and date range. Company summaries are now keyed by `company name + country/region` so same-name US/CA histories, amounts and websites are never mixed. Each summary shows first/latest observed date, dated sample count, historical median/min/max interval when enough dates exist, descriptive cadence (`insufficient / single-gap / regular / variable`), historical recency and `REVIEW_FIRST / REVIEW_SOON / REVIEW_LATER` only as a human-review ordering aid. No `intentScore`, `purchaseProbability`, `nextPurchaseDate`, current-need claim or close-probability score is created.

A single trade record with a supplied website can become a prospect candidate only through an explicit owner action followed by the same bounded website verification. The company-summary path can also explicitly group one `company name + country/region` identity into one prospect candidate and privately link all its selected historical records without increasing the base prospect score because of repetition. Same-name multi-country data requires identity selection; multiple historical website domains require human website selection; missing websites require explicit resolution. Company and record website resolvers return only domains that actually produced bounded `websiteContext` evidence—failed/unreadable domains are never shown as verified choices. Web/Maps results are returned for manual selection and Radar never auto-accepts the first result. Selected website promotion still creates only a prospect candidate and requires the Intelligence → human → Sales gates. During administrator-triggered Intelligence review, Radar privately attaches at most eight linked company-level historical trade records; after an authoritative `READY_FOR_SALES_QUALIFICATION_REVIEW` plus human `READY_FOR_SALES`, the same bounded reviewed history may be supplied to `sales.lead.qualify`. Public prospect APIs never expose those linked trade details. Historical trade records remain historical transaction evidence and are never converted into current purchase intent, budget, authority, predicted next order or close probability.

## Manager migration

Active delegation now uses:

```text
verified non-Demo opportunity
→ exact Intelligence Agent readiness check
→ POST /api/manager/tasks
→ bossai-intelligence-agent
→ mandatory owner approval
→ reviewable result
```

Retired from active Radar source:

```text
agent-content-employee
agent-private-domain-employee
agent-exposure-employee
POST /api/agents/:id/run
GET /api/workforce/runs/:id
```

The existing local `bossai_run_id` compatibility column now stores a Manager Task ID.

## Readiness contract

Radar requires:

```text
Intelligence review:
id=bossai-intelligence-agent
version=0.3.0
signatureStatus=verified
status=enabled
healthStatus=healthy
permissions include runtime.run, events.subscribe, events.publish

Sales qualification after human READY_FOR_SALES:
id=bossai-sales-agent
version=0.2.0
signatureStatus=verified
status=enabled
healthStatus=healthy
permissions include runtime.run, events.subscribe, events.publish
```

Demo opportunities, missing authentication and unsigned plugin state fail before task creation.

## Truth boundary

AI may explain evidence but cannot change Radar deterministic scores or decision thresholds. Demo evidence cannot support real business work. Completed employee work means a reviewable result, not scanning, lead mutation, customer outreach or report publication.

## Validation

```text
Radar full tests: 171/171
Radar build, frontend syntax and git diff whitespace: passed
Radar i18n: 690 used keys / 946 bilingual entries
Radar Manager migration verification: passed
Business website parser/crawler safety tests: passed, including wildcard and BossAI-specific robots rules, same-site bounds, pre-request cross-site redirect blocking, declared Sitemap traversal, bounded same-site /sitemap.xml fallback, and JavaScript-shell evidence-completeness detection
Prospect discovery / official-site enrichment / isolated candidate persistence / no-auto-CRM tests: passed
Optional official Brave Web Search discovery adapter: passed; no Google/Bing result-page scraping
Optional Google Places Text Search (New) map discovery adapter: passed with minimal field mask, server-side key only, website-required candidates and official-site re-verification; provider remains disabled until explicitly configured
Prospect query-direction planner: passed; deterministic local fallback plus optional one-shot BossAI Central AI Gateway planning, with no automatic collection or CRM mutation
Official-site-linked public company-channel evidence: passed; company/showcase LinkedIn links, other official-site-linked public profiles, JSON-LD contact points and WhatsApp Business URLs may be preserved, while LinkedIn personal `/in/` profiles are excluded
Owner-defined ICP website coverage: passed; persisted separately from candidate evidence score and never treated as purchase/close probability
Browser-rendered evidence supplementation: 5/5 focused regressions passed, including owner-request queue idempotency, no automatic Browser Runtime, same-host validation, capture-time/source validation, raw rendered HTML non-persistence, sufficient-evidence upgrade, sparse-evidence continued blocking, direct READY_FOR_SALES static-incomplete rejection and real HTTP entry coverage
Prospect Account Review / Customer 360: 5/5 focused unit + real HTTP regressions passed; unverified/static-incomplete/owner-decision/Sales-result stages derive from existing truth, private linked trade rows and Manager references join only in the administrator view, the public prospect response stays free of those private records, and CRM/outreach/purchase-intent/close-probability/next-order claims remain false
Owner Account Review Queue / P4: 5/5 focused queue + real HTTP regressions passed; owner decision outranks evidence/action/waiting work independent of candidate score, Sales completion remains a result-review task, rejected accounts are closed, administrator filtering is enforced, dashboard static entry contains the queue, queue-changing actions refresh server truth, and the shipped frontend no longer references nonexistent `loadData()`
Owner Decision Journal / P5: 11/11 focused owner-decision/Account Review/Manager/browser HTTP regressions passed; valid reason sets are decision-specific, `other` requires a note, stale decisions are atomic no-ops, direct READY_FOR_SALES/REJECTED PATCH writes fail closed, approval still requires the authoritative Intelligence handoff marker, rejection is journaled, decision notes stay private, the shipped UI contains the owner-decision dialog and no longer contains card-level approve/reject shortcuts or `patchWithAdminKey`
Sales Qualification Handoff Brief / P6: 10/10 focused parser + Account Review + real Manager HTTP regressions passed; no-task and incomplete-task states fail explicitly, Chinese/English Sales markers parse deterministically, UNKNOWN remains unknown, non-UNKNOWN values are Sales-reported only, future unrecognized formats fall back to raw result, the brief is non-persistent, prior owner approval is context only, and outreach/CRM authorization remains false
Execution Exception Desk / P7: 9/9 focused queue + Account Review + real HTTP retry regressions passed; failed/cancelled Intelligence and Sales tasks are surfaced separately from ordinary action-ready work, Manager error provenance is visible, owner-triggered retry is limited to the latest failed/cancelled task, retry operation IDs are server-managed from the failed Manager Task reference, repeated retry is idempotent, the queue moves from exception to waiting after retry, `automaticRetryExecuted=false`, and no CRM/outreach action occurs
Decision-to-Sales Authorization Lineage / P8: passed across unit, database migration, Account Review/queue, Handoff, Manager delegation, legacy READY fail-closed/reconfirmation and Sales retry regressions; Sales qualification requires an approve-sales Decision tied to the exact current Intelligence Manager Task, each new Sales delegation persists that Decision ID, legacy unbound rows are not backfilled, private owner notes are not sent to Sales, and the real legacy READY HTTP path creates zero Manager tasks until the owner explicitly reconfirms authorization
Outcome / Business Value Attribution / P9: passed across deterministic attribution, owner-input validation, append-only database journal, atomic stale-task rejection, owner queue closure/observation, shipped dashboard entry and real BossAI Manager HTTP regressions; completed Sales is REPORTED only, an employee `100000 USD` value claim stays non-numeric/unconfirmed, owner-entered `4200 USD` is the only value aggregated in the real-entry test, invalid lineage and incomplete Sales fail closed, stale reviews do not attach to newer tasks, confirmed/no-value outcomes close active owner work while observe remains reviewable, and public prospect output leaks no outcome note/value
Outcome Learning / P10 through P10.8: focused learning regressions plus Account Review unit/real-HTTP and real BossAI Manager flow assertions pass; confirmed/no-value/observing/awaiting samples bucket correctly, employee `100000 USD` claims are excluded from numeric aggregation, only owner-entered currency values aggregate, no-value never becomes revenue zero, small cohorts remain insufficient, stale lineage is excluded, and single-account membership/contribution remains non-predictive. P10.4 verifies deterministic newest-review selection for unsorted journals, synchronized result truth surfaces after P8/P9 changes, bounded progressive queue/candidate reachability, private no-store responses, and delegation `totalCount/truncated` fail-closed behavior. P10.5 adds current-eligible cohort drill-down and P10.6 makes each non-zero outcome-state count directly verifiable through exact `state` filtering while preserving `cohortSampleCount`. P10.7 adds executable latest-request gating across dashboard reads. P10.8 extends the same protection to Account Review and its Manager-result pane: account switching and dialog close invalidate older detail/result reads, stale responses/errors cannot cross account boundaries, and server-side Account Review/Manager/Owner Decision/CRM/outcome authority remains unchanged.
Canonical BossAI OS browser tool inspection: `browser.read` contract exists but currently reports `executionAvailable=false`; no OS file was changed and Radar does not represent browser execution as available
Prospect → Intelligence Manager delegation test: passed with crmRecordCreated=false
Authoritative Intelligence handoff marker + explicit READY_FOR_SALES gate + Sales sales.lead.qualify delegation test: passed; completed-but-blocked Intelligence results remain blocked and CRM lead table remains empty
Trade/customs CSV/TSV parser, no-write preview/field mapping, filtered query API, company+country historical identity summaries, descriptive cadence/review-priority calculations, company-level prospect grouping, company website ambiguity/resolution gates, dedupe database, real HTTP import, PII-column exclusion, no-auto-prospect/no-auto-CRM, private prospect↔trade relation, private Intelligence/Sales handoff and public-prospect non-disclosure tests: passed; no next-purchase prediction or intent score exists
Live bounded TradeMate website collection: passed without database write; latest 2026-08-17 validation completed in about 2.14 seconds, returned one public page with `websiteEvidenceStatus=static-incomplete`, `renderingHint=javascript-likely`, no collector error and no invented email/phone/company-profile/business-messaging/product signals. `databaseWritten=false`. This live result confirms that a JavaScript-heavy site is treated as verified-but-evidence-incomplete rather than as absent data or Sales-ready fact. Earlier no-write simulated authorized trade-record → website-verification → candidate validation produced candidate score 73 plus explicit historical-trade and JavaScript-evidence warnings; explicit ICP terms 外贸获客 / 潜在客户 / 客户跟进 produced 67% lexical website coverage (2/3), which is not a buyer-intent claim
Current local Intelligence Agent source: 0.4.0. The full current local suite is 60/60 PASS and architecture verification passes; the prospect/browser-evidence regressions are included in that green suite. Concurrent SKU work that had previously left a checkpoint regression failing has since advanced independently and is now green. Radar's installed-plugin readiness contract remains exactly pinned to `bossai-intelligence-agent@0.3.0` until a separately governed registration/version migration occurs; the local 0.4.0 source is not represented as already installed, signed or enabled.
Intelligence prospect review now parses bounded structured company contact channels plus `websiteEvidenceSource`, requires each channel source page to match the verified official-site host, rejects LinkedIn `/in/` personal pages, states that confidence/procurement labels do not prove purchase intent, and keeps browser-rendered static-incomplete evidence blocked.
Sales Agent tests: 10/10
Sales Agent architecture verification: passed
Sales cold-prospect route: sales.lead.qualify confirmed; no fabricated prior communication, unverified/static-incomplete website evidence is defensively blocked, browser-rendered provenance cannot override status, structured channel source pages must match the verified website host, LinkedIn personal `/in/` values are rejected, and no CRM mutation claim is made
Current Sales `verify:agent-manager`: not claimed passed in this batch. Its official script begins by rebuilding `bossai-os/apps/api`, which would modify the external BossAI OS checkout and conflicts with this batch's explicit no-OS-modification constraint. The two previously reported missing plugin integrity/loader dist files are currently present, likely due to independent OS work, but no full Manager Conformance pass is inferred from their presence.
Real BossAI Manager Reddit/GEO Artifact delivery/readback: historical pass
Digital Employee Center scan: passed
Constitution migration/release claim: blocked — latest 2026-08-19 rerun remains `CONSTITUTION_INTEGRITY_FAILED`. The harness reports canonical root-public-key/trusted-fingerprint mismatch, canonical/project root-key mismatch, manifest version/SHA/rootKeyId/requiredMachineChecks mismatch, signature keyId mismatch, Ed25519 verification failure, signed-manifest mismatch, plus canonical SHA-256 e7111b21c53e0cbbb6d23631887743acdb952f92878bd134e3bc3556713751b4 versus installed signed-Manifest expectation 102c41129883bace62a1b4c7b8a4bdf713c09e426f94c7d5ac0bf8aa66d47e96. No Constitution, Manifest, root key, hash lock or signature was modified or bypassed.
Unsigned enable rejection: passed
Offline approval and restart recovery: passed
```

Full project and platform validation is recorded in `Atlas/INTELLIGENCE_AGENT_MANAGER_INTEGRATION_2026-08-05.md`.

## Release truth

```text
productionReady=false
actuallyLaunched=false
realUserValidated=false
formalAIEmployeeRegistered=false
releaseSignatureCreated=false
constitutionReleaseGatePassed=false
```

The Constitution verification remains fail-closed. The installed expected SHA-256 is `102c41129883bace62a1b4c7b8a4bdf713c09e426f94c7d5ac0bf8aa66d47e96`, while the current verification run resolved the canonical Constitution to `e7111b21c53e0cbbb6d23631887743acdb952f92878bd134e3bc3556713751b4`. This project did not change or bypass the Constitution chain.
