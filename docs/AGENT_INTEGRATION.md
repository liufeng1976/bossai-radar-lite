# BossAI Radar Skill 与 MCP 接入指南

BossAI Radar Lite v0.6 同时提供两层 Agent 接口：

1. **MCP Server**：向支持 MCP 的 Agent 暴露结构化工具和 Prompt；
2. **SKILL.md + JSON CLI**：向 OpenClaw、Hermes 或没有 MCP 的 Agent 提供操作规范与命令行后备入口。

业务逻辑只有一套，所有 Agent 最终调用同一个 Radar HTTP API。

## 1. 准备 Radar

```powershell
cd C:\Users\42059\bossai-radar-lite
npm install
npm run build
npm start
```

确认服务：

```powershell
node dist\src\agent-cli.js health
```

默认地址：

```text
http://127.0.0.1:3080
```

## 2. MCP Server

启动命令：

```powershell
node C:\Users\42059\bossai-radar-lite\dist\src\mcp-server.js
```

MCP 使用 stdio，通常由 Agent 自动启动，不需要单独保持一个终端窗口。

### 默认工具

| 工具 | 权限 | 说明 |
|---|---|---|
| `radar_health` | 只读 | 服务版本和运行状态 |
| `radar_overview` | 只读 | CEO 总览、来源状态和最新报告 |
| `radar_list_opportunities` | 只读 | 商业机会优先级 |
| `radar_list_evidence` | 只读 | 原始公开证据和评分 |
| `radar_latest_report` | 只读 | 中英文 Markdown 日报 |
| `radar_lead_stats` | 管理员只读 | 线索漏斗和多币种金额 |
| `radar_list_leads` | 管理员只读 | 商业线索筛选 |
| `radar_followups` | 管理员只读 | 逾期、今日、未排期和未来跟进 |
| `radar_followup_draft` | 管理员只读 | 客户语言话术和建议下一步 |

默认不会暴露写工具。

### 可选工具

```env
RADAR_MCP_ALLOW_SCAN=true
RADAR_MCP_ALLOW_LEAD_WRITE=true
```

开启后分别增加：

- `radar_run_scan`
- `radar_update_lead`
- `radar_add_lead_activity`

MCP 永远不提供删除线索工具。

### MCP 环境变量

```env
RADAR_API_URL=http://127.0.0.1:3080
RADAR_ADMIN_API_KEY=
RADAR_MCP_LANGUAGE=zh
RADAR_MCP_TIMEOUT_MS=20000
RADAR_MCP_ALLOW_SCAN=false
RADAR_MCP_ALLOW_LEAD_WRITE=false
```

Radar 部署在其他电脑或公网时必须配置 `RADAR_ADMIN_API_KEY`，并使用 HTTPS 或可信内网。

## 3. Codex

已验证的安装命令：

```powershell
codex mcp add `
  --env RADAR_API_URL=http://127.0.0.1:3080 `
  --env RADAR_MCP_LANGUAGE=zh `
  bossai-radar -- `
  node C:\Users\42059\bossai-radar-lite\dist\src\mcp-server.js
```

检查：

```powershell
codex mcp list
codex mcp get bossai-radar
```

也可以参考：

```text
integrations/mcp/codex-config.toml.example
```

推荐让 Codex 担任“机会落地开发工程师”：Radar 发现机会，ChatGPT 或老板批准，Codex 再创建项目和开发 MVP。

## 4. Claude Code

已验证的安装命令：

```powershell
claude mcp add --scope project `
  -e RADAR_API_URL=http://127.0.0.1:3080 `
  -e RADAR_MCP_LANGUAGE=zh `
  bossai-radar -- `
  node C:\Users\42059\bossai-radar-lite\dist\src\mcp-server.js
```

Claude Code 适合读取 Radar 的高分机会与证据后，继续完成 PRD、代码、测试和交付文档。

## 5. Hermes Agent

已验证的 MCP 安装命令：

```powershell
hermes mcp add bossai-radar `
  --command node `
  --env RADAR_API_URL=http://127.0.0.1:3080 RADAR_MCP_LANGUAGE=zh `
  --args C:\Users\42059\bossai-radar-lite\dist\src\mcp-server.js
```

检查：

```powershell
hermes mcp list
hermes mcp test bossai-radar
```

安装 Hermes Skill：

```powershell
hermes skills install https://raw.githubusercontent.com/liufeng1976/bossai-radar-lite/main/skills/hermes/bossai-radar/SKILL.md
```

Hermes 适合承担长流程编排，但每次修改线索或对外沟通前仍必须保留人工审批。

## 6. OpenClaw

OpenClaw 工作区 Skill 的最高优先级目录是：

```text
<OpenClaw workspace>/skills/bossai-radar
```

使用本项目安装器：

```powershell
npm run skill:install -- openclaw --workspace C:\path\to\openclaw-workspace
```

安装器只复制 `SKILL.md`，不会下载程序、启动服务或修改 OpenClaw 配置。

OpenClaw Skill 位置：

```text
skills/openclaw/bossai-radar/SKILL.md
```

典型微信指令：

```text
扫描今天的海外电商机会
今天该跟进谁
给这条 HOT 线索生成一份中文跟进话术
把最高分机会整理成 7 天 MVP 方案
```

OpenClaw 优先使用 MCP；没有 MCP 时按 Skill 说明调用 JSON CLI。

## 7. JSON CLI 后备入口

```powershell
node dist\src\agent-cli.js overview
node dist\src\agent-cli.js opportunities --limit 10
node dist\src\agent-cli.js evidence --category customer-support
node dist\src\agent-cli.js followups --lang zh --days 7
node dist\src\agent-cli.js draft --lead-id <lead-id>
```

写权限默认关闭：

```env
RADAR_SKILL_ALLOW_SCAN=true
RADAR_SKILL_ALLOW_LEAD_WRITE=true
```

所有响应均为 JSON：

```json
{
  "ok": true,
  "command": "overview",
  "data": {}
}
```

## 8. 推荐的 BossAI Agent 分工

```text
OpenClaw     微信/Telegram/WhatsApp 指令入口
Hermes      长流程编排和任务恢复
Radar Lite  公开证据、机会评分、线索与跟进
ChatGPT     老板军师和商业决策
Claude Code PRD、复杂开发和审查
Codex       工程实现、测试、打包和发布
```

## 9. 安全原则

- 默认只读；
- 新扫描必须由用户明确提出；
- 修改线索前显示当前状态与目标状态；
- 客户消息必须人工审核，禁止自动群发；
- 不暴露管理员密钥、`.env`、SQLite 或联系人导出；
- 不允许 Agent 删除线索；
- 不把 Demo 数据当真实市场证明；
- Lite 进行商业经营仍需 BossAI 单独书面授权。
