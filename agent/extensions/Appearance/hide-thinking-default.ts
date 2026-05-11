// @name: 默认隐藏 Thinking
// @category: ui
// @description: 默认隐藏 thinking 内容，并显示带思考时长的 Ctrl+T 切换提示

import {
  AssistantMessageComponent,
  InteractiveMode,
  keyText,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Spacer, Text, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const AGENT_DIR = join(homedir(), ".pi", "agent");
const SETTINGS_PATH = join(AGENT_DIR, "settings.json");
const KEYBINDINGS_PATH = join(AGENT_DIR, "keybindings.json");
const THINKING_DURATION_CUSTOM_TYPE = "thinking-block-duration";

const GRAY = "\x1b[38;5;245m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const ASSISTANT_PATCHED = Symbol.for("pi.extensions.hide-thinking-default.assistantMessage.patched");
const ASSISTANT_ORIGINAL_UPDATE = Symbol.for("pi.extensions.hide-thinking-default.assistantMessage.originalUpdateContent");
const THINKING_DURATIONS = Symbol.for("pi.extensions.hide-thinking-default.thinkingDurations");
const THINKING_PREVIEWS = Symbol.for("pi.extensions.hide-thinking-default.thinkingPreviews");
const SHORTCUT_PATCHED = Symbol.for("pi.extensions.hide-thinking-default.shortcutState.patched");
const SHORTCUT_ORIGINAL_TOGGLE_THINKING = Symbol.for("pi.extensions.hide-thinking-default.shortcutState.originalToggleThinking");
const SHORTCUT_LISTENERS = Symbol.for("pi.extensions.hide-thinking-default.shortcutState.listeners");

type Ctx = Parameters<Parameters<ExtensionAPI["on"]>[1]>[1];

type ThinkingDurationSnapshot = {
  version: 1;
  messageTimestamp: number;
  durationMs: number;
  updatedAt: number;
};

type PatchableAssistantMessagePrototype = {
  [ASSISTANT_PATCHED]?: boolean;
  [ASSISTANT_ORIGINAL_UPDATE]?: (message: any) => void;
  updateContent?: (message: any) => void;
};

type PatchableAssistantMessageInstance = {
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

type PatchableInteractiveModePrototype = {
  [SHORTCUT_PATCHED]?: boolean;
  [SHORTCUT_ORIGINAL_TOGGLE_THINKING]?: () => void;
  toggleThinkingBlockVisibility?: () => void;
};

type PatchableInteractiveModeInstance = {
  hideThinkingBlock?: boolean;
};

type ShortcutStateListener = (state: { thinkingHidden?: boolean }) => void;

function readJson(path: string): any {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeJsonIfChanged(path: string, value: any): boolean {
  mkdirSync(dirname(path), { recursive: true });
  const next = `${JSON.stringify(value, null, 2)}\n`;
  const prev = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (prev === next) return false;
  writeFileSync(path, next, "utf8");
  return true;
}

function sameKeys(value: unknown, keys: string[]): boolean {
  const actual = Array.isArray(value) ? value : typeof value === "string" ? [value] : undefined;
  if (!actual || actual.length !== keys.length) return false;
  return actual.every((key, index) => key === keys[index]);
}

function ensureThinkingSettings(): boolean {
  const settings = readJson(SETTINGS_PATH);
  settings.hideThinkingBlock = true;
  const settingsChanged = writeJsonIfChanged(SETTINGS_PATH, settings);

  const keybindings = readJson(KEYBINDINGS_PATH);
  let keybindingsChanged = false;

  if (sameKeys(keybindings["app.thinking.toggle"], ["ctrl+shift+o"])) {
    delete keybindings["app.thinking.toggle"];
    keybindingsChanged = true;
  }

  if (sameKeys(keybindings["app.tools.expand"], ["ctrl+o"])) {
    delete keybindings["app.tools.expand"];
    keybindingsChanged = true;
  }

  if (keybindingsChanged) {
    keybindingsChanged = writeJsonIfChanged(KEYBINDINGS_PATH, keybindings);
  }

  return settingsChanged || keybindingsChanged;
}

function readThinkingHidden(): boolean {
  const settings = readJson(SETTINGS_PATH);
  return settings.hideThinkingBlock === true;
}

function durationMap(): Map<number, number> {
  const store = globalThis as typeof globalThis & { [THINKING_DURATIONS]?: Map<number, number> };
  if (!store[THINKING_DURATIONS]) store[THINKING_DURATIONS] = new Map<number, number>();
  return store[THINKING_DURATIONS];
}

function previewMap(): Map<number, string> {
  const store = globalThis as typeof globalThis & { [THINKING_PREVIEWS]?: Map<number, string> };
  if (!store[THINKING_PREVIEWS]) store[THINKING_PREVIEWS] = new Map<number, string>();
  return store[THINKING_PREVIEWS];
}

function shortcutStateListeners(): Set<ShortcutStateListener> {
  const store = globalThis as typeof globalThis & { [SHORTCUT_LISTENERS]?: Set<ShortcutStateListener> };
  if (!store[SHORTCUT_LISTENERS]) store[SHORTCUT_LISTENERS] = new Set<ShortcutStateListener>();
  return store[SHORTCUT_LISTENERS];
}

function emitShortcutState(state: { thinkingHidden?: boolean }): void {
  for (const listener of shortcutStateListeners()) {
    try {
      listener(state);
    } catch {
    }
  }
}

function patchShortcutStateHooks(): void {
  const proto = (InteractiveMode as any).prototype as PatchableInteractiveModePrototype;
  if (proto[SHORTCUT_PATCHED]) return;

  const originalToggleThinking = proto.toggleThinkingBlockVisibility;
  if (typeof originalToggleThinking === "function") {
    proto[SHORTCUT_ORIGINAL_TOGGLE_THINKING] = originalToggleThinking;
    proto.toggleThinkingBlockVisibility = function patchedToggleThinking(this: PatchableInteractiveModeInstance): void {
      originalToggleThinking.call(this);
      emitShortcutState({ thinkingHidden: Boolean(this.hideThinkingBlock) });
    };
  }

  proto[SHORTCUT_PATCHED] = true;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function displayThinkingToggleKey(): string {
  const configured = keyText("app.thinking.toggle") || "ctrl+t";
  return configured
    .split("/")
    .map((part) => part
      .split("+")
      .map((segment) => segment.length === 1 ? segment.toUpperCase() : `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`)
      .join("+"))
    .join("/");
}

function formatLabel(durationMs: number | undefined, hidden: boolean): string {
  const action = hidden ? "show full content" : "hide thinking content";
  const prefix = durationMs === undefined ? "Thinking" : `Thinking for ${formatDuration(durationMs)}`;
  return `${prefix}, ${displayThinkingToggleKey()} ${action}`;
}

function messageTimestamp(message: any): number | undefined {
  return typeof message?.timestamp === "number" && Number.isFinite(message.timestamp) ? message.timestamp : undefined;
}

function messageHasThinking(message: any): boolean {
  if (!message || !Array.isArray(message.content)) return false;
  return message.content.some((content: any) => content?.type === "thinking" && typeof content.thinking === "string" && content.thinking.trim());
}

class VisualTailText implements Component {
  private cachedText?: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private text: string,
    private readonly maxLines: number,
    private readonly paddingX = 1,
    private readonly paddingY = 0,
    private readonly stylePrefix = "",
    private readonly styleSuffix = "",
  ) {}

  render(width: number): string[] {
    if (this.cachedLines && this.cachedText === this.text && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const trimmed = this.text.trimEnd();
    if (!trimmed) {
      this.cachedText = this.text;
      this.cachedWidth = width;
      this.cachedLines = [];
      return [];
    }

    const contentWidth = Math.max(1, width - this.paddingX * 2);
    const visualLines = wrapTextWithAnsi(trimmed.replace(/\t/g, "   "), contentWidth).filter((line) => line.trim());
    const tail = visualLines.slice(-this.maxLines);
    const leftMargin = " ".repeat(this.paddingX);
    const rightMargin = " ".repeat(this.paddingX);
    const contentLines = tail.map((line) => {
      const lineWithMargins = `${leftMargin}${this.stylePrefix}${line}${this.styleSuffix}${rightMargin}`;
      const paddingNeeded = Math.max(0, width - visibleWidth(lineWithMargins));
      return `${lineWithMargins}${" ".repeat(paddingNeeded)}`;
    });
    const emptyLines = Array.from({ length: this.paddingY }, () => " ".repeat(width));
    const result = [...emptyLines, ...contentLines, ...emptyLines];

    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = result;
    return result;
  }

  invalidate(): void {
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

function safeMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function readThinkingDurationSnapshot(entry: unknown): ThinkingDurationSnapshot | undefined {
  const item = entry as { type?: unknown; customType?: unknown; data?: unknown };
  if (item.type !== "custom" || item.customType !== THINKING_DURATION_CUSTOM_TYPE) return undefined;
  const data = item.data as Partial<ThinkingDurationSnapshot> | undefined;
  if (!data || data.version !== 1) return undefined;
  const timestamp = safeMs(data.messageTimestamp);
  if (timestamp <= 0) return undefined;
  return {
    version: 1,
    messageTimestamp: timestamp,
    durationMs: safeMs(data.durationMs),
    updatedAt: safeMs(data.updatedAt),
  };
}

function restoreThinkingDurations(ctx: Ctx): void {
  const durations = durationMap();
  durations.clear();
  previewMap().clear();
  for (const entry of ctx.sessionManager.getBranch()) {
    const snapshot = readThinkingDurationSnapshot(entry);
    if (!snapshot) continue;
    durations.set(snapshot.messageTimestamp, snapshot.durationMs);
  }
}

function renderExpandedThinkingMessage(component: PatchableAssistantMessageInstance, message: any, durationMs: number): void {
  const contentContainer = component.contentContainer;
  if (!contentContainer || typeof contentContainer.clear !== "function" || typeof contentContainer.addChild !== "function") return;

  component.lastMessage = message;
  contentContainer.clear();

  const contentBlocks = Array.isArray(message.content) ? message.content : [];
  const hasVisibleContent = contentBlocks.some((content: any) =>
    (content.type === "text" && typeof content.text === "string" && content.text.trim()) ||
    (content.type === "thinking" && typeof content.thinking === "string" && content.thinking.trim())
  );

  if (hasVisibleContent) {
    contentContainer.addChild(new Spacer(1));
  }

  for (let index = 0; index < contentBlocks.length; index++) {
    const content = contentBlocks[index];
    const hasVisibleContentAfter = contentBlocks
      .slice(index + 1)
      .some((next: any) =>
        (next.type === "text" && typeof next.text === "string" && next.text.trim()) ||
        (next.type === "thinking" && typeof next.thinking === "string" && next.thinking.trim())
      );

    if (content.type === "text" && typeof content.text === "string" && content.text.trim()) {
      contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, component.markdownTheme));
    } else if (content.type === "thinking" && typeof content.thinking === "string" && content.thinking.trim()) {
      contentContainer.addChild(new Markdown(content.thinking.trim(), 1, 0, component.markdownTheme, { color: (text: string) => `${GRAY}${text}${RESET}` }));
      contentContainer.addChild(new Text(`${GRAY}${DIM}${formatLabel(durationMs, false)}${RESET}`, 1, 0));
    }

    if (hasVisibleContentAfter && (content.type === "text" || content.type === "thinking")) {
      contentContainer.addChild(new Spacer(1));
    }
  }

  const hasToolCalls = contentBlocks.some((content: any) => content.type === "toolCall");
  component.hasToolCalls = hasToolCalls;
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
}

function renderHiddenThinkingMessage(component: PatchableAssistantMessageInstance, message: any, durationMs: number, preview: string | undefined): void {
  const contentContainer = component.contentContainer;
  if (!contentContainer || typeof contentContainer.clear !== "function" || typeof contentContainer.addChild !== "function") return;

  component.lastMessage = message;
  contentContainer.clear();

  const contentBlocks = Array.isArray(message.content) ? message.content : [];
  const hasVisibleContent = contentBlocks.some((content: any) =>
    (content.type === "text" && typeof content.text === "string" && content.text.trim()) ||
    (content.type === "thinking" && typeof content.thinking === "string" && content.thinking.trim())
  );

  if (hasVisibleContent) {
    contentContainer.addChild(new Spacer(1));
  }

  for (let index = 0; index < contentBlocks.length; index++) {
    const content = contentBlocks[index];
    const hasVisibleContentAfter = contentBlocks
      .slice(index + 1)
      .some((next: any) =>
        (next.type === "text" && typeof next.text === "string" && next.text.trim()) ||
        (next.type === "thinking" && typeof next.thinking === "string" && next.thinking.trim())
      );

    if (content.type === "text" && typeof content.text === "string" && content.text.trim()) {
      contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, component.markdownTheme));
    } else if (content.type === "thinking" && typeof content.thinking === "string" && content.thinking.trim()) {
      if (preview) {
        contentContainer.addChild(new VisualTailText(preview, 3, 1, 0, GRAY, RESET));
      }
      contentContainer.addChild(new Text(`${GRAY}${DIM}${formatLabel(durationMs, true)}${RESET}`, 1, 0));
    }

    if (hasVisibleContentAfter && (content.type === "text" || content.type === "thinking")) {
      contentContainer.addChild(new Spacer(1));
    }
  }

  const hasToolCalls = contentBlocks.some((content: any) => content.type === "toolCall");
  component.hasToolCalls = hasToolCalls;
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
}

function patchAssistantMessageRendering(): void {
  const proto = (AssistantMessageComponent as any).prototype as PatchableAssistantMessagePrototype;
  if (proto[ASSISTANT_PATCHED]) return;

  const originalUpdateContent = proto.updateContent;
  if (typeof originalUpdateContent !== "function") return;

  proto[ASSISTANT_ORIGINAL_UPDATE] = originalUpdateContent;
  proto.updateContent = function patchedUpdateContent(this: PatchableAssistantMessageInstance, message: any): void {
    const timestamp = messageTimestamp(message);
    const durationMs = timestamp === undefined ? undefined : durationMap().get(timestamp);
    const preview = timestamp === undefined ? undefined : previewMap().get(timestamp);
    const hidden = Boolean(this.hideThinkingBlock);

    if (durationMs === undefined || !messageHasThinking(message)) {
      return originalUpdateContent.call(this, message);
    }

    if (!hidden) {
      renderExpandedThinkingMessage(this, message, durationMs);
      return;
    }

    renderHiddenThinkingMessage(this, message, durationMs, preview);
  };

  proto[ASSISTANT_PATCHED] = true;
}

export default function (pi: ExtensionAPI) {
  patchShortcutStateHooks();
  patchAssistantMessageRendering();

  let currentCtx: Ctx | undefined;
  let currentMessageTimestamp: number | undefined;
  let activeThinkingSegmentStartMs: number | undefined;
  let accumulatedThinkingMs = 0;
  let currentThinkingText = "";
  let thinkingHidden = readThinkingHidden();
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let offShortcutStateInput: (() => void) | undefined;

  function currentThinkingDuration(now = Date.now()): number {
    const runningSegmentMs = activeThinkingSegmentStartMs === undefined ? 0 : now - activeThinkingSegmentStartMs;
    return Math.max(0, accumulatedThinkingMs + runningSegmentMs);
  }

  function setCurrentMessageTimestamp(timestamp: number | undefined): void {
    if (timestamp === undefined || currentMessageTimestamp === timestamp) return;
    if (currentMessageTimestamp !== undefined && durationMap().has(currentMessageTimestamp)) {
      const previous = durationMap().get(currentMessageTimestamp) ?? 0;
      durationMap().delete(currentMessageTimestamp);
      durationMap().set(timestamp, previous);
    }
    if (currentMessageTimestamp !== undefined && previewMap().has(currentMessageTimestamp)) {
      const previous = previewMap().get(currentMessageTimestamp) ?? "";
      previewMap().delete(currentMessageTimestamp);
      if (previous) previewMap().set(timestamp, previous);
    }
    currentMessageTimestamp = timestamp;
  }

  function updateDurationMap(): void {
    if (currentMessageTimestamp === undefined) return;
    durationMap().set(currentMessageTimestamp, currentThinkingDuration());
  }

  function updatePreviewMap(): void {
    if (currentMessageTimestamp === undefined) return;
    const preview = currentThinkingText.trimEnd();
    if (preview) {
      previewMap().set(currentMessageTimestamp, preview);
    } else {
      previewMap().delete(currentMessageTimestamp);
    }
  }

  function clearCurrentPreview(): void {
    if (currentMessageTimestamp === undefined) return;
    previewMap().delete(currentMessageTimestamp);
  }

  function updateHiddenThinkingLabel(ctx: Ctx): void {
    const durationMs = currentMessageTimestamp === undefined
      ? undefined
      : durationMap().get(currentMessageTimestamp) ?? currentThinkingDuration();
    ctx.ui.setHiddenThinkingLabel(formatLabel(durationMs, thinkingHidden));
  }

  function refreshThinkingDisplay(): void {
    if (!currentCtx) return;
    updateDurationMap();
    updateHiddenThinkingLabel(currentCtx);
  }

  function startRefreshTimer(): void {
    if (refreshTimer) return;
    refreshTimer = setInterval(refreshThinkingDisplay, 1000);
  }

  function stopRefreshTimer(): void {
    if (!refreshTimer) return;
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }

  function startThinkingSegment(): void {
    if (activeThinkingSegmentStartMs !== undefined) return;
    activeThinkingSegmentStartMs = Date.now();
    updateDurationMap();
    refreshThinkingDisplay();
    startRefreshTimer();
  }

  function finishThinkingSegment(): void {
    if (activeThinkingSegmentStartMs !== undefined) {
      accumulatedThinkingMs += Math.max(0, Date.now() - activeThinkingSegmentStartMs);
      activeThinkingSegmentStartMs = undefined;
    }
    clearCurrentPreview();
    updateDurationMap();
    refreshThinkingDisplay();
  }

  function resetActiveThinking(): void {
    clearCurrentPreview();
    currentMessageTimestamp = undefined;
    activeThinkingSegmentStartMs = undefined;
    accumulatedThinkingMs = 0;
    currentThinkingText = "";
    stopRefreshTimer();
  }

  function persistThinkingDuration(): void {
    if (currentMessageTimestamp === undefined) return;
    const durationMs = durationMap().get(currentMessageTimestamp) ?? currentThinkingDuration();
    if (durationMs <= 0 && !currentThinkingText.trim()) return;
    pi.appendEntry(THINKING_DURATION_CUSTOM_TYPE, {
      version: 1,
      messageTimestamp: currentMessageTimestamp,
      durationMs,
      updatedAt: Date.now(),
    } satisfies ThinkingDurationSnapshot);
  }

  function extractThinkingText(message: any): string {
    if (!message || !Array.isArray(message.content)) return "";
    return message.content
      .filter((content: any) => content?.type === "thinking" && typeof content.thinking === "string")
      .map((content: any) => content.thinking)
      .join("\n");
  }

  function installShortcutStateDetector(): void {
    offShortcutStateInput?.();
    const listener: ShortcutStateListener = (state) => {
      if (state.thinkingHidden !== undefined) thinkingHidden = state.thinkingHidden;
      if (!currentCtx) return;
      refreshThinkingDisplay();
    };
    const listeners = shortcutStateListeners();
    listeners.add(listener);
    offShortcutStateInput = () => {
      listeners.delete(listener);
    };
  }

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    thinkingHidden = readThinkingHidden();
    const changed = ensureThinkingSettings();
    restoreThinkingDurations(ctx);
    installShortcutStateDetector();
    updateHiddenThinkingLabel(ctx);
    if (changed) {
      ctx.ui.notify("Thinking is hidden by default; Ctrl+T toggles full thinking. Run /reload to apply settings/keybinding cleanup.", "info");
    }
  });

  pi.on("session_tree", async (_event, ctx) => {
    currentCtx = ctx;
    thinkingHidden = readThinkingHidden();
    restoreThinkingDurations(ctx);
    updateHiddenThinkingLabel(ctx);
  });

  pi.on("message_start", async (event, ctx) => {
    const msg = event.message as any;
    if (msg?.role !== "assistant") return;
    currentCtx = ctx;
    resetActiveThinking();
    setCurrentMessageTimestamp(messageTimestamp(msg));
    currentThinkingText = extractThinkingText(msg);
    updateHiddenThinkingLabel(ctx);
  });

  pi.on("message_update", async (event, ctx) => {
    currentCtx = ctx;
    const e = event.assistantMessageEvent as any;

    if (e.type === "start") {
      resetActiveThinking();
      setCurrentMessageTimestamp(messageTimestamp(e.partial));
      currentThinkingText = extractThinkingText(e.partial);
    } else if (e.type === "thinking_start") {
      setCurrentMessageTimestamp(messageTimestamp(e.partial));
      updatePreviewMap();
      startThinkingSegment();
    } else if (e.type === "thinking_delta" && typeof e.delta === "string") {
      setCurrentMessageTimestamp(messageTimestamp(e.partial));
      if (activeThinkingSegmentStartMs === undefined) startThinkingSegment();
      currentThinkingText += e.delta;
      updatePreviewMap();
      updateDurationMap();
    } else if (e.type === "thinking_end") {
      setCurrentMessageTimestamp(messageTimestamp(e.partial));
      if (typeof e.content === "string") currentThinkingText = e.content;
      finishThinkingSegment();
    } else if (e.type === "done") {
      setCurrentMessageTimestamp(messageTimestamp(e.message));
      currentThinkingText = extractThinkingText(e.message) || currentThinkingText;
      finishThinkingSegment();
    } else if (e.type === "error") {
      setCurrentMessageTimestamp(messageTimestamp(e.error));
      currentThinkingText = extractThinkingText(e.error) || currentThinkingText;
      finishThinkingSegment();
    }

    refreshThinkingDisplay();
  });

  pi.on("message_end", async (event, ctx) => {
    const msg = event.message as any;
    if (msg?.role !== "assistant") return;
    currentCtx = ctx;
    setCurrentMessageTimestamp(messageTimestamp(msg));
    currentThinkingText = extractThinkingText(msg) || currentThinkingText;
    finishThinkingSegment();
    persistThinkingDuration();
    updateHiddenThinkingLabel(ctx);
    stopRefreshTimer();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    finishThinkingSegment();
    persistThinkingDuration();
    stopRefreshTimer();
    offShortcutStateInput?.();
    offShortcutStateInput = undefined;
    ctx.ui.setHiddenThinkingLabel(undefined);
  });
}
