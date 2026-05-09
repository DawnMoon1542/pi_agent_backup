// @name: bash 仅显示最后三行
// @category: ui
// @description: 模型调用 bash 时，TUI 中只预览执行结果的最后三行；按 Ctrl+O 展开完整内容。

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";

const PREVIEW_LINES = 3;
const EXPAND_HINT = "Ctrl+O to expand";

type TextPart = {
  type?: string;
  text?: string;
};

class FixedLines implements Component {
  constructor(private text = "") {}

  setText(text: string): void {
    this.text = text;
  }

  render(width: number): string[] {
    return this.text.split("\n").map((line) => truncateToWidth(line, width, ""));
  }

  invalidate(): void {}
}

function getTextContent(result: unknown): string {
  const value = result as { content?: TextPart[] } | undefined;
  const parts = Array.isArray(value?.content) ? value.content : [];
  return parts
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function toDisplayLines(content: string): string[] {
  const lines = content.replace(/\t/g, "  ").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length > 0 ? lines : [""];
}

export default function (pi: ExtensionAPI) {
  const baseBashTool = createBashTool(process.cwd());

  pi.registerTool({
    ...baseBashTool,
    label: "bash (last 3 lines in TUI)",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const bashTool = createBashTool(ctx.cwd);
      return bashTool.execute(toolCallId, params, signal, onUpdate, ctx);
    },

    renderResult(result, _options, theme, context) {
      const component = (context.lastComponent as FixedLines | undefined) ?? new FixedLines();
      const output = getTextContent(result);
      const lines = toDisplayLines(output);
      const total = output.trimEnd().length > 0 ? lines.length : 0;
      const skipped = Math.max(0, lines.length - PREVIEW_LINES);
      const visibleLines = context.expanded ? lines : lines.slice(-PREVIEW_LINES);
      const styledLines = visibleLines.map((line) => theme.fg("toolOutput", line));
      const summary = theme.fg("muted", `Output ${total} lines${skipped > 0 ? `, ${EXPAND_HINT}` : ""}`);

      component.setText([...styledLines, summary].join("\n"));
      return component;
    },
  });
}
