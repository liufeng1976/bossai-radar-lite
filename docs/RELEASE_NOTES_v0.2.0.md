# BossAI Radar Lite v0.2.0

## 本版本定位

v0.2.0 是首个适合对外发布和销售演示的封版版本。重点不是增加更多数据源，而是把首次体验、真实性标识、商业授权和发布治理补完整。

## 主要更新

### 1. 一键载入完整 Demo

页面新增“载入演示”按钮，可立即生成：

- 9 条明确标记的合成证据；
- Reddit、Hacker News、GitHub 三种来源展示；
- 3 个机会类别；
- `BUILD`、`SELL_SERVICE`、`WATCH` 三档决策；
- CEO 摘要和 Markdown 日报。

Demo 不提供伪造帖子链接，且真实扫描会排除所有演示证据。

### 2. 商业授权入口

页面新增商业授权弹窗，明确说明：

- 哪些场景免费；
- 哪些场景必须取得授权；
- Lite 与 Pro 的能力边界；
- 商业授权联系方式。

### 3. 数据库无损升级

v0.1 的 SQLite 数据库会自动增加 `is_demo` 字段，不需要删除数据库或重新初始化。

### 4. 中英文商业信号识别

确定性评分新增中文痛点、预算、付费、竞争和紧迫性词组，中文演示与后续中文 Feed 可以进入同一套评分体系。

### 5. 可预测的启动行为

新增：

```env
RADAR_RUN_ON_STARTUP=true
```

它与 `RADAR_AUTO_SCAN` 分开控制。销售演示时可关闭启动扫描，直接载入 Demo。

### 6. 发布治理

新增：

- 商业授权说明；
- Lite / Pro 比较表；
- 安全策略；
- 贡献规范；
- Issue 与 Pull Request 模板；
- GitHub 展示图；
- 自动发布一致性门禁。

## 验证结果

- 自动化测试：10 项通过；
- v0.1 数据库升级测试：通过；
- Demo 隔离与三档决策测试：通过；
- 前端 JavaScript 语法检查：通过；
- TypeScript 生产构建：通过；
- 发布文件与版本一致性检查：通过；
- 本地仪表盘：HTTP 200；
- Demo API：9 条证据、3 个机会，稳定覆盖 BUILD / SELL_SERVICE / WATCH；
- Demo 后真实扫描：12 条公开信息、5 个真实机会，全部 `isDemo=false`；
- Reddit 网络失败被隔离，Hacker News 与 GitHub 仍正常完成；
- Markdown 日报下载：HTTP 200。

## 安装

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

销售演示建议配置：

```env
RADAR_AUTO_SCAN=false
RADAR_RUN_ON_STARTUP=false
RADAR_DEMO_ENABLED=true
```

启动后打开 `http://127.0.0.1:3080`，点击“载入演示”。

## 许可提醒

本项目使用 source-available non-commercial license。商业 SaaS、咨询交付、企业营收用途、付费课程打包、白标、转售和商业再分发均需单独书面授权。

联系：`liufeng420594566@gmail.com`
