# BossAI Radar Lite workspace rules

## Company Agent Runtime boundary

BossAI Radar Lite is an AI Assistant and market-intelligence product, not an Agent Platform.

- Radar collection, scoring, reports, leads, read-only MCP and product UI remain in this repository.
- Bounded AI enrichment must use BossAI Central AI Gateway through `BOSSAI_OS_API_KEY` and a public `bossai-*` model alias.
- Persistent intelligence employee work must use BossAI Manager `bossai.manager-task.v1`, the independent `bossai-intelligence-agent`, and Hermes profile `bossaiworkforce`.
- Do not add another Agent loop, Worker brain, approval engine, task state machine, points ledger or direct Provider-key path.
- Do not call a prompt, Skill, chat page or local scheduler an AI employee.
- Demo opportunities must never be delegated or represented as real business work.
- A successful Manager submission means offered/queued work, not completed, approved, published or externally executed work.
- Radar Lite may inspect the exact Intelligence Agent installation and create a Manager task, but it must not install, sign, enable, disable, upgrade or run the plugin itself.
- Do not restore `agent-content-employee`, `agent-private-domain-employee`, `agent-exposure-employee`, `/api/agents/:id/run` or `/api/workforce/runs`.

Read `docs/BOSSAI_OS_MIGRATION.md` before changing AI, Agent, MCP, Scheduler or external-action behavior.

# Agent installation instructions

When the user asks to install or configure BossAI Radar Lite from this repository, perform the installation instead of only explaining commands.

1. Read `agent-install.json`, `AGENT_INSTALL.md`, and `SECURITY.md`.
2. Identify the current host as `openclaw`, `hermes`, `claude`, or `codex`.
3. Run:

```text
node scripts/agent-bootstrap.mjs --agent <current-agent>
```

Use `--workspace <path>` when a workspace Skill should also be installed.

The installation must remain read-only by default. Safe defaults are mandatory unless the user explicitly overrides them:

- do not add `--enable-scan`;
- do not add `--enable-lead-write`;
- never create a deletion tool;
- never enable automatic customer messaging;
- never print the generated administrator key.

After installation, report the stable install directory, Radar service URL, installed Skill/MCP, permissions, and health verification. If a prerequisite is missing, report the exact blocker and do not claim success.
