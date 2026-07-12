# Security Policy

## Supported version

当前仅维护最新发布版本。安全修复会进入 `main`，并在必要时发布补丁版本。

## 报告安全问题

请不要在公开 Issue 中披露可利用的漏洞、管理员密钥、模型密钥、用户数据或部署地址。

通过以下邮箱私下报告：

```text
liufeng420594566@gmail.com
```

邮件标题建议使用：`[SECURITY] BossAI Radar Lite`。

请尽量提供：

- 受影响版本；
- 复现步骤；
- 影响范围；
- 最小化验证样例；
- 建议修复方向。

## 部署安全基线

公网部署前必须完成：

1. 修改 `RADAR_ADMIN_API_KEY`，使用足够长的随机值；
2. 通过 HTTPS 反向代理提供服务；
3. 不公开 `.env`、`data/`、SQLite 文件和日志；
4. 限制服务器文件权限和备份访问；
5. 仅配置有权使用的数据源、Feed 和 API；
6. 定期更新 Node.js 和依赖；
7. 关闭不需要的演示入口：`RADAR_DEMO_ENABLED=false`；
8. 将服务放在可信网络或增加额外身份认证；
9. 线索后台开启时，确认 `COMMERCIAL_LEAD_ADMIN_ENABLED=true` 仅配合强管理员密钥使用；
10. 定期备份并清理 `data/radar-lite.sqlite`，不要把联系人和导出 CSV 上传到公开位置；
11. MCP 默认保持 `RADAR_MCP_ALLOW_SCAN=false` 和 `RADAR_MCP_ALLOW_LEAD_WRITE=false`；
12. JSON CLI 默认保持 `RADAR_SKILL_ALLOW_SCAN=false` 和 `RADAR_SKILL_ALLOW_LEAD_WRITE=false`；
13. 只从本仓库或经过人工审查的来源安装 Skill，不执行第三方 Skill 中的下载管道、混淆命令或未知脚本；
14. 不把 `RADAR_ADMIN_API_KEY` 直接写入公开 Agent 配置、聊天记录或 Skill 文本。

## Agent 自安装安全

- 建议先运行 `--dry-run` 查看安装计划；
- 对受控环境使用固定标签，例如 `github:liufeng1976/bossai-radar-lite#v0.7.0`；
- 自安装器只把管理员密钥写入 Radar 安装目录的 `.env`，不会打印或写入 Agent MCP 配置；
- 默认关闭定时扫描、Agent 真实扫描和线索写入；
- `--enable-scan` 与 `--enable-lead-write` 必须由用户明确授权；
- OpenClaw Skill 配置只保存安装路径、API 地址、语言和非敏感权限状态；
- `.radar/` 中的 PID 与日志只属于本机运行状态，不得上传到公开仓库；
- `npx` 安装会执行本仓库代码，部署方应核对仓库、标签和许可证；
- Agent 主机仍应限制文件系统、进程和网络权限，Radar 安装器不能替代宿主沙箱。

## 已知边界

- Lite 版管理员鉴权是单一 API Key，不等同于完整用户权限系统；
- Lite 版不提供多租户隔离、审计角色、SSO、SLA 或企业密钥管理；
- SQLite 适合单机和轻量部署，不建议作为高并发、多副本生产数据库；
- 公开来源内容可能包含恶意文本，模型输出不得被视为可信指令；
- 原始链接、预算、收入和客户声明必须人工核验；
- 公开线索接口只能提交，管理员接口才能读取、导出、修改或删除；
- 提交限流保存在进程内，重启后清空，不替代网关级 WAF 或长期滥用防护；
- Lite 不保存访问者原始 IP，但会保存申请人主动填写的联系方式和商业场景；
- 部署方负责依法告知、限制访问、备份、清理和响应合理的数据删除要求；
- 本地 stdio MCP 会由 Agent 主机启动进程，Agent 主机本身的命令权限、沙箱和配置安全不由 Radar Lite 控制；
- Agent 工具描述可能被不可信内容影响，任何扫描、线索修改或客户沟通都应保留人工确认；
- MCP 和 CLI 故意不提供删除线索能力，但拥有主机文件权限的 Agent 仍可能直接访问文件，部署方应限制其工作目录和系统权限。

线索数据详情见 [docs/LEAD_PRIVACY.md](docs/LEAD_PRIVACY.md) 和 [docs/LEAD_PRIVACY_EN.md](docs/LEAD_PRIVACY_EN.md)。
