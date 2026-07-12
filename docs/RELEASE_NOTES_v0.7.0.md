# BossAI Radar Lite v0.7.0

## 中文

v0.7.0 是 **Agent GitHub 自安装版本**。用户不再需要手工克隆、复制 Skill、注册 MCP 或逐条排查配置。把 GitHub 地址交给 OpenClaw、Hermes、Claude Code 或 Codex，Agent 可以根据仓库根目录的机器清单和指令文件直接完成安装、启动、配置和验证。

### 新增

- GitHub / `npx` 一条命令自安装入口；
- `agent-install.json` 机器可读安装清单；
- 中英文 `AGENT_INSTALL.md`；
- Codex 可自动读取的根目录 `AGENTS.md`；
- Claude Code 可自动读取的根目录 `CLAUDE.md`；
- 支持 `openclaw`、`hermes`、`claude`、`codex` 和 `all`；
- 默认稳定安装目录 `~/.bossai-radar-lite`；
- 自动复制或更新项目文件；
- 使用 `npm ci --ignore-scripts` 安装依赖；
- 自动生产构建；
- 自动创建或更新 `.env`；
- 自动生成强管理员密钥；
- 管理员密钥仅保存在 Radar `.env`，不写入 Agent MCP 配置；
- 自动启动或重启 Radar 后台服务；
- 自动安装 OpenClaw / Hermes Skill；
- 自动注册 Codex、Claude Code、Hermes stdio MCP；
- 可选把通用 Skill 安装到 Codex `.agents/skills` 或 Claude `.claude/skills`；
- 安装结束自动执行 Agent CLI 健康验证；
- 安装版本与运行 API 版本一致性检查；
- `--dry-run` 无修改安装计划；
- `--skip-service`、`--skip-agent-config`、`--skip-deps`、`--skip-verify` 高级选项；
- `service:start / stop / restart / status` 后台服务管理；
- PID 与日志保存在忽略目录 `.radar/`；
- MCP 和 CLI 从 Radar 安装目录加载 `.env`，不依赖 Agent 当前工作目录。

### 默认安全策略

- 自动扫描关闭；
- Agent 真实扫描关闭；
- 线索写入关闭；
- 删除工具永不提供；
- 自动客户消息永不提供；
- 安装结果不打印管理员密钥；
- OpenClaw Skill 配置不保存管理员密钥；
- 远程 API 必须显式使用 `--skip-service`；
- 安装目录不能嵌套在源码目录内；
- 运行版本与安装版本不一致时不报告成功。

### 一条命令

```powershell
npx -y github:liufeng1976/bossai-radar-lite --agent codex
```

支持将 `codex` 替换为 `openclaw`、`hermes` 或 `claude`。需要固定版本时使用：

```powershell
npx -y github:liufeng1976/bossai-radar-lite#v0.7.0 --agent codex
```

## English

v0.7.0 is the **Agent GitHub self-install release**. Users no longer need to manually clone the repository, copy Skills, register MCP servers, or troubleshoot each configuration step. An OpenClaw, Hermes, Claude Code, or Codex agent can read the machine-readable manifest and root instructions, then perform installation, startup, registration, and verification directly.

### Added

- one-command GitHub / `npx` self-install entry point;
- machine-readable `agent-install.json`;
- bilingual `AGENT_INSTALL.md`;
- root `AGENTS.md` for Codex-compatible agents;
- root `CLAUDE.md` for Claude Code;
- `openclaw`, `hermes`, `claude`, `codex`, and `all` targets;
- stable default install directory at `~/.bossai-radar-lite`;
- automatic file installation or update;
- dependency installation through `npm ci --ignore-scripts`;
- automatic production build;
- local `.env` creation and update;
- strong administrator-key generation;
- administrator key stored only in the Radar `.env`, not Agent MCP configuration;
- background Radar service startup and restart;
- OpenClaw and Hermes Skill installation;
- Codex, Claude Code, and Hermes stdio MCP registration;
- optional portable Skill installation for Codex or Claude workspaces;
- final Agent CLI health verification;
- installed-version versus running-API version verification;
- mutation-free `--dry-run` planning;
- advanced skip options;
- background service start, stop, restart, and status commands;
- ignored `.radar/` PID and log state;
- MCP and CLI load `.env` from the Radar installation instead of the Agent's current directory.

### Safe Defaults

- scheduled scans disabled;
- live Agent scans disabled;
- lead writes disabled;
- deletion tool never exposed;
- automatic customer messaging never exposed;
- administrator key never printed in installer output;
- OpenClaw Skill configuration stores no administrator key;
- remote APIs require explicit `--skip-service`;
- install directory cannot be nested inside the source repository;
- installer does not report success when the running API version differs.

### One Command

```powershell
npx -y github:liufeng1976/bossai-radar-lite --agent codex
```

Pin the release for controlled environments:

```powershell
npx -y github:liufeng1976/bossai-radar-lite#v0.7.0 --agent codex
```

## Validation

- local `npx` bin execution passed;
- self-install dry-run passed without filesystem mutation;
- safe OpenClaw installation passed in a temporary workspace;
- generated-key secrecy and permission defaults passed;
- cross-working-directory `.env` loading passed;
- service start, health, status, and stop lifecycle passed;
- isolated Codex MCP registration passed with a complete Windows Node path;
- isolated Claude Code user-scope MCP registration passed;
- full Hermes service + nine-tool MCP + local Skill installation passed;
- existing MCP, CLI, Skill, API, database, bilingual, build, and release checks remain active.
