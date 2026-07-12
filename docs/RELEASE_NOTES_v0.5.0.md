# BossAI Radar Lite v0.5.0

## 中文

v0.5.0 是 **自动跟进与每日销售行动版本**。它不增加新的资讯源，而是把 v0.4 已经进入数据库的商业线索转化为每天可执行的销售队列。

### 新增

- OVERDUE、TODAY、UNSCHEDULED、UPCOMING 四类跟进队列；
- 综合逾期、优先级、成交阶段、上线时间和报价的紧迫度排序；
- 今日到期和逾期指标；
- 中英文管理员原因和建议动作；
- 根据客户语言生成的个性化邮件/消息话术；
- NEW → QUALIFIED → CONTACTED → PROPOSAL → NEGOTIATION → WON 建议推进；
- 一键应用建议阶段和下一次跟进时间；
- 一键复制话术；
- 可识别邮箱时打开本机邮件客户端；
- 中文 / 英文 Markdown 跟进日报；
- 未来 30 天 `.ics` 跟进日历；
- 逾期日历事件自动调整到最近可执行时段；
- 中英文每日跟进工作法文档；
- 跟进队列、话术、日报和日历管理员 API。

### 安全边界

- 不自动发送邮件、微信或短信；
- 不把跟进数据发送给第三方服务；
- 所有跟进接口均受 `RADAR_ADMIN_API_KEY` 保护；
- `WON` 和 `LOST` 不进入活跃队列；
- 管理建议语言与客户话术语言分离。

## English

v0.5.0 is the **automated follow-up and daily sales action release**. It does not add more news sources. Instead, it converts the commercial leads already captured in v0.4 into an executable daily sales queue.

### Added

- OVERDUE, TODAY, UNSCHEDULED and UPCOMING follow-up queues;
- urgency ranking based on due status, priority, sales stage, launch timing and quote presence;
- due-today and overdue metrics;
- bilingual administrative reasons and recommended actions;
- personalized customer-facing email/message drafts in the lead's language;
- recommended NEW → QUALIFIED → CONTACTED → PROPOSAL → NEGOTIATION → WON progression;
- one-click application of the recommended stage and next follow-up date;
- one-click draft copy;
- local email-client launch when an email address is recognized;
- Chinese and English Markdown follow-up briefs;
- 30-day `.ics` follow-up calendar export;
- overdue calendar items moved to the nearest executable time;
- Chinese and English daily follow-up operating guides;
- administrator APIs for queues, drafts, reports and calendars.

### Security Boundary

- no automatic email, WeChat or SMS sending;
- no follow-up data is sent to third-party services;
- every follow-up endpoint requires `RADAR_ADMIN_API_KEY`;
- `WON` and `LOST` are excluded from the active queue;
- administrative language and customer-draft language are handled separately.

## Validation

- deterministic queue classification and sorting passed;
- bilingual draft generation passed;
- recommended stage and next-date generation passed;
- bilingual Markdown report generation passed;
- valid iCalendar generation passed;
- protected API integration tests passed;
- frontend syntax, bilingual dictionary and TypeScript build passed.
