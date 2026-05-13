// @name: 状态栏 Widget
// @category: ui
// @description: 彩色显示模型、上下文、TPS 和 git 状态

import { InteractiveMode, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Ctx = Parameters<Parameters<ExtensionAPI["on"]>[1]>[1];

type GitInfo =
  | { inRepo: false }
  | {
      inRepo: true;
      branch: string;
      clean: boolean;
      staged: number;
      modified: number;
      untracked: number;
    };

type TimerSnapshot = {
  version: 1;
  completedWorkMs: number;
  lastTurnWorkMs: number;
  updatedAt: number;
};

const TIMER_CUSTOM_TYPE = "status-line-work-timer";
const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

const RESET = "\x1b[0m";
const MODEL = "\x1b[38;5;183m";
const PROGRESS = "\x1b[38;5;111m";
const LOW = "\x1b[38;5;150m";
const MID = "\x1b[38;5;223m";
const HIGH = "\x1b[38;5;211m";
const TOKEN = "\x1b[38;5;146m";
const DIR = "\x1b[38;5;150m";
const GIT = "\x1b[38;5;183m";
const DIM = "\x1b[2m";
const DIM_OFF = "\x1b[22m";
const PILL_ACTIVE_BG = "\x1b[48;5;238m";
const PILL_INACTIVE_BG = "";

const YOLO_ACTIVE = Symbol.for("pi.extensions.yolo.active");
const SHORTCUT_PATCHED = Symbol.for("pi.extensions.status-line.shortcutState.patched");
const SHORTCUT_ORIGINAL_SET_TOOLS = Symbol.for("pi.extensions.status-line.shortcutState.originalSetToolsExpanded");
const SHORTCUT_ORIGINAL_TOGGLE_THINKING = Symbol.for("pi.extensions.status-line.shortcutState.originalToggleThinking");
const SHORTCUT_LISTENERS = Symbol.for("pi.extensions.status-line.shortcutState.listeners");

function color(text: string, c: string): string {
  return `${c}${text}${RESET}`;
}

function shortcutPill(keyText: string, label: string, active: boolean, activeColor?: string): string {
  const bg = active ? PILL_ACTIVE_BG : PILL_INACTIVE_BG;
  const labelText = active && activeColor ? `${activeColor}${label}${RESET}` : label;
  return `${bg}${DIM}${keyText}${DIM_OFF} ${labelText}${RESET}`;
}

function readThinkingHidden(): boolean {
  if (!existsSync(SETTINGS_PATH)) return false;
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8") || "{}");
    return settings.hideThinkingBlock === true;
  } catch {
    return false;
  }
}

type ShortcutStateListener = (state: { toolsExpanded?: boolean; thinkingHidden?: boolean }) => void;

type PatchableInteractiveModePrototype = {
  [SHORTCUT_PATCHED]?: boolean;
  [SHORTCUT_ORIGINAL_SET_TOOLS]?: (expanded: boolean) => void;
  [SHORTCUT_ORIGINAL_TOGGLE_THINKING]?: () => void;
  setToolsExpanded?: (expanded: boolean) => void;
  toggleThinkingBlockVisibility?: () => void;
};

type PatchableInteractiveModeInstance = {
  toolOutputExpanded?: boolean;
  hideThinkingBlock?: boolean;
};

function shortcutStateListeners(): Set<ShortcutStateListener> {
  const store = globalThis as typeof globalThis & { [SHORTCUT_LISTENERS]?: Set<ShortcutStateListener> };
  if (!store[SHORTCUT_LISTENERS]) store[SHORTCUT_LISTENERS] = new Set<ShortcutStateListener>();
  return store[SHORTCUT_LISTENERS];
}

function emitShortcutState(state: { toolsExpanded?: boolean; thinkingHidden?: boolean }): void {
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

  const originalSetToolsExpanded = proto.setToolsExpanded;
  if (typeof originalSetToolsExpanded === "function") {
    proto[SHORTCUT_ORIGINAL_SET_TOOLS] = originalSetToolsExpanded;
    proto.setToolsExpanded = function patchedSetToolsExpanded(this: PatchableInteractiveModeInstance, expanded: boolean): void {
      originalSetToolsExpanded.call(this, expanded);
      emitShortcutState({ toolsExpanded: Boolean(this.toolOutputExpanded ?? expanded) });
    };
  }

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

function progressColor(percent: number): string {
  if (percent < 50) return LOW;
  if (percent < 80) return MID;
  return HIGH;
}

function progressBar(percent: number | null | undefined): string {
  const width = 8; // 原来 10 格的 3/4，四舍五入为 8 格
  if (percent == null || !Number.isFinite(percent)) return `${"░".repeat(width)} --%`;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.floor((p / 100) * width);
  const empty = width - filled;
  let bar = "█".repeat(filled);
  if (empty > 0) bar += "▓";
  if (empty > 1) bar += "▒";
  if (empty > 2) bar += "░".repeat(empty - 2);
  return `${bar} ${p}%`;
}

function shortDir(cwd: string): string {
  const home = process.env.HOME;
  const normalized = cwd.replace(/\\/g, "/");
  const display = home && normalized.startsWith(home) ? `~${normalized.slice(home.length)}` : normalized;
  const parts = display.split("/").filter(Boolean);
  if (display.startsWith("~/") && parts.length >= 2) return `~/${parts.slice(-2).join("/")}`;
  if (parts.length >= 2) return parts.slice(-2).join("/");
  return display || ".";
}

function tokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0k";
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")}m`;
  }
  return `${Math.round(n / 1000)}k`;
}

function sumUsage(ctx: Ctx): { input: number; output: number; cost: number } {
  let input = 0;
  let output = 0;
  let cost = 0;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const msg = entry.message as any;
    if (msg?.role !== "assistant" || !msg.usage) continue;
    // 与 pi 官方 footer 保持一致：Input 只累计 usage.input。
    // 不把 cacheRead/cacheWrite 加进去，否则开启 prompt cache 后会把每轮缓存命中也重复累计，数值会明显偏大。
    input += Number(msg.usage.input ?? 0);
    output += Number(msg.usage.output ?? 0);
    cost += Number(msg.usage.cost?.total ?? 0);
  }
  return { input, output, cost };
}

function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0.000";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function estimateTokens(text: string): number {
  // Live TPS can only be estimated until provider returns usage.output.
  // Use a conservative char/token heuristic; final TPS is recalculated from actual output tokens.
  return Math.max(0, text.length / 4);
}

function formatTps(tps: number | undefined): string {
  if (tps == null || !Number.isFinite(tps)) return "--";
  return tps < 10 ? tps.toFixed(1) : Math.round(tps).toString();
}

function visibleWidth(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function truncateAnsi(s: string, width: number): string {
  if (width <= 0 || visibleWidth(s) <= width) return s;
  let out = "";
  let visible = 0;
  for (let i = 0; i < s.length && visible < width - 1; i++) {
    if (s[i] === "\x1b") {
      const match = s.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (match) {
        out += match[0];
        i += match[0].length - 1;
        continue;
      }
    }
    out += s[i];
    visible++;
  }
  return `${out}…${RESET}`;
}

export default function (pi: ExtensionAPI) {
  patchShortcutStateHooks();

  pi.registerShortcut("ctrl+y", {
    description: "Toggle yolo mode (bypass permission gates)",
    handler: async (ctx) => {
      yoloActive = !yoloActive;
      (globalThis as any)[YOLO_ACTIVE] = yoloActive;
      pi.events.emit("yolo:state", yoloActive);
      refreshShortcutStateDisplay(ctx, { sync: false });
    },
  });

  let gitInfo: GitInfo = { inRepo: false };
  let gitRefreshInFlight = false;
  let turnCount = 0;
  let lastTps: number | undefined;
  let streamStartMs: number | undefined;
  let liveOutputTokens = 0;
  let lastRenderMs = 0;
  let deferredRender: ReturnType<typeof setTimeout> | undefined;
  let latestFooterLines = [color("status loading...", DIM)];
  let requestFooterRender: (() => void) | undefined;
  let currentCtx: Ctx | undefined;
  let statusVisible = true;
  let toolsExpanded = false;
  let thinkingHidden = readThinkingHidden();
  let yoloActive = Boolean((globalThis as any)[YOLO_ACTIVE]);
  let offShortcutStateInput: (() => void) | undefined;
  let timerRefresh: ReturnType<typeof setInterval> | undefined;
  let activeWork = false;
  let activeWorkSegmentStartMs: number | undefined;
  let activeWorkAccumulatedMs = 0;
  let completedWorkMs = 0;
  let lastTurnWorkMs = 0;
  const timerPauseReasons = new Set<string>();

  function syncShortcutStates(ctx: Ctx): void {
    toolsExpanded = ctx.ui.getToolsExpanded();
    thinkingHidden = readThinkingHidden();
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

  function safeMs(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function readTimerSnapshot(entry: unknown): TimerSnapshot | undefined {
    const item = entry as { type?: unknown; customType?: unknown; data?: unknown };
    if (item.type !== "custom" || item.customType !== TIMER_CUSTOM_TYPE) return undefined;
    const data = item.data as Partial<TimerSnapshot> | undefined;
    if (!data || data.version !== 1) return undefined;
    return {
      version: 1,
      completedWorkMs: safeMs(data.completedWorkMs),
      lastTurnWorkMs: safeMs(data.lastTurnWorkMs),
      updatedAt: safeMs(data.updatedAt),
    };
  }

  function restoreTimerSnapshot(ctx: Ctx): void {
    activeWork = false;
    activeWorkSegmentStartMs = undefined;
    activeWorkAccumulatedMs = 0;
    timerPauseReasons.clear();
    stopTimerRefresh();
    completedWorkMs = 0;
    lastTurnWorkMs = 0;

    for (const entry of ctx.sessionManager.getBranch()) {
      const snapshot = readTimerSnapshot(entry);
      if (!snapshot) continue;
      completedWorkMs = snapshot.completedWorkMs;
      lastTurnWorkMs = snapshot.lastTurnWorkMs;
    }
  }

  function persistTimerSnapshot(): void {
    try {
      pi.appendEntry(TIMER_CUSTOM_TYPE, {
        version: 1,
        completedWorkMs,
        lastTurnWorkMs,
        updatedAt: Date.now(),
      } satisfies TimerSnapshot);
    } catch {
      // Runtime may be stale after session replacement/shutdown
    }
  }

  function currentTurnWorkMs(now = Date.now()): number {
    if (!activeWork) return lastTurnWorkMs;
    const runningSegmentMs = activeWorkSegmentStartMs === undefined ? 0 : now - activeWorkSegmentStartMs;
    return Math.max(0, activeWorkAccumulatedMs + runningSegmentMs);
  }

  function timerStateLine(): string {
    const current = currentTurnWorkMs();
    const total = completedWorkMs + (activeWork ? current : 0);
    return [
      color("Worked for ", DIM),
      formatDuration(current),
      color(", total ", DIM),
      formatDuration(total),
      color(" in this session", DIM),
    ].join("");
  }

  function shortcutLine1(): string {
    const tools = shortcutPill("Ctrl+O", "tools", toolsExpanded);
    const thinking = shortcutPill("Ctrl+T", "thinking", !thinkingHidden);
    const yolo = shortcutPill("Ctrl+Y", "yolo", yoloActive, HIGH);
    const key = (s: string) => color(s, DIM);
    return `${tools}  ${thinking}  ${yolo}  ${key("Ctrl+L")} model     ${key("Ctrl+G")} editor`;
  }

  function shortcutLine2(): string {
    const key = (s: string) => color(s, DIM);
    return `${key("Ctrl+V")} image  ${key("Ctrl+A")} bol       ${key("Ctrl+E")} eol   ${key("Ctrl+U")} kill-bol  ${key("Ctrl+K")} kill-eol`;
  }

  function setWhichKeyWidget(ctx: Ctx, options: { sync?: boolean } = {}): void {
    if (options.sync !== false) syncShortcutStates(ctx);
    ctx.ui.setWidget("status-line-which-key", [timerStateLine(), shortcutLine1(), shortcutLine2()], { placement: "aboveEditor" });
  }

  function refreshShortcutStateDisplay(ctx: Ctx, options: { sync?: boolean } = {}): void {
    setWhichKeyWidget(ctx, options);
    render(ctx, true);
  }

  function installShortcutStateDetector(): void {
    offShortcutStateInput?.();
    const listener: ShortcutStateListener = (state) => {
      if (state.toolsExpanded !== undefined) toolsExpanded = state.toolsExpanded;
      if (state.thinkingHidden !== undefined) thinkingHidden = state.thinkingHidden;
      if (!currentCtx || !statusVisible) return;
      refreshShortcutStateDisplay(currentCtx, { sync: false });
    };
    const listeners = shortcutStateListeners();
    listeners.add(listener);
    offShortcutStateInput = () => {
      listeners.delete(listener);
    };
  }

  function refreshTimerDisplay(): void {
    if (!currentCtx || !statusVisible) return;
    setWhichKeyWidget(currentCtx, { sync: false });
  }

  function startTimerRefresh(): void {
    if (timerRefresh) return;
    timerRefresh = setInterval(refreshTimerDisplay, 1000);
  }

  function stopTimerRefresh(): void {
    if (!timerRefresh) return;
    clearInterval(timerRefresh);
    timerRefresh = undefined;
  }

  function startWorkTimer(): void {
    activeWork = true;
    activeWorkAccumulatedMs = 0;
    lastTurnWorkMs = 0;
    activeWorkSegmentStartMs = timerPauseReasons.size === 0 ? Date.now() : undefined;
    startTimerRefresh();
    refreshTimerDisplay();
  }

  function pauseWorkTimer(reason: unknown): void {
    const key = typeof reason === "string" && reason.trim() ? reason : "external";
    const wasRunning = timerPauseReasons.size === 0;
    timerPauseReasons.add(key);
    if (!activeWork || !wasRunning) {
      refreshTimerDisplay();
      return;
    }
    if (activeWorkSegmentStartMs !== undefined) {
      activeWorkAccumulatedMs += Math.max(0, Date.now() - activeWorkSegmentStartMs);
      activeWorkSegmentStartMs = undefined;
    }
    refreshTimerDisplay();
  }

  function resumeWorkTimer(reason: unknown): void {
    const key = typeof reason === "string" && reason.trim() ? reason : "external";
    timerPauseReasons.delete(key);
    if (!activeWork) {
      refreshTimerDisplay();
      return;
    }
    if (timerPauseReasons.size === 0 && activeWorkSegmentStartMs === undefined) {
      activeWorkSegmentStartMs = Date.now();
    }
    refreshTimerDisplay();
  }

  function finishWorkTimer(): boolean {
    if (!activeWork) return false;
    const elapsed = currentTurnWorkMs();
    lastTurnWorkMs = elapsed;
    completedWorkMs += elapsed;
    activeWork = false;
    activeWorkSegmentStartMs = undefined;
    activeWorkAccumulatedMs = 0;
    timerPauseReasons.clear();
    stopTimerRefresh();
    refreshTimerDisplay();
    return true;
  }

  function installFooter(ctx: Ctx): void {
    currentCtx = ctx;
    if (!statusVisible) {
      ctx.ui.setFooter(undefined);
      ctx.ui.setWidget("status-line-which-key", undefined);
      return;
    }
    ctx.ui.setFooter((tui) => {
      requestFooterRender = () => tui.requestRender();
      return {
        dispose() {
          requestFooterRender = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          return latestFooterLines.map((line) => truncateAnsi(line, width));
        },
      };
    });
    ctx.ui.setStatus("status-widget", undefined);
    ctx.ui.setWidget("status-widget", undefined);
    installShortcutStateDetector();
    setWhichKeyWidget(ctx);
  }

  async function refreshGit(ctx: Ctx): Promise<void> {
    if (gitRefreshInFlight) return;
    gitRefreshInFlight = true;
    try {
      const res = await pi.exec("git", ["status", "--porcelain=v1", "-b"], { cwd: ctx.cwd, timeout: 1500 });
      if (res.code !== 0) {
        gitInfo = { inRepo: false };
        return;
      }

      const lines = res.stdout.trimEnd().split("\n").filter(Boolean);
      const branchLine = lines[0] ?? "";
      const branch = branchLine
        .replace(/^##\s+/, "")
        .replace(/\.\.\..*$/, "")
        .replace(/\s+\[.*\]$/, "")
        .trim() || "HEAD";

      let staged = 0;
      let modified = 0;
      let untracked = 0;
      for (const line of lines.slice(1)) {
        if (line.startsWith("??")) {
          untracked++;
          continue;
        }
        const x = line[0];
        const y = line[1];
        if (x && x !== " " && x !== "?") staged++;
        if (y && y !== " " && y !== "?") modified++;
      }
      gitInfo = { inRepo: true, branch, clean: staged + modified + untracked === 0, staged, modified, untracked };
    } catch {
      gitInfo = { inRepo: false };
    } finally {
      gitRefreshInFlight = false;
    }
  }

  function gitSegment(): string {
    if (!gitInfo.inRepo) return "";
    const base = `${color(`(${gitInfo.branch})`, GIT)} ${gitInfo.clean ? color("✓", LOW) : color("✗", HIGH)}`;
    if (gitInfo.clean) return base;
    const parts: string[] = [];
    if (gitInfo.staged > 0) parts.push(color(`${gitInfo.staged} new`, LOW));
    if (gitInfo.modified > 0) parts.push(color(`${gitInfo.modified} modified`, MID));
    if (gitInfo.untracked > 0) parts.push(color(`${gitInfo.untracked} untracked`, TOKEN));
    return `${base} ${parts.join(" ")}`;
  }

  function render(ctx: Ctx, force = false): void {
    const now = Date.now();
    if (!force && now - lastRenderMs < 250) {
      if (!deferredRender) {
        deferredRender = setTimeout(() => {
          deferredRender = undefined;
          render(ctx, true);
        }, 250 - (now - lastRenderMs));
      }
      return;
    }
    lastRenderMs = now;

    const modelName = ctx.model ? (ctx.model.name || ctx.model.id) : "Model";
    const usage = ctx.getContextUsage();
    const totals = sumUsage(ctx);
    const tpsText = formatTps(lastTps);

    const line1 = [
      color(`[${modelName}]`, MODEL),
      color(progressBar(usage?.percent), PROGRESS),
      color(`| Ctx: ${usage?.tokens == null ? "--" : tokenCount(usage.tokens)}/${usage?.contextWindow ? tokenCount(usage.contextWindow) : "--"}  Input ${tokenCount(totals.input)}  Output ${tokenCount(totals.output)}`, TOKEN),
      color(`| Cost: ${formatCost(totals.cost)}`, TOKEN),
    ].join(" ");

    const git = gitSegment();
    const line2 = [
      color(shortDir(ctx.cwd), DIR),
      color(`TPS: ${tpsText}`, MID),
      git,
    ].filter(Boolean).join(" ");

    latestFooterLines = [line1, line2];

    if (statusVisible) requestFooterRender?.();
  }

  function resetStream(): void {
    streamStartMs = undefined;
    liveOutputTokens = 0;
  }

  const offStatusVisible = pi.events.on("status-line:visible", (value) => {
    statusVisible = value !== false;
    if (!currentCtx) return;
    if (statusVisible) {
      installFooter(currentCtx);
      render(currentCtx, true);
    } else {
      currentCtx.ui.setFooter(undefined);
      currentCtx.ui.setWidget("status-line-which-key", undefined);
      currentCtx.ui.setStatus("status-widget", undefined);
    }
  });

  const offTimerPause = pi.events.on("status-line:timer-pause", (reason) => {
    pauseWorkTimer(reason);
  });

  const offTimerResume = pi.events.on("status-line:timer-resume", (reason) => {
    resumeWorkTimer(reason);
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreTimerSnapshot(ctx);
    installFooter(ctx);
    await refreshGit(ctx);
    render(ctx, true);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreTimerSnapshot(ctx);
    currentCtx = ctx;
    refreshTimerDisplay();
    await refreshGit(ctx);
    render(ctx, true);
  });

  pi.on("model_select", async (_event, ctx) => render(ctx, true));

  pi.on("agent_start", async (_event, ctx) => {
    currentCtx = ctx;
    startWorkTimer();
  });

  pi.on("turn_start", async (_event, ctx) => {
    turnCount++;
    await refreshGit(ctx);
    render(ctx, true);
  });

  pi.on("message_start", async (event, ctx) => {
    const msg = event.message as any;
    if (msg?.role !== "assistant") return;
    streamStartMs = Date.now();
    liveOutputTokens = 0;
    lastTps = undefined;
    render(ctx, true);
  });

  pi.on("message_update", async (event, ctx) => {
    const e = event.assistantMessageEvent;
    if (e.type === "start") {
      streamStartMs = Date.now();
      liveOutputTokens = 0;
      lastTps = undefined;
    } else if (e.type === "text_delta" || e.type === "thinking_delta" || e.type === "toolcall_delta") {
      if (!streamStartMs) streamStartMs = Date.now();
      liveOutputTokens += estimateTokens(e.delta);
      const seconds = Math.max((Date.now() - streamStartMs) / 1000, 0.001);
      lastTps = liveOutputTokens / seconds;
    } else if (e.type === "done" || e.type === "error") {
      if (!streamStartMs) streamStartMs = Date.now();
      const msg = e.type === "done" ? e.message : e.error;
      const actualOutputTokens = Number(msg.usage?.output ?? 0);
      if (actualOutputTokens > 0) {
        const seconds = Math.max((Date.now() - streamStartMs) / 1000, 0.001);
        // 只用本次响应的实际 output tokens / 本次响应耗时，避免累计 output 跨调用相减导致 TPS 错误。
        lastTps = actualOutputTokens / seconds;
        resetStream();
      }
      // 有些 provider 的 usage 要到 message_end 才稳定；此时不要 resetStream，留给 message_end 计算。
    }
    render(ctx);
  });

  pi.on("message_end", async (event, ctx) => {
    const msg = event.message as any;
    if (msg?.role === "assistant") {
      const actualOutputTokens = Number(msg.usage?.output ?? 0);
      if (!streamStartMs && typeof msg.timestamp === "number") {
        streamStartMs = Math.min(msg.timestamp, Date.now());
      }
      if (streamStartMs && actualOutputTokens > 0) {
        const seconds = Math.max((Date.now() - streamStartMs) / 1000, 0.001);
        lastTps = actualOutputTokens / seconds;
      } else if (liveOutputTokens > 0 && streamStartMs) {
        const seconds = Math.max((Date.now() - streamStartMs) / 1000, 0.001);
        lastTps = liveOutputTokens / seconds;
      }
      resetStream();
    }
    render(ctx, true);
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    await refreshGit(ctx);
    render(ctx, true);
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (finishWorkTimer()) {
      persistTimerSnapshot();
    }
    await refreshGit(ctx);
    render(ctx, true);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    currentCtx = undefined;
    if (deferredRender) clearTimeout(deferredRender);
    deferredRender = undefined;
    stopTimerRefresh();
    offStatusVisible();
    offTimerPause();
    offTimerResume();
    offShortcutStateInput?.();
    offShortcutStateInput = undefined;
    ctx.ui.setFooter(undefined);
    ctx.ui.setStatus("status-widget", undefined);
    ctx.ui.setWidget("status-widget", undefined);
    ctx.ui.setWidget("status-line-which-key", undefined);
  });
}
