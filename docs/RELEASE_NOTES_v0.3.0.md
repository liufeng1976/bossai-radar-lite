# BossAI Radar Lite v0.3.0

## 中文

v0.3.0 是 **中英文双语与商业转化版本**，在 v0.2.0 的证据采集、确定性评分、Demo 隔离和非商业许可基础上，补齐了面向国内外用户的产品体验和 GitHub 正式发布能力。

### 新增

- 中文 / English 一键切换；
- 语言选择保存在浏览器，并自动带到授权页和 Pro 等待名单；
- 中英文机会标题、决策、类别、价格和运行状态；
- 9 条 Demo 证据的英文展示文本；
- 中文与英文 Markdown 日报下载；
- 英文日报由结构化机会数据重新生成，不复用中文正文；
- 中英文商业授权申请页；
- 中英文 Pro 等待名单；
- 本地生成、可复制或通过邮件发送的结构化申请；
- `README_EN.md` 英文项目首页；
- 双语词条完整性自动门禁；
- GitHub Actions CI；
- 标签触发的 GitHub Release 自动发布；
- Windows ZIP、runtime tar.gz 和 SHA256 校验打包。

### 商业许可

BossAI Radar Lite 继续采用 **BossAI Radar Lite Non-Commercial License 1.0**。

以下场景必须取得单独书面授权：收费 SaaS、咨询交付、付费课程、企业经营、白标、OEM、转售、商业集成和托管服务。

商业申请入口：

```text
/commercial.html?intent=commercial
```

Pro 等待名单：

```text
/commercial.html?intent=pro-waitlist
```

## English

v0.3.0 is the **bilingual and commercial-conversion release**. It adds a complete Chinese/English product experience and production-ready GitHub release workflow on top of the v0.2 evidence, scoring, demo-isolation and licensing foundation.

### Added

- one-click Chinese / English switching;
- persistent browser language selection;
- localized opportunity titles, decisions, categories, prices and run status;
- English display text for all nine demo evidence items;
- Chinese and English Markdown report downloads;
- English reports regenerated from structured opportunity data;
- bilingual commercial-license application page;
- bilingual BossAI Radar Pro waitlist;
- local-only structured application preview, copy and email flow;
- complete `README_EN.md`;
- automated bilingual dictionary completeness checks;
- GitHub Actions CI;
- tag-triggered GitHub Release publishing;
- Windows ZIP, runtime tar.gz and SHA256 release assets.

### License

BossAI Radar Lite remains licensed under the **BossAI Radar Lite Non-Commercial License 1.0**.

Written authorization is required for paid SaaS, consulting delivery, paid courses, internal revenue-supporting business use, white label, OEM, resale, commercial integration and managed services.

## Validation

- backend and migration tests passed;
- demo/live evidence isolation passed;
- English report generation test passed;
- frontend JavaScript syntax checks passed;
- bilingual dictionary completeness check passed;
- TypeScript production build passed;
- release packaging and checksum generation passed;
- Chinese and English dashboard/report smoke tests passed.
