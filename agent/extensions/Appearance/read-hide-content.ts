// @name: 隐藏 read 输出
// @category: ui
// @description: 模型调用 read 时，TUI 只显示摘要，不显示文件内容

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

function getTextContent(result: any): string {
  const parts = Array.isArray(result?.content) ? result.content : [];
  return parts
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("\n");
}

function getLineCount(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

export default function (pi: ExtensionAPI) {
  const baseReadTool = createReadTool(process.cwd());

  pi.registerTool({
    ...baseReadTool,
    label: "read (hidden in TUI)",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // 用当前会话 cwd 创建真正的 read 工具，保证相对路径解析和内置行为一致。
      const readTool = createReadTool(ctx.cwd);
      return readTool.execute(toolCallId, params, signal, onUpdate, ctx);
    },

    renderResult(result, _options, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);

      // 错误信息不是文件内容，保留显示，便于排查路径/权限问题。
      if (context.isError) {
        const output = getTextContent(result);
        text.setText(output ? `\n${theme.fg("error", output)}` : theme.fg("error", "read failed"));
        return text;
      }

      const output = getTextContent(result);
      const lineCount = getLineCount(output);
      const path = String((context.args as any)?.path ?? (context.args as any)?.file_path ?? "");
      const suffix = lineCount > 0 ? `，约 ${lineCount} 行` : "";
      const pathPart = path ? `: ${theme.fg("accent", path)}` : "";
      return text;
    },
  });
}
