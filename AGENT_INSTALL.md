# BossAI Radar Lite — Agent 自安装 / Agent Self-Install

## 中文

把仓库地址交给 OpenClaw、Hermes、Claude Code 或 Codex 后，Agent 应直接完成安装、配置和验证，而不是只把手动命令复述给用户。

仓库：

```text
https://github.com/liufeng1976/bossai-radar-lite
```

### 给 Agent 的标准指令

```text
安装并配置这个 GitHub 项目：
https://github.com/liufeng1976/bossai-radar-lite

要求：
1. 识别你自己属于 OpenClaw、Hermes、Claude Code 还是 Codex；
2. 使用仓库的 agent-install.json 和 scripts/agent-bootstrap.mjs；
3. 安装到稳定目录并启动 Radar 服务；
4. 安装对应 Skill 或注册 MCP；
5. 完成健康检查；
6. 默认保持只读；
7. 未经我明确确认，不得开启真实扫描、线索写入、自动消息发送或删除能力；
8. 最后报告安装目录、服务地址、已安装接口和验证结果。
```

### GitHub 一条命令安装

Agent 可以直接执行：

```powershell
npx -y github:liufeng1976/bossai-radar-lite --agent codex
```

把最后一个参数替换为：

```text
openclaw
hermes
claude
codex
```

OpenClaw 建议同时提供工作区：

```powershell
npx -y github:liufeng1976/bossai-radar-lite --agent openclaw --workspace "C:\path\to\openclaw-workspace"
```

Claude Code 或 Codex 需要把 Skill 同时装入当前项目时：

```powershell
npx -y github:liufeng1976/bossai-radar-lite --agent codex --workspace "C:\path\to\project"
```

### 已克隆仓库时

```powershell
node scripts/agent-bootstrap.mjs --agent codex
```

或：

```powershell
npm run agent:install -- --agent codex
```

### 默认安装结果

安装器会：

1. 安装或更新到 `~/.bossai-radar-lite`；
2. 使用 `npm ci --ignore-scripts` 安装依赖；
3. 执行 TypeScript 生产构建；
4. 创建本地 `.env`；
5. 生成强管理员密钥；
6. 关闭自动扫描、Agent 真实扫描和线索写入；
7. 启动后台 Radar 服务；
8. 安装对应 Skill 或注册 stdio MCP；
9. 调用只读健康接口完成验证。

管理员密钥仅保存在 Radar 安装目录的 `.env`，不会打印在安装结果中，也不会复制进 Agent Skill 配置。

### 明确开启权限

只有用户明确要求时才可增加：

```powershell
--enable-scan
--enable-lead-write
```

即使开启写权限，MCP 仍不提供删除线索工具，也不会自动发送客户消息。

### 服务管理

```powershell
npm run service:status
npm run service:start
npm run service:restart
npm run service:stop
```

服务 PID 和日志保存在安装目录的 `.radar/`，不会进入 Git 或发布包。

---

## English

When an OpenClaw, Hermes, Claude Code, or Codex agent receives the repository URL, it should perform the installation, configuration, and verification instead of merely repeating manual commands.

Repository:

```text
https://github.com/liufeng1976/bossai-radar-lite
```

### Standard instruction for an agent

```text
Install and configure this GitHub project:
https://github.com/liufeng1976/bossai-radar-lite

Requirements:
1. Identify whether you are OpenClaw, Hermes, Claude Code, or Codex.
2. Use agent-install.json and scripts/agent-bootstrap.mjs from the repository.
3. Install into a stable directory and start the Radar service.
4. Install the matching Skill or register the MCP server.
5. Complete a health verification.
6. Keep the installation read-only by default.
7. Do not enable live scans, lead writes, automatic messaging, or deletion without explicit approval.
8. Report the install path, service URL, installed interfaces, and verification result.
```

### One-command GitHub install

```powershell
npx -y github:liufeng1976/bossai-radar-lite --agent codex
```

Supported agent values:

```text
openclaw
hermes
claude
codex
```

### Safe defaults

The installer disables scheduled scans, live Agent scans, lead mutation, deletion, and automatic customer messaging. A strong administrator key is generated locally and stored only in the Radar `.env` file.

Explicit permission flags:

```powershell
--enable-scan
--enable-lead-write
```

Deletion and automatic customer sending remain unavailable through MCP.
