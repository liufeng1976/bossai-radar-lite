# BossAI Radar Lite Decisions

Updated: 2026-08-05

## D-001 — Radar remains the intelligence workbench

Radar Lite owns source collection, evidence, deterministic scores, opportunity decisions, reports, leads and SQLite. It is not an Agent Platform.

## D-002 — Persistent work uses the independent Intelligence Agent

All persistent intelligence employee delegation targets only:

```text
bossai-intelligence-agent@0.3.0
```

through BossAI Manager `bossai.manager-task.v1`.

## D-003 — Exact plugin readiness is mandatory

Before creating a Manager task Radar checks exact ID, version, verified signature, enabled state, healthy state and Manager permissions. Radar never installs or enables the plugin itself.

## D-004 — Old employee paths are retired

The following cannot return to active source:

```text
agent-content-employee
agent-private-domain-employee
agent-exposure-employee
POST /api/agents/:id/run
GET /api/workforce/runs/:id
```

## D-005 — Deterministic scoring cannot be overridden

AI explanations may not change Radar pain, payment, competition, urgency, total scores or `BUILD / SELL_SERVICE / WATCH / IGNORE` thresholds.

## D-006 — Local compatibility fields remain references only

The existing `bossai_run_id` field remains for storage compatibility but contains the Manager Task ID. Radar stores no plugin-private execution state.

## D-007 — No external action

Delegation creates a reviewable intelligence result only. It does not start source scans, modify evidence or leads, contact customers or publish reports.

## D-008 — Technical integration is Level 2 only

Passing tests does not imply production readiness, launch, real-user validation, release signing or formal AI Employee registration.

## D-009 — Reddit/GEO uses bounded Manager evidence, not direct employee collection

Radar may serialize selected evidence as `EVIDENCE_JSON` in a Manager objective. Each record is bounded and retains its URL, time, engagement, Radar score, tags and derived subreddit. The Intelligence employee may interpret candidate signals but cannot write them back or change Radar scores.

## D-010 — Explicit intent controls Reddit/GEO routing

A task uses `intelligence.reddit-geo.brief` only when its human objective explicitly requests Reddit, subreddit, GEO, AI-search or brand-mention work. Merely attaching a Reddit evidence record does not override a generic opportunity, evidence, competitor or daily-brief objective.
