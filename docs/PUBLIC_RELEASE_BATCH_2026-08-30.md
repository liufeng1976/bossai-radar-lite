# Public Release Batch — 2026-08-30

Purpose: isolate the GitHub acquisition/public-release work from the substantial pre-existing Radar prospect/outcome/UI development already present in this working tree.

## Hard rule

Do **not** use `git add -A`, `git add .`, or whole-tree commit automation for this batch.

Radar had many modified/untracked product files before the public-release work began. They must remain a separate reviewed batch unless explicitly combined.

## Whole-file safe for this public-release batch

- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/release.yml`
- `docs/PUBLIC_RELEASE.md`
- `docs/GITHUB_LAUNCH_CHECKLIST.md`
- `docs/PUBLIC_RELEASE_BATCH_2026-08-30.md`
- `public-release.json`
- `scripts/verify-public-release.mjs`

## Mixed files — hunk-level staging only

These files already contained unrelated Radar development before this batch:

- `README.md`
- `README_EN.md`
- `package.json`

Stage only the public-release/acquisition hunks unless the underlying Radar feature batch is separately reviewed and intentionally combined.

Public-release README hunks include:

- Lite vs commercial BossAI boundary;
- public-release check instructions;
- Radar → Ecommerce Manager → Customer Service ecosystem links.

The same README files also contain pre-existing prospect discovery, trade evidence, owner-decision, outcome-learning and UI documentation changes. Those are not automatically part of this batch.

Public-release `package.json` hunks include:

- license/author/repository/homepage/bugs metadata;
- GitHub discovery keywords;
- `verify:public-release`;
- adding the public gate to `release:check`.

Other existing script changes in `package.json` must be staged according to their own feature batch.

## Pre-existing changes explicitly outside this batch

This includes the existing `.env.example`, Atlas/governance changes, UI, collectors, database, prospect/outcome modules and their tests. This document does not freeze or reject them; it prevents accidental bundling.

## Acceptance

On the exact release candidate:

```bash
npm run verify:public-release
npm run release:check
```

Evidence while preparing this batch:

- public-release gate passes while scanning tracked + untracked candidate files;
- full Radar check previously passed 177/177 tests plus build, frontend syntax, i18n and BossAI OS migration verification.

Re-run on the final staged/committed candidate. Historical output is not a substitute for release evidence.
