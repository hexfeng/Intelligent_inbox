# Intelligent Inbox 方案与架构再评估

日期：2026-09-24

## 结论

当前产品方向不需要改成开放式 Agent，也不需要增加微服务、向量库、通用 MCP 或多 Provider 路由。现有的 Chrome MV3 Extension、单体 TypeScript API、PostgreSQL、Google connector 和确定性 Action Executor 是正确底座。

最值得做的架构升级不是增加更多 Agent，而是把现在一次模型调用承担的工作拆成三层：

1. 决策层只回答封闭、可校准的问题，例如 attention、intent、priority、是否依赖附件、是否需要 Review。
2. 策略层由代码根据模型判断生成 Recommendation，模型不直接决定可执行动作。
3. 生成层只在用户真正打开一封邮件或请求草稿时生成摘要和 Draft。

如果只从任务形态、模型能力、延迟和成本设计，Jev 应是第一层的首选判断引擎，而不是普通生成模型的 challenger。GPT-6 Luna 只作为判断层的可替换 fallback，以及按需短摘要模型；GPT-6 Sol 处理 Draft 等生成任务；GPT-6 Astra 只用于离线困难样本分析或评测仲裁。Jev 不替代生成模型、产品策略代码或执行器，它替代的是通用 LLM 在高频路径上承担的封闭概率判断。

## 本次评估范围

本建议基于以下现有产品与实现资料：

- [优化版 PRD v1.1](../Gmail_AI_Assistant_PRD_v1.1_Optimized.docx)
- [阶段开发计划](../Gmail_AI_Assistant_Development_Plan_Phase_Based_v1.0.docx)
- [当前架构](ARCHITECTURE.md)
- [当前实现状态](IMPLEMENTATION_STATUS.md)
- [隐私边界](PRIVACY.md)
- [Phase 8 测试计划](PHASE_8_TEST_PLAN.md)
- 当前 Extension、API、contracts、数据库迁移和测试代码

本次不建议立即修改产品功能或生产模型。先把目标架构、评测门槛和迁移顺序定清楚，再根据证据实施。

## 当前方案中应保留的部分

### Gmail 仍然是邮件客户端

Extension 只提供理解、推荐和安全执行层，不复制 Inbox、Search、Compose 或 Settings。这个产品边界仍然成立，也是避免产品失焦的关键。

### 单 API 应用优于早期微服务

当前 Fastify API 同时承担 OAuth、Google connector、模型适配、Recommendation、Action Executor 和审计。对于 Alpha 规模，这比 API Gateway、队列、多个 worker 和独立 Agent runtime 更容易验证，也更容易做账号隔离和隐私审计。

只有在观测到明确的吞吐、故障隔离或部署独立性问题后，才应拆服务。

### 确定性 Action Executor 是正确的安全边界

模型只能输出受限结构，真正的 Gmail 写操作仍由服务端验证 account、scope、thread version、recommendation、payload、idempotency 和 Undo pre-image。这是产品最重要的信任资产，不应交给 Agent tool loop。

### 按需读取和最小持久化仍然正确

不做全邮箱后台扫描，不默认保存 raw body、附件和 draft，不把 Gmail 内容写入向量库。对于公开 Gmail SaaS，这一设计比“先同步全部数据再做智能化”更可控。

### Responses API 与 strict Structured Outputs 仍适合当前任务

OpenAI 官方仍建议在需要固定响应结构时使用 Structured Outputs，并明确说明 schema 正确不等于内容语义正确，因此服务端验证与评测仍是必要环节。[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## 当前实现暴露出的结构性问题

### 一个模型调用承担了太多不同性质的任务

当前 `analyze` 同时产生分类、优先级、摘要、suggested action、reason code、confidence 和 verified facts。这些任务的风险、成本和最佳模型不同：

- 分类和路由是封闭决策。
- 摘要是生成任务。
- verified facts 是证据提取与校验任务。
- suggested action 是产品策略。

把它们放进一个 schema 看起来简单，但会让模型升级、评测、错误定位和成本优化互相耦合。

### `verified_facts` 目前并不是真正的 verified

sender、recipient、subject 和 attachment metadata 来自 connector，但 dates、amounts 和 participants 由模型输出。严格 JSON Schema 只能保证格式，不能证明这些字段确实存在于邮件中。

同时，持久化前会清空 verified facts；从缓存恢复的 intelligence 因此不再包含生成时的 facts。后续 Draft 仍能读取实时 thread，但“只使用 verified facts”的契约在缓存路径上并不完整。

建议引入只存在于当前请求内存中的 `EvidenceEnvelope`：

```ts
type EvidenceRef = {
  kind: "SENDER" | "RECIPIENT" | "DATE" | "AMOUNT" | "ATTACHMENT" | "PARTICIPANT";
  value: string;
  source: {
    message_id: string;
    field: "FROM" | "TO" | "SUBJECT" | "BODY" | "ATTACHMENT_NAME";
    start?: number;
    end?: number;
  };
};
```

模型可以提出 candidate evidence，但服务端必须验证 value 能回指到 connector 输入。不能验证的值不进入 Draft context，也不能叫 verified。

### thread normalizer 丢失了消息边界和证据来源

当前实现把整个 thread 的所有 `text/plain` 内容连接成一个字符串，再从遇到的第一个 signature marker 开始截断。旧消息中的签名可能导致后续新消息全部丢失；不同发件人、时间、message ID 和引用层级也会消失。

目标格式应保留每条消息的最小结构：

```ts
type NormalizedMessage = {
  message_id: string;
  from: string;
  to: string[];
  sent_at?: string;
  subject?: string;
  body_text: string;
  attachment_count: number;
};
```

签名、quoted history 和 HTML fallback 应按 message 处理，再按时间顺序组装。这样才能做可靠的 recipient、事实来源、最后发言人和 thread lifecycle 判断。

### 模型自报 confidence 不能直接作为自动化阈值

当前 `confidence` 是生成模型自己输出的 0 到 1 数字，没有经过本项目数据的校准。它可作为调试信号，但不能直接代表 90% 正确率。

如果继续使用通用 LLM，是否进入 Review 应主要由本项目评测出的类别阈值、规则和异常条件决定。如果使用 Jev，可以利用它返回的概率分布，但仍然必须在本项目 locked set 上做 calibration 测量。

### 模型直接输出 suggested action 混合了判断和产品政策

模型可以判断“需要回复”“会议请求”“低价值通知”，但最终推荐 `DRAFT_REPLY`、`PROPOSE_TIME` 或 `ARCHIVE` 应由代码结合 scope、风险、附件依赖、thread 状态和用户设置确定。

建议让模型输出事实判断，由 `RecommendationPolicy` 纯函数生成 action。这样产品规则变化不需要重写 prompt，也更容易证明危险动作不会出现。

### Triage 在返回首屏前处理全部线程

`POST /v1/triage/queue` 会对最多 50 个 thread 做 fetch、cache lookup 和模型分析，完成后才返回 UI。即使并发为 4，用户仍需要等待整个集合。

更简单的改法是让 Extension 持有明确的 thread ID 队列，复用现有 `/analyze`：

1. 先加载当前项。
2. 后台预取接下来的 3 到 5 项。
3. 用户每前进一步继续滚动预取。
4. badge 随结果逐步出现。

这不需要新队列服务、SSE 或持久化 triage session，也比一次分析 50 封更符合“按需处理”。

### pipeline version 不够完整

当前只保存 model ID。一次 intelligence 结果还取决于 prompt、schema、normalizer、policy 和 provider。建议保存：

```text
pipeline_version = normalizer:v2 + decision:v2 + policy:v1 + prompt:<hash> + model:<snapshot>
```

任何一个部分变化都应触发相应的 locked regression，而不是只记录模型名称。

## 推荐目标架构

```text
Gmail MV3 Extension
  - Extract explicit thread IDs only
  - Own the visible triage queue
  - Load current item and prefetch a small window
            |
            v
Fastify API
  - Session and account boundary
  - Gmail and Calendar connectors
  - Per-message normalizer
  - Ephemeral EvidenceEnvelope
            |
            v
Decision Layer
  - closed judgments only
  - Jev as the primary decision engine
  - GPT-6 Luna as a compatible fallback
            |
            v
Deterministic RecommendationPolicy
  - risk and scope checks
  - review and abstention gates
  - one primary recommendation
            |
       +----+------------------+
       |                       |
       v                       v
On-demand Generation       Deterministic Executor
  - GPT-6 Sol               - Gmail allow-list only
  - summary or draft         - version and ownership checks
  - no tool access           - idempotency and Undo
       |                       |
       +-----------+-----------+
                   v
PostgreSQL
  - derived enums and summary
  - recommendation and execution metadata
  - feedback and safe audit data
  - no raw body, attachment content, or draft text
```

## 按问题类型分流，而不是按“一个万能模型”分流

选择通路的第一原则是输出形态：答案是否来自一个事先给定的有限集合，代码是否会直接根据它分支。

| 问题类型 | 示例 | 主通路 | 为什么 |
|---|---|---|---|
| 固定类别 | Promotion、Newsletter、Receipt、Conversation | Jev Choice | 候选集合已知，需要每类概率而不是一段解释 |
| 是/否判断 | 是否需要回复、是否依赖附件、是否存在冲突 | Jev Noul | 代码需要一个可设阈值的 yes 概率 |
| 有序程度 | 紧急程度、优先级、商业价值 | Jev Score | 输出是定义明确的等级谱，可由代码加权 |
| 任意文本 | 摘要、回复草稿、会议邮件 | GPT-6 Luna/Sol | 结果必须生成新的自然语言字符串 |
| 开放字段抽取 | 日期、金额、参与者、订单号 | 解析器或生成模型提出候选，代码回指原文验证 | Jev 不能生成未预先列出的任意字符串 |
| 推荐动作 | Archive、Mark Read、Draft Reply、Propose Time | `RecommendationPolicy` 纯函数 | 这是产品政策，不应由模型自由决定 |
| 外部写操作 | 改 label、创建 Draft、Undo | 确定性 Executor | 必须校验账号、权限、版本、幂等与撤销状态 |

分类 taxonomy 也必须拆轴。`Promotion` 是内容类型，`订阅邮件` 是分发或关系属性，两者不是互斥选项：促销邮件可以是订阅邮件，一封一次性交易通知则可以不是订阅邮件。当前 `intent` 同时混入了 `NEWSLETTER`、`NOTIFICATION` 这类内容类型，v2 建议拆成：

```text
content_type: CONVERSATION | NEWSLETTER | PROMOTION | NOTIFICATION | INVOICE | RECEIPT | OTHER
communication_intent: QUESTION | REQUEST_ACTION | REQUEST_MEETING | INFORM | INTRODUCE | UNKNOWN
is_subscription: probability of yes
is_automated_sender: probability of yes
reply_expected: probability of yes
```

这样代码不会被迫在“促销”与“订阅”中二选一，也不会把“是什么类型”与“对用户提出什么要求”混为一个字段。

### 通路 A：邮件类型与订阅属性分类

这是 Jev 最适合、也最应该优先替换通用 LLM 的通路。

输入给 Jev 的不是一段随意拼接的 prompt，而是结构化 state：

```ts
type EmailDecisionState = {
  subject: string;
  sender_domain: string;
  headers: {
    list_unsubscribe: boolean;
    precedence?: string;
  };
  messages: Array<{
    sender_role: "USER" | "OTHER";
    body_text: string;
  }>;
  attachment_names: string[];
};
```

同一次 Jev 请求并行询问：

```text
content_type: Choice
  CONVERSATION | NEWSLETTER | PROMOTION | NOTIFICATION | INVOICE | RECEIPT | OTHER

is_subscription: Noul
contains_promotional_offer: Noul
direct_reply_expected: Noul
has_user_obligation: Noul
```

例 1，邮件主题是“50% off ends tonight”，正文有优惠码和商品列表，并带 `List-Unsubscribe`：

```json
{
  "content_type": {
    "choice": "PROMOTION",
    "probabilities": {
      "PROMOTION": 0.97,
      "NEWSLETTER": 0.02,
      "OTHER": 0.01
    }
  },
  "is_subscription": 0.91,
  "contains_promotional_offer": 0.99,
  "direct_reply_expected": 0.01,
  "has_user_obligation": 0.02
}
```

这时 Jev 只完成“它是什么”的判断。随后代码策略可以做：

```text
if P(PROMOTION) >= 0.85
and direct_reply_expected <= 0.10
and has_user_obligation <= 0.10
then recommend LABEL(promotions_label_id)
```

`promotions_label_id` 来自 connector 或用户设置，不是 Jev 输出的。产品规则只把它作为推荐参数。这样以后要把阈值从 0.85 改为 0.90，或不再推荐某个 label，只改代码，不需要改模型 prompt。

例 2，Substack 周报同时包含一段作者向用户提出的具体问题：

```json
{
  "content_type": {
    "choice": "NEWSLETTER",
    "probabilities": {
      "NEWSLETTER": 0.76,
      "CONVERSATION": 0.21,
      "OTHER": 0.03
    }
  },
  "is_subscription": 0.96,
  "direct_reply_expected": 0.64,
  "has_user_obligation": 0.18
}
```

这里不能因为 `NEWSLETTER` 是最高类别就直接 Archive。策略层看到 `direct_reply_expected` 较高，应进入 Review 或显示为需要用户判断。这正是“保留概率分布”比只拿一个标签更有价值的地方。

### 通路 B：收件箱分诊与优先级

对于一封“Can you approve the budget by 3pm?”，同一次 Jev 请求可以问：

- `attention_state`：`NEEDS_REPLY | NEEDS_ACTION | FYI | REVIEW`
- `intent`：`QUESTION | REQUEST | MEETING_REQUEST | INVOICE | INTRODUCTION | NEWSLETTER | NOTIFICATION | UNKNOWN`
- `reply_required`：Noul
- `action_required`：Noul
- `urgency`：`NONE | LOW | MEDIUM | HIGH`
- `attachment_dependency`：Noul
- `contradictory_thread`：Noul

假设返回 `REQUEST=0.88`、`NEEDS_ACTION=0.81`、`reply_required=0.72`、`urgency=2.7/3`。代码再结合明确出现的截止时间、未读状态和用户设置计算最终排序，并生成 `STAR` 或 `DRAFT_REPLY` 建议。

不要让 Jev 直接回答“这封邮件最终该执行什么动作”。复杂推荐应拆成多个原子判断，由代码组合。TypeSafe 的官方原语也明确建议：多个独立因素分别提问，再由代码加权；Choice、Score、Noul 正好分别映射枚举分支、阈值和 `if`。[TypeSafe primitives](https://docs.typesafe.ai/primitives)

### 通路 C：Review 与自动化门控

`review_required` 不应再作为一个由模型随意输出的布尔值，而应由策略层组合：

```text
review_required =
  top_class_probability < class_threshold
  OR probability_margin < margin_threshold
  OR violates_cross_field_invariants(decisions)
  OR attachment_dependency >= 0.40
  OR contradictory_thread >= 0.30
  OR intent == UNKNOWN
  OR requested_action is outside allow-list
```

例如模型判断 `PROMOTION=0.48`、`RECEIPT=0.44`。即使 top-1 是 Promotion，两类概率间隔只有 0.04，代码也应进入 Review，不能因为模型“选出了一个合法枚举”就自动打标签。

这一层的价值是把自动化边界变成可测试的代码：模型负责不确定性，代码负责风险容忍度。

跨字段约束尤其重要，因为同一 Jev 请求中的问题彼此独立。例如 `content_type=PROMOTION`、`reply_expected=0.92`、`attention_state=FYI` 虽然每个输出都合法，但组合后可疑；代码应把它升级为 Review，而不是盲目采用其中任一个结果。

### 通路 D：事实抽取与证据校验

日期、金额、订单号、人员姓名属于开放值，不能直接用 Jev Choice，因为候选值事先并不知道。推荐两步：

1. connector 和解析器先从 headers、正文、附件名中产生带原文位置的候选值。
2. 如果候选存在歧义，再让 Jev 从候选集合中选择其语义角色；最后由代码验证选中值确实存在于原文。

例如正文包含 `$129.00`、`$15.00 tax` 和 `total $144.00`。解析器先得到三个候选；Jev 可以在动态 Choice 中判断“哪个候选是应付总额”，但它不负责凭空生成 `144.00`。没有候选或无法回指原文时，结果就是 unverified，不进入 Draft context。

如果需要从长文本中发现解析器不知道的新字段，则用 GPT-6 Luna 的 Structured Outputs 提出候选，再走同一个证据验证器。OpenAI Structured Outputs 保证结果符合 schema，但不证明语义正确，因此原文回指仍是必要步骤。[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

### 通路 E：摘要与回复草稿

Jev 不生成字符串，所以这一通路由生成模型负责：

```text
Normalized thread
  + Jev decision vector
  + code-verified EvidenceEnvelope
  + user-selected tone/intent
          |
          v
GPT-6 Luna: 1-3 条短摘要
GPT-6 Sol: 回复或会议 Draft
          |
          v
Draft factuality validator
          |
          v
Create Gmail Draft only; never send
```

例如 Jev 已判断 `MEETING_REQUEST=0.94`、`reply_required=0.93`，代码通过 Calendar FreeBusy 得到三个真实空档。Sol 的职责只是把这三个确认过的时间写成自然语言邮件；它不能自己发明新时间，也不能直接创建或发送事件。

### 通路 F：推荐和执行

判断、推荐、执行必须是三件事：

```text
Jev probabilities
      |
      v
RecommendationPolicy (pure code)
  - thresholds
  - account scopes
  - user preferences
  - action allow-list
  - risk tier
      |
      v
User confirmation
      |
      v
Action Executor
  - thread version check
  - idempotency key
  - exact label mutation
  - Undo pre/post image
```

以 Promotion 为例：Jev 判断 `P(PROMOTION)=0.97`，策略层才推荐 `LABEL`；用户确认后，Executor 才调用 Gmail API。任何模型都不应直接拿到 Gmail 写工具。

### 一封邮件的端到端调用数量

默认高频路径应保持很短：

1. normalizer 生成一次结构化 state。
2. 一次 Jev 调用并行完成所有独立判断。
3. 代码立即产生排序、Review 和 recommendation。
4. 只有用户打开邮件时才调用 Luna 生成摘要。
5. 只有用户请求 Draft 时才调用 Sol。

只有第二个判断确实依赖第一步产生的新数据时，才做第二次 Jev 调用。例如第一轮确认“需要根据附件类型判断”，代码读取允许的附件 metadata 后，第二轮才询问附件相关判断；能够基于原 state 并行回答的问题，不拆成多次调用。

## Jev 是否适合本产品

### Jev 能做什么

Jev 接收一个 state 和一组独立问题，返回三类封闭结果：Choice、Score 和 Noul。问题在同一请求中并行判断，输出受调用者提供的选项约束，并返回概率或 confidence。[TypeSafe API schema](https://api.typesafe.ai/openapi.json) [TypeSafe primitives](https://docs.typesafe.ai/primitives)

这与 Intelligent Inbox 的以下判断高度匹配：

- `attention_state`：Choice
- `intent`：Choice
- `content_type`：Choice
- urgency 或 priority：Score
- 是否依赖附件：Noul
- 是否存在互相冲突的请求：Noul
- 是否应进入 Review：由代码组合上述结果

Jev 官方文档也建议把复杂判断拆成多个独立问题，再由代码组合，而不是让模型一次性决定完整行动。[TypeSafe workflow evals](https://evals.typesafe.ai/)

### Jev 不能做什么

Jev 不生成自由文本，因此不能直接承担：

- 2 到 4 行 thread summary
- Gmail Draft
- 任意日期、金额、参与者或附件名抽取
- 多步计划
- Action 执行

因此它不能替换 `OpenAIIntelligenceProvider` 的全部职责，只能替换拆分后的 `DecisionProvider`。

### 上线约束不改变目标架构

Jev 在 2026-09-15 以 early access 形式公开。厂商公布的低延迟和低成本数字来自其自建 workflow eval，并明确说明这些增益处于真实场景的较高端，且评测由模型能力团队构建，可能存在偏差。[TypeSafe launch note](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

公开隐私条款明确表示不会用 Input 训练或微调模型，但保留期限表述为提供服务或商业目的所需的合理时间，并说明服务在美国托管。当前公开信息不足以证明它满足本产品所需的 Zero Data Retention、区域处理或 Google 用户数据合规要求。[TypeSafe privacy policy](https://typesafe.ai/legal/privacy-policy)

以下门槛只决定何时切生产流量，不改变“封闭判断优先走 Jev”的目标设计：

1. 只用合成或脱敏 locked fixtures 做第一轮评测。
2. 获得明确的数据保留、删除、子处理方、事件响应和数据区域答复。
3. 在相同输入上与 GPT-6 Luna 比较类别指标、校准、p95、失败率和单封成本。
4. shadow 阶段不影响用户结果，不把真实邮件发送给未经批准的 Provider。
5. 只有门槛全部通过后，才允许 Jev 处理真实邮件中的封闭决策。

## 模型与工具建议

### 推荐运行时组合

| 任务 | 推荐起点 | 原因 | 是否现在接入 |
|---|---|---|---|
| 高频封闭判断 | Jev；GPT-6 Luna 作为 fallback | Jev 原生面向 Choice、Score、Noul 和概率输出，适合分类、评分、路由和门控；Luna 保持相同 DecisionProvider 契约用于降级 | 目标主通路 |
| Thread summary | GPT-6 Luna 或 Sol | 只在打开当前项时生成；质量不足再升级 Sol | 是，按需 |
| Gmail Draft | GPT-6 Sol | Draft 需要语言质量与事实约束，仍由用户发送 | 是 |
| Meeting Draft | GPT-6 Sol | 输入仅包含确认过的 constraints 和 FreeBusy slots | 是 |
| 困难样本分析与离线仲裁 | GPT-6 Astra | 能力最高，但不应进入每封邮件的高频路径 | 仅离线 |
| 外部 challenger | Gemini 3.8 Flash、Claude Sonnet 5 | 都是当前稳定的高能力候选；只在 eval harness 中比较，不先建生产路由 | 否 |

OpenAI 官方当前将 GPT-6 Astra 定位为最高能力模型、Sol 定位为能力与成本平衡、Luna 定位为高吞吐低成本模型，并且三者都支持 Responses API、函数、Web search、File search 和 computer use。[OpenAI models](https://developers.openai.com/api/docs/models)

Gemini 当前稳定模型中，Gemini 3.8 Flash 支持结构化输出；Anthropic 当前把 Claude Sonnet 5 定位为速度与能力平衡的模型。它们应作为评测候选，而不是立即增加生产依赖。[Gemini models](https://ai.google.dev/gemini-api/docs/models) [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output) [Claude models](https://platform.claude.com/docs/en/models/overview)

### 不建议接入的工具

#### Agents API

当前工作流只有固定 connector、固定 schema 和固定执行策略。Agent runtime 不会提高核心闭环质量，反而增加状态、工具选择和数据保留面。OpenAI Agents API 当前也不支持 ZDR，只支持美国数据驻留，不适合本产品的 raw email 路径。[OpenAI Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview)

#### MCP 和通用 tool search

本产品只有 Gmail、Calendar 和内部数据库等少量已知能力。直接的 typed connector 比动态发现工具更安全。OpenAI 也明确提示发送到第三方 MCP 的数据受第三方保留政策约束。[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

#### Computer use

Gmail 和 Calendar 都已有正式 API。用模型操控 Gmail UI 会降低稳定性、可审计性和幂等性，不能替代 connector。

#### Vector store

当前 Hero 不需要跨邮箱语义检索。Ask Inbox 进入 P1 后仍应先用 Gmail query 和小规模 rerank；只有 query 无法达到召回门槛时再评估向量索引。

#### 在线 Batch API

Batch API 适合离线评测，官方提供 50% 成本折扣和独立限额，但 Batch 不是 ZDR eligible，不能用于用户正在等待的真实邮件路径。[OpenAI Batch API](https://developers.openai.com/api/docs/guides/batch) [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

## 数据与隐私建议

### 保留 `store:false`，但不要把它描述成 ZDR

OpenAI 官方说明默认 abuse monitoring 日志可能保留客户内容最多 30 天；ZDR 需要单独审批和项目配置。`store:false` 会关闭 Responses application state，但不会自动获得 ZDR。[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

发布前应把以下信息作为可验证配置而不是文案：

- Provider 项目是否启用 ZDR 或 Modified Abuse Monitoring
- 请求是否始终 `store:false`
- 是否使用 background、Batch、Files、MCP 或其他会改变保留行为的能力
- 实际处理区域和数据驻留配置
- 用户删除数据时本产品能删除哪些内容、不能删除哪些 Provider 日志

### 不在在线路径使用 Background mode

分类和 Draft 都应是短请求。Background mode需要临时磁盘状态，且会增加轮询和失败恢复复杂度。只有真正需要分钟级推理的未来功能才考虑它。

### 附件继续保持明确的 Review 边界

P0 只传递 attachment count 和必要的类型信号，不读取附件正文。只要邮件决策依赖未读取附件，就进入 Review。附件理解进入 P2 时，应使用独立 opt-in、独立保留策略和独立评测集，不附带进入普通分类路径。

## 评测架构

### 不依赖即将下线的托管 Evals 产品

OpenAI 已宣布现有 Evals dashboard/API 将在 2026-10-31 只读，并计划于 2026-11-30 关闭，因此不应把新的核心评测体系建在该服务上。[OpenAI deprecations](https://developers.openai.com/api/docs/deprecations)

建议在仓库内建立可重复运行的 harness：

```text
evals/
  fixtures.deidentified.jsonl
  labels.locked.jsonl
  prompts/
  scorers/
  reports/
```

运行时只需要一个命令选择 candidate：

```text
npm run eval:model -- --backend openai-luna
npm run eval:model -- --backend jev
npm run eval:model -- --backend gemini-flash
npm run eval:model -- --backend claude-sonnet
```

### 必须报告的指标

- 每个 attention、intent 和 content type 的 precision、recall、F1 和样本数
- Review/abstention coverage 与错误捕获率
- unsafe action exposure，必须为 0
- schema 或 provider failure rate
- p50、p95 和超时率
- 单封平均成本和 100 封成本
- Jev 或概率输出的 Brier score、Expected Calibration Error 和 reliability bins
- summary 中日期、金额、参与者、附件和承诺的 evidence trace rate
- Draft recipient correctness，必须为 100%
- Calendar slot trace rate，必须为 100%

### 模型晋级规则

不要用综合平均分掩盖高风险小类。候选模型只有同时满足以下条件才能替换基线：

1. dangerous action exposure 仍为 0。
2. recipient 和 Calendar slot trace 仍为 100%。
3. Meeting、Invoice、Introduction、attachment-dependent 和 contradictory 类别不退化。
4. Review recall 不下降到门槛以下。
5. p95、失败率和成本有实际改进。
6. 数据处理条款满足公开 Alpha 要求。

## 推荐实施顺序

规范化的完整迁移计划见 [Development plan v2](DEVELOPMENT_PLAN_V2.md)，目标 contract 见 [Decision Pipeline v2](DECISION_PIPELINE_V2.md)。以下阶段保留为架构层摘要。

### 第一阶段：先修正输入和证据边界

- 把 normalizer 改成 per-message pipeline。
- 增加 HTML-only 邮件的安全 text fallback。
- 建立 ephemeral `EvidenceEnvelope` 和 substring/source 校验。
- 把 `pipeline_version` 纳入缓存与评测记录。

验证：现有 fixture 加入多消息签名、HTML-only、quoted history、附件依赖、发件人自回复和冲突 thread；全部通过。

### 第二阶段：把判断与策略拆开

- 新建 `DecisionResult`，只包含封闭判断和原始概率/score。
- 新建纯函数 `RecommendationPolicy`。
- `suggested_action` 不再由模型直接决定。
- Review 由规则和经校准阈值共同决定。

验证：固定 decision 输入必然产生固定 recommendation；模型不能构造 ActionType。

### 第三阶段：建立 repo-local eval harness

- 从 PRD 计划的 100 到 200 封脱敏样本开始。
- 锁定开发集和 regression set。
- 支持 GPT-6 Luna、Jev 和至少一个外部 challenger。
- 对 raw provider output、latency、usage 和错误做本地临时记录，报告生成后删除敏感中间结果。

验证：同一 commit、同一 candidate、同一 fixture 可复现聚合结果；报告包含每类样本数。

### 第四阶段：优化 Triage 首屏

- Extension 持有 queue。
- 当前项优先，滚动预取 3 到 5 项。
- Summary 只为当前项和短预取窗口生成。
- cache hit 和新分析分别计时。

验证：第一条可决策项的 p95 低于当前全队列等待时间；不会因为第 40 封失败阻塞第 1 封。

### 第五阶段：接入 Jev 主 DecisionProvider

- 实现一次请求并行回答全部原子问题。
- 用 GPT-6 Luna 实现相同契约，作为显式配置 fallback 和回归基线。
- 在合成或已批准的脱敏样本上校准阈值，再进入真实账号 acceptance。
- 所有独立问题一次请求，不逐问题调用。
- 由代码组合 Review 和 Recommendation。
- 第一版不做请求级自动级联或动态 Provider 路由。

验证：默认 Jev 路径、显式 Luna fallback、Provider failure 和低置信 Review 都通过 contract、policy 和 end-to-end gate。

### 第六阶段：再决定是否需要 Gmail Watch

当前 Google Gmail 文档仍说明，对于用户设备上的客户端，poll-based synchronization 是推荐方式；服务器 push 则需要 Pub/Sub、watch 续期、history reconciliation 和通知确认。[Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push)

只有 Waiting/Follow-up 或 Daily Brief 的留存证据足够强，且按需模式无法满足 freshness 时，才增加 Watch。不能因为新模型更快就提前引入后台同步。

## 应立即做、应实验、应延后

| 优先级 | 决策 |
|---|---|
| 立即做 | per-message normalizer、evidence envelope、deterministic recommendation policy、pipeline version、repo-local eval harness |
| 立即做 | Triage lazy prefetch，先展示当前项，不等待全部 thread |
| 实验 | Jev 与 GPT-6 Luna fallback 在 locked set 上的分类、calibration、延迟和成本对比 |
| 实验 | GPT-6 Sol 与外部 challenger 的 Draft factuality 盲评 |
| 延后 | Jev 真实邮件生产流量，直到隐私与合规通过 |
| 延后 | 多 Provider runtime router、Agents API、MCP、computer use、vector store |
| 延后 | Gmail Watch、Pub/Sub、任务队列，直到 Follow-up/Brief 被用户数据证明 |

## 对抗式审查

### 最可能翻车的五个点

1. **把 Jev 的 type-safe 误解为语义正确。** 它不会输出 schema 外的值，但仍可能选错合法选项。修正：必须做项目内 calibration 与 abstention 测试。
2. **为了同时支持 Jev 和 Luna 而建成通用多 Provider 路由。** 修正：只定义一个很薄的 `DecisionProvider` 接口；Jev 是主实现，Luna 是显式降级实现，不做动态模型市场或复杂路由。
3. **拆分模型调用后反而增加总延迟。** 修正：封闭判断一次并行完成；summary 按需；用首项可用时间而不是整批完成时间评估。
4. **证据结构看似严谨，但最后仍让模型自由生成关键事实。** 修正：日期、金额、参与者、recipient 和 Calendar slot 必须回指 connector 输入或确定性工具结果。
5. **评测集优化得很好，真实 Gmail DOM、OAuth 和多消息 thread 仍失败。** 修正：模型 eval 与 real-account acceptance 是两套独立 gate，任何一套失败都不能开 Alpha。

### 最简单可行方案检查

本建议没有新增常驻服务、消息队列、向量数据库、Agent runtime 或生产多 Provider 路由。新增内容主要是代码边界和评测资产，能够在现有 monorepo、Fastify API 和 PostgreSQL 内完成。

## 最终建议

近期最优方案是“更严格的 pipeline”，不是“更自主的 Agent”：

- 保留当前产品边界与基础设施。
- 先修正 message normalization、证据来源和 recommendation ownership。
- 用 Jev 承担固定类别、yes/no、评分和概率门控；GPT-6 Luna 只作为判断 fallback 和短摘要模型。
- 用 GPT-6 Sol 承担 Draft 等开放文本生成。
- 用代码承担 RecommendationPolicy，用确定性 Executor 承担 Gmail/Calendar 写操作。
- 用本地 locked eval 和真实账号 acceptance 决定是否迁移。

如果这些工作完成，Intelligent Inbox 会更快、更便宜，也更容易解释和审计；同时不会因为追逐前沿工具而破坏当前最有价值的安全边界。
