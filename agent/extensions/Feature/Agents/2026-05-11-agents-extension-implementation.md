# Pi Agents Extension 实施文档

## 目标

实现一套适用于 pi agent 的 sub agent 扩展与配套 skills 整理方案，满足以下要求：

1. 整理当前 `superpowers/skills`，只保留并改造以下 skills：
   - `brainstorming`
   - `dispatching-parallel-agents`
   - `executing-plans`
   - `subagent-driven-development`
   - `test-driven-development`
   - `systematic-debugging`
   - `writing-plans`
   - 新增 `code-review`
2. 所有保留 skill 的 `SKILL.md` 及关联模板高质量翻译为中文。
3. 删除所有 `superpowers` 与 `git worktree` 相关表述。
4. `brainstorming` 不再要求把 design 写成单独文档并保存，只要求把设计内容直接输出给用户；实施文档才需要保存。
5. 为 pi 实现一套 `agents` 扩展，注册 agents 相关工具，支持 sub agent 并行调度、前后台两种运行模式、状态展示、终止、主 agent 与 sub agent 结果联动。
6. skill 中不得写死“使用 pi extension 的某个 agent preset”，skill 只能说“调用 xxx subagent”。pi 侧通过 system prompt 适配这层映射。
7. 预设 agent 不能写死在 system prompt 中，主 agent 需要通过工具动态查询可用 preset；同时支持本次调用内联定义 custom agent。

---

## 一、总体范围

本次开发分为两部分：

### A. Skills 整理与中文化

工作目录：
- `/Users/dawnmoon/.pi/agent/superpowers/skills`

保留并改造：
- `brainstorming/`
- `dispatching-parallel-agents/`
- `executing-plans/`
- `subagent-driven-development/`
- `test-driven-development/`
- `systematic-debugging/`
- `writing-plans/`
- 新建 `code-review/`

删除：
- `using-git-worktrees/`
- `using-superpowers/`
- `finishing-a-development-branch/`
- `receiving-code-review/`
- `requesting-code-review/`
- `verification-before-completion/`
- `writing-skills/`

### B. Pi Agents Extension

目标目录：
- `/Users/dawnmoon/.pi/agent/extensions/Feature/Agents`

需要修改的现有扩展：
- `/Users/dawnmoon/.pi/agent/extensions/Feature/index.ts`
- `/Users/dawnmoon/.pi/agent/extensions/Prompt/system-prompt.ts`
- `/Users/dawnmoon/.pi/agent/extensions/Appearance/status-line.ts`

---

## 二、Skills 改造规则

### 1. 文本处理规则

所有保留 skill 需要遵循以下统一规则：

1. 精确翻译原文，不总结，不压缩，不改写原始逻辑结构。
2. 删除所有与 `superpowers` 绑定的表述。
3. 删除所有 `git worktree` 相关内容。
4. 删除任何要求“先写 design 文档再写 plan 文档”的流程。
5. 保留流程控制、质量门禁、反模式、示例、检查项。
6. 将“invoke xxx skill”改为通用中文表述，如“调用 xxx 技能”或“进入 xxx 阶段”。
7. 将“your human partner”统一改为“用户”。
8. 不能在 skill 中提及 `pi`、`pi extension`、`agents tool`、`preset` 等平台实现细节。
9. skill 中只允许说“调用 xxx subagent”，不得说“调用 explorer preset”之类平台特定名称。

### 2. 各 skill 具体改造要求

#### brainstorming
- 保留“先理解需求、再给方案、再确认设计”的流程。
- 删除“将 design 写入 spec 文档并保存”的要求。
- 删除“用户 review spec 文件后再继续”的要求。
- 改为：
  - 设计内容直接在对话中分段输出给用户确认。
  - 设计确认后，直接进入 `writing-plans`，生成实施文档。
- 如果原文里有 `visual-companion.md` 和 `spec-document-reviewer-prompt.md`，也要翻译并按上述原则清理。
- 不再要求 commit design 文档。

#### writing-plans
- 保留它作为“实施文档”的唯一落盘入口。
- 产物文档保留为实现计划文档。
- 删除所有 `superpowers`、`git worktree` 引用。
- 把计划文档中的执行说明改成通用表述：
  - 推荐使用 subagent-driven-development
  - 或直接在当前会话执行
- 需要把 plan 位置改成中性路径描述，不绑定 `docs/superpowers/...`。可写为“保存到项目约定位置；若无约定，保存到 docs/plans/...”。

#### executing-plans
- 删除所有关于 `superpowers works much better with access to subagents` 的文案。
- 删除 `finishing-a-development-branch`、`using-git-worktrees` 依赖。
- 保留“先读计划、再批判性复核、逐项执行、遇阻塞立即停”的原则。
- 末尾改为：全部任务完成后，运行与改动相匹配的验证命令，并向用户报告结果。

#### subagent-driven-development
- 保留“每个任务用全新 subagent + 两阶段审查”的主流程。
- 删除所有 `superpowers:*` 依赖说明。
- 保留模板文件，但全部翻译为中文：
  - `implementer-prompt.md`
  - `spec-reviewer-prompt.md`
  - `code-quality-reviewer-prompt.md`
- skill 正文中只写：
  - 实现任务时调用 implementer subagent
  - 再调用 spec reviewer subagent
  - 再调用 code quality reviewer subagent
- 不提及 preset 名称，也不提及 pi。

#### dispatching-parallel-agents
- 保留“多个相互独立问题并行调查”的方法。
- 示例中的 API 调用改成中性描述，不绑定 Claude Code 的 `Task(...)` 示例。
- 可以改成伪代码或自然语言，如“为每个独立问题分发一个 agent 并并行运行”。

#### test-driven-development
- 完整翻译。
- 保留 `testing-anti-patterns.md` 并翻译。
- 删除与某个宿主平台绑定的文字。

#### systematic-debugging
- 完整翻译。
- 保留：
  - `root-cause-tracing.md`
  - `defense-in-depth.md`
  - `condition-based-waiting.md`
  - `test-pressure-1.md`
  - `test-pressure-2.md`
  - `test-pressure-3.md`
  - `test-academic.md`
- `CREATION-LOG.md` 不属于最终面向模型的 skill 内容，可不保留为目标产物。

#### code-review
- 由以下内容整合而成：
  - `requesting-code-review/SKILL.md`
  - `requesting-code-review/code-reviewer.md`
  - `receiving-code-review/SKILL.md`
  - `subagent-driven-development/spec-reviewer-prompt.md` 中与规格一致性审查有关的结构
- 目标目录：
  - `code-review/SKILL.md`
  - `code-review/code-reviewer.md`
  - `code-review/spec-reviewer-prompt.md`
- 内容分三层：
  1. 何时发起 code review
  2. 如何处理收到的 review 反馈
  3. reviewer / spec reviewer 的 prompt 模板

---

## 三、Pi Agents Extension 功能设计

## 1. 目录结构

在以下目录实现：
- `/Users/dawnmoon/.pi/agent/extensions/Feature/Agents`

建议文件结构：

```text
Agents/
├── index.ts
├── types.ts
├── constants.ts
├── registry.ts
├── runtime.ts
├── persistence.ts
├── process-manager.ts
├── agents-tool.ts
├── list-presets-tool.ts
├── manage-agents-tool.ts
├── foreground-panel.ts
├── background-events.ts
├── status-bridge.ts
├── prompt-adapter.ts
├── agents.json
└── 2026-05-11-agents-extension-implementation.md
```

### 文件职责

- `index.ts`
  - 作为扩展入口，注册全部工具、事件、状态恢复逻辑。
- `types.ts`
  - 放所有类型定义。
- `constants.ts`
  - 放路径、事件名、默认值、上限等常量。
- `registry.ts`
  - 内存态 agent 注册表。
- `runtime.ts`
  - 负责 session 内 agent 生命周期编排。
- `persistence.ts`
  - 读写 `subagents.jsonl` 与 session custom entry。
- `process-manager.ts`
  - 使用 `child_process.spawn()` 启动并管理 sub agent 进程。
- `agents-tool.ts`
  - 主调度工具：创建一个 tool call 下的多个 sub agent。
- `list-presets-tool.ts`
  - 列出 `agents.json` 中可用 preset。
- `manage-agents-tool.ts`
  - 查询、终止、列出当前 session agent。
- `foreground-panel.ts`
  - 前台等待模式的 TUI 面板。
- `background-events.ts`
  - 后台 agent 完成后推送事件并注入 system message。
- `status-bridge.ts`
  - 把 agents 列表写到 status-line 可读取的 session 状态或事件总线中。
- `prompt-adapter.ts`
  - 给主 agent 注入如何使用 agents tool 的规则，不写死 preset 列表。
- `agents.json`
  - 当前目录下的 preset 定义文件。

---

## 2. 关键约束

### 并发与数量
- 一个 session 中同时运行的 sub agent 最多 5 个。
- 一个 `agents` tool call 可以一次发起多个 sub agent。
- 若发起数量超过 5，工具直接返回错误，不排队。

### 超时
- 默认超时：20 分钟。
- 可配置。
- 上限：60 分钟。
- 超时后先发 `SIGTERM`，5 秒后未退出再发 `SIGKILL`。

### 环境与工作目录
- sub agent 继承主 agent 的 `cwd`。
- sub agent 继承主 agent 的环境变量。
- 允许附加额外环境变量用于标识 parent / child 关系，例如：
  - `PI_SUB_AGENT=1`
  - `PI_PARENT_SESSION_ID=<id>`
  - `PI_SUB_AGENT_ID=<id>`
- 但不能破坏原有环境继承语义。

### 结果推送
- 后台模式下，sub agent 完成后，其结果必须立即作为 system message 推送给主 agent 的下一轮可见上下文，不等待用户下一次发消息。
- 这是事件驱动，而不是轮询查询。

### skills 继承
- sub agent 继承主 agent 当前可用 skills，不做裁剪。

### preset 查询
- 不在 system prompt 中写死 preset 列表。
- 主 agent 必须通过工具实时查询。
- 同时支持本次调用提供 custom agent。

---

## 四、数据结构设计

## 1. agents.json

位置：
- `/Users/dawnmoon/.pi/agent/extensions/Feature/Agents/agents.json`

格式（示例）：

```json
{
  "version": 1,
  "presets": {
    "explorer": {
      "name": "Explorer",
      "description": "代码探索、上下文收集、依赖分析",
      "model": "claude-3-5-sonnet-20241022",
      "systemPrompt": "你是一名代码探索 subagent。你的职责是快速收集结构化上下文，重点输出目录结构、关键文件、依赖关系、现有模式和风险点。不要实现代码，不要修改文件。"
    },
    "reviewer": {
      "name": "Reviewer",
      "description": "代码质量审查与实现一致性检查",
      "model": "claude-3-5-sonnet-20241022",
      "systemPrompt": "你是一名代码审查 subagent。你的职责是检查实现是否满足要求、是否存在缺陷、边界情况、测试问题和结构问题，输出明确问题列表与结论。"
    },
    "coder": {
      "name": "Coder",
      "description": "具体实现与修复，遵循测试优先",
      "model": "claude-3-5-sonnet-20241022",
      "systemPrompt": "你是一名实现 subagent。你的职责是根据任务描述完成实现、运行验证、总结改动。优先先写测试再实现，不做无关改动。"
    }
  }
}
```

说明：
- 不支持模板变量。
- `systemPrompt` 为完整字符串。
- 可由用户手工编辑。
- 读取失败时应返回清晰错误。

## 2. 内存态 agent 结构

```ts
type AgentStatus = "pending" | "running" | "done" | "failed" | "killed";
type AgentMode = "foreground" | "background";

type TokenUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total?: number;
  cost?: number;
};

type SessionAgentRecord = {
  id: string;
  parentToolCallId: string;
  parentSessionId: string;
  sessionId?: string;
  name: string;
  preset: string;
  mode: AgentMode;
  prompt: string;
  model: string;
  systemPrompt: string;
  status: AgentStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  pid?: number;
  toolCalls: number;
  tokenUsage: TokenUsage;
  lastTwoLines: string[];
  textBuffer: string;
  currentToolName?: string;
  resultText?: string;
  errorText?: string;
  sessionPath?: string;
};
```

## 3. subagents.jsonl 记录格式

文件：
- `/Users/dawnmoon/.pi/agent/sessions/subagents.jsonl`

每行一条 JSON：

```json
{
  "version": 1,
  "id": "subagent-uuid",
  "parentSessionId": "parent-session-id",
  "sessionId": "subagent-session-id",
  "name": "explorer",
  "preset": "explorer",
  "mode": "background",
  "prompt": "分析 src 目录结构",
  "status": "done",
  "createdAt": 1760000000000,
  "completedAt": 1760000012345,
  "toolCalls": 7,
  "tokenUsage": {
    "input": 1300,
    "output": 1200,
    "cacheRead": 0,
    "cacheWrite": 0,
    "total": 2500,
    "cost": 0.0123
  },
  "resultText": "最终输出文本",
  "errorText": "",
  "sessionPath": "/Users/dawnmoon/.pi/agent/sessions/subagent-session-id.jsonl"
}
```

要求：
- 文件无限增长，不做清理。
- 必须记录 `parentSessionId` 和 `sessionId`。
- 写入使用串行文件写队列，避免并发冲突。

## 4. Session Custom Entry

需要通过 `pi.appendEntry()` 存一份当前 session 的活跃 agent 摘要，用于：
- session 重载后恢复 agents 列表显示
- 与 `status-line.ts` 通讯

建议 customType：
- `agents-extension-state`

建议结构：

```ts
type PersistedAgentsState = {
  version: 1;
  agents: Array<{
    id: string;
    name: string;
    preset: string;
    mode: AgentMode;
    status: AgentStatus;
    toolCalls: number;
    tokenUsage: TokenUsage;
    lastTwoLines: string[];
    updatedAt: number;
  }>;
};
```

---

## 五、工具设计

## 1. `agents_list_presets`

用途：
- 返回当前 `agents.json` 中全部可用 preset。
- 主 agent 必须通过这个工具实时获取可用 preset，不在 system prompt 中硬编码。

参数：
- 无

返回：
- 文本内容：人类可读列表
- details：结构化 preset 数据

示例文本：

```text
Available agent presets:
- explorer: 代码探索、上下文收集、依赖分析
- reviewer: 代码质量审查与实现一致性检查
- coder: 具体实现与修复，遵循测试优先
```

## 2. `agents`

用途：
- 在一个 tool call 中创建一个或多个 sub agent。
- 支持 `foreground` 和 `background` 两种模式。

参数结构：

```ts
{
  mode?: "foreground" | "background";
  timeoutMinutes?: number;
  agents: Array<{
    name: string;
    prompt: string;
    preset?: string;
    custom?: {
      model: string;
      systemPrompt: string;
    };
  }>;
}
```

参数规则：
- `mode` 默认 `foreground`
- `timeoutMinutes` 默认 `20`
- `timeoutMinutes` 最大 `60`
- `agents.length >= 1`
- 每个 agent：
  - 必须提供 `name`
  - 必须提供 `prompt`
  - `preset` 与 `custom` 二选一
- 若总活动 agent 数加上本次创建数超过 5，则直接报错

### foreground 模式语义
- 在一个 tool call 内同时发起多个 sub agent。
- 展示前台 agents 面板。
- 主 agent 在等待期间不继续工作。
- 全部 agent 完成后，再把这个 tool call 的结果一次性返回给主 agent。
- 返回内容应包含每个 agent 的最终输出。

### background 模式语义
- 工具调用返回“已在后台启动”的结果。
- sub agent 在后台继续运行。
- 完成后立即通过事件将结果注入给主 agent。
- 需要联动 status-line 展示当前 session 中的 agents 列表。

## 3. `agents_manage`

用途：
- 查看当前 session 中 agent 状态
- 终止指定 agent
- 列出正在运行和最近完成的 agent

参数建议：

```ts
{
  action: "list" | "kill" | "get";
  agentId?: string;
}
```

语义：
- `list`: 返回当前 session 全部 agent 摘要
- `get`: 返回指定 agent 详情
- `kill`: 终止指定 agent

不需要再单独做“查询后台结果”的工具，因为后台结果通过事件立即推送给主 agent。

---

## 六、Sub Agent 进程设计

## 1. 启动方式

使用：
- `child_process.spawn()`

模式：
- `pi --mode json`

原因：
- 需要流式读取 stdout 的 JSON 事件
- 需要实时更新面板与状态栏
- 需要 kill / timeout 控制

### 启动参数要求
- 使用当前主进程可解析的 `pi` 可执行方式
- 参考 pi 示例 extension 中的 `getPiInvocation()` 逻辑，兼容：
  - 直接 `pi`
  - Node/Bun 包装脚本

### 子进程参数原则
- 继承当前 model 或使用 preset/custom 指定 model
- 继承当前环境变量
- 使用当前 `cwd`
- 使用 JSON 模式输出事件流
- 需要让子进程完整跑一个独立 session

### session 文件要求
- sub agent 的正常 session 继续保存在：
  - `/Users/dawnmoon/.pi/agent/sessions`
- 不使用 `--no-session`
- 需要从 JSON 事件流中读取该 sub session 的 `session.id`
- 将 parent / child 关系额外写入 `subagents.jsonl`

## 2. 事件解析

需要处理以下 JSON 事件：

### `session`
- 读取 sub agent 自己的 session id
- 保存到 `SessionAgentRecord.sessionId`

### `message_update`
- 若 `assistantMessageEvent.type === "text_delta"`
  - 累加到 `textBuffer`
  - 按换行切分并更新 `lastTwoLines`
- 若工具调用期间没有新文本，保持当前展示

### `tool_execution_start`
- `toolCalls += 1`
- `currentToolName = toolName`
- `lastTwoLines = ["<toolName> tool called"]`
- 这里的 UI 语义是：若当前为工具调用，内容行显示 `xxx tool called`

### `tool_execution_end`
- 清空 `currentToolName`
- 恢复按 `textBuffer` 计算出来的最后两行展示

### `message_end`
- 累加 usage：
  - input
  - output
  - cacheRead
  - cacheWrite
  - cost
  - total tokens
- 若 assistant 完整消息可提取最终文本，也要保留

### `agent_end`
- 提取最终结果文本
- 标记状态为 `done` 或 `failed`
- 持久化最终记录
- 触发完成事件

### 子进程 `close` / `error`
- 若异常退出，标记 `failed`
- 写入 `errorText`
- 持久化
- 触发失败事件

## 3. 最后两行算法

“最后两行”定义已经确认：
- 以当前累积文本按换行拆分
- 只渲染拆分结果中的最后两行
- TUI 只展示这两行

建议实现：

```ts
function extractLastTwoLines(text: string): string[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  return lines.slice(-2);
}
```

当处于工具调用中时，显示：
- `bash tool called`
- `read tool called`
- `edit tool called`

不需要显示工具参数详情。

---

## 七、前台面板设计

## 1. 展示格式

前台模式下的每个 agent 块固定如下：

```text
[●] explorer (running) 2.5k tokens, 7 tools called
这里是最后两行的内容
这里是最后两行的内容
```

说明：
- 第一行：状态 + 名称 + 状态文本 + token 数 + 工具调用数
- 第二、三行：最后两行文本内容
- 若当前处于工具调用中，则第二或第三行显示 `xxx tools called`

状态图标建议：
- `pending` -> `○`
- `running` -> `●`
- `done` -> `✓`
- `failed` -> `✗`
- `killed` -> `⊗`

状态文本：
- `pending`
- `running`
- `completed`
- `failed`
- `killed`

第一行示例：
- `[●] explorer (running) 2.5k tokens, 7 tools called`
- `[✓] reviewer (completed) 3.8k tokens, 5 tools called`


## 2. 交互要求

使用 `ctx.ui.custom()` 或现有 `aboveStatus` patch 技术实现。

交互：
- `↑/↓` 切换当前选中 agent
- `Ctrl+K` 终止当前选中的 running agent
- `Esc` 终止全部并退出前台面板

不需要：
- 查看完整输出
- 展开模式
- 复制输出

## 3. 生命周期

- `foreground` 模式开始时显示面板
- 全部 agent 完成后自动关闭面板
- 返回 tool result 给主 agent
- 若用户按 `Esc`，终止全部 agent，并让 tool result 以错误或取消状态返回

---

## 八、后台模式与 status-line 联动

## 1. 状态栏区域要求

在输入框下方、模型详情上方增加一行 agents 列表。

当前已有 `status-line.ts` 负责：
- footer
- aboveEditor widget

本次需要扩展它，在 status 区增加 agents 列表。实现方式建议：
- 保持 footer 两行不动
- 通过 `ctx.ui.setWidget("agents-status", ...)` 在 `aboveEditor` 或 `belowEditor` 放置 agents 列表行
- 位置需与用户要求对齐：在输入框下方、模型详情上方
- 若现有 `status-line.ts` 已完全接管 footer，则应在它内部统一管理这一行，避免多扩展互相覆盖

建议采用：
- 由 `status-line.ts` 继续接管 footer
- agents 扩展通过全局事件或 session custom entry 向 `status-line.ts` 提供可渲染数据
- `status-line.ts` 渲染时在原有两行和 editor 之间增加 agents 列表 widget

## 2. agents 列表内容

显示规则：
- 默认显示 `main`
- 当本 session 创建 sub agents 后，显示当前 session 中的 agents
- 最多显示 5 个
- 例如：

```text
Agents: [main] explorer reviewer coder
```

或者带状态：

```text
Agents: [main] explorer(running) reviewer(done) coder(running)
```

建议最终形式：
- 简短，以名称为主
- 当前聚焦项使用方括号包裹

## 3. 焦点切换

用户要求：
- 当输入框为空时，按方向下键切换到 agents 区域
- 默认焦点是 `main`

这需要扩展 `InteractiveMode` 或 editor 输入处理。

实现建议：
1. 在 `status-line.ts` 中仿照已有 shortcut patch 机制，增加键盘状态 hook。
2. 当 editor 文本为空且按下 `↓` 时，将焦点切换到 agents 区。
3. agents 区左右或上下切换不同 agent。
4. 回车进入对应 agent 的查看或操作模式不是本期硬要求，可先只做可切换和可标识。

如果焦点型 agents strip 难以在第一版稳定完成，则第一版最少也要完成：
- agents 列表显示
- 当前 session 中 agents 更新
- 后续再补焦点切换

但按本次要求，焦点切换属于目标范围，应进入实施任务清单。

## 4. 后台结果注入主 agent

核心要求：
- 后台 sub agent 完成后，立即作为 system message 推送给 LLM。

建议事件流：
1. sub agent 完成
2. `pi.events.emit("agents:completed", payload)`
3. 扩展维护一个待注入 system message 队列
4. 在主 agent 当前回合安全边界处注入消息

建议注入内容格式：

```text
[Background subagent completed]
name: explorer
status: completed
result:
<final output>
```

失败时：

```text
[Background subagent completed]
name: explorer
status: failed
error:
<error text>
```

注入实现优先检查 pi 可用 API：
- 若存在直接注入 system message / sendMessage 的会话 API，则使用正式消息注入
- 若没有，则在 `before_agent_start` 阶段追加到 `systemPrompt` 或插入新的 system/user 消息

本期目标是“立即推送给 LLM”，因此不能依赖用户后续再次发消息才可见。
开发时要优先查证：
- 是否能在 session 运行中直接 `sendMessage` 给当前 session
- 若能，优先走消息注入
- 若不能，再选择以“下一轮 agent 启动前自动拼入 system prompt”的方式模拟，但这不完全满足立即推送，需在实现前再次确认 pi API

---

## 九、Prompt 适配设计

需要修改：
- `/Users/dawnmoon/.pi/agent/extensions/Prompt/system-prompt.ts`

新增一段 agents 使用规范，但不能写死 preset 列表。

必须表达的规则：

1. 你可以调用 agents 相关工具调度 sub agent。
2. 使用前先调用工具查询当前可用 preset。
3. skill 里若要求“调用 xxx subagent”，你应根据工具返回的 preset 列表选择合适 agent；若没有合适 preset，可在本次调用中定义 custom agent。
4. `foreground` 模式用于当前任务必须等待多个 sub agent 完成后再继续。
5. `background` 模式用于主 agent 继续工作，同时让 sub agent 后台运行。
6. 后台完成结果会自动送回主 agent 上下文。
7. 一次最多允许 5 个并发 sub agent。

不要写：
- explorer、reviewer、coder 是固定内置列表

可以写：
- 常见用途包括探索、实现、审查等，但可用 preset 以工具查询结果为准。

---

## 十、现有文件修改要求

## 1. `/Users/dawnmoon/.pi/agent/extensions/Feature/index.ts`

需要：
- 导入 `./Agents`
- 在默认导出函数中注册 Agents 扩展

目标结构：

```ts
import agents from "./Agents";

export default async function (pi: ExtensionAPI) {
  ...
  await Promise.resolve(agents(pi));
}
```

## 2. `/Users/dawnmoon/.pi/agent/extensions/Appearance/status-line.ts`

需要：
- 增加读取 agents 状态的能力
- 在输入区和 footer 之间增加 agents 列表展示
- 增加焦点切换相关状态管理与键盘 hook
- 与现有 shortcut hook 共存，避免相互覆盖

建议新增：
- 一个全局 listeners 集合，监听 `agents:state-changed`
- 一个本地 `agentsStripState`
- 一个 `setWidget("agents-strip", ...)` 渲染函数
- 焦点切换 patch，与 editor 空文本检测结合

## 3. `/Users/dawnmoon/.pi/agent/extensions/Prompt/system-prompt.ts`

需要：
- 在现有 system prompt 注入逻辑中追加 agents 使用规范
- 文案与本实施文档第九节一致

---

## 十一、开发顺序

### 任务 1：建立 Agents 扩展骨架

文件：
- `Agents/index.ts`
- `Agents/types.ts`
- `Agents/constants.ts`

步骤：
1. 创建类型定义
2. 创建常量与事件名
3. 导出扩展入口
4. 在 `Feature/index.ts` 注册扩展

验证：
- `ts` 导入无报错
- `/reload` 后扩展正常加载

### 任务 2：实现 preset 读取

文件：
- `Agents/agents.json`
- `Agents/list-presets-tool.ts`
- `Agents/registry.ts`

步骤：
1. 写 `agents.json`
2. 实现读取、校验、缓存逻辑
3. 注册 `agents_list_presets` 工具
4. 返回文本和结构化详情

验证：
- 工具能返回当前 preset 列表
- `agents.json` 格式错误时返回清晰错误

### 任务 3：实现 sub agent 进程管理

文件：
- `Agents/process-manager.ts`
- `Agents/persistence.ts`

步骤：
1. 参考 pi 官方 `examples/extensions/subagent` 中的 `getPiInvocation()` 与 JSON 事件解析方式
2. 实现 `spawn()` 启动逻辑
3. 实现超时、kill、stdout/stderr 处理
4. 实现 lastTwoLines、toolCalls、tokenUsage 更新
5. 实现写入 `subagents.jsonl`

验证：
- 单个 sub agent 能启动、完成、持久化
- 工具调用时能看到 `xxx tool called`
- token 和 toolCalls 统计正确

### 任务 4：实现 runtime 与 session 状态持久化

文件：
- `Agents/runtime.ts`
- `Agents/registry.ts`
- `Agents/status-bridge.ts`

步骤：
1. 管理当前 session agent 注册表
2. 状态变化时写 `appendEntry("agents-extension-state", ...)`
3. 向 status-line 发事件或提供全局读取入口
4. session_start / session_tree 时恢复状态

验证：
- 重载后 agents 列表可恢复
- status-line 可接收到最新状态

### 任务 5：实现 `agents_manage`

文件：
- `Agents/manage-agents-tool.ts`

步骤：
1. 支持 `list`
2. 支持 `get`
3. 支持 `kill`
4. 对不存在 agent 返回明确错误

验证：
- 可列出当前 session agents
- 可终止 running agent

### 任务 6：实现前台面板

文件：
- `Agents/foreground-panel.ts`
- `Agents/agents-tool.ts`

步骤：
1. 用 `ctx.ui.custom()` 或已有 aboveStatus patch 实现面板
2. 实时展示每个 agent 三行内容
3. 支持 `↑/↓`、`Ctrl+K`、`Esc`
4. 全部完成后关闭面板并返回 tool result

验证：
- 多个 agent 前台并发显示正常
- 最后两行渲染正确
- `Ctrl+K` 与 `Esc` 生效

### 任务 7：实现后台模式与立即注入

文件：
- `Agents/background-events.ts`
- `Agents/agents-tool.ts`
- `Prompt/system-prompt.ts`

步骤：
1. `background` 模式下立即返回“已启动”结果
2. 完成后触发 `agents:completed`
3. 把结果作为 system message 推送给主 agent
4. 确保主 agent 在后续推理上下文中立即可见

验证：
- 后台 agent 完成后无需用户再次发消息即可被主 agent 感知
- 失败结果也能注入

### 任务 8：实现 status-line 联动

文件：
- `Appearance/status-line.ts`
- `Agents/status-bridge.ts`

步骤：
1. 增加 agents 列表显示
2. 最多显示 5 个
3. 默认 `main`
4. 实现 editor 为空时 `↓` 切换到 agents 区
5. 支持在 agents 区切换焦点

验证：
- agents strip 正确显示
- 焦点切换有效
- 不影响原有状态栏功能

### 任务 9：整理 skills

工作目录：
- `/Users/dawnmoon/.pi/agent/superpowers/skills`

步骤：
1. 为每个保留 skill 建立中文最终版本
2. 删除与本方案冲突的文案
3. 新建 `code-review`
4. 调整关联 prompt 模板
5. 清理目录结构，只留下目标 skills

验证：
- 每个 `SKILL.md` 为高质量中文
- 不再出现 `superpowers` 与 `git worktree`
- `brainstorming` 不再要求保存 design 文档
- `writing-plans` 成为唯一落盘文档入口

### 任务 10：联调与验收

步骤：
1. `/reload` 扩展
2. 测试 `agents_list_presets`
3. 测试 `agents` foreground
4. 测试 `agents` background
5. 测试 `agents_manage kill`
6. 测试 status-line agents 列表
7. 测试新 system prompt 对主 agent 的引导
8. 测试 skills 文本是否符合新工作流

---

## 十二、验收标准

满足以下条件视为完成：

### Skills
- 只保留目标 8 个 skills
- 全部高质量中文化
- 无 `superpowers` 和 `git worktree` 表述
- `brainstorming` 不再保存 design 文档
- `writing-plans` 是唯一需要保存的实施文档入口
- `code-review` 已整合完成

### Extension
- `Feature/index.ts` 已注册 Agents 扩展
- `agents_list_presets` 可返回实时 preset 列表
- `agents` 支持 `foreground` 和 `background`
- `foreground` 下多个 agent 并发运行时有面板展示
- 面板每个 agent 显示三行：
  - 状态摘要行
  - 最后两行内容
- 工具调用时显示 `xxx tool called`
- `background` 下主 agent 可继续工作
- sub agent 完成后结果会立即作为 system message 注入主 agent
- `status-line` 中能显示 agents 列表
- 最多并发 5 个 agent
- 默认超时 20 分钟，最大 60 分钟
- `subagents.jsonl` 正常记录 parent / child session 关系
- 支持通过 `agents_manage kill` 终止 agent
- 支持 custom agent
- 不在 system prompt 中写死 preset 列表

---

## 十三、开发时必须优先参考的现有代码

### Pi 官方文档
- `/Users/dawnmoon/Library/pnpm/global/5/.pnpm/@earendil-works+pi-coding-agent@0.74.0_ws@8.20.0_zod@4.4.3/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- `/Users/dawnmoon/Library/pnpm/global/5/.pnpm/@earendil-works+pi-coding-agent@0.74.0_ws@8.20.0_zod@4.4.3/node_modules/@earendil-works/pi-coding-agent/docs/json.md`
- `/Users/dawnmoon/Library/pnpm/global/5/.pnpm/@earendil-works+pi-coding-agent@0.74.0_ws@8.20.0_zod@4.4.3/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`
- `/Users/dawnmoon/Library/pnpm/global/5/.pnpm/@earendil-works+pi-coding-agent@0.74.0_ws@8.20.0_zod@4.4.3/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`

### Pi 官方示例
- `/Users/dawnmoon/Library/pnpm/global/5/.pnpm/@earendil-works+pi-coding-agent@0.74.0_ws@8.20.0_zod@4.4.3/node_modules/@earendil-works/pi-coding-agent/examples/extensions/subagent/index.ts`
- `/Users/dawnmoon/Library/pnpm/global/5/.pnpm/@earendil-works+pi-coding-agent@0.74.0_ws@8.20.0_zod@4.4.3/node_modules/@earendil-works/pi-coding-agent/examples/extensions/subagent/agents.ts`

### 当前本地扩展实现
- `/Users/dawnmoon/.pi/agent/extensions/Feature/ask-user-questions.ts`
- `/Users/dawnmoon/.pi/agent/extensions/Feature/form-ui-helpers.ts`
- `/Users/dawnmoon/.pi/agent/extensions/Appearance/status-line.ts`
- `/Users/dawnmoon/.pi/agent/extensions/Prompt/system-prompt.ts`

---

## 十四、已确认决策清单

1. design 不单独保存文档，实施文档才保存。
2. agents 扩展放在 `~/.pi/agent/extensions/Feature/Agents`。
3. `Feature/index.ts` 中注册扩展。
4. 两种调度模式都需要：
   - 后台运行
   - 前台等待
5. 一个 tool call 可同时发起多个 sub agent；前台模式要等全部完成才返回此 tool call 结果。
6. preset 从 `Agents/agents.json` 读取。
7. 主 agent 不得在 system prompt 中硬编码 preset 列表，必须通过工具查询。
8. 支持 custom agent。
9. 前台面板每个 agent 显示：
   - 第一行状态摘要
   - 最后两行内容
10. 工具调用中显示 `xxx tool called`。
11. 不支持查看完整输出。
12. 后台完成结果必须事件驱动并立即注入主 agent。
13. sub agent 继承 cwd 和环境变量。
14. sub agent 正常 session 保存在 `~/.pi/agent/sessions`，关联关系另写入 `subagents.jsonl`。
15. 不支持自动重试。
16. 同时运行的 sub agent 最多 5 个。
17. 默认超时 20 分钟，可配置，最大 60 分钟。
18. `subagents.jsonl` 无限增长，不做清理。
19. skills 全部继承，不裁剪。
20. 前台面板不做耗时估算。

---

## 文档用途

此文档用于新 session 直接进入开发。

开发时应先按本文件建立目录与骨架，再逐任务实现与验证，不需要重新设计范围。
