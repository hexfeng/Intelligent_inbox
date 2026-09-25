# Decision Pipeline v2

状态：代码基线已实现，外部验收与校准待完成
日期：2026-09-24

## 决策

Intelligent Inbox v2 把邮件处理拆成五个边界：

1. Gmail connector 与 per-message normalizer 提供结构化、可回指的临时输入。
2. Jev 作为主要 `DecisionProvider`，一次并行完成封闭分类、yes/no 判断和有序评分。
3. `RecommendationPolicy` 用纯代码组合概率、权限、风险和用户设置。
4. GPT-6 Luna 或 Sol 只在需要时生成摘要或 Draft。
5. 确定性 Executor 负责经过用户确认的 Gmail 或 Calendar 相关写操作。

本规范不引入微服务、消息队列、Agent runtime、向量库、通用工具路由或后台全邮箱同步。

## 分类维度

`Promotion` 与 `Subscription` 不是互斥标签。前者描述内容，后者描述分发关系。v2 使用相互独立的判断轴：

| 字段 | Jev 原语 | 候选或含义 |
|---|---|---|
| `content_type` | Choice | `CONVERSATION`, `NEWSLETTER`, `PROMOTION`, `NOTIFICATION`, `INVOICE`, `RECEIPT`, `OTHER` |
| `communication_intent` | Choice | `QUESTION`, `REQUEST_ACTION`, `REQUEST_MEETING`, `INFORM`, `INTRODUCE`, `UNKNOWN` |
| `is_subscription` | Noul | 邮件是否来自用户订阅或持续接收的列表 |
| `is_automated_sender` | Noul | 是否主要由自动系统或批量发送流程产生 |
| `reply_expected` | Noul | 发件人是否合理期待当前用户回复 |
| `action_required` | Noul | 用户是否需要完成回复之外的任务 |
| `attachment_dependency` | Noul | 正确判断是否依赖当前未读取的附件内容 |
| `contradictory_thread` | Noul | Thread 中是否存在互相冲突或已被后文推翻的要求 |
| `urgency` | Score | `NONE`, `LOW`, `MEDIUM`, `HIGH`，每级有明确文字标准 |

同一 normalized state 的问题在一次 Jev 请求中并行发送。只有后续问题确实需要代码先取得的新数据时，才允许第二次请求。

## 目标契约

### Provider 输出

`DecisionProvider` 只返回模型原始判断，不返回摘要、动作或 Review 结论：

```ts
type ChoiceAnswer<T extends string> = {
  value: T;
  probabilities: Record<T, number>;
  confidence: number;
};

type ScoreAnswer<T extends string> = {
  score: number;
  probabilities: Record<T, number>;
  confidence: number;
};

type DecisionSignalsV2 = {
  schema_version: "2.0";
  thread_id: string;
  thread_version: string;
  content_type: ChoiceAnswer<ContentType>;
  communication_intent: ChoiceAnswer<CommunicationIntent>;
  is_subscription: number;
  is_automated_sender: number;
  reply_expected: number;
  action_required: number;
  attachment_dependency: number;
  contradictory_thread: number;
  urgency: ScoreAnswer<UrgencyLevel>;
  provider: "JEV" | "OPENAI_LUNA";
  model_version: string;
  question_set_version: string;
};
```

接口保持很薄，不建设动态多 Provider router：

```ts
interface DecisionProvider {
  decide(input: NormalizedThreadV2): Promise<DecisionSignalsV2>;
}

interface SummaryProvider {
  summarize(input: SummaryContext): Promise<SummaryResult>;
}

interface DraftProvider {
  draft(input: DraftContext): Promise<string>;
  meetingDraft(input: MeetingDraftContext): Promise<string>;
}
```

Jev 是默认 `DecisionProvider`。GPT-6 Luna 实现相同契约，作为部署级 fallback 和回归基线。第一版不做单请求自动级联；切换必须通过显式配置并记录 backend，避免一次用户操作产生两个 Provider 请求或不可解释的结果漂移。

### 代码派生字段

以下字段由 `RecommendationPolicy` 产生，不由模型直接输出：

- `attention_state`
- `priority`
- `review_required`
- `reason_codes`
- `recommendation_action`
- recommendation risk 与 payload

示例逻辑：

```text
review_required =
  top_choice_probability < threshold_for_class
  OR choice_margin < margin_threshold
  OR attachment_dependency >= attachment_threshold
  OR contradictory_thread >= contradiction_threshold
  OR communication_intent == UNKNOWN
  OR violates_cross_field_invariants(signals)

attention_state =
  REVIEW                    if review_required
  NEEDS_REPLY               if reply_expected >= reply_threshold
  NEEDS_ACTION              if action_required >= action_threshold
  FYI                       otherwise
```

阈值属于版本化代码配置，必须通过 locked eval set 校准。Jev 的 type-safe 输出只能保证值在候选集合中，不能保证语义判断正确。

## 输入与证据

### Per-message normalized state

当前把整个 Thread 拼成一个字符串的 `ThreadSnapshot` 需要替换为保留消息边界的结构：

```ts
type NormalizedMessageV2 = {
  message_id: string;
  sender: string;
  recipients: string[];
  sent_at?: string;
  subject?: string;
  body_text: string;
  headers: {
    list_unsubscribe: boolean;
    precedence?: string;
  };
  attachments: Array<{
    filename: string;
    mime_type?: string;
  }>;
};

type NormalizedThreadV2 = {
  thread_id: string;
  thread_version: string;
  messages: NormalizedMessageV2[];
  gmail_labels: string[];
};
```

签名、quoted history、重复内容和 HTML fallback 按 message 处理。P0 不读取附件正文；只要决定依赖附件内容，就进入 Review。

### EvidenceEnvelope

日期、金额、人员、订单号和附件名属于开放值，不由 Jev 凭空生成。connector 或解析器先产生候选，并保留来源：

```ts
type EvidenceRef = {
  kind: "SENDER" | "RECIPIENT" | "DATE" | "AMOUNT" | "ATTACHMENT" | "PARTICIPANT" | "IDENTIFIER";
  value: string;
  source: {
    message_id: string;
    field: "FROM" | "TO" | "SUBJECT" | "BODY" | "ATTACHMENT_NAME";
    start?: number;
    end?: number;
  };
};
```

Jev 可以从预解析候选中判断语义角色，例如选择哪个金额是总额；GPT-6 Luna 可以为解析器未覆盖的字段提出候选。无论候选来自哪里，代码都必须验证值能够回指输入，才能进入 Draft context。`EvidenceEnvelope` 默认只存在于请求内存中。

## API 形态

### Analyze

`POST /v1/threads/:id/analyze` 返回判断与推荐，不再同步生成摘要：

```text
thread_header
decision_signals
derived_state
recommendations
cached
pipeline_version
```

`thread_header` 来自当前 connector 响应，用于显示 sender 和 subject，不作为模型生成的 verified facts 持久化。

### Summary

`POST /v1/threads/:id/summary` 只在 Thread Panel 打开或当前 Triage 项需要展示时调用。摘要必须使用当前 `thread_version`，并通过 evidence trace 检查。

### Draft

现有 `/draft` 与 `/meeting-draft` 路径保留，但输入改为：

- 当前 normalized thread
- v2 derived state
- 经过验证的 EvidenceEnvelope
- 用户选择的 rewrite intent
- 对会议 Draft，仅允许确定性 FreeBusy slots

Draft 仍只创建 Gmail Draft，不发送邮件、不创建 Calendar event。

### Triage

Extension 持有 thread ID 队列，复用单 Thread `/analyze`：

1. 立即分析当前项。
2. 预取后续 3 到 5 项。
3. 用户前进时补充预取窗口。
4. 当前项摘要按需加载，不等待整个列表。

旧 `/v1/triage/queue` 在 UI 完成迁移后删除；不增加队列服务、SSE 或持久化 triage session。

## 持久化与缓存

允许持久化：

- 派生 enum、概率、score 和 recommendation metadata
- 短摘要
- provider、model、question set、normalizer 和 policy version
- feedback、execution 和安全审计元数据

禁止持久化：

- raw body、quoted history 和附件正文
- EvidenceEnvelope 中的自由文本 value
- Draft 文本
- 完整 Provider request 或 response

缓存键至少包含：

```text
account_id + thread_id + thread_version + pipeline_version
```

其中：

```text
pipeline_version =
  normalizer:v2
  + decision-schema:v2
  + question-set:<version>
  + policy:<version>
  + provider:<provider/model>
```

v1.1 结果不转换成 v2 概率。迁移后旧缓存只允许失效或删除，不能伪造缺失的概率字段。

## 反馈与评测

反馈字段改为与 v2 taxonomy 一致：

- `content_type`
- `communication_intent`
- `is_subscription`
- `attention_state`
- `priority`
- `recommendation_action`

模型评测和产品策略评测分开：

- Provider：每类 precision、recall、F1、Brier score、ECE、p50/p95、失败率和成本。
- Policy：固定 signals 输入是否产生正确 Review、priority 和 recommendation。
- Generation：summary evidence trace、Draft factuality、recipient correctness 和 Calendar slot trace。
- End to end：真实 Gmail account、DOM、OAuth、Action、Undo 与删除流程。

## 不变量

- 模型永远不能构造 Gmail label ID、Action payload 或工具名称。
- 所有 Gmail 写操作都需要当前 thread version、有效 recommendation 和用户确认。
- Review 是代码决策；Provider 失败或输出不完整不能降级成自动动作。
- 任何模型输出的自由文本事实在通过原文回指前都不叫 verified。
- Provider 切换不能改变 Executor 的安全边界。
