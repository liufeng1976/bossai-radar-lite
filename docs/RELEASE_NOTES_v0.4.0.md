# BossAI Radar Lite v0.4.0

## 中文

v0.4.0 是 **商业线索与成交漏斗版本**。它把 v0.3 的商业授权申请和 Pro 等待名单，从“生成邮件”升级为可选的本地入库、自动评分、报价、跟进和成交管理闭环。

### 新增

- 商业申请直接保存到本地 SQLite；
- 仍保留申请预览、复制和邮件备份；
- 24 小时相同联系方式与申请类型去重；
- 默认每个网络来源每小时 5 次提交限制；
- 隐藏蜜罐字段拦截简单机器人；
- 自动线索评分与 HOT / WARM / COOL 优先级；
- Pro 等待名单自动进入 WAITLIST；
- NEW、QUALIFIED、CONTACTED、PROPOSAL、NEGOTIATION、WON、LOST 成交漏斗；
- 中英文商业线索后台；
- 姓名、公司、场景和联系方式搜索；
- 状态、申请类型和优先级筛选；
- 负责人、报价、币种和下次跟进时间；
- 电话、邮件、会议、报价和备注活动记录；
- 按币种分别统计报价与成交金额；
- CSV 导出；
- 单条线索及全部活动永久删除；
- 中英文线索数据与隐私说明；
- 管理员接口由 `RADAR_ADMIN_API_KEY` 保护。

### 隐私和安全

- 不把访问者原始 IP 写入数据库；
- IP 只在进程内用于短时限流；
- 公开接口只能提交，不能读取线索；
- `.env`、SQLite 和导出文件不得进入仓库或发布包；
- 公网部署必须使用 HTTPS 和强随机管理员密钥。

## English

v0.4.0 is the **commercial lead and sales pipeline release**. It upgrades the v0.3 commercial-license and Pro-waitlist flow from email generation into an optional local lead database with scoring, quotes, follow-up activity and conversion management.

### Added

- direct local SQLite storage for commercial applications;
- preview, copy and email-backup modes remain available;
- 24-hour deduplication by contact and application type;
- default limit of five submissions per network source per hour;
- a hidden honeypot field for basic bot filtering;
- automatic lead scoring and HOT / WARM / COOL priority;
- Pro waitlist submissions routed to WAITLIST;
- NEW, QUALIFIED, CONTACTED, PROPOSAL, NEGOTIATION, WON and LOST funnel stages;
- bilingual commercial lead workspace;
- search across name, company, use case and contact;
- filters for status, application type and priority;
- owner, quote, currency and next-follow-up fields;
- call, email, meeting, quote and note activity history;
- quote and won value reported separately by currency;
- CSV export;
- permanent deletion of a lead and its full activity history;
- Chinese and English lead-data privacy notices;
- administrator APIs protected by `RADAR_ADMIN_API_KEY`.

### Privacy and security

- raw visitor IP addresses are not written to the database;
- IP addresses exist only in process memory for short-term rate limiting;
- public APIs can submit but cannot read leads;
- `.env`, SQLite and exported files must never enter the repository or release archives;
- public deployments require HTTPS and a strong random administrator key.

## Validation

- lead validation and scoring tests passed;
- waitlist routing passed;
- consent and honeypot rejection passed;
- 24-hour deduplication passed;
- multi-currency quote statistics passed;
- status, quote and activity lifecycle passed;
- public submit, administrator read/update/export/delete smoke tests passed;
- bilingual dictionary, frontend syntax and TypeScript production build passed.
