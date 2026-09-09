# BossAI Radar Lite — Public Release Boundary

BossAI Radar Lite is the public, source-available market-intelligence acquisition product in the BossAI portfolio.

## Public value proposition

A new user should be able to clone or install Radar Lite and evaluate the complete local method:

```text
public evidence collection
→ evidence isolation and deduplication
→ must-read / skim / skip triage
→ deterministic opportunity scoring
→ BUILD / SELL_SERVICE / WATCH / IGNORE
→ CEO brief, report and reviewable sales follow-up
```

The public repository also exposes a read-mostly Agent Skill/MCP surface so supported Agent hosts can inspect Radar results without turning Radar into a second Agent platform.

## Source-available license truth

Radar Lite is **source-available under a non-commercial license**. It is not currently distributed under an OSI-approved open-source license.

Permitted and prohibited uses are controlled by the root `LICENSE` file. Commercial authorization is described in `docs/COMMERCIAL_LICENSE.md` and the Lite/Pro product boundary is described in `docs/LITE_VS_PRO.md`.

## Commercial conversion boundary

The public repository demonstrates the product method. Commercial BossAI offerings may add or authorize:

- enterprise/team identity, roles and tenant isolation;
- advanced or licensed data sources;
- managed deployment and operational support;
- private deployment and SLA;
- remote/enterprise MCP with governed permissions;
- CRM/team workflows and approved external integrations;
- persistent Intelligence Employee execution through BossAI OS;
- commercial internal use, customer delivery, white-label or redistribution rights where contractually granted.

## BossAI OS boundary

Radar Lite is an AI Assistant and market-intelligence product. It does not own or replace:

- the general Agent Runtime;
- persistent employee task authority;
- Approval or Audit authority;
- Memory authority;
- the AI Gateway or Provider Router;
- authoritative Points/Billing;
- Headquarters Commerce license/subscription/payment/refund authority.

Persistent Intelligence Employee work delegates through BossAI OS Manager to the independent `bossai-intelligence-agent` under the company execution standard.

## Public-release verification

Run before preparing a public release candidate:

```bash
npm run verify:public-release
npm run release:check
```

The public-release verifier checks public/legal files, canonical repository metadata, required positioning markers and obvious tracked secret-file hazards. Existing `release:check` remains the product's broader technical release check.

Passing these checks is not evidence of public launch, production readiness, real-user validation or commercial revenue.
