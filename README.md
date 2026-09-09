<p align="center">
  <img src="docs/assets/social-preview.svg" alt="BossAI Radar Lite" width="100%" />
</p>

# BossAI Radar Lite

**中文** · [English](README_EN.md) · [BossAI 下一步 / Next Steps](BOSSAI_NEXT_STEPS.md)

> 自动采集海外公开信息，用「必读 / 速览 / 可跳过」三级筛选压缩信息流，并继续识别真实痛点、付费表达与商业机会。

BossAI Radar Lite 是 BossAI Radar 的 **source-available 非商业版**。它既是 Agent 可安装的情报晨报 Skill，也是带证据链的商业机会验证工具。

## 先看清楚 Lite 和商业版的边界

| 需求 | Radar Lite | BossAI 商业版 / Pro |
|---|---|---|
| 本机采集公开来源、确定性评分、CEO 日报 | ✅ | ✅ |
| Agent Skill / 本地 MCP / GitHub 自安装 | ✅ | ✅ |
| 单管理员、本地 SQLite、人工审核线索 | ✅ | ✅ |
| 企业内部营利用途、客户交付、白标 | 需商业授权 | ✅ |
| 团队权限、租户隔离、企业数据源、托管/SLA | — | ✅ |
| 持久化 Intelligence Employee 执行 | 通过 BossAI OS 交接 | ✅ BossAI OS 治理 |
| Runtime、Approval、Audit、Memory、AI Gateway、Billing 权威 | 不在本仓库 | BossAI OS / Headquarters Commerce |

完整能力差异见 [`docs/LITE_VS_PRO.md`](docs/LITE_VS_PRO.md)，公开发布与平台边界见 [`docs/PUBLIC_RELEASE.md`](docs/PUBLIC_RELEASE.md)。

### 从情报到执行

Radar Lite 负责先找到“值得做什么”。当机会证据足够后，可以把 `top_opportunities` 交给 [BossAI 电商总管 Skill](https://github.com/liufeng1976/bossai-ecommerce-ai-team-skill) 生成7天执行包；如果问题集中在订单咨询、物流、退款、售后或多品牌客服，则可进一步评估 [BossAI Customer Service Agent](https://github.com/liufeng1976/bossai-commerce-copilot) 的本地事实层与强制人工审核工作流。三个仓库都不复制 BossAI OS Runtime。

## 直接交给 Agent 安装

把这个地址发给 OpenClaw、Hermes、Claude Code 或 Codex：

```text
https://github.com/liufeng1976/bossai-radar-lite
```

并告诉它：

```text
读取 agent-install.json 和 AGENT_INSTALL.md，直接完成安装、服务启动、Skill/MCP 配置和健康检查。默认只读，未经确认不得开启真实扫描或线索写入。
```

Agent 也可以直接执行一条命令：

```powershell
npx -y github:liufeng1976/bossai-radar-lite --agent codex
```

将 `codex` 替换为 `openclaw`、`hermes` 或 `claude`。安装器会安装到稳定目录、生成本地强密钥、启动后台服务并完成验证。详细说明见 [Agent 自安装指南](AGENT_INSTALL.md)。

系统会自动完成：

```text
公开来源采集
    ↓
去重、超时与失败隔离
    ↓
必读 / 速览 / 可跳过三级筛选
    ↓
可直接转化的内容选题
    ↓
痛点 / 付费 / 竞争 / 紧迫度评分
    ↓
BUILD / SELL_SERVICE / WATCH / IGNORE
    ↓
目标客户、建议报价与 7 天行动计划
```

公开发布候选在提交前可运行：

```bash
npm run verify:public-release
npm run release:check
```

通过只表示当前源码包装和现有技术检查符合发布候选要求，不等于已经公开上线、生产就绪或经过真实付费客户验证。

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
| ArXiv | Atom API | AI、LLM、Agent 与相关研究进展 |
| RSS / Atom | 用户自定义公开 Feed | 行业博客、产品更新、研究机构与垂直媒体 |

RSS 最多可配置 30 个 Feed。每类来源都有独立超时、数量限制、运行状态和错误记录，单一来源失败不会拖垮整轮扫描。

### Reddit/GEO 情报员工交接

机会卡片现提供“生成 Reddit/GEO 情报包”入口。Radar Lite 会把选中的非演示公开证据以受控 `EVIDENCE_JSON` 交给现有 `bossai-intelligence-agent@0.3.0`，保留原始链接、subreddit、时间、互动量、确定性 Radar 分数、标签和查询词。

情报员工生成 `intelligence.reddit-geo-brief.md`，整理社区信号、GEO 站内内容机会、版规缺口和 `bossai.intelligence-handoff.v1`。它不会自动抓取、发帖、私信、批量回复或修改 Radar 数据；Sidebar/About、版规、置顶帖、Flair 和身份披露要求未核验时，下游内容交接保持阻塞并等待人工审核。

### 三层情报晨报

每次扫描都会把当轮信息自动分为：

- **必读**：明确付费、强痛点、高紧迫度或高综合证据分；
- **速览**：有参考价值，但暂不足以立即采取行动；
- **可跳过**：弱信号、重复性高或缺少实质证据。

日报同时生成最多 6 个可直接转成文章、口播或社媒内容的选题。Agent 默认先展示必读，再展示速览，可跳过内容只汇总数量。

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
- 必读 / 速览 / 可跳过三级情报；
- 可直接转化的内容选题；
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

### 每日跟进与销售行动

v0.5 会把活跃线索自动整理为四类执行队列：

- `OVERDUE`：已超过计划日期；
- `TODAY`：今天到期；
- `UNSCHEDULED`：活跃但没有下一次跟进时间；
- `UPCOMING`：未来 7 天内到期。

系统综合逾期、HOT / WARM / COOL、成交阶段、上线时间和报价生成紧迫度，并提供：

- 今日到期与逾期数量；
- 后台当前语言的原因和建议动作；
- 客户语言的个性化邮件或消息话术；
- 建议推进阶段和下一次跟进日期；
- 一键复制、打开本机邮件客户端和应用建议下一步；
- 中英文 Markdown 跟进日报；
- 未来 30 天 `.ics` 日历导出。

系统不会自动发送邮件、微信或短信。完整工作法见 [每日线索跟进工作法](docs/FOLLOWUP_GUIDE.md)。

### Agent Skill、MCP 与 GitHub 自安装

v0.7 让 Agent 可以从 GitHub 自动完成整套接入：

- 根目录机器清单 `agent-install.json`；
- Codex 使用 `AGENTS.md`；
- Claude Code 使用 `CLAUDE.md`；
- OpenClaw、Hermes 和通用 `SKILL.md`；
- 标准 stdio MCP Server；
- 默认 9 个只读工具和 2 个复用 Prompt；
- 无 MCP 环境使用 JSON CLI；
- 稳定安装目录、强密钥、后台服务和健康验证；
- `service:start / stop / restart / status` 服务管理；
- MCP/CLI 始终从 Radar 安装目录读取 `.env`。

默认只读。MCP 和 CLI 都不会向 Agent 暴露删除线索能力，客户消息也必须人工审核。

```powershell
npx -y github:liufeng1976/bossai-radar-lite --agent codex
npm run service:status
npm run agent -- overview
```

完整说明见 [Agent 自安装指南](AGENT_INSTALL.md) 和 [Agent Skill 与 MCP 接入指南](docs/AGENT_INTEGRATION.md)。

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
- Model Context Protocol TypeScript SDK；
- Zod 工具参数验证；
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
RADAR_REDDIT_CONTEXT_COMMUNITIES=3
RADAR_TOPICS=AI ecommerce,Shopify automation,Amazon seller tools,customer support AI,content automation
RADAR_ARXIV_CATEGORIES=cs.AI,cs.CL,cs.LG
RADAR_RSS_FEEDS=https://news.ycombinator.com/rss;https://export.arxiv.org/rss/cs.AI
RADAR_WEBSITE_SEEDS=
RADAR_WEBSITE_MAX_PAGES_PER_SEED=5
RADAR_WEBSITE_MAX_DEPTH=1
RADAR_WEBSITE_CONCURRENT_SEEDS=4
RADAR_WEBSITE_RESPECT_ROBOTS=true
RADAR_PROSPECT_DISCOVERY_SEEDS=
RADAR_PROSPECT_DISCOVERY_MAX_PAGES_PER_SEED=3
RADAR_PROSPECT_DISCOVERY_MAX_DEPTH=1
RADAR_PROSPECT_DISCOVERY_CONCURRENT_SEEDS=3
RADAR_PROSPECT_DISCOVERY_MAX_CANDIDATES_PER_SEED=20
RADAR_PROSPECT_DISCOVERY_MIN_SCORE=45
RADAR_PROSPECT_ICP_TERMS=
RADAR_PROSPECT_VERIFY_MAX_WEBSITES_PER_SCAN=20
RADAR_PROSPECT_SEARCH_PROVIDER=disabled
RADAR_PROSPECT_SEARCH_QUERIES=
RADAR_PROSPECT_SEARCH_MAX_RESULTS_PER_QUERY=10
RADAR_PROSPECT_SEARCH_CONCURRENT_QUERIES=2
RADAR_PROSPECT_SEARCH_COUNTRY=US
RADAR_PROSPECT_SEARCH_LANGUAGE=en
BRAVE_SEARCH_API_KEY=
RADAR_PROSPECT_MAP_PROVIDER=disabled
RADAR_PROSPECT_MAP_QUERIES=
RADAR_PROSPECT_MAP_MAX_RESULTS_PER_QUERY=10
RADAR_PROSPECT_MAP_CONCURRENT_QUERIES=2
RADAR_PROSPECT_MAP_REGION_CODE=US
RADAR_PROSPECT_MAP_LANGUAGE_CODE=en
GOOGLE_PLACES_API_KEY=

AI_PROVIDER=deterministic
AI_BASE_URL=https://api.deepseek.com
AI_API_KEY=
AI_MODEL=deepseek-chat

GITHUB_TOKEN=
RADAR_ADMIN_API_KEY=change-this-before-public-deployment

RADAR_API_URL=http://127.0.0.1:3080
RADAR_MCP_LANGUAGE=zh
RADAR_MCP_TIMEOUT_MS=20000
RADAR_MCP_ALLOW_SCAN=false
RADAR_MCP_ALLOW_LEAD_WRITE=false
RADAR_SKILL_ALLOW_SCAN=false
RADAR_SKILL_ALLOW_LEAD_WRITE=false
RADAR_LITE_HOME=C:\\Users\\42059\\bossai-radar-lite
```

`GITHUB_TOKEN` 不是必需项，但可提高 GitHub 公共搜索限额。`RADAR_RSS_FEEDS` 使用分号或换行分隔，最多配置 30 个公开 Feed。`RADAR_REDDIT_CONTEXT_COMMUNITIES` 控制每轮最多补充多少个 subreddit 的 Sidebar/About、公开版规与置顶帖上下文；设为 `0` 可关闭。成功上下文缓存 24 小时，失败结果仅缓存 15 分钟。

`RADAR_WEBSITE_SEEDS` 是面向外贸/企业研究的公开网站种子列表，使用分号或换行分隔。配置后，Radar 只在种子同站点内按 `RADAR_WEBSITE_MAX_PAGES_PER_SEED` 和 `RADAR_WEBSITE_MAX_DEPTH` 的上限做有界采集；默认读取并遵守 `robots.txt`，支持 robots 中声明的 Sitemap 以及有界同站点 `/sitemap.xml` fallback，持续执行 SSRF/重定向/响应体大小保护，跳过登录、注册、账户、购物车、结账及常见文档/媒体路径，不绕过验证码、登录或访问控制。采集结果保留企业名称、页面描述、产品/服务信号、公开联系页、页面/JSON-LD 公开展示的业务邮箱/电话、官网主动链接的公司级外部主页及 WhatsApp Business 等公开业务渠道，并作为带来源 URL 的证据进入 Radar，而不是直接发送销售消息。LinkedIn 个人 `/in/` 等个人档案不会进入公司级主页证据。静态 HTML 疑似只是 JavaScript 壳时会标记 `javascript-likely`，不会把“静态抓不到”解释成“企业没有这些信息”。

`RADAR_PROSPECT_DISCOVERY_SEEDS` 用于潜客发现，适合显式配置公开企业名录、展会展商页、协会会员页和供应商目录。Radar 只在发现源同站点做有界读取，从页面抽取站外企业官网候选，过滤搜索、社交、支付、建站和大型市场平台域名，再把候选官网交给企业网站爬虫二次核验。候选按公开来源、企业标签、商业上下文和官网证据做确定性排序；排序分不是采购概率。`prospect_candidates` 现在显式保存 `websiteEvidenceStatus=unverified|verified|static-incomplete` 和 `websiteVerifiedAt`：搜索/地图/名录只发现 URL 时保持 `unverified`；真实受控官网采集成功才升级成 `verified`，JavaScript 壳页则记为 `static-incomplete`。后续纯搜索再次发现同一域名不能把已核验状态或已核验的企业名称、描述、公开联系方式、产品信号覆盖回空值。`unverified` 候选在 UI 只提供“核验官网”，后端也会在创建 Manager 任务前以 `PROSPECT_WEBSITE_EVIDENCE_REQUIRED` 阻断 Intelligence。`static-incomplete` 可交情报员工判断证据缺口，但必须保持 `BLOCKED_PENDING_BROWSER_OR_ALTERNATE_EVIDENCE`。只有 Intelligence Manager 权威结果明确包含 `READY_FOR_SALES_QUALIFICATION_REVIEW`，并且人工明确批准 `READY_FOR_SALES` 后，才允许创建 `bossai-sales-agent` 的 `sales.lead.qualify` Manager 任务；`READY_FOR_SALES` 还会再次检查官网证据状态。即使 Sales 资格判断完成，Radar 仍不会自动创建或修改 CRM 正式记录、发送邮件或进行任何外联。

老板的终局账户决策现在通过 Account Review 内的“老板决策留痕”完成，而不是直接修改状态。`POST /api/admin/prospects/:id/owner-decision` 只接受 `approve-sales` / `reject-prospect`，要求选择与决策匹配的理由，`other` 必须补充说明，并把理由、说明和当时的官网证据、审查材料完成度、公司业务渠道数量、历史贸易数量/人工复核顺序、Radar 候选证据分、Intelligence/Sales Manager 引用保存为私有决策快照。决策日志和原有 `ProspectCandidate.status` 在同一事务中写入；状态过期时两者都不写。直接 `PATCH READY_FOR_SALES/REJECTED` 会以 `PROSPECT_OWNER_DECISION_REQUIRED` 失败。决策记录用于审计，不是新的审批引擎或 CRM 阶段，也不表示购买意图、成交概率或下一单预测；公开 `/api/prospects` 不返回老板备注或决策快照。

Sales 资格判断完成后，Account Review 的“查看销售资格结果”会通过 `GET /api/admin/prospects/:id/sales-handoff-brief` 实时读取 BossAI Manager 权威结果并生成不落库的 `bossai.prospect-sales-handoff-brief.v1`。它只解析 Sales Agent 明确写出的处置标记、官网证据状态以及真实需求/决策权/采购时间/预算字段：`UNKNOWN/未知` 继续保持未知，非 UNKNOWN 内容只标记为“Sales 结果报告的证据”，不会自动升级成老板已验证事实；无法识别的未来格式直接回退为原始 Manager 结果。Handoff Brief 不授权任何外联或 CRM 写入，也不生成购买意图、成交概率或下一次采购日期。

Intelligence 或 Sales Manager 任务失败/取消后，现在会进入老板队列独立的“执行异常”类别，而不是混在普通“可立即推进”中。Account Review 会显示原 Manager Task、错误码/错误说明，并把“刷新现有状态”和“人工重试”分成两个动作。重试不会自动发生：只有老板显式重试最新失败/取消任务时，Radar 才复用现有 `/delegate` 或 `/qualify` 路径创建一个新的受治理 Manager Task；重试 operation ID 由失败 Task ID 决定并由服务端管理，重复点击只读回同一个重试任务。该机制不新增调度器或重试循环，也不会创建 CRM、发送消息或执行外联。

Sales 资格判断现在还必须具备完整的“Intelligence Manager Task → 老板 approve-sales Decision → Sales Manager Task”授权链，`READY_FOR_SALES` 状态本身不再足以触发 Sales。每条新 `prospect-sales` 委派都会持久化精确的 `ownerDecisionId`，并把 Decision ID、时间、理由码及其对应的前置 Intelligence Task 作为受限上下文送入 BossAI Manager；老板的自由文本私有备注不会进入 Sales 执行上下文。历史 READY 数据如果没有老板决策、决策对应了别的 Intelligence Task，或已有 Sales Task 没有绑定 Decision，会进入“Sales 授权待确认”并 fail-closed；老板必须重新阅读当前权威 Intelligence 结果并显式“重新确认 Sales 授权”，系统才会新增一条批准记录并允许创建新的、绑定该批准的新 Sales Task。旧 Sales Task 不会被静默回填或改写。这条授权只允许 `sales.lead.qualify`，不授权外联、CRM 写入、报价、改价、签约或收款。

P9 在这条授权链之后新增“Decision → Sales → Outcome”经营结果归因，但不会把 Sales 完成当成成交或收入。完成的 Sales Manager 结果首先只是 `REPORTED` 证据；即使员工正文写着“创造 10 万美元价值”，Radar 也只保留为受限报告文本，不自动提取成金额。只有老板在 Account Review 里显式选择“确认结果有效 / 继续观察 / 结果无价值”才会追加一条 `bossai.prospect-outcome-review.v1` 结果复核；可选经营价值金额只允许老板在“确认结果有效”时手工输入，并标记为 `owner-entered`。每条结果复核都绑定当前 Sales Manager Task 和 P8 Owner Decision，写入前会在 SQLite 事务里再次确认该 Sales Task 仍是最新、已完成且授权绑定未变化，避免旧结果串到新任务。潜客工作台新增“经营结果”汇总，只聚合老板手工录入的已确认金额；公开 `/api/prospects` 不返回老板结果备注、快照或价值金额。

P10 在 P9 之上新增只读 `bossai.prospect-outcome-learning.v1`“结果复盘”。它只纳入“当前最新 Sales Manager Task 已完成 + P8 Owner Decision 绑定仍合法”的历史样本，并且只在 Sales Task ID 与 Owner Decision ID 同时匹配时读取对应 P9 结果复核。潜客工作台以白/灰卡片显示 4 个描述性视图：发现来源、官网证据方式、公司业务渠道角色、ICP 词汇覆盖区间；每个 cohort 只显示样本数以及 confirmed / no-value / observing / awaiting 数量。固定小样本门槛以下返回 `insufficient-sample` 并显示“样本不足，暂不形成判断”，不会输出最佳来源、最佳渠道或最可能成交客户。可选金额只聚合老板 `confirm-outcome` 时手工录入的币种金额；员工金额文本、no-value、Radar 分数都不会转成 Revenue / ROI。P10 不修改 `ProspectCandidate.score`、ICP/Sales 资格，不写 CRM，不创建 Manager Task，不调用模型，也不生成 close probability、purchase intent 或 next purchase date。公开 `/api/prospects` 不暴露 P10 私有聚合或老板金额。

P10.1 把这套复盘进一步带回单账户 Account Review：新增只读 `bossai.prospect-outcome-learning-membership.v1`，直接说明“为什么这个账户进入这些复盘分组”。它只展示现有事实：发现来源、官网证据方式与状态、官网公司级业务渠道角色、ICP 词汇覆盖区间，以及当前 Sales Task 是否因“已完成 + P8 授权绑定仍有效”而具备进入 P10 样本的资格。未完成 Sales、无效授权链或 Sales Task 与授权链不一致时明确显示“不进入结果样本”。这不是新的评分、阶段或推荐，也不会产生购买意图、成交概率或因果解释。

P10.2 继续补齐单账户解释：Account Review 现在还会明确显示该账户在当前 Outcome Learning 样本中究竟计作 `confirmed / no-value / observing / awaiting-owner-review / excluded`。该状态完全复用当前精确的 `Sales Manager Task ID + Owner Decision ID` P8/P9 lineage：只有当前最新已完成 Sales Task 且授权链合法时才可能形成结果状态；若当前 lineage 没有匹配的 P9 复核，就只计作等待老板确认；旧 Sales Task / 旧 Owner Decision 的历史复核不会污染新任务。`excluded` 只表示当前不进入样本，不是负向评分；所有状态都不代表 Revenue、ROI、成交概率或购买意图。

P10.3 收口“看见复盘以后下一步怎么做”。Outcome Learning 顶部直接显示当前 eligible 样本数是否达到固定最小样本门槛；业务渠道视图明确提示一个账户可能同时属于多个渠道角色，因此渠道 cohort 样本数不能相加当成独立账户总数。只要 Owner Queue 中存在结果待审，Outcome Learning 会出现“去处理结果待审”入口，经营结果里的“等待老板确认 / 继续观察”卡片也进入同一现有 `result-review` 队列，不新增工作流。Owner Queue attention 筛选改为先向服务端提交 `attention` 再执行当前 500 条有界读取，避免更高优先级账户先占据混合结果后隐藏匹配的结果待审账户。

P10.4 收口结果复盘的一致性、隐私和可达性。会改变 P8/P9/P10 真相的操作现在统一刷新经营结果、Outcome Learning 与老板待审队列；P9/P10 在契约内部按 `reviewedAt DESC + id DESC` 选择当前复核，不再依赖调用者传入的 journal 恰好已排序。老板待审队列首屏保持 10 条、潜客候选首屏保持 12 条，但均可继续展开当前有界结果，潜客接口读取上限保持 500。所有管理员接口统一返回 `Cache-Control: no-store, private` 与 `Pragma: no-cache`。全局 BossAI delegation 列表仍有 200 条边界，并新增 `totalCount/truncated`；若历史覆盖不完整，卡片“没有查到 delegation”只显示为状态未知，并停止直接重复创建 Intelligence/Sales 任务，要求先进入 Account Review 读取该账户的权威最新状态。

P10.5 补齐“从组合复盘回到底层样本证据”的路径。每个非空 cohort 都可以通过管理员只读 `bossai.prospect-outcome-learning-drilldown.v1` 查看当前仍满足 P8/P9 合法链路的样本账户，再直接打开 Account Review 核实来源、官网证据、渠道、Sales/Owner Decision 与结果复核。Drill-down 只返回账户 ID、公司名、域名和当前 contribution state，按公司名稳定排列；它不返回老板 Outcome Review 备注、老板录入经营价值金额或员工价值声明，也不按候选分、价值、成交概率或购买意图排序。任何 P8/P9/P10 真相刷新都会清空旧 drill-down，避免组合视图已更新而样本列表仍停留在旧状态。该路径不创建新阶段、Manager Task、CRM 记录、模型调用或外联动作。

P10.6 进一步把每个 cohort 的 `已确认 / 无价值 / 观察 / 待确认` 数字变成可核实证据入口。非零状态可在同一只读 drill-down 上增加 `state=confirmed|no-value|observing|awaiting-owner-review` 精确过滤，只返回该状态下当前仍合法的样本账户，同时返回 `cohortSampleCount` 保留完整分组分母，避免过滤后误读样本规模。零状态仍只是标签；未知 state 直接 `HTTP 400 / OUTCOME_LEARNING_STATE_INVALID`。该过滤仍按公司名排列，不返回老板备注、经营价值金额或员工金额声明，也不会产生排序、概率、CRM、Manager Task、模型调用或外联动作。

P10.7 收口 Dashboard 只读请求竞态。手动刷新、扫描后的静默刷新、Owner Queue 快速切换、Outcome Learning cohort/state 连续点击以及结果真相刷新都可能产生重叠请求；现在页面统一使用可执行测试覆盖的 `latest-request` gate，只有最新序列响应或错误才有资格写回 UI。旧 Dashboard 批次不能覆盖新的 overview/prospect 状态，旧 trade/delegation/outcome/queue 响应不能污染新读取，truth refresh 会显式 invalidate 未完成的 drill-down，使旧样本列表不能在刷新后重新出现。该机制只控制浏览器读结果的写回顺序，不新增任务、状态机、Scheduler、CRM、Manager authority 或业务判断。

P10.8 把同一竞态保护延伸到 Account Review 权威详情。快速从不同队列/复盘样本打开账户时，只有最新账户详情请求可以更新弹窗；关闭 Account Review 会直接 invalidate 未完成请求，防止关闭后旧详情再次出现。账户切换或重新加载详情时也会 invalidate 旧的 BossAI Manager 结果读取，因此 A 账户的慢员工结果不能写进 B 账户详情。旧请求失败也不会弹出覆盖新页面的错误提示。该机制仍只约束浏览器读取顺序，不改变 Account Review、Manager、审批、CRM 或结果真相的任何服务端权威。

可选的 Web 搜索发现使用正式 Brave Web Search JSON API，而不是抓取 Google/Bing 搜索结果 HTML。只有设置 `RADAR_PROSPECT_SEARCH_PROVIDER=brave` 和服务端 `BRAVE_SEARCH_API_KEY` 后才启用；密钥不会进入浏览器或公开配置。地图企业发现使用 Google Places Text Search (New) JSON API，仅在 `RADAR_PROSPECT_MAP_PROVIDER=google_places` 且服务端配置 `GOOGLE_PLACES_API_KEY` 时启用，并只请求企业名称、公开地址、地点类型与官网 URI。Google Places 可能产生 API 计费，因此默认关闭。`RADAR_PROSPECT_SEARCH_QUERIES` / `RADAR_PROSPECT_MAP_QUERIES` 控制自动扫描查询；老板在“潜客候选”区域输入一次目标企业描述时，已配置的 Web 与 Maps Provider 会并行发现、按域名合并，再统一进入官网二次核验。每个 Provider 查询最多返回 20 条，默认 10 条；并发默认 2；企业官网种子默认并发 4，潜客目录默认并发 3；每轮最多二次核验 `RADAR_PROSPECT_VERIFY_MAX_WEBSITES_PER_SCAN` 个官网（默认 20）。同一 Radar 进程一次只允许一个手动潜客搜索任务，避免重复费用和网络突发。

`RADAR_PROSPECT_ICP_TERMS` 用分号或换行声明老板明确的目标客户词组，例如 `pet supplies;smart feeder;distributor`。Radar 只在完成官网二次核验后，基于企业名称、官网描述和产品/服务信号计算词组覆盖率，并单独显示 `ICP 官网覆盖`。该覆盖率不会改变 Radar 的证据强度分，也不得解释成真实采购意图、预算、成交概率或客户阶段。

“潜客候选”入口还提供一次性的“扩展搜索方向”：未配置 AI Gateway 时使用本地公司角色矩阵，配置 `AI_PROVIDER=bossai-gateway` 时才通过 BossAI Central AI Gateway 生成 6–8 个公司级搜索方向。规划动作本身不启动采集；老板选择某个方向后才执行已配置的 Web/Maps 发现。自动扫描结果按 `公开名录 / Web 搜索 / 地图` 分渠道显示成功、部分成功、失败或未启用状态、候选数量、错误数量和耗时。

贸易/海关数据使用独立 `trade_records` 证据池。老板可导入自己有权使用的 CSV/TSV，Radar 自动映射买方/进口商/供应商/出口商、国家、商品、HS 编码、日期、数量、金额、币种和可选官网；个人邮箱/个人电话等列不会进入贸易证据模型。前端先调用 `/api/admin/trade-records/preview` 做无写入预览，展示推断出的字段映射、重要缺失字段、明确不纳入模型的原始列和公司级样本，老板确认当前文件后才真正导入。贸易证据支持按企业/商品/来源、HS 前缀、交易角色、国家和日期范围筛选；公司摘要按“公司名 + 国家/地区”独立聚合，防止同名跨国企业混算。摘要只描述历史事实：首次/最近历史日期、有效日期样本数、中位/最短/最长历史间隔、`insufficient / single-gap / regular / variable` 历史节奏、商品/HS 覆盖、按币种历史金额和官网状态，并用 `REVIEW_FIRST / REVIEW_SOON / REVIEW_LATER` 仅帮助老板决定人工复核顺序。系统没有 `intentScore`、`purchaseProbability` 或 `nextPurchaseDate`，也不会把历史重复交易推导成当前需求、预算、决策权或成交概率。导入不会自动创建潜客或 CRM。单条记录可显式晋级；公司摘要也可在“公司名 + 国家/地区”身份边界内显式建立一个公司级潜客候选，并把该企业多条历史交易私有挂接到同一候选，但历史交易次数不会抬高潜客基础分。同名跨国家必须先消歧；同一身份出现多个官网域名必须人工选择；无官网时才走已配置 Web/Maps 解析。无论单条还是公司级解析，只有真正通过 robots/SSRF/Sitemap 等受控官网采集并产生 `websiteContext` 的域名才会出现在可采用候选中，失败域名不会伪装成“已核验官网”。显式晋级后只建立私有 `prospect_trade_evidence` 关联，公开 `/api/prospects` 不返回历史贸易金额、数量或来源文件；只有管理员触发 Intelligence 复核时才附带最多 8 条关联历史贸易事实，且只有权威情报结果允许 Sales handoff 并经人工 `READY_FOR_SALES` 后，同一批受限历史事实才可进入 `sales.lead.qualify`。Intelligence 和 Sales 两个独立员工本身也会防御性拒绝未核验官网事实。历史贸易事实始终保持为历史证据，不会自动推导成当前采购意图、预算、决策权、下一次订单或成交概率。

公网部署前必须：

1. 将 `RADAR_ADMIN_API_KEY` 改为足够长的随机值；
2. 通过 HTTPS 反向代理提供服务；
3. 不公开 `.env`、`data/`、SQLite 文件和日志；
4. 关闭不需要的演示入口：`RADAR_DEMO_ENABLED=false`；
5. 遵守各公开来源的接口条款、限额和机器人政策；
6. 需要企业权限、租户隔离和 SLA 时升级到商业 Pro 版。

当 `HOST` 绑定到非回环地址时，服务会拒绝默认值或少于 24 字符的管理员密钥并停止启动。

更多安全说明见 [SECURITY.md](SECURITY.md)。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务、版本和许可状态 |
| GET | `/api/overview` | 总览、统计、调度和最新日报 |
| GET | `/api/opportunities` | 机会列表 |
| GET | `/api/prospects` | 潜客候选列表；候选与 CRM 正式线索隔离 |
| POST | `/api/admin/prospects/plan` | 一次性扩展公司级搜索方向；不会启动采集或写 CRM |
| POST | `/api/admin/prospects/discover` | 管理员输入目标企业描述，通过已配置 Web/Maps API 发现候选并做有界官网核验；不会写 CRM |
| GET | `/api/admin/trade-records` | 管理员查看/筛选本地贸易证据和公司级历史摘要；历史节奏仅供人工复核排序 |
| POST | `/api/admin/trade-records/preview` | 无写入预览 CSV/TSV 字段映射、缺失字段、忽略列和公司级样本 |
| POST | `/api/admin/trade-records/import` | 确认导入有权使用的 CSV/TSV 贸易记录；去重但不创建潜客/CRM |
| POST | `/api/admin/trade-records/:id/resolve-website` | 对无官网贸易记录显式搜索并受控核验候选官网；只返回已核验建议，不自动采用 |
| POST | `/api/admin/trade-records/:id/prospect` | 对已选定官网做受控核验并显式建立单条贸易证据潜客候选；仍需 Intelligence 审核 |
| POST | `/api/admin/trade-companies/resolve-website` | 按公司名 + 国家/地区解析/核验公司官网；多候选必须人工选择 |
| POST | `/api/admin/trade-companies/prospect` | 在身份与官网消歧后建立公司级潜客候选并私有关联该组历史贸易证据；不提高购买意向分 |
| POST | `/api/admin/prospects/:id/verify-website` | 对搜索/地图/名录仅发现的 `unverified` 潜客显式核验官网；不创建员工任务/CRM |
| PATCH | `/api/admin/prospects/:id` | 人工更新潜客审核状态；官网证据已核验且 Intelligence 权威结果明确允许 Sales handoff 后才接受 `READY_FOR_SALES` |
| POST | `/api/admin/prospects/:id/delegate` | 仅将已核验/静态不完整官网证据交给 Intelligence Agent 复核；`unverified` 会 fail-closed，不创建 CRM |
| POST | `/api/admin/prospects/:id/qualify` | 仅对人工批准的 `READY_FOR_SALES` 候选创建 `bossai-sales-agent` / `sales.lead.qualify` Manager 任务；仍不写 CRM |
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
| GET | `/api/admin/followups?lang=zh&days=7` | 获取今日、逾期、未排期和未来跟进队列 |
| GET | `/api/admin/followups/report.md?lang=zh` | 下载中文或英文跟进日报 |
| GET | `/api/admin/followups/calendar.ics` | 下载跟进日历 |
| GET | `/api/admin/leads/:id/followup-draft` | 生成单条线索跟进话术和建议下一步 |
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
├── integrations/               # MCP 配置示例
├── public/                     # 中英文仪表盘、商业授权页、线索后台和 i18n 词典
├── skills/                     # 通用、OpenClaw 与 Hermes Skill
├── scripts/                    # 构建、Skill 安装、发布打包与发布门禁
├── src/
│   ├── ai.ts                   # 可选 OpenAI-compatible 分析
│   ├── brief.ts                # 三层情报简报与内容选题
│   ├── collectors.ts           # Reddit / HN / GitHub / ArXiv / RSS 采集器
│   ├── config.ts               # 环境配置
│   ├── database.ts             # SQLite 证据库和兼容迁移
│   ├── demo.ts                 # 明确标记的合成演示数据
│   ├── leads.ts                # 线索校验、评分与状态输入规范化
│   ├── followups.ts            # 跟进队列、话术、日报和日历
│   ├── radar-api-client.ts     # Agent 与 MCP 共用 API Client
│   ├── mcp.ts                  # MCP 工具与 Prompt 注册
│   ├── mcp-server.ts           # stdio MCP 入口
│   ├── agent-cli.ts            # 无 MCP 环境的 JSON CLI
│   ├── pipeline.ts             # 全链路编排与失败隔离
│   ├── report.ts               # CEO 日报
│   ├── scheduler.ts            # 每日定点扫描
│   ├── security.ts             # 公网监听与管理员密钥启动门禁
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

v0.7.1 发布门禁覆盖：

- 数据库、机会、线索和跟进生命周期；
- 官方 MCP Client、9 个默认工具、2 个 Prompt 和可选写权限；
- Agent JSON CLI 与跨工作目录 `.env` 加载；
- 通用、OpenClaw、Hermes Skill 安全检查；
- `agent-install.json`、`AGENTS.md`、`CLAUDE.md` 和双语自安装文档；
- 本地 `npx` 包入口；
- 无修改 `--dry-run`；
- 临时 OpenClaw 完整 Skill 安装；
- 强密钥不回显、默认只读权限和配置无密钥；
- 后台服务启动、状态、健康检查和停止；
- 前端 JavaScript、双语词典和 TypeScript 生产构建；
- Windows ZIP、runtime tar.gz 与 SHA256 校验。

详细变更见 [CHANGELOG.md](CHANGELOG.md)，本版发布文案见 [docs/RELEASE_NOTES_v0.7.1.md](docs/RELEASE_NOTES_v0.7.1.md)。

## 免责声明

公开帖子不等于已验证订单。系统输出用于机会筛选，不构成投资、法律或财务建议。涉及预算、收入、客户数和市场规模时，必须打开真实原始链接人工复核。