# Pi Agent 扩展体系

/Users/dawnmoon/.pi/agent/extensions 目录下的所有自定义扩展，按职责划分为外观、功能、权限、提示、供应商五大类，共 18 项独立扩展模块。

## 扩展分类总览

整个扩展集合围绕 Pi coding agent 的 `ExtensionAPI` 构建，通过 `pi.on()` 监听生命周期事件、`pi.registerTool()` 注册自定义工具、`pi.registerCommand()` 注册命令、`pi.registerProvider()` 注册模型供应商，覆盖了 TUI 交互、AI 工具增强、安全管控、模型接入等维度。

## 外观 (Appearance)

该分类控制终端 UI 的呈现方式：thinking 块的默认显示策略、状态栏信息、工具调用的展现形式。

### 默认隐藏 Thinking (`hide-thinking-default`)

将 thinking 内容默认折叠隐藏，在消息底部显示思考时长和 `Ctrl+T` 切换提示。通过 patch `AssistantMessageComponent` 的渲染逻辑，在隐藏态显示 thinking 文本尾部预览（最多 3 行），展开态完整显示。思考时长以 `(h m s)` 格式实时更新并持久化到 session 分支中，确保跨轮次、跨会话恢复时仍能正确显示。

### 抑制 Thinking 状态文本 (`suppress-thinking-status`)

屏蔽 `Ctrl+T` 切换 thinking 可见性时产生的 `"Thinking blocks: ... "` 状态行信息，避免与其他扩展的状态栏内容产生视觉干扰。通过 monkey-patch `InteractiveMode.prototype.showStatus` 实现。

### 状态栏 Widget (`status-line`)

在编辑器上方渲染两行终端状态栏：

- 第一行：模型名称、上下文使用百分比进度条、输入/输出 Token 统计、累计费用
- 第二行：当前目录、实时 TPS、Git 分支与变更状态

额外提供快捷键提示面板（`Ctrl+O` 切换工具展开、`Ctrl+T` 切换 thinking、`Ctrl+Y` 切换 yolo 模式）和工作计时器（当前轮次耗时 + 会话累计耗时），计时器数据同样持久化到 session 分支。

### 工具展示优化 (`pi-tool-display`)

OpenCode 风格的工具调用渲染扩展，提供三种预设（`opencode` / `balanced` / `verbose`），核心能力包括：

- 内置工具的紧凑渲染（`read`/`grep`/`find`/`ls`/`bash`/`edit`/`write`）
- 编辑/写入操作的自适应 diff 展示（split/unified 布局，语法高亮，窄窗宽度截断）
- 流式传输中的待定编辑/写入预览（展示 `pending edit` / `pending overwrite` / `pending create` 差异）
- thinking 块标签与上下文净化，防止 presentation label 回流到后续模型轮次
- 可选的 native 用户消息框（markdown 感知渲染 + ANSI 安全处理）

## 功能 (Feature)

该分类是扩展集中占比最大的部分，提供自定义工具、命令、工作流自动化等能力。

### AskUserQuestions 工具 (`ask-user-questions`)

通过自定义 TUI 对话框向用户提出 1-5 个带选项的问题。每个问题支持选择预设选项、输入自定义答案、或标记为"聊天讨论"。对话框支持键盘导航（方向键切换问题和选项、Enter 确认、Ctrl+C 取消），结果以结构化 JSON 返回给模型。工具执行期间自动暂停状态栏计时器。

### Clear 命令 (`clear-command`)

注册 `/clear` 命令，功能等同于 `/new`，清空当前上下文并开启新会话。

### FormFilling 工具 (`form-filling`)

结构化表单填写工具，支持 2-25 个元素，字段类型包括布尔值、单选、多选、文本输入、说明文本。表单支持键盘导航、输入框支持多行文本（Shift+Enter 换行）、必填校验，提交时返回结构化 `FormValue` 数组。

### 自动重试策略 (`retry-policy`)

在每次 session 启动时自动写入 `settings.json`：请求重试设为最多 10 次、基础间隔 1 秒，provider 级别最大重试等待 5 分钟。

### Skill 美元符引用 (`skill-dollar-reference`)

扩展编辑器的自动补全系统，支持 `$skill:<name>` 语法引用技能。自定义 `AutocompleteProvider` 拦截 `$` 前缀输入，从已注册的技能命令中匹配并补齐。同时注册 `DollarSkillEditor` 拦截退格键：删除 `$skill:xxx` 引用时一次退格删除整个引用标记而非逐字符删除。在 `agent_start` 前扫描 prompt 中的 `$skill:xxx` 引用，将其映射为技能文件路径并注入到模型上下文。

### 会话统计 (`stats`)

注册 `/stats` 和 `/stat` 命令，加载当前设备上所有历史 session 数据，以交互式全屏覆盖层展示：

- 概览页：Token 用量（输入/输出/缓存读写）、消息数、按费用排序的模型统计、高频工具调用排行
- 热力图页：7 天范围显示日期 x 小时热力图，30 天/全部范围显示星期 x 月热力图
- 每日趋势图

支持 `r` 键切换时间范围（ALL TIME / 7D / 30D），方向键翻页。

### pi-rewind

基于 Git 的 checkpoint/rewind 扩展，每次执行 write/edit/bash 工具后自动创建快照。核心能力：

- `/rewind` 命令：checkpoint 浏览器 → diff 预览 → 恢复
- `Esc+Esc` 快捷键：快速仅文件回退
- 智能去重：只读操作不创建 checkpoint
- 恢复选项：文件 + 对话 / 仅文件 / 仅对话
- 跨分支恢复拦截、敏感目录排除、50 个上限自动修剪
- 底部状态栏显示 checkpoint 数量

### pi-rtk-optimizer

RTK 命令改写与工具输出压缩扩展，两阶段流水线：

- **命令改写**：将 bash 命令自动转为 `rtk` 等效命令，委托给安装的 `rtk rewrite` 二进制作为改写规则唯一来源
- **输出压缩**：ANSI 剥离、测试输出聚合、构建输出过滤、Git 输出压缩、Linter 聚合、搜索结果分组、源码注释过滤、智能截断

提供 `/rtk` 交互式设置面板和多个子命令（`show`/`verify`/`stats`/`reset`）。

### pi-subagents

Claude Code 风格的自主子代理系统，提供 `Agent` / `get_subagent_result` / `steer_subagent` 三个工具。核心能力：

- 默认代理类型：`general-purpose`（继承父 system prompt 的"父级孪生"）、`Explore`（只读代码探索）、`Plan`（架构规划）
- 自定义代理：通过 `.pi/agents/<name>.md` 定义，支持 YAML frontmatter 配置工具集、模型、思考级别、隔离模式
- 并行后台代理 + 并发队列（默认 4 并发）
- 持久化 Widget 展示活动代理状态（spinner、工具使用、token 消耗、上下文利用率）
- 对话查看器：选择任意代理查看其实时滚动对话
- 优雅轮次限制：达到 max_turns 时发 steering 消息要求收尾，额外 5 轮宽限期
- Git worktree 隔离、技能预加载、持久记忆、跨扩展 RPC、定时调度

## 权限 (Permission)

该分类提供安全管控能力：危险命令拦截、敏感文件访问审批。

### 权限守卫 (`permission-gate`)

在 bash 工具执行前扫描命令，匹配 27 条危险规则，按严重程度（`critical` / `high` / `medium`）分级。检测到危险命令时弹出确认覆盖层，展示匹配的规则和完整命令，用户可选择允许或拒绝。支持 yolo 模式绕过所有检查。规则覆盖了递归删除、sudo、dd、格式化磁盘、分区修改、curl-pipe-shell、git 强制操作、Kubernetes 资源删除、敏感文件访问等场景。

### 敏感文件审批 (`sensitive-file-gate`)

在 read/write/edit 工具执行前扫描文件路径，匹配 8 条敏感文件名规则（`.env`、`secret`、`credential`、`token`、`key`、SSH 私钥、`.npmrc`/`.pypirc`/`.netrc`、Shell RC 文件）。检测到敏感路径时弹出确认覆盖层，展示匹配规则和文件路径。

两个权限扩展共享同一个 `confirmOverlay` 覆盖层组件，该组件通过 patch `InteractiveMode.prototype.showExtensionCustom` 实现了 `aboveStatus` 放置模式（在状态行上方渲染自定义 UI）。

## 提示 (Prompt)

### 系统提示注入 (`system-prompt`)

在每次 `before_agent_start` 事件中向系统提示注入额外的指令块。当前注入的内容是一套生产级输出纪律规范，包括：Banned Output Patterns 禁止列表、输出净化纪律（禁止 Prompt Echoing / Process Leakage / Meta-commentary）、动态技能激活评估流程、执行原则、开发规范、Git Commit Message 格式、语言风格约束等。

## 供应商 (Provider)

该分类注册了 5 个自定义模型供应商，均通过 Anthropic Messages API 兼容端点接入。

### 供应商环境变量管理 (`env.ts`)

统一的 API Key 读取工具：优先读取进程环境变量，回退到 `.env` 文件的解析结果。

### NewAPI Claude (`custom-provider-newapi-claude`)

通过内网 NewAPI 网关接入 Claude Opus 4.7 / Opus 4.6 / Sonnet 4.6，以及 DeepSeek V4 Pro / V4 Flash。

### NewAPI Codex (`custom-provider-newapi-codex`)

通过内网 NewAPI 网关接入 Codex 模型。

### NewAPI OpenAI (`custom-provider-newapi-openai`)

通过内网 NewAPI 网关接入 OpenAI 模型。

### 个人 DeepSeek (`custom-provider-personal-dpsk`)

直连 DeepSeek 官方 Anthropic 兼容端点（`api.deepseek.com/anthropic`），提供 DeepSeek V4 Pro 和 V4 Flash。

### 个人 MiMo (`custom-provider-personal-mimo`)

接入小米 MiMo V2.5 Pro，100 万上下文窗口，支持文本和图片输入。

### Ikun (`custom-provider-ikun`)

自定义供应商接入 Claude Opus 4.7 / 4.6。

## 架构关系

所有扩展通过各分类的 `index.ts` 统一导出，使用 `export default async function(pi: ExtensionAPI)` 签名注册到 Pi 框架。扩展间的协作关系包括：

- `status-line` 的计时器通过 `pi.events` 暴露 `status-line:timer-pause` / `status-line:timer-resume` 事件，`permission-gate`、`sensitive-file-gate`、`ask-user-questions`、`form-filling` 在弹出 UI 时暂停计时
- `status-line` 的 yolo 模式通过 `Symbol.for("pi.extensions.yolo.active")` 全局标记，`permission-gate` 和 `sensitive-file-gate` 读取该标记决定是否跳过权限检查
- `hide-thinking-default` 和 `status-line` 通过相同的 `ShortcutStateListener` 机制监听 `Ctrl+T` thinking 切换事件
- `skill-dollar-reference` 扫描技能引用并注入到 prompt，`pi-subagents` 的技能预加载机制从相同技能目录树发现 SKILL.md
- `confirmOverlay` 和 `form-ui-helpers` 各自独立实现了 `aboveStatus` placement 的 `showExtensionCustom` patch，通过不同 Symbol 隔离避免冲突
