// @name: 会话统计命令
// @category: ui
// @description: 注册 /stats 命令，以交互页面显示详细使用统计

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

type Range = "all" | "7d" | "30d";

type UsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
};

type ModelStats = UsageTotals & { key: string; calls: number };
type StatsData = ReturnType<typeof collectStats>;

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const TITLE = "\x1b[38;5;183m";
const ACCENT = "\x1b[38;5;111m";
const GREEN = "\x1b[38;5;150m";
const YELLOW = "\x1b[38;5;223m";
const RED = "\x1b[38;5;211m";
const TOKEN = "\x1b[38;5;146m";
const TEXT = "\x1b[38;5;252m";
const MUTED = "\x1b[38;5;245m";

const RANGES: Range[] = ["all", "7d", "30d"];
const EMPTY_USAGE: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 };

function c(s: string, color: string): string {
  return `${color}${s}${RESET}`;
}

function rangeLabel(range: Range): string {
  if (range === "7d") return "7D";
  if (range === "30d") return "30D";
  return "ALL TIME";
}

function getCutoff(range: Range): number {
  const now = Date.now();
  if (range === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (range === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

function entryTime(entry: any): number {
  const t = Date.parse(String(entry?.timestamp ?? ""));
  return Number.isFinite(t) ? t : 0;
}

function addUsage(target: UsageTotals, usage: any): void {
  const input = Number(usage?.input ?? 0);
  const output = Number(usage?.output ?? 0);
  const cacheRead = Number(usage?.cacheRead ?? 0);
  const cacheWrite = Number(usage?.cacheWrite ?? 0);
  target.input += input;
  target.output += output;
  target.cacheRead += cacheRead;
  target.cacheWrite += cacheWrite;
  target.totalTokens += Number(usage?.totalTokens ?? input + output + cacheRead + cacheWrite);
  target.cost += Number(usage?.cost?.total ?? 0);
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")}m`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

function fmtCost(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0.000";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function pct(part: number, total: number): string {
  if (!total || !Number.isFinite(total)) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function bar(value: number, max: number, width = 20): string {
  if (!max || value <= 0) return c("·".repeat(width), MUTED);
  const filled = Math.max(1, Math.round((value / max) * width));
  return c("█".repeat(filled), ACCENT) + c("░".repeat(Math.max(0, width - filled)), MUTED);
}

function heatCell(value: number, max: number): string {
  if (!value || !max) return c("·", MUTED);
  const ratio = value / max;
  // 统一使用蓝紫色系，只通过亮度和块密度表达强弱，避免多色调难以分辨。
  if (ratio > 0.75) return c("█", "\x1b[38;5;147m");
  if (ratio > 0.45) return c("▓", "\x1b[38;5;111m");
  if (ratio > 0.2) return c("▒", "\x1b[38;5;75m");
  return c("░", "\x1b[38;5;60m");
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function collectStats(branch: any[], range: Range) {
  const cutoff = getCutoff(range);
  let userMsgs = 0;
  let assistantMsgs = 0;
  let toolResults = 0;
  let assistantCallsWithUsage = 0;
  let firstTs = Infinity;
  let lastTs = 0;

  const totals: UsageTotals = { ...EMPTY_USAGE };
  const models = new Map<string, ModelStats>();
  const tools = new Map<string, number>();
  const daily = new Map<string, UsageTotals>();
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  for (const entry of branch) {
    const ts = entryTime(entry);
    if (ts < cutoff) continue;
    if (ts) {
      firstTs = Math.min(firstTs, ts);
      lastTs = Math.max(lastTs, ts);
    }

    if (entry.type !== "message") continue;
    const msg = entry.message as any;
    if (msg?.role === "user") userMsgs++;
    if (msg?.role === "toolResult") {
      toolResults++;
      const name = String(msg.toolName ?? "unknown");
      tools.set(name, (tools.get(name) ?? 0) + 1);
    }
    if (msg?.role !== "assistant") continue;
    assistantMsgs++;
    if (!msg.usage) continue;
    assistantCallsWithUsage++;
    addUsage(totals, msg.usage);

    const modelKey = `${msg.provider ?? "unknown"}/${msg.model ?? "unknown"}`;
    let model = models.get(modelKey);
    if (!model) {
      model = { key: modelKey, calls: 0, ...EMPTY_USAGE };
      models.set(modelKey, model);
    }
    model.calls++;
    addUsage(model, msg.usage);

    if (ts) {
      const dKey = dayKey(ts);
      const day = daily.get(dKey) ?? { ...EMPTY_USAGE };
      addUsage(day, msg.usage);
      daily.set(dKey, day);
      const date = new Date(ts);
      heat[date.getDay()][date.getHours()] += Number(msg.usage.totalTokens ?? 0);
    }
  }

  return { range, totals, models, tools, daily, heat, userMsgs, assistantMsgs, toolResults, assistantCallsWithUsage, firstTs, lastTs };
}

function metric(label: string, value: string, color = TOKEN): string {
  return `${c(label, MUTED)} ${c(value, color)}`;
}

function renderStatsPage(data: StatsData, page: number): string[] {
  const lines: string[] = [];
  const u = data.totals;
  const duration = data.firstTs < Infinity && data.lastTs > 0
    ? `${new Date(data.firstTs).toLocaleDateString()} → ${new Date(data.lastTs).toLocaleDateString()}`
    : "No data";

  lines.push(c(`${BOLD}Usage Stats${RESET}`, TITLE));
  lines.push(`${c("Range", MUTED)} ${c(rangeLabel(data.range), ACCENT)}   ${c("Period", MUTED)} ${c(duration, TEXT)}`);
  lines.push("");

  if (page === 0) {
    lines.push(`${metric("Total", fmtTokens(u.totalTokens))}   ${metric("Input", `${fmtTokens(u.input)} (${pct(u.input, u.totalTokens)})`)}   ${metric("Output", `${fmtTokens(u.output)} (${pct(u.output, u.totalTokens)})`)}   ${metric("Cost", fmtCost(u.cost), GREEN)}`);
    lines.push(`${metric("Cache read", `${fmtTokens(u.cacheRead)} (${pct(u.cacheRead, u.totalTokens)})`)}   ${metric("Cache write", `${fmtTokens(u.cacheWrite)} (${pct(u.cacheWrite, u.totalTokens)})`)}`);
    lines.push("");
    lines.push(c("Messages", TITLE));
    lines.push(`${metric("User", String(data.userMsgs))}   ${metric("Assistant", String(data.assistantMsgs))}   ${metric("Usage calls", String(data.assistantCallsWithUsage))}   ${metric("Tool results", String(data.toolResults))}`);
    lines.push("");

    lines.push(c("Models by cost", TITLE));
    const modelRows = [...data.models.values()].sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens).slice(0, 10);
    if (!modelRows.length) lines.push(c("  No model usage data", MUTED));
    for (const m of modelRows) {
      lines.push(`  ${c(m.key, ACCENT)}  ${metric("calls", String(m.calls))}  ${metric("tokens", fmtTokens(m.totalTokens))}  ${metric("cost", fmtCost(m.cost), GREEN)}`);
    }
    lines.push("");

    lines.push(c("Top tools", TITLE));
    const toolRows = [...data.tools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (!toolRows.length) {
      lines.push(c("  No tool calls", MUTED));
    } else {
      lines.push("  " + toolRows.map(([name, count]) => `${c(name, ACCENT)} ${c(String(count), TOKEN)}`).join("    "));
    }
    return lines;
  }

  lines.push(c("Usage heatmap  weekday × hour", TITLE));
  lines.push(c("       00 03 06 09 12 15 18 21", MUTED));
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const maxHeat = Math.max(0, ...data.heat.flat());
  for (let day = 0; day < 7; day++) {
    lines.push(`  ${c(names[day], MUTED)}  ${data.heat[day].map((v) => heatCell(v, maxHeat)).join("")}`);
  }
  lines.push("");

  lines.push(c("Daily trend", TITLE));
  const dailyRows = [...data.daily.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(data.range === "all" ? -21 : 0);
  const maxDaily = Math.max(0, ...dailyRows.map(([, v]) => v.totalTokens));
  if (!dailyRows.length) lines.push(c("  No daily usage data", MUTED));
  for (const [day, v] of dailyRows) {
    lines.push(`  ${c(day, MUTED)} ${bar(v.totalTokens, maxDaily, 16)} ${c(fmtTokens(v.totalTokens).padStart(6), TOKEN)} ${c(fmtCost(v.cost).padStart(8), GREEN)}`);
  }
  return lines;
}

function header(range: Range, page: number, pageCount: number): string[] {
  const tabs = RANGES.map((r) => r === range ? c(` ${rangeLabel(r)} `, `${BOLD}${TITLE}`) : c(` ${rangeLabel(r)} `, MUTED)).join(" ");
  return [
    `${c("/stats", TITLE)}  ${tabs}    ${c(`Page ${page + 1}/${pageCount}`, `${BOLD}${YELLOW}`)}`,
    c("↑/↓ page   ←/→ range   q/Esc close", MUTED),
    "",
  ];
}

class StatsPage {
  private rangeIndex = 0;
  private page = 0;
  private data: StatsData;

  constructor(private branch: any[], private requestRender: () => void, private done: () => void) {
    this.data = collectStats(this.branch, this.range);
  }

  invalidate() {}

  private get range(): Range {
    return RANGES[this.rangeIndex];
  }

  private rebuild(): void {
    this.data = collectStats(this.branch, this.range);
    this.page = 0;
  }

  handleInput(data: string): void {
    if (data === "q" || data === "Q" || matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) {
      this.done();
      return;
    }
    if (matchesKey(data, Key.left)) {
      this.rangeIndex = (this.rangeIndex + RANGES.length - 1) % RANGES.length;
      this.rebuild();
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.right)) {
      this.rangeIndex = (this.rangeIndex + 1) % RANGES.length;
      this.rebuild();
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.up) || matchesKey(data, "pageUp")) {
      this.page = Math.max(0, this.page - 1);
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.down) || matchesKey(data, "pageDown") || matchesKey(data, "space")) {
      this.page = Math.min(1, this.page + 1);
      this.requestRender();
    }
  }

  render(width: number): string[] {
    const pageCount = 2;
    this.page = Math.min(this.page, pageCount - 1);
    const body = renderStatsPage(this.data, this.page);
    return [...header(this.range, this.page, pageCount), ...body].map((line) => truncateToWidth(line, width));
  }
}

export default function (pi: ExtensionAPI) {
  const openStats = async (_args: string | undefined, ctx: any) => {
    const branch = ctx.sessionManager.getBranch() as any[];
    pi.events.emit("status-line:visible", false);
    try {
      await ctx.ui.custom((tui: any, _theme: any, _kb: any, done: () => void) =>
        new StatsPage(branch, () => tui.requestRender(), done)
      );
    } finally {
      pi.events.emit("status-line:visible", true);
    }
  };

  pi.registerCommand("stats", {
    description: "打开交互式使用统计页面",
    handler: openStats,
  });

  pi.registerCommand("stat", {
    description: "打开交互式使用统计页面（/stats 别名）",
    handler: openStats,
  });
}
