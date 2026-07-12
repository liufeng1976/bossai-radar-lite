# Claude Code installation instructions

When the user asks to install BossAI Radar Lite, do the work directly:

1. Read `agent-install.json`, `AGENT_INSTALL.md`, and `SECURITY.md`.
2. Run the self-installer:

```text
node scripts/agent-bootstrap.mjs --agent claude --scope user
```

Add `--workspace <current-project>` when the portable Skill should also be copied into `.claude/skills/bossai-radar`.

Keep the installation read-only by default. Do not enable `--enable-scan` or `--enable-lead-write` unless the user explicitly requests those permissions. Never expose the generated administrator key, create a deletion tool, or enable automatic customer messaging.

Verify the Radar health endpoint and the `bossai-radar` MCP registration before reporting success. Report exact blockers instead of providing a false success message.
