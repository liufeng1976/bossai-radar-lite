# Radar Lite / Intelligence Agent Manager Integration

Date: 2026-08-05  
Radar: `bossai-radar-lite@0.7.1`  
Plugin: `bossai-intelligence-agent@0.1.0`  
Status: Completion Level 2 technical integration

## Product result

Radar Lite now delegates verified non-Demo opportunities through BossAI Manager instead of obsolete built-in employee and Workforce Run endpoints.

```text
Radar opportunity
→ exact plugin readiness
→ POST /api/manager/tasks
→ bossai-intelligence-agent
→ explicit acceptance
→ owner approval
→ reviewable result
```

## Readiness gate

Task creation requires:

```text
exact plugin ID
version 0.1.0
verified signature
enabled installation
healthy Runtime
runtime.run permission
events.subscribe permission
events.publish permission
```

Unsigned state is rejected before Manager task creation.

## Data boundary

Radar retains all source, evidence, deterministic score, opportunity, report, lead and SQLite data. The Manager objective contains only bounded opportunity facts and up to 12 evidence summaries. Plugin-private pending state remains in BossAI OS Platform Storage.

The compatibility field `bossai_run_id` stores the Manager Task ID and does not create a second Runtime.

## Retired architecture

Active Radar source no longer uses:

```text
agent-content-employee
agent-private-domain-employee
agent-exposure-employee
POST /api/agents/:id/run
GET /api/workforce/runs/:id
GET /api/workforce/runs/:id/events
```

## Truth rules

- Demo opportunity delegation is blocked.
- AI cannot change Radar deterministic scores or thresholds.
- Missing evidence is marked rather than invented.
- Completed means a reviewable result exists.
- No scan, Radar mutation, lead mutation, outreach or report publication is claimed.

## Actual validation

```text
Radar Manager client and real server tests: 7/7
Intelligence Agent unit tests: 5/5
Plugin architecture verifier: passed
Digital Employee Center scan: passed
Unsigned enable rejection: passed
NDJSON Runtime lifecycle: passed
Manager acceptance and approval: passed
Approval while offline: passed
Restart recovery: passed
Result delivery: passed
Radar database access from plugin: false
External actions executed: false
```

Final regressions passed:

```text
Radar build: passed
Radar full tests: 56/56
Radar frontend syntax: passed
Radar i18n: 343 used keys / 384 bilingual entries
Radar Manager migration boundary: passed
BossAI OS active API tests: 99/99
BossAI OS Web tests: 27/27
BossAI OS Typecheck: passed
Agent / Portfolio / Merge / AI Gateway / OpenAPI boundaries: passed
registeredAgents: 0
```

## Release truth

```text
completionLevel=2
productionReady=false
actuallyLaunched=false
realUserValidated=false
formalAIEmployeeRegistered=false
releaseSignatureCreated=false
```
