// @name: bash 命令前三行，输出后三行
// @category: ui
// @description: 模型调用 bash 时，TUI 中命令只预览渲染后的前三行，输出只预览渲染后的最后三行；按 Ctrl+O 展开完整内容。

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";

const PREVIEW_LINES = 3;
const EXPAND_HINT = "Ctrl+O to expand";

type TextPart = {
  type?: string;
  text?: string;
};

type BashArgs = {
  command?: string;
  timeout?: number;
};

type PreviewMode = "head" | "tail";

type VisualSection = {
  lines: string[];
  mode: PreviewMode;
  previewLines: number;
};

class VisualPreview implements Component {
  private header = "";
  private sections: VisualSection[] = [];
  private footer = "";
  private expanded = false;

  setContent(options: { header: string; sections: VisualSection[]; footer?: string; expanded: boolean }): void {
    this.header = options.header;
    this.sections = options.sections;
    this.footer = options.footer ?? "";
    this.expanded = options.expanded;
  }

  private renderSection(section: VisualSection, width: number): string[] {
    const wrapped = section.lines.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
    if (this.expanded || wrapped.length <= section.previewLines) {
      return wrapped.map((line) => truncateToWidth(line, width, ""));
    }
    const visible = section.mode === "head"
      ? wrapped.slice(0, section.previewLines)
      : wrapped.slice(-section.previewLines);
    return visible.map((line) => truncateToWidth(line, width, ""));
  }

  render(width: number): string[] {
    const rendered: string[] = [];
    if (this.header) rendered.push(truncateToWidth(this.header, width, ""));
    for (const section of this.sections) {
      rendered.push(...this.renderSection(section, width));
    }
    if (this.footer) rendered.push(truncateToWidth(this.footer, width, ""));
    return rendered;
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
  if (lines.length === 0) return [theme.fg("toolOutput", "$ <empty command>")];
  return lines.map((line, index) => {
    const prefix = index === 0 ? "$ " : "  ";
    return theme.fg("toolOutput", `${prefix}${line}${index === 0 ? suffix : ""}`);
  });
}

function bashHeader(theme: any): string {
  return theme.fg("toolTitle", theme.bold("Bash"));
}

function outputHeader(theme: any): string {
  return theme.fg("toolTitle", theme.bold("Output"));
}

function expandFooter(theme: any): string {
  return theme.fg("muted", EXPAND_HINT);
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
      component.setContent({
        header: bashHeader(theme),
        sections: [
          {
            lines: commandLines(args as BashArgs | undefined, theme),
            mode: context.isPartial ? "tail" : "head",
            previewLines: PREVIEW_LINES,
          },
        ],
        expanded: Boolean(context.expanded),
      });
      return component;
    },

    renderResult(result, options, theme, context) {
      const component = previewComponent(context.lastComponent);
      const expanded = Boolean(context.expanded ?? options.expanded);

      if (context.isError) {
        const output = getTextContent(result) || "bash failed";
        component.setContent({
          header: outputHeader(theme),
          sections: [
            {
              lines: toDisplayLines(output).map((line) => theme.fg("error", line)),
              mode: "tail",
              previewLines: PREVIEW_LINES,
            },
          ],
          footer: expandFooter(theme),
          expanded,
        });
        return component;
      }

      const output = getTextContent(result);
      const lines = output.trimEnd().length > 0
        ? toDisplayLines(output).map((line) => theme.fg("toolOutput", line))
        : [theme.fg("muted", "<no output>")];

      component.setContent({
        header: outputHeader(theme),
        sections: [
          {
            lines,
            mode: "tail",
            previewLines: PREVIEW_LINES,
          },
        ],
        footer: expandFooter(theme),
        expanded,
      });
      return component;
    },
  });
}
