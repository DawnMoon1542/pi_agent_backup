// @name: write 仅显示最后三行
// @category: ui
// @description: 模型调用 write 时，TUI 中只预览待写入内容的最后三行，避免整文件刷屏。

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createWriteTool } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";

const PREVIEW_LINES = 3;
const EXPAND_HINT = "Ctrl+O to expand";

class FixedLines implements Component {
  constructor(private text = "") {}

  setText(text: string): void {
    this.text = text;
  }

  render(width: number): string[] {
    if (this.text.length === 0) return [];
    return this.text.split("\n").map((line) => truncateToWidth(line, width, ""));
  }

  invalidate(): void {}
}

function toDisplayLines(content: string): string[] {
  const lines = content.replace(/\t/g, "  ").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function getTextContent(result: any): string {
  const parts = Array.isArray(result?.content) ? result.content : [];
  return parts
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("\n");
}

export default function (pi: ExtensionAPI) {
  const baseWriteTool = createWriteTool(process.cwd());

  pi.registerTool({
    ...baseWriteTool,
    label: "write (last 3 lines in TUI)",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const writeTool = createWriteTool(ctx.cwd);
      return writeTool.execute(toolCallId, params, signal, onUpdate, ctx);
    },

    renderCall(args, theme, context) {
      const component = (context.lastComponent as FixedLines | undefined) ?? new FixedLines();
      const path = typeof (args as any)?.path === "string" ? (args as any).path : "";
      const content = typeof (args as any)?.content === "string" ? (args as any).content : "";

      const outputLines = [
        `${theme.fg("toolTitle", theme.bold("write"))} ${path ? theme.fg("accent", path) : theme.fg("muted", "<unknown>")}`,
      ];

      if (content.length > 0) {
        const lines = toDisplayLines(content);
        const total = lines.length;
        const skipped = Math.max(0, total - PREVIEW_LINES);
        const visibleLines = context.expanded ? lines : lines.slice(-PREVIEW_LINES);

        outputLines.push(...visibleLines.map((line) => theme.fg("toolOutput", line)));
        outputLines.push(theme.fg("muted", `Written ${total} lines${skipped > 0 ? `, ${EXPAND_HINT}` : ""}`));
      } else {
        outputLines.push(theme.fg("muted", "[空内容]"));
      }

      component.setText(outputLines.join("\n"));
      return component;
    },

    renderResult(result, _options, theme, context) {
      const component = (context.lastComponent as FixedLines | undefined) ?? new FixedLines();

      if (!context.isError) {
        component.setText("");
        return component;
      }

      const output = getTextContent(result) || "write failed";
      component.setText(theme.fg("error", output));
      return component;
    },
  });
}
