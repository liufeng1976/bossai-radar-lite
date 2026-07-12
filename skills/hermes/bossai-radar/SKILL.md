---
name: bossai-radar
description: Use BossAI Radar Lite as the evidence and sales-operations layer for long-running Hermes workflows.
---

# BossAI Radar for Hermes

Use BossAI Radar as a bounded tool inside a larger workflow. Radar discovers and scores opportunities, stores commercial leads, and generates human-reviewed follow-up drafts. Hermes may orchestrate the sequence, but it must not replace Radar's deterministic evidence and permission gates.

## Interfaces

Preferred: configure the local stdio MCP server:

```bash
node "$RADAR_LITE_HOME/dist/src/mcp-server.js"
```

Fallback: use the JSON CLI:

```bash
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" <command> [options]
```

## Recommended Hermes workflows

### Opportunity to product

1. Read `radar_overview`.
2. Read `radar_list_opportunities`.
3. Inspect `radar_list_evidence` for the selected category.
4. Require at least two sources before treating a BUILD recommendation as cross-source validated.
5. Produce a PRD, seven-day MVP plan, and first-sale experiment.
6. Delegate implementation to a coding agent only after the owner approves the opportunity.

### Daily sales operations

1. Read `radar_followups`.
2. Handle OVERDUE, TODAY, HOT UNSCHEDULED, then UPCOMING.
3. Generate one `radar_followup_draft` at a time.
4. Pause for human approval before any customer-facing communication or lead mutation.
5. If approved and write tools are enabled, update the lead and record an activity.

## Long-running task rules

- Re-check Radar state before every state-changing step.
- Do not reuse an old draft after the lead status or quote changes.
- Do not run repeated scans in a loop; one scan per explicit owner request is the default.
- Stop and report source failures rather than hiding them.
- Never delete leads or modify the SQLite database directly.
- Keep Demo evidence separate from live evidence.
- Commercial use requires separate BossAI authorization.
