# Contributing to BossAI Radar Lite

感谢你参与 BossAI Radar Lite。

## 贡献范围

欢迎提交：

- 公开数据源的合规采集器；
- 去重、评分、证据审计和失败隔离改进；
- 仪表盘可用性、无障碍和移动端优化；
- 测试、文档、安装流程和安全修复；
- 不依赖绕过登录、验证码、访问控制或平台限制的实现。

不接受：

- 伪造职位、收入、预算、客户或市场数据；
- 绕过平台认证、验证码、Cookie 限制或机器人政策；
- 默认上传用户数据库、模型密钥或私有数据；
- 将 Lite 版改造成未授权商业交付包的变更。

## 本地开发

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

提交前必须执行：

```powershell
npm run release:check
```

## 代码要求

- TypeScript 开启严格模式；
- 新业务规则必须有确定性测试；
- 采集器必须设置超时并返回来源级错误；
- AI 输出不得覆盖确定性分数和最终决策；
- 新增演示数据必须设置 `isDemo: true`，且不得冒充真实链接；
- 环境变量必须同步写入 `.env.example`，不得提交真实密钥。

## 提交流程

1. 从 `main` 创建功能分支；
2. 保持一次提交聚焦一个问题；
3. 在 Pull Request 中说明问题、方案、测试和许可影响；
4. 涉及新数据源时，附上公开接口条款或合规边界说明；
5. 不要在提交中包含 `data/`、`.env`、日志或本地数据库。

## 许可

提交代码即表示你有权贡献该代码，并同意贡献内容按本仓库的 BossAI Radar Lite Non-Commercial License 1.0 提供。商业使用仍需获得版权方单独书面授权。
