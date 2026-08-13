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
12. Radar tests pass from the real server entry point.

This migration does not claim production deployment, formal Agent registration, release signing, generalized service-to-service identity, automatic external actions or real-user validation.
