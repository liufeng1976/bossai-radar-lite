# BossAI Radar Lite v0.6.0

## 中文

v0.6.0 是 **Agent Skill 与 MCP 正式接入版本**。Radar Lite 不再只是网页和 REST API，而是可以被 OpenClaw、Hermes、Claude Code、Codex 及其他 MCP 客户端直接调用的通用商业情报能力层。

### 新增

- 标准 stdio MCP Server；
- 9 个默认只读工具；
- 2 个复用 Prompt：CEO 日报、机会转 7 天 MVP；
- 可选真实扫描工具；
- 可选线索更新和活动记录工具；
- MCP 写权限默认关闭；
- MCP 永不暴露删除线索能力；
- 共用的类型安全 Radar API Client；
- 无 MCP 环境可使用 JSON Agent CLI；
- CLI 真实扫描和线索写入默认关闭；
- 通用 `SKILL.md`；
- OpenClaw 专用 `SKILL.md` 与官方 frontmatter；
- Hermes 专用 `SKILL.md`；
- OpenClaw 工作区 Skill 安装器；
- Codex、Claude Code、Hermes 的已验证 MCP 安装命令；
- Codex TOML 与通用 stdio JSON 配置示例；
- 中英文 Agent Skill / MCP 接入指南。

### 默认 MCP 工具

- `radar_health`
- `radar_overview`
- `radar_list_opportunities`
- `radar_list_evidence`
- `radar_latest_report`
- `radar_lead_stats`
- `radar_list_leads`
- `radar_followups`
- `radar_followup_draft`

### 安全边界

- 默认只读；
- 新扫描必须显式开启；
- 线索写入必须显式开启；
- 修改线索前要求人工确认；
- 客户消息只生成草稿，不自动发送；
- 不暴露删除工具；
- Skill 不包含下载、混淆命令或危险安装脚本；
- 管理员密钥、SQLite 和联系人导出不进入发布包。

## English

v0.6.0 is the **official Agent Skill and MCP integration release**. Radar Lite is now a reusable business-intelligence capability layer for OpenClaw, Hermes, Claude Code, Codex, and other MCP clients.

### Added

- standard stdio MCP server;
- nine default read-only tools;
- two reusable prompts for a CEO brief and an opportunity-to-MVP workflow;
- optional live-scan tool;
- optional lead-update and activity-write tools;
- MCP write permissions disabled by default;
- no lead-deletion tool in the MCP interface;
- shared typed Radar API client;
- JSON Agent CLI fallback for hosts without MCP;
- CLI scan and lead-write permissions disabled by default;
- portable `SKILL.md`;
- OpenClaw-specific `SKILL.md` with official frontmatter;
- Hermes-specific `SKILL.md`;
- OpenClaw workspace skill installer;
- verified MCP commands for Codex, Claude Code, and Hermes;
- Codex TOML and generic stdio JSON examples;
- Chinese and English agent integration guides.

### Security Boundary

- read-only by default;
- live scans require an explicit permission flag;
- lead writes require a separate explicit permission flag;
- human approval is required before lead mutation;
- customer messages remain drafts and are never sent automatically;
- no deletion tool is exposed;
- skill packages contain no download pipes, obfuscated commands, or dangerous installers;
- administrator keys, SQLite data, and contact exports are excluded from release packages.

## Validation

- official MCP Client discovered and called all default tools;
- optional scan and lead-write tool gates passed;
- MCP prompts passed discovery tests;
- JSON CLI subprocess calls passed against a live local Radar server;
- CLI scan and write denial passed by default;
- portable, OpenClaw, and Hermes skill frontmatter passed;
- dangerous-command checks passed;
- OpenClaw temporary workspace installation passed;
- TypeScript, frontend, bilingual dictionary, release file, and package checks passed.
