# Changelog

## 0.7.1 - 2026-07-12

### Fixed

- GitHub npx packages without package-lock.json now fall back from npm ci to npm install --ignore-scripts
- Source installs keep the locked npm ci path when a lockfile exists
- Prebuilt Release packages install production dependencies and reuse dist
- CI builds before running self-install tests that depend on production artifacts

### Validation

- Clean-checkout release gate passed
- Source and prebuilt-runtime installation modes passed
- Existing Agent permission, MCP, Skill, service, and security tests remain active

## 0.7.0 - 2026-07-12

### Added

- One-command GitHub and npx Agent self-installer
- Machine-readable agent-install.json manifest
- Bilingual AGENT_INSTALL.md
- Root AGENTS.md and CLAUDE.md execution instructions
- Stable installation directory with automatic file updates
- Safe dependency install and production build
- Local administrator-key generation without terminal disclosure
- Background Radar service manager with PID, logs, start, stop, restart, and status
- Automatic OpenClaw and Hermes Skill installation
- Automatic Codex, Claude Code, and Hermes MCP registration
- Optional portable workspace Skill installation
- Cross-working-directory local .env loading for MCP and CLI
- Dry-run, remote API, skip, workspace, scope, and explicit permission options
- Installed-version versus running-API verification

### Security

- Self-install remains read-only by default
- Scheduled scans, live Agent scans, and lead writes are disabled
- Administrator keys remain only in the Radar .env file
- Agent MCP and Skill configuration contains no administrator key
- Remote API startup requires an explicit skip-service option
- Install directories cannot be nested inside the source repository
- Delete tools and automatic customer messaging remain unavailable

### Validation

- Local npx package-bin execution passed
- Mutation-free dry-run passed
- Temporary OpenClaw self-install passed
- Strong-key secrecy and safe permission defaults passed
- Cross-directory .env resolution passed
- Background service lifecycle passed

## 0.6.0 - 2026-07-12

### Added

- Standard stdio MCP server built with the official TypeScript SDK
- Nine default read-only Radar tools and two reusable prompts
- Optional live-scan, lead-update, and activity-write MCP tools
- Shared typed Radar API client for MCP and CLI integrations
- JSON Agent CLI fallback for hosts without MCP
- Portable, OpenClaw, and Hermes SKILL.md packages
- OpenClaw workspace skill installer
- Verified Codex, Claude Code, and Hermes MCP commands
- Codex TOML and generic stdio JSON configuration examples
- Chinese and English Agent Skill / MCP integration guides

### Security

- MCP and CLI scan/write permissions are disabled by default
- No agent interface exposes lead deletion
- Customer outreach remains draft-only and human-reviewed
- Skill packages are checked for dangerous download pipes, obfuscated commands, and destructive shell patterns
- Administrator keys, SQLite data, and contact exports remain excluded from release packages

### Validation

- Official MCP Client tool and prompt discovery passed
- Default read-only and optional write-tool gates passed
- JSON CLI subprocess integration passed against a live local Radar server
- OpenClaw temporary workspace installation passed
- Portable, OpenClaw, and Hermes skill frontmatter and safety checks passed

## 0.5.0 - 2026-07-12

### Added

- OVERDUE, TODAY, UNSCHEDULED and UPCOMING follow-up queues
- Urgency scoring based on due status, lead priority, sales stage, launch timing and quote presence
- Due-today and overdue metrics in the commercial lead workspace
- Bilingual administrative reasons and recommended actions
- Customer-facing follow-up drafts generated in each lead's language
- Recommended stage progression and next-follow-up dates
- One-click copy, local email-client launch and recommendation application
- Chinese and English Markdown follow-up briefs
- 30-day iCalendar follow-up export
- Automatic rescheduling of overdue calendar items to the nearest executable time
- Chinese and English daily follow-up operating guides
- Administrator APIs for follow-up queues, drafts, reports and calendars

### Security

- Follow-up actions remain human-reviewed and are never sent automatically
- All follow-up APIs require administrator access
- WON and LOST leads are excluded from active queues
- Administrative language and customer-draft language are separated

### Validation

- Follow-up classification, sorting and urgency tests passed
- Chinese and English draft generation tests passed
- Recommended stage and next-date tests passed
- Markdown follow-up report and iCalendar tests passed
- Protected API integration tests passed
- Frontend, bilingual dictionary and TypeScript build checks passed

## 0.4.0 - 2026-07-12

### Added

- Local SQLite commercial lead capture for license applications and Pro waitlist submissions
- 24-hour contact-and-intent deduplication, in-memory rate limiting, consent validation, and honeypot filtering
- Deterministic commercial lead score with HOT / WARM / COOL priority
- NEW, WAITLIST, QUALIFIED, CONTACTED, PROPOSAL, NEGOTIATION, WON, and LOST funnel stages
- Bilingual commercial lead workspace with search, filters, funnel metrics, detail editing, and activity history
- Owner, quote, quote currency, next follow-up time, and multi-currency pipeline statistics
- CSV export and permanent lead deletion with activity cascade
- Chinese and English lead-data privacy notices
- Public submit API and administrator read/update/activity/export/delete APIs

### Changed

- Commercial application form now submits to the local database when enabled
- Preview, clipboard copy, and email backup remain available
- Commercial configuration now exposes lead-capture and lead-admin availability without exposing secrets
- Frontend and bilingual validation now include the lead workspace

### Validation

- Backend automated tests: 17 passed
- Lead scoring, waitlist routing, consent, honeypot, deduplication, multi-currency statistics, lifecycle, and deletion covered
- Public submit and administrator read/update/activity/export/delete smoke tests passed
- Bilingual dictionary check: 282 used keys and 304 paired entries passed
- Frontend JavaScript syntax and TypeScript production build passed

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
