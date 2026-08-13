# BossAI Radar Lite Current State

Updated: 2026-08-10

## Product identity

```text
Product: BossAI Radar Lite
Version: 0.7.1
Path: C:\Users\42059\Projects\bossai-radar-lite
Classification: AI Assistant / professional intelligence workbench
Local URL: http://127.0.0.1:3080
Completion Level: 2
```

## Current authority boundary

Radar Lite remains authoritative for public-source collection, SSRF protection, source health, evidence records and fingerprints, deterministic scoring, `BUILD / SELL_SERVICE / WATCH / IGNORE`, reports, leads and local SQLite.

Persistent intelligence employee work is packaged separately as:

```text
bossai-intelligence-agent@0.3.0
```

BossAI OS remains the only Agent Platform. Radar does not install, sign, enable, disable or run the plugin.

## Reddit/GEO structured evidence handoff

Radar Lite already owns the real Reddit Search JSON collector. Each scan can now enrich up to three observed subreddits with public Sidebar/About, rules and pinned-post context, using a 24-hour success cache and a 15-minute failure cache. The current integration passes bounded non-DEMO evidence to `bossai-intelligence-agent@0.3.0` as one `EVIDENCE_JSON` record per source item, including title, bounded excerpt, URL, derived subreddit, timestamp, engagement, Radar score, category, tags and query.

Explicit Reddit/GEO objectives are routed by the employee to `intelligence.reddit-geo.brief`. Generic opportunity objectives are not reclassified merely because a Reddit item appears in the evidence list.

Radar still does not let the employee crawl Reddit, write Radar records or change deterministic scores. Sidebar/About, rules and pinned-post context are now collected when public endpoints respond. Flair and identity-disclosure interpretation still require human review before downstream content becomes draft-ready.

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
id=bossai-intelligence-agent
version=0.3.0
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
Radar full tests: 58/58
Radar build and frontend syntax: passed
Radar i18n: 344 used keys / 385 bilingual entries
Radar Manager migration verification: passed
Intelligence Agent tests: 9/9
BossAI Runtime Conformance: 7/7
Real BossAI Manager Reddit/GEO Artifact delivery/readback: passed
Digital Employee Center scan: passed
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

The Constitution verification remains fail-closed. The installed expected SHA-256 is `102c41129883bace62a1b4c7b8a4bdf713c09e426f94c7d5ac0bf8aa66d47e96`, while the canonical Constitution currently resolves to `d294c952877b966586d74ec8197b3096b4db2cccaccf883cd5d300988f7fe5cc`. This project did not change or bypass the Constitution chain.
