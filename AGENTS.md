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
