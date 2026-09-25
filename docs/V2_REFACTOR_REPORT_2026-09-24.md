# Decision Pipeline v2 重构完成报告

日期：2026-09-24
结论：架构与代码重构、合成 Provider smoke 和本地数据库/API gate 已完成；真实 Gmail、Calendar 与代表性语料验收需要项目方介入。

## 重构前完成度与文档差异

重构前的 Google OAuth、Gmail 安全动作、Undo、Draft、Calendar FreeBusy、Extension UI 和删除数据闭环已经存在，约占产品交付面的多数；但核心判断路径仍与最新 v2 文档不一致：

| 最新 v2 要求 | 重构前代码 | 当前代码 |
|---|---|---|
| 分类判断使用 JEV 概率原语 | 单次 OpenAI 调用混合分类、摘要、动作和事实 | JEV `systemOne` Choice/Noul/Score；Luna 为显式 fallback |
| 模型只负责 signals | 模型生成 Review、action、reason、summary | 本地策略拥有 Review、priority、attention、action；summary 独立 |
| 保留 message 边界 | Thread 正文被拼成一个字符串 | 每条 message 独立正文、headers、附件 metadata 与归一化 |
| Evidence 可回指但不持久化正文 | 模型生成 `verified_facts` | 临时 EvidenceEnvelope，仅 decision record 入库 |
| cache 必须包含完整 pipeline version | 仅 account/thread/version | 增加 normalizer/question-set/policy pipeline version |
| 首项不等待整批 | API 分析最多 50 封后统一返回 | Extension 当前项优先，随后并行预取 4 项 |
| summary 不阻塞判断 | summary 是 analyze 的必需字段 | `/summary` 独立缓存、独立 loading/error |

## 已完成实现

1. Shared contracts 已迁移到 `DecisionSignalsV2`、`DerivedStateV2`、`AnalysisResultV2` 和完整概率分布校验。
2. Gmail Gateway 与 normalizer 已改为 per-message 数据结构，支持 HTML-only fallback、逐消息签名/引用清理和紧凑 evidence refs。
3. 默认 `DECISION_BACKEND=jev`；TypeSafe SDK 日志关闭，避免 request body 进入 SDK debug log。`openai-luna` 使用同一输出契约，不做隐式逐请求级联。
4. RecommendationPolicy 以固定阈值、top-two margin、附件依赖、线程矛盾和跨字段冲突决定 Review 与动作。
5. OpenAI generation 拆为 Summary 与 Draft；两者使用 `store:false` 且无 hosted tools。Meeting Draft 仍只使用 FreeBusy 产生的 slots。
6. PostgreSQL migration 增加 pipeline-aware decision cache 与独立 summary cache；migration 可重复运行，旧 v1.1 cache 不会被当作 v2。
7. Extension 已消费 v2 contract；旧 `/v1/triage/queue` 和旧 v1.1 写路径已删除。
8. 加入 synthetic/de-identified seed fixtures、locked labels、policy cases 与 `npm run eval:policy`。
9. JEV 与 Luna 使用同一分类口径：营销 CTA（shop/view/learn more/unsubscribe）不构成 `REQUEST_ACTION` 或必须行动；最终推荐继续由确定性策略生成。

## 当前验证证据

- `npm run typecheck`：contracts、API、Extension 全部通过。
- `npm test`：12 个 test files、42 个 tests 全部通过。
- `npm run build`：contracts、API TypeScript build 与 Extension production build 通过。
- `npm run eval:policy`：5/5 seed policy cases 通过。
- `npm run eval:smoke`：JEV 3/3、GPT-6 Luna 3/3 locked synthetic fixtures 通过；Luna summary 返回有效结构化摘要。
- PostgreSQL 17 容器健康；v2 migration 连续执行两次均成功，证明本地幂等性。
- `npm run phase8a:live`：22/22 本地 checks 通过，包括 API health、未授权边界和 9/9 数据表检查。
- Google OAuth 实机连接与增量 Calendar 授权通过：exchange/status 均返回 200；本地库确认 1 个连接账户，包含 Gmail Modify 与 Calendar FreeBusy scopes，refresh token 仅以加密值保存。
- 自动化覆盖包括概率和校验、低 margin、附件/矛盾 Review、Promotion/Subscription、Meeting、隐私持久化、summary cache、idempotency 与 Undo。

## 仍需项目方介入

以下工作无法由本地 synthetic 环境真实证明：

1. 确认可用于 locked evaluation 的代表性、去标识或纯 synthetic 邮件 corpus 及人工标签；当前 3 条 seed fixture 只验证 harness 和口径一致性，不代表生产质量。
2. 用扩展后的 locked set 生成 per-class precision/recall/F1、Brier、ECE、p50/p95、错误率与成本报告，并据此校准阈值。
3. 将当前 Extension ID 加入 Google OAuth test users/redirect 配置，安装 MV3 Extension，按 `MANUAL_ACCEPTANCE.md` 验证真实 Gmail/Calendar、Recipient、Thread、Undo、SPA、DST 与 provider disclosure。
4. 对真实账户流程执行日志检查，确认不存在 raw body、EvidenceEnvelope value 或 Draft text 持久化/日志泄漏。

在上述证据完成前，代码可以继续本地开发，但不能将 Phase 8 或外部 Alpha 标记为通过。
