# GitHub Public Launch Checklist

This checklist converts `public-release.json` into the GitHub repository metadata and release actions required for BossAI Radar Lite.

## Repository metadata

**Description**

> Source-available AI market-intelligence radar for public evidence, deterministic opportunity scoring, prospect research, MCP and governed BossAI OS handoffs.

**Topics**

`market-intelligence`, `business-intelligence`, `competitive-intelligence`, `mcp`, `ai-agent`, `opportunity-radar`, `startup-research`, `reddit`, `hacker-news`, `prospect-research`

## Pre-release gate

Run:

```bash
npm run release:check
```

The exact release commit must pass the public-release gate, build, tests, frontend checks, bilingual i18n checks, BossAI migration boundary and release packaging checks.

## GitHub release

1. Keep the release commit limited to reviewed Radar/product/public-release changes; do not sweep unrelated local work into the release.
2. Confirm `public-release.json.product.version` equals `package.json.version`.
3. Use release title `BossAI Radar Lite v{version}`.
4. Generate release notes with `.github/release.yml`, then verify that no private lead, owner-decision, trade, outcome or credential data appears.
5. Link the Agent self-install guide, MCP guide, Lite-vs-Pro boundary, commercial license and security policy.
6. Do not describe deterministic opportunity scores as purchase probability, revenue prediction or guaranteed business value.
7. Do not claim the Intelligence/Sales Agent runtime is owned by Radar Lite; persistent employee work remains governed by BossAI OS.

## Conversion path

README → local install/demo → evidence and opportunity workflow → Lite/Pro comparison → commercial authorization / managed enterprise path.

## After release

- verify social preview, English/Chinese README first screen and clean self-install;
- record the exact release URL and commit;
- record qualified GitHub traffic separately from commercial leads;
- track stars/forks/issues only as acquisition signals, not revenue evidence;
- change `public-release.json.claims.publiclyLaunched` only after the release exists externally;
- change production/real-user claims only after the corresponding evidence exists.
