// @name: Mermaid 终端渲染
// @category: ui
// @description: 拦截 assistant 输出中的 mermaid 代码块，使用 termaid 渲染为终端 Unicode 图形

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AssistantMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Spacer, Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";

const MERMAID_PATCHED = Symbol.for("pi.extensions.mermaid-render.patched");
const MERMAID_ORIGINAL_UPDATE = Symbol.for("pi.extensions.mermaid-render.originalUpdateContent");
const MERMAID_ENABLED = Symbol.for("pi.extensions.mermaid-render.enabled");
const MERMAID_COMPONENTS = Symbol.for("pi.extensions.mermaid-render.components");
const MERMAID_RENDER_CACHE = Symbol.for("pi.extensions.mermaid-render.cache");

const MERMAID_FENCE_REGEX = /```mermaid\s*\n([\s\S]*?)```/g;
const MAX_RENDER_CACHE_ENTRIES = 64;
// termaid 默认使用圆角连线，保持省略 --sharp-edges 以固定圆角输出。
const TERMAID_COMMAND = "termaid --padding-x 2 --padding-y 1 --gap 2";
const WARNING_STYLE = "\x1b[38;2;255;244;204m\x1b[48;2;64;48;10m";
const ANSI_RESET = "\x1b[0m";

function getMermaidEnabled(): boolean {
  const store = globalThis as typeof globalThis & { [MERMAID_ENABLED]?: boolean };
  return store[MERMAID_ENABLED] !== false;
}

function setMermaidEnabled(value: boolean): void {
  const store = globalThis as typeof globalThis & { [MERMAID_ENABLED]?: boolean };
  store[MERMAID_ENABLED] = value;
}

type PatchableProto = {
  [MERMAID_PATCHED]?: boolean;
  [MERMAID_ORIGINAL_UPDATE]?: (message: any) => void;
  updateContent?: (message: any) => void;
};

type PatchableInstance = {
  contentContainer?: {
    clear(): void;
    addChild(component: unknown): void;
  };
  hideThinkingBlock?: boolean;
  hiddenThinkingLabel?: string;
  markdownTheme?: any;
  lastMessage?: any;
  hasToolCalls?: boolean;
};

function getMermaidComponents(): Set<PatchableInstance> {
  const store = globalThis as typeof globalThis & { [MERMAID_COMPONENTS]?: Set<PatchableInstance> };
  if (!store[MERMAID_COMPONENTS]) {
    store[MERMAID_COMPONENTS] = new Set<PatchableInstance>();
  }
  return store[MERMAID_COMPONENTS];
}

function getMermaidRenderCache(): Map<string, string | null> {
  const store = globalThis as typeof globalThis & { [MERMAID_RENDER_CACHE]?: Map<string, string | null> };
  if (!store[MERMAID_RENDER_CACHE]) {
    store[MERMAID_RENDER_CACHE] = new Map<string, string | null>();
  }
  return store[MERMAID_RENDER_CACHE];
}

function setCachedMermaidRender(source: string, rendered: string | null): void {
  const cache = getMermaidRenderCache();
  cache.set(source, rendered);

  while (cache.size > MAX_RENDER_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}

function renderMermaidToTerminal(source: string): string | null {
  const normalizedSource = source.trim();
  if (!normalizedSource) return null;

  const cache = getMermaidRenderCache();
  if (cache.has(normalizedSource)) {
    return cache.get(normalizedSource) ?? null;
  }

  try {
    const result = execSync(
      TERMAID_COMMAND,
      {
        input: normalizedSource,
        encoding: "utf8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const rendered = result.trimEnd();
    setCachedMermaidRender(normalizedSource, rendered);
    return rendered;
  } catch {
    setCachedMermaidRender(normalizedSource, null);
    return null;
  }
}

class TermaidOutput implements Component {
  private cachedWidth?: number;
  private cachedLines?: string[];
  private readonly paddingX = 1;
  private readonly rawLines: string[];
  private readonly requiredWidth: number;

  constructor(rendered: string) {
    this.rawLines = rendered.split("\n");
    const maxRenderedWidth = this.rawLines.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);
    this.requiredWidth = maxRenderedWidth + this.paddingX * 2;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines = width < this.requiredWidth
      ? this.renderNarrowWarning(width)
      : this.renderDiagram(width);

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private renderNarrowWarning(width: number): string[] {
    return [
      this.formatWarningLine("! Terminal is too narrow to display this Mermaid diagram", width),
      this.formatWarningLine(`  Current width: ${width}, required width: ${this.requiredWidth}`, width),
      this.formatWarningLine("  Use /termaid to disable rendering", width),
    ];
  }

  private formatWarningLine(text: string, width: number): string {
    const safeWidth = Math.max(1, width);
    const truncated = truncateToWidth(text, safeWidth, "...");
    const padding = Math.max(0, safeWidth - visibleWidth(truncated));
    return `${WARNING_STYLE}${truncated}${" ".repeat(padding)}${ANSI_RESET}`;
  }

  private renderDiagram(width: number): string[] {
    const innerWidth = Math.max(1, width - this.paddingX * 2);
    const leftMargin = " ".repeat(this.paddingX);
    return this.rawLines.map((line) => {
      const padding = Math.max(0, innerWidth - visibleWidth(line));
      return `${leftMargin}${line}${" ".repeat(padding)}${leftMargin}`;
    });
  }
}

function splitTextByMermaid(text: string): Array<{ type: "text"; content: string } | { type: "mermaid"; source: string }> {
  const parts: Array<{ type: "text"; content: string } | { type: "mermaid"; source: string }> = [];
  let lastIndex = 0;

  const regex = new RegExp(MERMAID_FENCE_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "mermaid", source: match[1]! });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return parts;
}

function textContainsCompleteMermaidFence(text: string): boolean {
  const regex = new RegExp(MERMAID_FENCE_REGEX.source, "g");
  return regex.test(text);
}

function refreshRenderedAssistantMessages(): void {
  const instances = getMermaidComponents();
  for (const instance of [...instances]) {
    if (!instance.lastMessage || typeof instance.contentContainer?.clear !== "function") {
      instances.delete(instance);
      continue;
    }

    try {
      (instance as PatchableInstance & { updateContent?: (message: any) => void }).updateContent?.(instance.lastMessage);
    } catch {
      instances.delete(instance);
    }
  }
}

function patchAssistantMessage(): void {
  const proto = (AssistantMessageComponent as any).prototype as PatchableProto;
  const existingOriginal = proto[MERMAID_ORIGINAL_UPDATE];

  if (proto[MERMAID_PATCHED] && existingOriginal) {
    proto.updateContent = existingOriginal;
    proto[MERMAID_PATCHED] = false;
  }

  const original = proto.updateContent;
  if (typeof original !== "function") return;

  proto[MERMAID_ORIGINAL_UPDATE] = original;

  proto.updateContent = function patchedMermaidUpdateContent(this: PatchableInstance, message: any): void {
    getMermaidComponents().add(this);

    const contentBlocks = Array.isArray(message?.content) ? message.content : [];
    const hasMermaid = contentBlocks.some(
      (block: any) => block.type === "text" && typeof block.text === "string" && textContainsCompleteMermaidFence(block.text),
    );

    if (!hasMermaid || !getMermaidEnabled()) {
      return original.call(this, message);
    }

    const contentContainer = this.contentContainer;
    if (!contentContainer || typeof contentContainer.clear !== "function" || typeof contentContainer.addChild !== "function") {
      return original.call(this, message);
    }

    this.lastMessage = message;
    contentContainer.clear();

    const hasVisibleContent = contentBlocks.some(
      (content: any) =>
        (content.type === "text" && typeof content.text === "string" && content.text.trim()) ||
        (content.type === "thinking" && typeof content.thinking === "string" && content.thinking.trim()),
    );

    if (hasVisibleContent) {
      contentContainer.addChild(new Spacer(1));
    }

    for (let index = 0; index < contentBlocks.length; index++) {
      const content = contentBlocks[index];
      const hasVisibleContentAfter = contentBlocks
        .slice(index + 1)
        .some(
          (next: any) =>
            (next.type === "text" && typeof next.text === "string" && next.text.trim()) ||
            (next.type === "thinking" && typeof next.thinking === "string" && next.thinking.trim()),
        );

      if (content.type === "text" && typeof content.text === "string" && content.text.trim()) {
        if (textContainsCompleteMermaidFence(content.text)) {
          const parts = splitTextByMermaid(content.text);
          for (const part of parts) {
            if (part.type === "text" && part.content.trim()) {
              contentContainer.addChild(new Markdown(part.content.trim(), 1, 0, this.markdownTheme));
            } else if (part.type === "mermaid") {
              const rendered = renderMermaidToTerminal(part.source);
              if (rendered) {
                contentContainer.addChild(new Spacer(1));
                contentContainer.addChild(new TermaidOutput(rendered));
                contentContainer.addChild(new Spacer(1));
              } else {
                contentContainer.addChild(new Markdown(part.source.trim(), 1, 0, this.markdownTheme));
              }
            }
          }
        } else {
          contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, this.markdownTheme));
        }
      } else if (content.type === "thinking" && typeof content.thinking === "string" && content.thinking.trim()) {
        if (this.hideThinkingBlock) {
          contentContainer.addChild(new Text(this.hiddenThinkingLabel ?? "Thinking...", 1, 0));
        } else {
          contentContainer.addChild(new Markdown(content.thinking.trim(), 1, 0, this.markdownTheme));
        }
      }

      if (hasVisibleContentAfter && (content.type === "text" || content.type === "thinking")) {
        contentContainer.addChild(new Spacer(1));
      }
    }

    const hasToolCalls = contentBlocks.some((content: any) => content.type === "toolCall");
    this.hasToolCalls = hasToolCalls;
    if (hasToolCalls) return;

    if (message.stopReason === "aborted") {
      const abortMessage = message.errorMessage && message.errorMessage !== "Request was aborted" ? message.errorMessage : "Operation aborted";
      contentContainer.addChild(new Spacer(1));
      contentContainer.addChild(new Text(abortMessage, 1, 0));
    } else if (message.stopReason === "error") {
      const errorMessage = message.errorMessage || "Unknown error";
      contentContainer.addChild(new Spacer(1));
      contentContainer.addChild(new Text(`Error: ${errorMessage}`, 1, 0));
    }
  };

  proto[MERMAID_PATCHED] = true;
}

export default function (pi: ExtensionAPI) {
  patchAssistantMessage();

  pi.registerCommand("termaid", {
    description: "Toggle termaid mermaid rendering",
    handler: async (_args, ctx) => {
      const next = !getMermaidEnabled();
      setMermaidEnabled(next);
      refreshRenderedAssistantMessages();
      ctx.ui.notify(`Termaid rendering: ${next ? "on" : "off"}`, "info");
    },
  });
}
