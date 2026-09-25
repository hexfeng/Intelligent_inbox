# Intelligent Inbox v2 重构与后续开发计划

日期：2026-09-24
状态：Code-complete baseline; external validation pending
依据：[Decision Pipeline v2](DECISION_PIPELINE_V2.md) 和 [架构再评估](ARCHITECTURE_RESEARCH_2026-09-24.md)

## 结论

现有产品已经完成了大部分用户界面、Google 集成和安全执行闭环，不需要重写整个项目。架构变更集中在“读取 Gmail Thread 之后、执行安全动作之前”的 intelligence pipeline。

开发策略采用原地分层重构：先保护现有安全行为，再替换输入结构、判断契约、Recommendation 所有权和按需生成路径。每个阶段都保持 typecheck、测试和生产 build 可通过，不同时建设第二套服务。

## 执行状态（2026-09-24）

R1 至 R6 与 R8 的代码迁移已经完成：per-message 输入、v2 contracts、JEV/Luna DecisionProvider、确定性策略、pipeline-aware persistence、独立 Summary/Draft、Extension rolling prefetch 和旧写路径清理均已落地。R7 已加入去标识 seed fixtures、locked labels、表驱动 policy tests、`npm run eval:policy` 与 `npm run eval:smoke`；JEV/Luna 在当前 3 条 synthetic locked fixtures 上均为 3/3，通过本地 PostgreSQL migration 与 22/22 Phase 8A live gate。概率校准、延迟/成本报告仍需要经产品确认的代表性邮件语料。

因此，后续不再是架构重构，而是外部验证与阈值校准。准确的完成项、验证证据和介入点见 [v2 refactor report](V2_REFACTOR_REPORT_2026-09-24.md)。

## 当前成果如何处理

| 当前模块 | 处理决定 | 原因 |
|---|---|---|
| Chrome MV3 Extension 与 Gmail 挂载 | 保留 | 产品载体和故障边界不变 |
| OAuth、加密 refresh token、账号隔离 | 保留并回归 | 与模型架构无关，属于已建立的安全资产 |
| Gmail connector | 保留 API 调用，重构 Thread 返回结构 | 当前把所有消息拼成一个字符串，无法可靠回指证据 |
| Calendar FreeBusy 与 slot ranking | 保留 | 已是确定性工具路径，符合 v2 设计 |
| Action Executor、idempotency、Undo | 原样保留并回归 | 不应受模型替换影响 |
| `EmailIntelligenceV11` | 替换为 v2 signals、derived state 和独立 summary | 当前混合分类、生成、事实与产品政策 |
| `OpenAIIntelligenceProvider` | 拆分 | `analyze`、summary、Draft 是不同任务 |
| `buildRecommendationSet` | 重写为纯 `RecommendationPolicy` | 当前直接信任模型 `suggested_action` |
| `verified_facts` | 删除模型所有权，改为 ephemeral EvidenceEnvelope | strict schema 不能证明事实存在于原文 |
| `confidence` | 删除单一总分，保留每个 Jev 判断的概率与 confidence | 总分没有可执行语义，也未校准 |
| Thread Panel | 保留交互，summary 改为独立 loading state | summary 不再阻塞判断和 recommendation |
| Triage Overlay | 保留交互，重构数据加载 | 当前要等最多 50 封全部分析完成 |
| PostgreSQL 与 repository | 保留，增加 pipeline version 和 v2 缓存区分 | 防止 v1.1 缓存冒充 v2 结果 |
| Feedback 与 eval | 扩展 taxonomy 和 probability metrics | 需要分别测 Provider 与 Policy |

## 已完成阶段的重新判定

| 原阶段 | 原状态 | v2 影响 | 新状态 |
|---|---|---|---|
| Phase 0 Development Readiness | 代码完成，真实账号证据待补 | Contract 需要从 v1.1 升级为 v2 | 重新打开 contract gate |
| Phase 1 Foundation and Gmail Connector | 代码完成 | Connector 输出与 normalizer 需要重构 | 部分重新打开 |
| Phase 2 Email Intelligence Core | 代码完成，质量证据待补 | 核心实现被替换 | 重新打开并优先处理 |
| Phase 3 Safe Actions and Undo | 代码完成 | 无架构性修改 | 保持完成，执行回归 |
| Phase 4 Thread Panel and Feedback | 代码完成 | API shape、summary loading、反馈字段变化 | 部分重新打开 |
| Phase 5 Smart Reply | 代码完成，事实评测待补 | Draft provider 保留，context 和 evidence 改造 | 部分重新打开 |
| Phase 6 Inbox Triage | 代码完成，DOM 证据待补 | 全队列等待改为 rolling prefetch | 部分重新打开 |
| Phase 7 Calendar FreeBusy | 代码完成，真实账号证据待补 | Meeting gate 改读 derived state | 小范围适配 |
| Phase 8 Alpha Hardening | 未通过 | 增加 v2 migration、calibration 和 provider evidence | 保持关闭 |

## 重构顺序

### R0 保护现有安全闭环

目标：在改变 intelligence pipeline 前建立不会被重构破坏的回归基线。

开发项：

- 为 Analyze、Draft、Meeting Draft、Action、Undo 和 Triage 补充当前 API contract tests。
- 固定跨账号、stale thread、未知 action、重复 idempotency key、Undo conflict 和错误 recipient 测试。
- 建立 v1.1 fixture 快照，仅用于比较迁移前后用户行为，不作为 v2 输出契约。
- 记录当前单 Thread 与 10 Thread 的首项可用时间、整批时间和 Provider 调用数。

Exit Gate：现有 24 个自动化测试继续通过；新增安全回归可稳定复现当前行为；基准报告可重复运行。

### R1 Per-message input 与 EvidenceEnvelope

目标：先修正所有后续判断和生成共同依赖的输入。

主要文件：

- `apps/api/src/domain.ts`
- `apps/api/src/google-gateway.ts`
- `apps/api/src/normalizer.ts`
- `apps/api/src/normalizer.test.ts`

开发项：

- `ThreadSnapshot` 改为保留每条 message 的 ID、headers、sender、recipient、时间、正文和附件 metadata。
- 每条 message 独立处理 signature、quoted history、重复内容和 HTML-only fallback。
- 新建 ephemeral `EvidenceEnvelope`，为 header 和正文候选保留 message、field 和 offset。
- 保持 Draft recipient、Message-ID、References 和 per-message label 行为不变。

Exit Gate：多消息签名不会截断后续消息；HTML-only、quoted history、自回复、附件依赖和冲突 fixtures 通过；Draft recipient 与 Undo 回归无退化。

### R2 v2 Contracts 与兼容适配

目标：引入新的判断契约，但不要求 UI 在同一个提交中完成迁移。

主要文件：

- `packages/contracts/src/index.ts`
- `packages/contracts/src/contracts.test.ts`
- `apps/api/src/domain.ts`
- `apps/extension/src/content/types.ts`

开发项：

- 新增 `DecisionSignalsV2`、`DerivedStateV2`、`AnalysisResultV2` 和每题概率 schema。
- 拆分 `content_type`、`communication_intent` 和 subscription/automation/reply/action 属性。
- 从 model contract 移除 `summary`、`suggested_action`、`reason_code`、`review_required`、总 `confidence` 和 `verified_facts`。
- 增加短期 v2-to-current-view adapter，使重构期间 Extension 仍能渲染；UI 迁移完成后删除 adapter。
- Feedback schema 增加 v2 字段，旧字段在过渡期只读。

Exit Gate：无任意字符串可进入枚举字段；概率和为 1 的容差、缺失选项、非法分数和 schema version 均有测试；adapter 不产生模型未提供的伪概率。

### R3 DecisionProvider 与 Jev 主通路

目标：让高频封闭判断从生成模型迁移到 Jev。

建议新增：

- `apps/api/src/decision-provider.ts`
- `apps/api/src/typesafe-decision-provider.ts`
- `apps/api/src/openai-decision-provider.ts`
- `apps/api/src/decision-questions.ts`

开发项：

- 使用官方 JavaScript/TypeScript SDK [`@typesafe-ai/sdk`](https://docs.typesafe.ai/sdk/javascript) 实现一次 `systemOne` 请求。
- 同一 normalized state 并行发送所有独立 Choice、Noul 和 Score 问题。
- 保存 provider、model、question set 和 usage metadata，但不保存完整 request/response。
- 用 GPT-6 Luna 实现相同接口，作为显式配置 fallback 和对照基线。
- 配置从 `OPENAI_CLASSIFIER_MODEL` 迁移为 `DECISION_BACKEND`、`TYPESAFE_API_KEY`、`TYPESAFE_MODEL` 和仅在 Luna fallback 下需要的 `OPENAI_DECISION_MODEL`；不在第一版做请求级自动级联。

Exit Gate：Jev 输出完全通过本地 Zod contract；一个 Thread 只产生一次 Jev 判断请求；Provider timeout、invalid response 和缺少配置只会返回 Review/错误，不会产生自动动作。

### R4 RecommendationPolicy 与 Review Gate

目标：把产品政策从模型输出迁移到可测试代码。

主要文件：

- `apps/api/src/recommendations.ts`
- `apps/api/src/app.ts`
- 新增 `apps/api/src/recommendation-policy.test.ts`

开发项：

- 用纯函数从 signals、用户设置、scope、thread state 和 label ID 生成 derived state 与 recommendations。
- 为不同类别和风险定义版本化阈值、probability margin 和跨字段 invariant。
- `review_required`、`attention_state`、`priority` 和 reason codes 全部由代码产生。
- 模型不能生成 `ActionType`、label ID 或 payload。
- Meeting Draft gate 改为读取 derived `REQUEST_MEETING` 与 policy recommendation。

Exit Gate：相同输入必然产生相同结果；所有可执行 action 都能追溯到 policy rule；Promotion/Subscription、Receipt/Promotion、reply/action 冲突和低 margin 有表驱动测试；危险动作暴露为 0。

### R5 Persistence 与 API 迁移

目标：让 v1.1 和 v2 缓存边界明确，保持回滚能力。

主要文件：

- 新增 `apps/api/db/migrations/002_decision_pipeline_v2.sql`
- `apps/api/src/postgres-repository.ts`
- `apps/api/src/app.ts`

开发项：

- intelligence cache 增加 `pipeline_version`、provider/model/question set/policy metadata。
- cache lookup 必须匹配 account、thread、thread version 和 pipeline version。
- v1.1 缓存不转换为 v2；切换后忽略并按计划清理。
- `/analyze` 返回 signals、derived state、recommendations、thread header 和 pipeline version。
- 增加独立 `/summary` 路径；Draft 路径实时重建 EvidenceEnvelope。

Exit Gate：旧缓存不能被 v2 路径读取；升级和回滚不会破坏 recommendation/action 外键关系；数据库和日志中不存在 raw body、EvidenceEnvelope value 或 Draft text。

### R6 Generation 与 Extension 迁移

目标：把判断首屏、摘要和 Draft 的等待时间解耦。

主要文件：

- 拆分 `apps/api/src/openai-provider.ts`
- `apps/extension/src/content/ThreadPanel.tsx`
- `apps/extension/src/content/TriageOverlay.tsx`
- `apps/extension/src/content/InboxLauncher.tsx`

开发项：

- `SummaryProvider` 默认使用 GPT-6 Luna，`DraftProvider` 使用 GPT-6 Sol。
- 把生成配置明确拆为 `OPENAI_SUMMARY_MODEL` 与 `OPENAI_DRAFT_MODEL`，避免判断模型配置控制生成路径。
- Thread Panel 先显示判断与 recommendation，再独立显示 summary loading/error/ready。
- Triage 由 Extension 持有 thread ID 队列，当前项优先，滚动预取 3 到 5 项。
- 当前项摘要按需获取；第 40 封失败不能阻塞第 1 封。
- UI 不显示未校准的单一 confidence；Review 显示稳定 reason code。
- UI 完成迁移后删除旧 `/v1/triage/queue` 和 v2-to-current-view adapter。

Exit Gate：第一项无需等待整批；summary 失败不阻止安全 recommendation；Draft 只使用验证事实；键盘、焦点保护、Gmail DOM fallback 和无自动发送回归通过。

### R7 Repo-local Evals 与阈值校准

目标：分别证明 Provider、Policy 和 Generation 的质量。

建议新增：

```text
evals/
  fixtures.deidentified.jsonl
  labels.locked.jsonl
  scorers/
  reports/
```

开发项：

- 覆盖 Conversation、Newsletter、Promotion、Notification、Invoice、Receipt、subscription、多意图、附件依赖和矛盾 Thread。
- 报告 per-class precision、recall、F1、Brier score、ECE、coverage、Review catch rate、p50/p95、错误率和成本。
- 固定 signals 测 RecommendationPolicy，不把 Provider 误差与策略 bug 混成一个分数。
- Summary 和 Draft 单独测 evidence trace、recipient correctness、Calendar slot trace 与盲评编辑率。
- 阈值变更必须带 locked set 差异报告和 policy version 更新。

Exit Gate：schema validity 100%；危险动作暴露 0；Draft recipient 和 Calendar slot trace 100%；每个自动化类别达到书面阈值；没有用总体 accuracy 掩盖小类退化。

### R8 Cutover Cleanup 与 Alpha Gate

目标：移除临时兼容代码，并重新完成 Alpha 证据。

开发项：

- 默认 `DECISION_BACKEND=jev`，记录实际 backend 和 pipeline version。
- 删除 `EmailIntelligenceV11` 写路径、模型 `suggested_action`、旧总 confidence、旧 verified facts 和旧 triage queue。
- 更新 privacy copy、环境模板、runbook、manual acceptance 和部署检查。
- 运行 typecheck、自动化测试、production build、数据库 migration、真实 Gmail/Calendar matrix 和日志检查。
- 保留一个部署级开关切换到 Luna contract-compatible implementation；不保留动态多 Provider router。

Exit Gate：所有旧 v1.1 写路径不可达；真实账号 Analyze、Review、Action、Undo、Draft、Triage 和 Meeting Draft 通过；全部 release blocker 有证据关闭。

## 推荐 PR 切分

| PR | 内容 | 不应混入 |
|---|---|---|
| 1 | R0 安全回归与基准 | 新 provider 或 UI 改造 |
| 2 | R1 per-message normalizer 和 evidence | taxonomy 或 recommendation 政策 |
| 3 | R2 v2 contracts 和临时 adapter | Provider 网络调用 |
| 4 | R3 Jev 与 Luna DecisionProvider | UI 和数据库大改 |
| 5 | R4 RecommendationPolicy | Summary 或 Triage |
| 6 | R5 migration、repository 和 API shape | Gmail DOM 改动 |
| 7 | R6 generation 拆分与 Extension | 阈值调优 |
| 8 | R7 eval harness 和 calibration | 新产品功能 |
| 9 | R8 cleanup、真实账号验收和 cutover | Watch、Agent、向量库 |

## 每个阶段的通用完成标准

- `npm run typecheck`、`npm test`、`npm run build` 全部通过。
- 新增代码路径有成功、Review、Provider failure、stale 和跨账号测试。
- 不增加 raw mail、Draft 或 EvidenceEnvelope 的数据库和日志持久化。
- 不扩大 Gmail/Calendar scope，不增加自动发送、退订或创建事件能力。
- 文档与代码状态同步更新，不把目标架构描述成已经上线。

## 暂不进入本计划

- Gmail Watch、Pub/Sub 和后台历史同步
- 自动发送、自动退订和 Calendar event 创建
- Ask Inbox、向量数据库和附件正文理解
- Agent runtime、MCP、computer use 和任意工具调用
- 动态多 Provider 成本路由

这些能力必须由 Alpha 使用证据触发新的产品与数据评审，不能借本次重构顺带加入。
