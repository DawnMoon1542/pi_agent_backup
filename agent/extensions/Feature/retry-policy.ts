// @name: 自动重试策略
// @category: model
// @description: 将请求失败自动重试改为 10 次，基础间隔 1 秒，provider 最大重试等待 5 分钟

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

function readJson(path: string): any {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeJsonIfChanged(path: string, value: any): boolean {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  const prev = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (prev === next) return false;
  writeFileSync(path, next, "utf8");
  return true;
}

function ensureRetryPolicy(): boolean {
  const settings = readJson(SETTINGS_PATH);
  settings.retry = {
    ...(settings.retry ?? {}),
    enabled: true,
    maxRetries: 10,
    baseDelayMs: 1000,
    provider: {
      ...(settings.retry?.provider ?? {}),
      maxRetries: 10,
      maxRetryDelayMs: 5 * 60 * 1000,
    },
  };
  return writeJsonIfChanged(SETTINGS_PATH, settings);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const changed = ensureRetryPolicy();
    if (changed) {
      ctx.ui.notify("Retry policy updated: 10 attempts, base delay 1s, provider retry cap 5min. Run /reload to apply in-memory settings.", "info");
    }
  });
}
