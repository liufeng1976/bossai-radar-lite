---
name: bossai-radar
description: "BossAI Radar: evidence-backed overseas opportunity discovery, commercial lead pipeline, and human-reviewed sales follow-up."
metadata:
  openclaw:
    homepage: https://github.com/liufeng1976/bossai-radar-lite
    requires:
      bins:
        - node
---

# BossAI Radar for OpenClaw

Use this skill for overseas opportunity scans, opportunity evidence review, commercial lead triage, and daily follow-up preparation.

## Startup check

BossAI Radar Lite must already be running. Prefer MCP tools when the OpenClaw host exposes them. Otherwise use the CLI fallback:

```bash
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" health
```

If health fails, report that Radar is not running. Do not start unrelated services or download software automatically.

## Read-only commands

```bash
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" overview
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" opportunities --limit 10
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" evidence --limit 20 --category analytics-research
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" report --lang zh
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" lead-stats
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" leads --priority HOT --limit 20
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" followups --lang zh --days 7
node "$RADAR_LITE_HOME/dist/src/agent-cli.js" draft --lead-id <lead-id>
```

Parse stdout as JSON and require `ok=true` before using `data`.

## WeChat or messaging workflow

When the owner sends a message such as “扫描今天的海外机会”:

1. Check health.
2. If the user explicitly asked for a new scan and scan permission is enabled, run the scan tool or CLI command.
3. Read opportunities and supporting evidence.
4. Reply with the top three decisions, evidence strength, and exact next actions.

When the owner sends “今天该跟进谁”:

1. Read `radar_followups` or the `followups` CLI command.
2. Order the reply as OVERDUE → TODAY → HOT UNSCHEDULED → UPCOMING.
3. Include the reason and recommended action.
4. Generate a draft only for the selected lead.
5. Never send the customer message without owner confirmation.

## Mutations

Live scanning requires `RADAR_MCP_ALLOW_SCAN=true` for MCP or `RADAR_SKILL_ALLOW_SCAN=true` for CLI.

Lead changes require `RADAR_MCP_ALLOW_LEAD_WRITE=true` for MCP or `RADAR_SKILL_ALLOW_LEAD_WRITE=true` for CLI.

Before any lead update:

- show the current state;
- show the proposed state;
- obtain explicit approval;
- record a follow-up activity after the action.

Never delete leads, expose keys, or mark a lead WON without explicit proof and owner confirmation.

## Evidence rules

- Public posts are signals, not verified orders.
- Preserve source links and absolute dates when available.
- Keep Demo data clearly labeled.
- Do not invent revenue, customers, budgets, or market size.
- Commercial use of Lite requires separate BossAI authorization.
