# BossAI Radar Skill and MCP Integration Guide

BossAI Radar Lite v0.6 provides two agent-facing layers:

1. **MCP Server** for structured tools and reusable prompts;
2. **SKILL.md + JSON CLI** for OpenClaw, Hermes, or agents without MCP support.

All integrations use the same Radar HTTP API and business rules.

## Prepare Radar

```powershell
cd C:\Users\42059\bossai-radar-lite
npm install
npm run build
npm start
```

Verify the service:

```powershell
node dist\src\agent-cli.js health
```

Default endpoint:

```text
http://127.0.0.1:3080
```

## MCP Server

```powershell
node C:\Users\42059\bossai-radar-lite\dist\src\mcp-server.js
```

The MCP server uses stdio and is normally launched by the agent host.

### Default read-only tools

- `radar_health`
- `radar_overview`
- `radar_list_opportunities`
- `radar_list_evidence`
- `radar_latest_report`
- `radar_lead_stats`
- `radar_list_leads`
- `radar_followups`
- `radar_followup_draft`

Optional tools are exposed only when explicitly enabled:

```env
RADAR_MCP_ALLOW_SCAN=true
RADAR_MCP_ALLOW_LEAD_WRITE=true
```

They add:

- `radar_run_scan`
- `radar_update_lead`
- `radar_add_lead_activity`

The MCP interface never exposes lead deletion.

### Environment

```env
RADAR_API_URL=http://127.0.0.1:3080
RADAR_ADMIN_API_KEY=
RADAR_MCP_LANGUAGE=en
RADAR_MCP_TIMEOUT_MS=20000
RADAR_MCP_ALLOW_SCAN=false
RADAR_MCP_ALLOW_LEAD_WRITE=false
```

Use a strong administrator key and HTTPS or a trusted private network when Radar is not running on the same machine.

## Codex

Verified command:

```powershell
codex mcp add `
  --env RADAR_API_URL=http://127.0.0.1:3080 `
  --env RADAR_MCP_LANGUAGE=en `
  bossai-radar -- `
  node C:\Users\42059\bossai-radar-lite\dist\src\mcp-server.js
```

Check configuration:

```powershell
codex mcp list
codex mcp get bossai-radar
```

A TOML example is available at `integrations/mcp/codex-config.toml.example`.

## Claude Code

Verified command:

```powershell
claude mcp add --scope project `
  -e RADAR_API_URL=http://127.0.0.1:3080 `
  -e RADAR_MCP_LANGUAGE=en `
  bossai-radar -- `
  node C:\Users\42059\bossai-radar-lite\dist\src\mcp-server.js
```

Claude Code is a strong fit for turning approved Radar opportunities into PRDs, code, tests, and delivery documentation.

## Hermes Agent

Verified MCP command:

```powershell
hermes mcp add bossai-radar `
  --command node `
  --env RADAR_API_URL=http://127.0.0.1:3080 RADAR_MCP_LANGUAGE=en `
  --args C:\Users\42059\bossai-radar-lite\dist\src\mcp-server.js
```

Check it with:

```powershell
hermes mcp list
hermes mcp test bossai-radar
```

Install the Hermes skill directly from GitHub:

```powershell
hermes skills install https://raw.githubusercontent.com/liufeng1976/bossai-radar-lite/main/skills/hermes/bossai-radar/SKILL.md
```

## OpenClaw

The highest-precedence workspace skill location is:

```text
<OpenClaw workspace>/skills/bossai-radar
```

Install with the bundled copier:

```powershell
npm run skill:install -- openclaw --workspace C:\path\to\openclaw-workspace
```

The installer copies skill files only. It does not download software, start services, or change OpenClaw configuration.

Skill source:

```text
skills/openclaw/bossai-radar/SKILL.md
```

OpenClaw should prefer MCP tools. If MCP is unavailable, the skill uses the JSON CLI fallback.

## JSON CLI fallback

```powershell
node dist\src\agent-cli.js overview
node dist\src\agent-cli.js opportunities --limit 10
node dist\src\agent-cli.js evidence --category customer-support
node dist\src\agent-cli.js followups --lang en --days 7
node dist\src\agent-cli.js draft --lead-id <lead-id>
```

Write commands remain disabled unless explicitly enabled:

```env
RADAR_SKILL_ALLOW_SCAN=true
RADAR_SKILL_ALLOW_LEAD_WRITE=true
```

Every result is JSON with an `ok` field.

## Recommended BossAI agent roles

```text
OpenClaw     Messaging command entry point
Hermes      Long-running orchestration and recovery
Radar Lite  Evidence, opportunity scoring, leads, follow-ups
ChatGPT     CEO adviser and commercial decision layer
Claude Code PRDs, complex implementation, and review
Codex       Engineering, testing, packaging, and release
```

## Security rules

- read-only by default;
- fresh scans require an explicit user request;
- show current and proposed values before a lead update;
- customer messages remain human-reviewed;
- never expose administrator keys, `.env`, SQLite files, or contact exports;
- never delete leads through an agent;
- never present Demo data as live proof;
- commercial operation of Lite still requires separate written BossAI authorization.
