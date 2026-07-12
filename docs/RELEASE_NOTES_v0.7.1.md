# BossAI Radar Lite v0.7.1

## 中文

v0.7.1 是 Agent 自安装补丁版本，修复 GitHub `npx` 安装包中没有 `package-lock.json` 时，安装器仍然调用 `npm ci` 导致安装失败的问题。

### 修复

- 有 `package-lock.json` 或 `npm-shrinkwrap.json` 时继续使用可复现的 `npm ci`；
- GitHub / npm 打包环境未包含锁文件时，安全回退为 `npm install --ignore-scripts`；
- 源码安装自动包含开发依赖并执行生产构建；
- Release 预编译运行包只安装生产依赖并复用 `dist`；
- 依赖安装结果明确记录为 `locked` 或 `npm-package-fallback`；
- 质量门禁调整为先构建、再运行依赖 `dist` 的自安装测试；
- 保持全部 v0.7.0 安全默认值不变。

### 安全默认值

- 自动扫描关闭；
- Agent 真实扫描关闭；
- 线索写入关闭；
- 删除工具不可用；
- 自动客户消息不可用；
- 管理员密钥不打印、不写入 Agent MCP 配置。

### 推荐固定版本命令

```powershell
npx -y github:liufeng1976/bossai-radar-lite#v0.7.1 --agent codex
```

## English

v0.7.1 is a self-install patch release. It fixes GitHub `npx` installations where npm omits `package-lock.json`, causing an unconditional `npm ci` call to fail.

### Fixed

- continue to use reproducible `npm ci` when `package-lock.json` or `npm-shrinkwrap.json` is available;
- safely fall back to `npm install --ignore-scripts` when the GitHub/npm package does not contain a lockfile;
- source installations include development dependencies and run the production build;
- prebuilt Release packages install production dependencies and reuse `dist`;
- dependency installation records either `locked` or `npm-package-fallback` mode;
- CI now builds before running self-install tests that require `dist`;
- all v0.7.0 safe defaults remain unchanged.

### Recommended pinned command

```powershell
npx -y github:liufeng1976/bossai-radar-lite#v0.7.1 --agent codex
```

## Validation

- clean-checkout build-before-test gate passed;
- local source-package install passed;
- prebuilt Windows ZIP self-install passed;
- pinned remote GitHub `npx` install is part of the final release verification;
- OpenClaw, Codex, Claude Code, and Hermes registration behavior remains unchanged.
