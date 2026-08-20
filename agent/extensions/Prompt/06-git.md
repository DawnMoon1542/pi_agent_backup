## Git

- 禁止使用 `git worktree`。
- 开发默认在当前分支完成。
- 提交前检查工作区状态,避免提交无关文件。
- 每条 commit message 使用以下格式:

```text
英文类型: 中文简介,描述本次更改的结果是什么

中文正文:描述对什么文件进行了什么修改
```

示例:

```text
fix: 修复消息步骤重复与底部文本异常合并

服务端和客户端同时为相同文本生成 text_message 步骤,ID 不同,
导致 mergeTurnSteps 按 ID 去重时两者共存,每条消息显示两次,
且 deriveRenderableContent 因文本翻倍而无法正确去重。
```
