// @name: bash 命令前三行，输出后三行
// @category: ui
// @description: 模型调用 bash 时，TUI 中命令只预览渲染后的前三行，输出只预览渲染后的最后三行；按 Ctrl+O 展开完整内容。

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";

const PREVIEW_LINES = 3;
type TextPart = {
  type?: string;
  text?: string;
};

type BashArgs = {
  command?: string;
  timeout?: number;
};

type PreviewMode = "head" | "tail";

class VisualPreview implements Component {
  private lines: string[] = [];
  private expanded = false;
  private mode: PreviewMode = "tail";

  setContent(lines: string[], options: { expanded: boolean; mode: PreviewMode }): void {
    this.lines = lines;
    this.expanded = options.expanded;
    this.mode = options.mode;
  }

  render(width: number): string[] {
    const wrapped = this.lines.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
    if (this.expanded || wrapped.length <= PREVIEW_LINES) {
      return wrapped.map((line) => truncateToWidth(line, width, ""));
    }

    const visible = this.mode === "head"
      ? wrapped.slice(0, PREVIEW_LINES)
      : wrapped.slice(-PREVIEW_LINES);

    return visible.map((line) => truncateToWidth(line, width, ""));
  }

  invalidate(): void {}
}

function previewComponent(lastComponent: Component | undefined): VisualPreview {
  return lastComponent instanceof VisualPreview ? lastComponent : new VisualPreview();
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

function commandLines(args: BashArgs | undefined, theme: any): string[] {
  const command = typeof args?.command === "string" ? args.command : "";
  const timeout = typeof args?.timeout === "number" ? args.timeout : undefined;
  const commandBody = command.length > 0 ? command : "<empty command>";
  const suffix = timeout == null ? "" : theme.fg("muted", ` (timeout ${timeout}s)`);
  const lines = commandBody.replace(/\t/g, "  ").split("\n");
  if (lines.length === 0) return [theme.fg("toolTitle", "$ <empty command>")];
  return lines.map((line, index) => {
    const prefix = index === 0 ? "$ " : "  ";
    const text = `${prefix}${line}${index === 0 ? suffix : ""}`;
    return index === 0 ? theme.fg("toolTitle", text) : theme.fg("toolOutput", text);
  });
}

export default function (pi: ExtensionAPI) {
  const baseBashTool = createBashTool(process.cwd());

  pi.registerTool({
    ...baseBashTool,
    label: "bash (command first 3 TUI lines, output last 3 TUI lines)",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const bashTool = createBashTool(ctx.cwd);
      return bashTool.execute(toolCallId, params, signal, onUpdate, ctx);
    },

    renderCall(args, theme, context) {
      const component = previewComponent(context.lastComponent);
      component.setContent(commandLines(args as BashArgs | undefined, theme), {
        expanded: Boolean(context.expanded),
        mode: context.isPartial ? "tail" : "head",
      });
      return component;
    },

    renderResult(result, options, theme, context) {
      const component = previewComponent(context.lastComponent);

      if (context.isError) {
        const output = getTextContent(result) || "bash failed";
        component.setContent(toDisplayLines(output).map((line) => theme.fg("error", line)), {
          expanded: Boolean(context.expanded ?? options.expanded),
          mode: "tail",
        });
        return component;
      }

      const output = getTextContent(result);
      const lines = output.trimEnd().length > 0
        ? toDisplayLines(output).map((line) => theme.fg("toolOutput", line))
        : [theme.fg("muted", "<no output>")];

      component.setContent(lines, {
        expanded: Boolean(context.expanded ?? options.expanded),
        mode: "tail",
      });
      return component;
    },
  });
}
