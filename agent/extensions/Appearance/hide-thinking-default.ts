// @name: 默认隐藏 Thinking
// @category: ui
// @description: 默认隐藏 thinking 内容，并显示单行 Ctrl+T 切换提示

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const AGENT_DIR = join(homedir(), ".pi", "agent");
const SETTINGS_PATH = join(AGENT_DIR, "settings.json");
const KEYBINDINGS_PATH = join(AGENT_DIR, "keybindings.json");
const DEFAULT_LABEL = "Thinking hidden — Ctrl+T toggles full content";

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

function formatLabel(_thinkingText: string): string {
  return DEFAULT_LABEL;
}

function extractThinkingText(message: any): string {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter((content: any) => content?.type === "thinking" && typeof content.thinking === "string")
    .map((content: any) => content.thinking)
    .join("\n");
}

export default function (pi: ExtensionAPI) {
  let currentThinkingText = "";

  function updateHiddenThinkingLabel(ctx: any): void {
    ctx.ui.setHiddenThinkingLabel(formatLabel(currentThinkingText));
  }

  pi.on("session_start", async (_event, ctx) => {
    const changed = ensureThinkingSettings();
    const lastAssistant = [...ctx.sessionManager.getBranch()]
      .reverse()
      .find((entry: any) => entry.type === "message" && entry.message?.role === "assistant");
    currentThinkingText = extractThinkingText((lastAssistant as any)?.message);
    updateHiddenThinkingLabel(ctx);
    if (changed) {
      ctx.ui.notify("Thinking is hidden by default; Ctrl+T toggles full thinking. Run /reload to apply settings/keybinding cleanup.", "info");
    }
  });

  pi.on("message_start", async (event, ctx) => {
    const msg = event.message as any;
    if (msg?.role !== "assistant") return;
    currentThinkingText = extractThinkingText(msg);
    updateHiddenThinkingLabel(ctx);
  });

  pi.on("message_update", async (event, ctx) => {
    const e = event.assistantMessageEvent as any;
    if (e.type === "start") {
      currentThinkingText = extractThinkingText(e.message);
    } else if (e.type === "thinking_delta" && typeof e.delta === "string") {
      currentThinkingText += e.delta;
    } else if (e.type === "done") {
      currentThinkingText = extractThinkingText(e.message);
    }
    updateHiddenThinkingLabel(ctx);
  });

  pi.on("message_end", async (event, ctx) => {
    const msg = event.message as any;
    if (msg?.role !== "assistant") return;
    currentThinkingText = extractThinkingText(msg) || currentThinkingText;
    updateHiddenThinkingLabel(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setHiddenThinkingLabel(undefined);
  });
}
