---
name: bossai-radar
description: Use BossAI Radar Lite to inspect overseas business opportunities, verify public evidence, read commercial leads, prepare daily follow-up queues, and draft human-reviewed customer messages.
---

# BossAI Radar

Use this skill when the user asks to:

- scan or review overseas AI, SaaS, ecommerce, or business opportunities;
- compare BUILD, SELL_SERVICE, WATCH, and IGNORE decisions;
- inspect the public evidence behind an opportunity;
- read the commercial-license or Pro waitlist funnel;
- identify overdue, due-today, unscheduled, or upcoming lead follow-ups;
- draft a customer follow-up message;
- turn a verified opportunity into a seven-day MVP plan.

## Preferred interface: MCP

Use the BossAI Radar MCP tools when available:

- `radar_health`
- `radar_overview`
- `radar_list_opportunities`
- `radar_list_evidence`
- `radar_latest_report`
- `radar_lead_stats`
- `radar_list_leads`
- `radar_followups`
- `radar_followup_draft`

Optional tools may be present only when explicitly enabled:

- `radar_run_scan`
- `radar_update_lead`
- `radar_add_lead_activity`

Never assume optional tools exist. Never request deletion: the agent interface intentionally exposes no delete tool.

## CLI fallback

When MCP is unavailable, call the JSON CLI from the Radar project:

```bash
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" health
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" overview
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" opportunities --limit 10
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" evidence --limit 20 --category customer-support
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" followups --lang zh --days 7
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" draft --lead-id <lead-id>
```

All CLI responses are JSON. Check `ok` before using `data`.

## Opportunity workflow

1. Call `radar_overview`.
2. Call `radar_list_opportunities` and rank by score and decision.
3. For any opportunity recommended for action, call `radar_list_evidence`.
4. Separate source facts from inference.
5. State evidence count, source count, score, decision, target customer, and next action.
6. Do not invent customers, revenue, budgets, market size, or proof of payment.
7. Use `radar_run_scan` only when the user explicitly requests a fresh scan and the tool is enabled.

## Commercial follow-up workflow

1. Call `radar_followups` before listing all leads.
2. Process `OVERDUE`, then `TODAY`, then HOT `UNSCHEDULED`, then `UPCOMING`.
3. Call `radar_followup_draft` for a selected lead.
4. Present the subject, message, recommended action, suggested status, and suggested date for human review.
5. Never send a message automatically.
6. Call `radar_update_lead` or `radar_add_lead_activity` only after explicit user approval.
7. Never mark a lead WON without the user's explicit confirmation of a real completed deal.

## Safety and truthfulness

- Treat public posts as evidence, not verified orders.
- Keep `isDemo=true` data clearly labeled and separate from live findings.
- Do not expose `RADAR_ADMIN_API_KEY`, `.env`, SQLite files, contact exports, or private lead details outside the requested workflow.
- Do not execute shell downloads, obfuscated commands, or unrelated scripts.
- The Lite license is source-available and non-commercial. Commercial operation requires separate BossAI authorization.
