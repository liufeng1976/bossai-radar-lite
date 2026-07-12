# Changelog

## 0.3.0 - 2026-07-12

### Added

- Complete Chinese and English dashboard with persistent language switching
- Localized opportunity titles, decisions, categories, pricing, source status and time formatting
- English display text for all synthetic demo evidence
- Bilingual commercial-license application and BossAI Radar Pro waitlist
- Local-only application preview, clipboard copy and email generation
- English Markdown report generation from structured opportunity data
- English GitHub project documentation in `README_EN.md`
- Automated bilingual dictionary completeness checks
- GitHub Actions CI and tag-triggered Release workflow
- Windows ZIP, runtime tar.gz and SHA256 release packaging

### Changed

- Report download now accepts `?lang=zh` or `?lang=en`
- `/api/overview` now exposes the application version
- Commercial-license and Pro links preserve the selected language

### Validation

- Backend automated tests: 12 passed
- Frontend JavaScript syntax checks: passed
- Bilingual dictionary check: 186 used keys and 201 paired entries passed
- TypeScript production build: passed

## 0.2.0 - 2026-07-12

### Added

- Clearly marked synthetic demo dataset with 9 evidence records across three source types
- Local/admin-only `POST /api/demo/seed` endpoint and dashboard demo-loading action
- `isDemo` persistence for evidence and opportunities
- Demo report disclaimer and non-clickable synthetic evidence titles
- Commercial license dialog and configurable authorization contact
- Centralized application version metadata
- Independent `RADAR_RUN_ON_STARTUP` switch for predictable demo and offline startup behavior
- Source-available license terminology across the product and documentation
- Lite versus Pro feature boundary document
- Commercial authorization guide, contribution guide, security policy, and release checklist
- GitHub social preview asset
- Automated release consistency gate

### Changed

- Real radar scans now exclude demo evidence from scoring and opportunity generation
- Existing SQLite databases automatically add the new demo columns without destructive reset
- Dashboard and health API report version 0.2.0
- README rewritten as a release-ready project homepage
- Package description now accurately says source-available non-commercial

### Validation

- 10 automated tests passed
- Demo isolation and BUILD / SELL_SERVICE / WATCH presentation covered by tests
- Legacy database migration path covered by automated testing
- Frontend JavaScript syntax and TypeScript production build passed
- Controlled live scan collected 12 items and generated 5 real opportunities after demo seeding
- All live opportunities remained `isDemo=false`; Reddit network failure was isolated while Hacker News and GitHub succeeded
- Version, license wording, required release files, and dashboard metadata checked by `npm run release:check`
- Production dependency audit reported 0 vulnerabilities

## 0.1.0 - 2026-07-12

### Added

- Independent BossAI Radar Lite project with no reuse of AI Radar OS source code
- Automatic public-data collection from Reddit, Hacker News, and GitHub Issues
- Source-level timeout, failure isolation, duration, count, and error tracking
- SQLite evidence, run, opportunity, and report persistence using Node's built-in database
- Deterministic pain, payment, competition, urgency, engagement, and quality scoring
- Cross-source and payment-proof gates for BUILD decisions
- Opportunity clustering with BUILD / SELL_SERVICE / WATCH / IGNORE outcomes
- Optional DeepSeek or OpenAI-compatible evidence interpretation
- CEO daily report with target customer, pricing, and 7-day MVP plan
- Exact daily local-time scheduler
- Responsive desktop, tablet, and mobile dashboard
- Markdown report download
- Local and API administrator protection for manual scans
- Windows one-click launcher
- Non-commercial source license with mandatory separate authorization for commercial use

### Validation

- 7 automated tests passed
- TypeScript production build passed
- npm audit reported 0 vulnerabilities
- Local dashboard and health API returned HTTP 200
- Controlled live scan collected 26 public items and generated 6 opportunities
- Hacker News and GitHub succeeded in the controlled scan
- Reddit timed out at the network level on the test machine and was correctly isolated without failing the overall run
