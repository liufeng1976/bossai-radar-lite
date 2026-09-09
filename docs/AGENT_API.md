# BossAI Radar Lite Agent API

Radar Lite exposes the same business evidence through three machine surfaces:

- HTTP API for any tool-using AI Agent;
- stdio MCP for Codex, Claude Code, Hermes and other MCP hosts;
- JSON CLI for environments without MCP.

## Discovery

With the Radar service running on the default local address:

```text
GET http://127.0.0.1:3080/.well-known/bossai-agent-api.json
GET http://127.0.0.1:3080/api/agent/openapi
GET http://127.0.0.1:3080/api/agent/capabilities
```

The discovery contract is `bossai.agent-api.v1`.

## Safe BossAI Agent operations

The manifest marks these operations as eligible for the BossAI OS `connector.read` path:

```text
bossai-radar-lite:capabilities
bossai-radar-lite:overview
bossai-radar-lite:opportunities
bossai-radar-lite:prospects
bossai-radar-lite:evidence
bossai-radar-lite:runs
bossai-radar-lite:latest-report
```

These operations are read-only. They may return public evidence and locally stored Radar state, but they do not send messages, mutate customer accounts, publish content, buy anything or create a second BossAI task authority.

## Write/delegation boundary

Radar already has write operations such as scan, lead/prospect administration and BossAI OS delegation. They remain unavailable through the default `connector.read` surface, but the discovery manifest now exposes them as **governed write operations** so an Agent can understand exactly what additional authority is required.

- live scan: requires Radar write authorization; MCP additionally requires `RADAR_MCP_ALLOW_SCAN=true`;
- lead mutation over MCP: requires `RADAR_MCP_ALLOW_LEAD_WRITE=true` and remains human-reviewed;
- opportunity delegation: requires `RADAR_ADMIN_API_KEY`, configured BossAI OS employee access and human review;
- prospect delegation: additionally requires verified prospect evidence before the BossAI OS task can be queued.

Inside BossAI OS, an Agent that needs to turn Radar evidence into persistent work should use the existing Manager/Agent contracts. Radar's delegation endpoints call BossAI OS; Radar does not become an Agent Runtime.

## Meaning of "Agent can operate Radar"

An AI Agent may freely discover and call the operations its credentials and host policy allow. This does not grant the Agent permission to bypass admin authentication, human approval, BossAI OS Tool policy, audit or commercial entitlement.
