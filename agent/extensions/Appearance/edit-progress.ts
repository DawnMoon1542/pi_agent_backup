// @name: Edit 进度显示
// @category: ui
// @description: edit 工具调用时显示最近三行更新进度，完成后显示紧凑更新内容

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createEditTool } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";

const PREVIEW_LINES = 3;
const EXPAND_HINT = "Ctrl+O to expand";

type EditItem = { oldText: string; newText: string };
type RenderableEditArgs = {
  path?: string;
  file_path?: string;
  edits?: EditItem[] | string;
  oldText?: string;
  newText?: string;
};

type DiffLine = {
  kind: "add" | "remove" | "muted";
  text: string;
};

type EditRenderState = {
  done?: boolean;
  ranges?: string;
  compactBody?: DiffLine[];
  expandedBody?: DiffLine[];
  changed?: number;
};

type ToolTheme = {
  fg: (name: string, text: string) => string;
  bold: (text: string) => string;
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

function component(lines: string[], lastComponent?: Component): FixedLines {
  const fixed = lastComponent instanceof FixedLines ? lastComponent : new FixedLines();
  fixed.setText(lines.join("\n"));
  return fixed;
}

function collapseToTail<T>(lines: T[], expanded: boolean): T[] {
  if (expanded || lines.length <= PREVIEW_LINES) return lines;
  return lines.slice(-PREVIEW_LINES);
}

function parseEdits(args: RenderableEditArgs | undefined): EditItem[] {
  if (!args) return [];
  let edits = args.edits;
  if (typeof edits === "string") {
    try {
      edits = JSON.parse(edits);
    } catch {
      edits = [];
    }
  }

  const parsed: EditItem[] = [];
  if (Array.isArray(edits)) {
    for (const edit of edits) {
      if (typeof edit?.oldText === "string" || typeof edit?.newText === "string") {
        parsed.push({ oldText: edit.oldText ?? "", newText: edit.newText ?? "" });
      }
    }
  }
  if (typeof args.oldText === "string" || typeof args.newText === "string") {
    parsed.push({ oldText: args.oldText ?? "", newText: args.newText ?? "" });
  }
  return parsed;
}

function pathOf(args: RenderableEditArgs | undefined): string {
  return String(args?.path ?? args?.file_path ?? "...");
}

function displayLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\t/g, "  ").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function styleLine(line: DiffLine, theme: ToolTheme): string {
  if (line.kind === "add") return theme.fg("toolDiffAdded", line.text);
  if (line.kind === "remove") return theme.fg("toolDiffRemoved", line.text);
  return theme.fg("muted", line.text);
}

function linesFromArgs(args: RenderableEditArgs | undefined): DiffLine[] {
  const edits = parseEdits(args);
  const latest = edits[edits.length - 1];
  if (!latest) return [];
  const lines = displayLines(latest.newText || latest.oldText || "");
  return lines.map((line) => ({ kind: "add", text: `+ ${line}` }));
}

function changedCountFromArgs(args: RenderableEditArgs | undefined): number {
  return parseEdits(args).reduce((total, edit) => {
    const oldCount = displayLines(edit.oldText).length;
    const newCount = displayLines(edit.newText).length;
    return total + Math.max(oldCount, newCount);
  }, 0);
}

function progressLines(args: RenderableEditArgs | undefined, expanded: boolean, theme: ToolTheme): string[] {
  const lines = linesFromArgs(args);
  if (lines.length === 0) return [theme.fg("muted", "waiting for edit arguments...")];
  return collapseToTail(lines, expanded).map((line) => styleLine(line, theme));
}

function textContent(result: any): string {
  return (Array.isArray(result?.content) ? result.content : [])
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("\n");
}

function rangesFromDiff(diff: string | undefined): string {
  if (!diff) return "";
  const ranges: string[] = [];
  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] == null ? 1 : Number(match[2]);
    const end = count <= 0 ? start : start + count - 1;
    ranges.push(`${start}:${end}`);
  }
  return ranges.join(",");
}

function changedLineCount(diff: string | undefined): number {
  if (!diff) return 0;
  let added = 0;
  let removed = 0;
  for (const raw of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (raw.startsWith("+")) added++;
    if (raw.startsWith("-")) removed++;
  }
  return Math.max(added, removed);
}

function compactDiffLines(diff: string | undefined): DiffLine[] {
  if (!diff) return [];

  const out: DiffLine[] = [];
  let inHunk = false;
  let hunkHasChanges = false;

  for (const raw of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (!raw) continue;
    if (raw.startsWith("diff --git") || raw.startsWith("index ") || raw.startsWith("--- ") || raw.startsWith("+++ ")) continue;

    const hunk = raw.match(/^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/);
    if (hunk) {
      if (out.length > 0 && hunkHasChanges) out.push({ kind: "muted", text: "..." });
      inHunk = true;
      hunkHasChanges = false;
      continue;
    }
    if (!inHunk) continue;

    if (raw.startsWith("-")) {
      out.push({ kind: "remove", text: `- ${raw.slice(1)}` });
      hunkHasChanges = true;
      continue;
    }
    if (raw.startsWith("+")) {
      out.push({ kind: "add", text: `+ ${raw.slice(1)}` });
      hunkHasChanges = true;
    }
  }

  while (out[0]?.text === "...") out.shift();
  while (out[out.length - 1]?.text === "...") out.pop();
  return out;
}

function expandedDiffLines(diff: string | undefined): DiffLine[] {
  if (!diff) return [];

  const out: DiffLine[] = [];
  let inHunk = false;

  for (const raw of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (!raw) continue;
    if (raw.startsWith("diff --git") || raw.startsWith("index ") || raw.startsWith("--- ") || raw.startsWith("+++ ")) continue;

    if (/^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/.test(raw)) {
      inHunk = true;
      out.push({ kind: "muted", text: raw });
      continue;
    }
    if (!inHunk) continue;

    if (raw.startsWith("-")) {
      out.push({ kind: "remove", text: `- ${raw.slice(1)}` });
      continue;
    }
    if (raw.startsWith("+")) {
      out.push({ kind: "add", text: `+ ${raw.slice(1)}` });
      continue;
    }
    if (raw.startsWith(" ")) {
      out.push({ kind: "muted", text: `  ${raw.slice(1)}` });
    }
  }

  return out;
}

export default function (pi: ExtensionAPI) {
  const baseEditTool = createEditTool(process.cwd());

  pi.registerTool({
    ...baseEditTool,
    label: "edit",
    renderShell: "default",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const editTool = createEditTool(ctx.cwd);
      return editTool.execute(toolCallId, params, signal, onUpdate, ctx);
    },

    renderCall(args, theme, context) {
      const state = context.state as EditRenderState;
      const p = pathOf(args as RenderableEditArgs | undefined);
      const displayedPath = state.ranges ? `${p}:${state.ranges}` : p;
      const lines = [`${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", displayedPath)}`];
      if (!state.done && context.isPartial) {
        lines.push(...progressLines(args as RenderableEditArgs | undefined, Boolean(context.expanded), theme));
      }
      return component(lines, context.lastComponent);
    },

    renderResult(result, options, theme, context) {
      const state = context.state as EditRenderState;
      state.done = true;

      if (context.isError) {
        const errorText = textContent(result) || "edit failed";
        return component([theme.fg("error", "edit failed"), theme.fg("error", errorText)], context.lastComponent);
      }

      const args = context.args as RenderableEditArgs | undefined;
      const diff = (result as any)?.details?.diff as string | undefined;
      state.ranges = rangesFromDiff(diff) || state.ranges;

      const compactBody = compactDiffLines(diff);
      const expandedBody = expandedDiffLines(diff);
      if (compactBody.length > 0) state.compactBody = compactBody;
      if (expandedBody.length > 0) state.expandedBody = expandedBody;
      if (diff) state.changed = changedLineCount(diff);

      const expanded = Boolean(context.expanded ?? options.expanded);
      const fallbackBody = linesFromArgs(args);
      const compactSource = state.compactBody && state.compactBody.length > 0 ? state.compactBody : fallbackBody;
      const expandedSource = state.expandedBody && state.expandedBody.length > 0 ? state.expandedBody : compactSource;
      const source = expanded ? expandedSource : compactSource;
      const visible = expanded ? source : collapseToTail(source, false);
      const changed = state.changed && state.changed > 0 ? state.changed : changedCountFromArgs(args);
      const body = visible.map((line) => styleLine(line, theme));
      const hasHiddenLines = expandedSource.length > PREVIEW_LINES;
      const showExpandHint = hasHiddenLines && !expanded;
      const summary = theme.fg("muted", `Edited ${changed} lines${showExpandHint ? `, ${EXPAND_HINT}` : ""}`);
      return component([...body, summary], context.lastComponent);
    },
  });
}
