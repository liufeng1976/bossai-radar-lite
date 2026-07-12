<p align="center">
  <img src="docs/assets/social-preview.svg" alt="BossAI Radar Lite" width="100%" />
</p>

# BossAI Radar Lite

**中文** · [English](README_EN.md)

> 自动搜索海外公开信息，识别真实痛点、付费表达与竞品信号，生成可执行的 CEO 商业机会日报。

BossAI Radar Lite 是 BossAI Radar 的 **source-available 非商业版**。它不是新闻聚合器，也不要求用户手工录入线索。系统会自动完成：

```text
公开来源采集
    ↓
去重、超时与失败隔离
    ↓
痛点 / 付费 / 竞争 / 紧迫度评分
    ↓
跨来源机会聚类
    ↓
BUILD / SELL_SERVICE / WATCH / IGNORE
    ↓
目标客户、建议报价与 7 天行动计划
```

## 为什么做 Lite

Lite 用于让个人开发者、研究者和潜在客户验证 BossAI Radar 的核心方法：

- 证据是否真实可追溯；
- 热度是否等于生意；
- 哪些机会应立即开发；
- 哪些机会应先卖服务验证；
- 哪些方向应继续观察或明确放弃。

它保留完整的单机商业判断闭环，但不包含企业团队、白标、商业交付和高级数据源能力。

## 当前能力

### 自动采集公开证据

| 来源 | 接入方式 | 默认用途 |
|---|---|---|
| Reddit | 公开 Search JSON | 用户抱怨、替代方案、付费表达 |
| Hacker News | Algolia 公共搜索接口 | 产品讨论、创业需求与技术商业化信号 |
| GitHub Issues | GitHub 公共 Search API | 功能缺口、集成问题与真实工作流痛点 |

每个来源都有独立超时、数量限制、运行状态和错误记录。单一来源失败不会拖垮整轮扫描。

### 确定性机会评分

每条证据分别计算：

- 痛点强度；
- 明确付费表达；
- 竞品与替代方案信号；
- 紧迫性；
- 社区互动量；
- 内容完整度。

聚类后再加入证据数量和跨来源验证。最终决策由确定性规则裁决：

```text
BUILD         高分 + 至少两个来源 + 明确付费证据
SELL_SERVICE  已有付费信号，但更适合先用服务验证
WATCH         有趋势或痛点，证据暂不足
IGNORE        不投入开发资源
```

AI 只能解释证据、优化标题和行动计划，不能篡改机会分数和决策门槛。

### 中英文 CEO 仪表盘与日报

右上角可在“中文 / English”之间切换，语言会自动带到商业授权页、Pro 等待名单、申请邮件和日报下载。

- CEO 结论；
- 机会优先级；
- 目标客户；
- 核心问题；
- 建议报价；
- 7 天 MVP 行动；
- 高价值原始证据；
- 来源健康状态；
- 自动扫描日程；
- 中文与英文 Markdown 日报下载；
- 中英文商业授权申请与 Pro 等待名单；
- 双语词条完整性自动检查。

页面适配电脑、平板和手机。

### 商业线索与成交漏斗

商业授权页可把申请保存到本地 SQLite，并继续保留预览、复制和邮件备份：

- 自动计算线索分数与 HOT / WARM / COOL；
- Pro 申请自动进入 WAITLIST；
- NEW → QUALIFIED → CONTACTED → PROPOSAL → NEGOTIATION → WON / LOST；
- 负责人、报价、币种、下次跟进时间；
- 电话、邮件、会议、报价和备注活动记录；
- 按币种分别统计报价和成交金额；
- CSV 导出和单条线索永久删除；
- 24 小时重复申请去重、提交限流和蜜罐过滤。

入口：

```text
http://127.0.0.1:3080/commercial.html
http://127.0.0.1:3080/leads.html
```

线索后台在公网环境必须使用 `RADAR_ADMIN_API_KEY`。详细数据说明见 [商业线索数据说明](docs/LEAD_PRIVACY.md)。

### 明确标记的演示数据

首次评估时可点击页面右上角的 **载入演示**。系统会生成 9 条合成证据和多个机会，用于展示完整界面。

演示模式具备以下约束：

- 每条样例证据都带 `isDemo=true`；
- 页面显示 `DEMO` 标识；
- 不提供伪造的原始帖子链接；
- 演示日报以“演示数据”开头；
- 真实扫描和真实机会评分会排除演示证据。

## 许可边界

本项目使用 **BossAI Radar Lite Non-Commercial License 1.0**。

免费许可覆盖：

- 个人学习；
- 学术或非商业研究；
- 内部技术评估；
- 不收费的非商业演示；
- 保留版权和许可证的非商业修改与分发。

以下场景必须获得 BossAI 单独书面商业授权：

- 收费 SaaS、订阅或会员权益；
- 咨询、代运营、情报报告或项目交付；
- 付费课程、训练营或软件安装包；
- 企业内部直接支持营收的经营使用；
- 白标、OEM、二次销售或商业再分发；
- 嵌入商业产品或向客户提供托管服务。

本许可属于 **source-available non-commercial license**，不是 OSI 标准开放许可。源码可见不代表商业使用免费。

商业授权申请页：`http://127.0.0.1:3080/commercial.html`

商业授权联系：`liufeng420594566@gmail.com`

详细说明：

- [完整许可证](LICENSE)
- [商业授权说明](docs/COMMERCIAL_LICENSE.md)
- [Lite 与 Pro 功能边界](docs/LITE_VS_PRO.md)
- [商业线索数据说明](docs/LEAD_PRIVACY.md)

## 技术栈

- Node.js 22.5+；
- TypeScript 严格模式；
- Express 5；
- Node 内置 SQLite；
- 原生 HTML / CSS / JavaScript；
- 可选 DeepSeek 或任意 OpenAI-compatible 模型。

不需要单独安装 PostgreSQL、Redis 或前端框架。

## 快速启动

### Windows 一键启动

双击：

```text
start-radar.cmd
```

脚本会安装依赖、创建本地 `.env` 并打开：

```text
http://127.0.0.1:3080
```

### 命令行启动

```powershell
cd C:\Users\42059\bossai-radar-lite
npm install
Copy-Item .env.example .env
npm run dev
```

默认情况下，首次启动没有历史报告时，系统会自动运行一次公开来源扫描。用于销售演示或离线评估时，可设置 `RADAR_RUN_ON_STARTUP=false`，启动后直接点击“载入演示”。

### 生产构建

```powershell
npm run release:check
npm start
```

### 生成发布包

```powershell
npm run package:release
```

发布目录会生成 Windows ZIP、runtime tar.gz 和 SHA256 校验文件。

## 接入 DeepSeek

在 `.env` 中设置：

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=你的密钥
AI_MODEL=deepseek-chat
```

没有模型密钥时不会中断，系统自动使用确定性模板生成商业判断和行动计划。

## 主要配置

```env
PORT=3080
HOST=127.0.0.1
DATA_DIR=./data

RADAR_DEMO_ENABLED=true
COMMERCIAL_LICENSE_EMAIL=liufeng420594566@gmail.com
COMMERCIAL_LICENSE_URL=
COMMERCIAL_LEAD_CAPTURE_ENABLED=true
COMMERCIAL_LEAD_ADMIN_ENABLED=true
COMMERCIAL_LEAD_RATE_LIMIT=5

RADAR_AUTO_SCAN=true
RADAR_RUN_ON_STARTUP=true
RADAR_DAILY_HOUR=8
RADAR_DAILY_MINUTE=0
RADAR_TIMEZONE=Asia/Shanghai
RADAR_LOOKBACK_DAYS=14
RADAR_MAX_ITEMS_PER_SOURCE=20
RADAR_TOPICS=AI ecommerce,Shopify automation,Amazon seller tools,customer support AI,content automation

AI_PROVIDER=deterministic
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=
AI_MODEL=deepseek-chat

GITHUB_TOKEN=
RADAR_ADMIN_API_KEY=change-this-before-public-deployment
```

`GITHUB_TOKEN` 不是必需项，但可提高 GitHub 公共搜索限额。

公网部署前必须：

1. 将 `RADAR_ADMIN_API_KEY` 改为足够长的随机值；
2. 通过 HTTPS 反向代理提供服务；
3. 不公开 `.env`、`data/`、SQLite 文件和日志；
4. 关闭不需要的演示入口：`RADAR_DEMO_ENABLED=false`；
5. 遵守各公开来源的接口条款、限额和机器人政策；
6. 需要企业权限、租户隔离和 SLA 时升级到商业 Pro 版。

更多安全说明见 [SECURITY.md](SECURITY.md)。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务、版本和许可状态 |
| GET | `/api/overview` | 总览、统计、调度和最新日报 |
| GET | `/api/opportunities` | 机会列表 |
| GET | `/api/evidence` | 证据列表 |
| GET | `/api/runs` | 扫描历史 |
| GET | `/api/report/latest` | 最新日报 JSON |
| GET | `/api/report/latest.md?lang=zh` | 下载中文 Markdown 日报 |
| GET | `/api/report/latest.md?lang=en` | 下载英文 Markdown 日报 |
| POST | `/api/scan` | 立即运行真实扫描 |
| POST | `/api/demo/seed` | 载入明确标记的合成演示数据 |
| POST | `/api/leads` | 提交商业授权或 Pro 等待名单申请 |
| GET | `/api/admin/leads` | 管理员查询和筛选线索 |
| GET | `/api/admin/leads/stats` | 成交漏斗和多币种金额统计 |
| GET | `/api/admin/leads/export.csv` | 导出线索 CSV |
| GET | `/api/admin/leads/:id` | 读取线索与跟进记录 |
| PATCH | `/api/admin/leads/:id` | 更新状态、优先级、负责人、报价和跟进时间 |
| POST | `/api/admin/leads/:id/activities` | 添加跟进活动 |
| DELETE | `/api/admin/leads/:id` | 永久删除线索与全部活动 |

公网写请求使用：

```http
X-Radar-Key: your-admin-key
```

本机监听 `127.0.0.1` 时，页面按钮可直接调用写接口。

## 项目结构

```text
bossai-radar-lite/
├── .github/                    # CI、标签发布、Issue 与 PR 模板
├── docs/
│   ├── assets/                 # GitHub 展示素材
│   ├── COMMERCIAL_LICENSE.md
│   ├── LITE_VS_PRO.md
│   └── RELEASE_CHECKLIST.md
├── public/                     # 中英文仪表盘、商业授权页、线索后台和 i18n 词典
├── scripts/                    # 构建、双语检查、发布打包与发布门禁
├── src/
│   ├── ai.ts                   # 可选 OpenAI-compatible 分析
│   ├── collectors.ts           # Reddit / HN / GitHub 采集器
│   ├── config.ts               # 环境配置
│   ├── database.ts             # SQLite 证据库和兼容迁移
│   ├── demo.ts                 # 明确标记的合成演示数据
│   ├── leads.ts                # 线索校验、评分与状态输入规范化
│   ├── pipeline.ts             # 全链路编排与失败隔离
│   ├── report.ts               # CEO 日报
│   ├── scheduler.ts            # 每日定点扫描
│   ├── scoring.ts              # 确定性评分与决策门槛
│   ├── server.ts               # API 与静态站点
│   ├── types.ts
│   └── version.ts
├── README_EN.md               # 英文项目说明
└── tests/                      # 数据库、雷达、线索、权限、英文报告和调度测试
```

## Lite 与 Pro 的产品边界

Lite 重点是单机验证，不包含：

- X 官方 API、Product Hunt、付费需求 Feed、收入案例 Feed；
- 多用户、团队空间、权限和租户隔离；
- 飞书、Slack、邮件和企业微信推送；
- 行业模板、客户自定义权重和高级查询编排；
- 多人销售分配、自动化触达和外部 CRM 集成；
- PostgreSQL、多实例部署、备份和企业审计；
- 托管部署、白标、商业支持和 SLA；
- 商业使用及商业再分发权利。

完整比较见 [docs/LITE_VS_PRO.md](docs/LITE_VS_PRO.md)。

## 参与贡献

提交变更前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，并执行：

```powershell
npm run release:check
```

新增采集器必须设置超时、数量限制和失败隔离；不得绕过登录、验证码、Cookie 限制或平台访问控制。

## 当前验证状态

v0.4.0 发布门禁覆盖：

- 数据库旧版 Schema 自动升级；
- 演示数据与真实评分隔离；
- 机会评分和 BUILD 门槛；
- 中文与英文日报生成；
- 商业线索校验、评分、等待名单分流和 24 小时去重；
- 多币种报价、状态、跟进活动和删除生命周期；
- 中英文线索后台与 304 组配对词条；
- 公开提交与管理员读写、导出、删除接口冒烟；
- 前端 JavaScript 语法检查和 TypeScript 生产构建；
- Windows ZIP、runtime tar.gz 与 SHA256 校验。

详细变更见 [CHANGELOG.md](CHANGELOG.md)，本版发布文案见 [docs/RELEASE_NOTES_v0.4.0.md](docs/RELEASE_NOTES_v0.4.0.md)。

## 免责声明

公开帖子不等于已验证订单。系统输出用于机会筛选，不构成投资、法律或财务建议。涉及预算、收入、客户数和市场规模时，必须打开真实原始链接人工复核。
