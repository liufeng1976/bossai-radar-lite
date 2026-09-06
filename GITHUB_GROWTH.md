# BossAI Radar Lite — GitHub Growth Measurement

This repository includes a small, read-only GitHub Traffic report so repository discovery can be separated from downstream conversion.

Run locally from an authenticated GitHub CLI session:

```bash
npm run growth:traffic
```

Optional JSON output:

```bash
npm run growth:traffic -- --json
```

Optional local snapshot:

```bash
npm run growth:traffic -- --save .bossai-local/github-traffic/baseline.json
```

`.bossai-local/` is gitignored. Do not commit traffic snapshots, GitHub credentials, tokens, customer data, private opportunity evidence, or local runtime state.

The report reads:

- rolling 14-day Views and Unique Visitors;
- rolling 14-day Clones and Unique Cloners;
- top referrers;
- popular repository paths;
- point-in-time Stars, Forks, and open Issues.

Interpretation matters: GitHub Views/Clones are rolling 14-day windows, while Stars/Forks/Issues are cumulative point-in-time counts. Do not describe a rolling-window increase as cumulative acquisition and do not claim a specific README, release, topic, referrer, or BossAI handoff caused growth unless there is enough evidence to support that claim.

The CI-safe command:

```bash
npm run growth:traffic:check
```

performs only a local path/output guard self-test and does not call GitHub Traffic APIs.

This tooling does not publish content, create Issues, message leads, mutate CRM/sales records, alter Radar scoring, change MCP authority, trigger BossAI Commerce actions, or store a GitHub token.
