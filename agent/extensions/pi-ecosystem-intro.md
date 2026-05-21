# Pi Coding Agent — Extensions 与 Skills 完整介绍

Pi Coding Agent 是一个可高度扩展的 AI 编码助手框架。本文档系统梳理其两大核心扩展机制：Extensions（运行时增强层）与 Skills（知识与指令层），涵盖 16 个扩展模块与 22 个技能指令，从技术实现、功能用途到架构关系进行全面介绍。

## Extensions — 运行时增强层

Extensions 通过 Pi 扩展 API 直接注册 hook、工具、命令和 provider，在运行时改变 agent 的行为、外观和能力边界。按功能域分为 5 个分类目录。

### Appearance — 外观与显示

围绕 TUI 视觉体验，提供 4 个扩展模块和 1 个子项目。

- **hide-thinking-default** — 默认隐藏 thinking 块，显示末尾 3 行预览和思考时长，支持 Ctrl+T 切换。通过 monkey-patch AssistantMessageComponent 和 InteractiveMode 实现，持久化思考时长到 session 条目。
- **status-line** — TUI 底部双行状态栏，显示模型名、context 使用率、Token 统计、TPS、Git 状态、快捷键面板和工作计时器。注册 Ctrl+Y 快捷键切换 yolo 模式。
- **suppress-thinking-status** — 屏蔽 Ctrl+T 切换时的 "Thinking blocks:" 重复状态消息，与 hide-thinking-default 配合使用。
- **pi-tool-display (v0.3.6)** — 紧凑化工具调用渲染器，为 7 种内置工具提供自定义渲染能力和 diff 可视化。支持三种预设（opencode/balanced/verbose）和交互式 `/tool-display` 命令。

### Feature — 功能扩展

提供核心交互能力增强，包含 7 个独立模块和 3 个子项目。

- **ask-user-questions** — 注册 `AskUserQuestions` 工具，AI 可通过自定义 TUI 向用户提 1-5 个带选项的多选/自定义答案问题。支持左右切换，自定义输入框编辑。
- **form-filling** — 注册 `FormFilling` 工具，AI 可让用户填写 2-25 个字段的表单（boolean/select/multiselect/input/text）。
- **form-ui-helpers** — 上述两工具共享的 TUI 渲染基础设施，提供 customAboveStatus、主题包装、文本框渲染等。
- **clear-command** — `/clear` 命令，等同于 `/new` 开启新会话。
- **retry-policy** — session 启动时自动配置重试策略：最多 10 次，基础延迟 1 秒，provider 最大等待 5 分钟。
- **skill-dollar-reference** — `$skill:name` 语法引用 skill，提供自动补全和 agent 启动前的路径注入。
- **stats** — `/stats` 命令，交互式使用统计页面（token 用量、费用、模型分布、工具频率、热力图）。
- **pi-rewind (v0.5.0)** — 自动 git checkpoint，支持 `/rewind` 浏览/diff 预览/恢复，一键 Esc+Esc 快速文件恢复。
- **pi-rtk-optimizer (v0.7.1)** — 自动将 bash 命令重写为 rtk 等价物，8 阶段工具输出压缩管线以节省上下文窗口。
- **pi-subagents (v0.7.3)** — 自主子代理系统，注册 Agent/get_subagent_result/steer_subagent 三个工具，支持并发/隔离/调度/持久记忆/worktree 隔离。

### Permission — 权限与安全

在 AI 操作敏感文件和危险命令前弹出确认对话框。

- **permission-gate** — 拦截 27 类高危 bash 命令（rm -rf、sudo、git push --force 等），按 critical/high/medium 三级定级。yolo 模式跳过检测。
- **sensitive-file-gate** — 拦截 .env、secret、token、key、SSH 私钥、shell RC 文件等 8 类敏感路径的读写操作。
- **confirm-overlay** — 共享确认对话框 UI，支持 Y/N 快捷键、上下切换、Enter/Esc 确认。

### Prompt — 提示词注入

- **system-prompt** — 在 `before_agent_start` hook 中注入完整的 SYSTEM_PROMPT 规范，包括禁止输出模式、输出净化纪律、动态技能激活流程、执行原则、开发规范和语言风格。

### Provider — 模型提供者

通过 5 个 provider 模块接入多种模型，共享 `env.ts` 读取 API Key。

- **new-api-claude** — 经 NewAPI 网关访问 Claude Opus 4.6、Claude Sonnet 4.6、DeepSeek V4 Pro/Flash
- **new-api-openai** — 经 NewAPI 网关访问 Gemini 3.1 Pro
- **new-api-codex** — 经 NewAPI 网关访问 GPT-5.5
- **personal-dpsk** — 直连 DeepSeek 官方 API 访问 V4 Pro/Flash
- **personal-mimo** — 连接小米 MiMo API 访问 MiMo V2.5 Pro

## Skills — 知识与指令层

Skills 以 Markdown 文档形式存在，通过匹配触发词或 `$skill:name` 语法注入到 agent 上下文中，指导 agent 采用特定的工作方法论或技术方案。共 22 个 skill，分布在 3 个层级。

### 顶层 Skills

12 个独立 skill，覆盖浏览器自动化、工作流持续提交、前端设计、配色方案、输出规范、ESLint 配置、文档转换、Node.js 最佳实践、Session 汇总、React 性能优化、TypeScript 类型编程和视频下载。

- **agent-browser** — Chrome CDP 浏览器自动化 CLI，提供导航、表单填写、截图、数据提取、认证管理、视频录制等完整能力。
- **continuously-work** — 持续执行 + 渐进 git commit，遇到真正阻塞才停止。错误分级机制（P0/P1/P2）。
- **design-taste-frontend** — 高级 UI/UX 指令集，通过 3 个调节变量控制风格，含 100 项 AI 暴露信号禁令和 Bento 2.0 运动引擎。
- **frontend-ui-design-morandi-color-scheme** — 莫兰迪配色方案，定义 Neutral/Text/Primary/Accent/Success 五色系和 CSS 变量示例。
- **full-output-enforcement** — 强制完整输出，禁止代码占位符和截断模式，定义 Scope→Build→Cross-check 执行流程。
- **linting-neostandard-eslint9** — ESLint v9 flat config + neostandard 配置指南，含快速启动和迁移文档。
- **md2html** — 将 Markdown 转为自包含 HTML，含 Mermaid 图表、时间线、Callout、侧边 TOC、Claude-orange 主题。通过 `/md2html <file>` 触发。
- **node-best-practices** — Node.js 22+ 原生 TypeScript 最佳实践集合，覆盖 type stripping、异步模式、错误处理、性能等 14 条规则。
- **pi-session-summarizer** — 提取 pi agent session 记录，按项目分类整理为结构化 Markdown。Python 脚本驱动。
- **react-best-practices** — Vercel 工程团队的 45 条 React/Next.js 性能优化规则，覆盖 8 个类别。
- **typescript-magician** — 复杂泛型类型设计、any 消除、类型守卫，工作流程为 tsc → 识别 → 修复 → 验证。
- **yt-dlp-downloader** — 使用 yt-dlp 从 YouTube、Bilibili、Twitter 等网站下载视频/提取音频，含 sub-skill 系统。

### search-skills/ — 搜索与内容提取

统一的搜索与内容解析体系，共享 credentials.json 和 Python 脚本栈。

- **content-extract** — URL→Markdown 上层解析入口。决策树：Domain Whitelist 检查 → Probe 低成本探测 → MinerU 高保真回退。输出统一 Result Contract。
- **mineru-extract** — MinerU 官方 API 调用，支持 pipeline/vlm/MinerU-HTML 三种模型，将 HTML/PDF/Office/图片转为干净 Markdown。
- **search-layer** — 意图感知多源搜索协议。集成 Brave Search、Exa、Tavily、Grok，意图分类后并行检索 + 加权评分 + 知识合成。

### workflow/ — 工作流编排

9 个 skill 组成从需求探索到代码实现到审查调试的完整工作流。

- **brainstorming** — 工作流入口，将想法转为需求边界和方向选型。产出 docs/brainstorming/ 文档。
- **grill-with-docs** — 领域对质，精炼术语、验证边界场景、确认实现方案，产出 design doc + CONTEXT.md 更新 + ADR。
- **writing-plans** — 将设计文档转为 Task Group — Task — Step 三层实现计划，产出 docs/plans/ 文档。
- **subagent-driven-development** — 每个 Task 分派独立子代理，两阶段审查（spec 合规 → 代码质量）。
- **executing-plans** — 当前会话内逐 Task 执行计划，遇阻塞停下询问。
- **code-review** — 三层审查指南：何时发起、如何处理反馈、审查者提示模板。
- **test-driven-development** — 严格红-绿-重构 TDD 循环，bug 修复也始于失败测试。
- **systematic-debugging** — 四阶段系统化调试：根本原因调查 → 模式分析 → 假设测试 → 实施。
- **dispatching-parallel-agents** — 独立问题并行分派 agent，为每个问题领域创建聚焦的子代理。

#### 工作流调用链

```
brainstorming → grill-with-docs → writing-plans → subagent-driven-development / executing-plans
                                                        ↓
                                                   code-review（每 Task 后）
                                                   test-driven-development（实现中）
                                                   systematic-debugging（遇 bug 时）
                                                   dispatching-parallel-agents（独立问题并行时）
```

## 整体架构关系

Extensions 是 pi agent 的运行时增强层，通过 Pi 扩展 API 注册 hook、工具、命令、provider，直接改变 agent 的行为和外观。

Skills 是 pi agent 的知识与指令层，以 Markdown 文档形式存在，通过 `$skill:name` 或自动匹配注入到 agent 上下文中，指导 agent 的工作方法论和技术方案。

两者通过 `skill-dollar-reference` extension 建立桥梁——该 extension 为 skill 引用提供自动补全和路径注入能力。`pi-subagents` extension 则支持 skill 预加载到子代理中。

Extensions 与 Skills 相辅相成：Extensions 提供"怎么做"的运行时能力，Skills 提供"做什么"的方法论指导，共同构成 pi coding agent 完整的可扩展生态。
