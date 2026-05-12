// @name: 会话统计命令
// @category: ui
// @description: 注册 /stats 命令，以交互页面显示详细使用统计

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
type SessionManagerConstructor = {
  listAll?: (onProgress?: (loaded: number, total: number) => void) => Promise<Array<{ path: string }>>;
  open?: (path: string, sessionDir?: string, cwdOverride?: string) => { getEntries: () => any[] };
};

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

function collectStats(branch: any[], range: Range, sourceSessionCount = 1, skippedSessionCount = 0) {
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
  // heatDays: last 7 calendar dates, each with 24 hour buckets
  const now = new Date();
  const last7Dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    last7Dates.push(dayKey(d.getTime()));
  }
  const heatDayMap = new Map<string, number[]>();
  for (const dk of last7Dates) heatDayMap.set(dk, Array.from({ length: 24 }, () => 0));
  // heatMonths: weekday (0-6) x month buckets
  const monthSet = new Set<string>();
  const weekdayMonthMap = Array.from({ length: 7 }, () => new Map<string, number>());

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
      const tokens = Number(msg.usage.totalTokens ?? 0);
      // heatDays: accumulate into hour bucket if date is in last 7 days
      const hourBucket = heatDayMap.get(dKey);
      if (hourBucket) hourBucket[date.getHours()] += tokens;
      // heatMonths: accumulate into weekday x month bucket
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthSet.add(monthKey);
      const wdMap = weekdayMonthMap[date.getDay()];
      wdMap.set(monthKey, (wdMap.get(monthKey) ?? 0) + tokens);
    }
  }

  // Build heatDays array (7 rows)
  const heatDays = last7Dates.map((dk) => ({
    label: dk.slice(5), // MM-DD
    values: heatDayMap.get(dk)!,
  }));
  // Build heatMonths grid: 7 weekdays x 12 months (always show 12 months ending at current month)
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fixed12Months: string[] = [];
  const fixed12Labels: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    fixed12Months.push(key);
    fixed12Labels.push(MONTH_NAMES[d.getMonth()]);
  }
  const heatMonths = {
    columns: fixed12Labels,
    grid: weekdayMonthMap.map((wdMap) => fixed12Months.map((m) => wdMap.get(m) ?? 0)),
  };

  return {
    range,
    totals,
    models,
    tools,
    daily,
    heatDays,
    heatMonths,
    userMsgs,
    assistantMsgs,
    toolResults,
    assistantCallsWithUsage,
    firstTs,
    lastTs,
    sourceSessionCount,
    skippedSessionCount,
    scannedEntryCount: branch.length,
  };
}

export function collectStatsFromBranches(branches: any[][], range: Range) {
  return collectStats(branches.flat(), range, branches.length);
}

async function loadDeviceSessionEntries(ctx: any): Promise<{ entries: any[][]; skipped: number }> {
  const managerConstructor = ctx.sessionManager.constructor as SessionManagerConstructor;
  if (typeof managerConstructor.listAll !== "function" || typeof managerConstructor.open !== "function") {
    return { entries: [ctx.sessionManager.getEntries() as any[]], skipped: 0 };
  }

  const sessionInfos = await managerConstructor.listAll();
  if (!sessionInfos.length) return { entries: [ctx.sessionManager.getEntries() as any[]], skipped: 0 };

  const entries: any[][] = [];
  let skipped = 0;
  for (const info of sessionInfos) {
    try {
      entries.push(managerConstructor.open(info.path).getEntries() as any[]);
    } catch {
      skipped++;
    }
  }

  if (!entries.length) return { entries: [ctx.sessionManager.getEntries() as any[]], skipped };
  return { entries, skipped };
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
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
    const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - stripAnsi(s).length));

    // Prepare Usage Stats rows as [label, value, color][] per row
    const usageRow1: [string, string, string][] = [
      ["Total", fmtTokens(u.totalTokens), TOKEN],
      ["Input", `${fmtTokens(u.input)} (${pct(u.input, u.totalTokens)})`, TOKEN],
      ["Output", `${fmtTokens(u.output)} (${pct(u.output, u.totalTokens)})`, TOKEN],
    ];
    const usageRow2: [string, string, string][] = [
      ["Cache R", `${fmtTokens(u.cacheRead)} (${pct(u.cacheRead, u.totalTokens)})`, TOKEN],
      ["Cache W", `${fmtTokens(u.cacheWrite)} (${pct(u.cacheWrite, u.totalTokens)})`, TOKEN],
      ["Cost", fmtCost(u.cost), GREEN],
    ];
    const msgRow: [string, string, string][] = [
      ["User", String(data.userMsgs), TOKEN],
      ["Assistant", String(data.assistantMsgs), TOKEN],
      ["Usage calls", String(data.assistantCallsWithUsage), TOKEN],
      ["Tool results", String(data.toolResults), TOKEN],
    ];

    // Compute per-column widths for usage rows only
    const usageRows = [usageRow1, usageRow2];
    const maxUsageCols = Math.max(...usageRows.map((r) => r.length));
    const colLabelW: number[] = Array.from({ length: maxUsageCols }, () => 0);
    const colValW: number[] = Array.from({ length: maxUsageCols }, () => 0);
    for (const row of usageRows) {
      for (let i = 0; i < row.length; i++) {
        colLabelW[i] = Math.max(colLabelW[i], row[i][0].length);
        colValW[i] = Math.max(colValW[i], row[i][1].length);
      }
    }
    const gap = 4;
    const indent = "  ";
    const renderRow = (row: [string, string, string][], labelWidths: number[], valWidths: number[], rowGap: number) => {
      return indent + row.map((item, i) => {
        const label = c(item[0].padEnd(labelWidths[i]), ACCENT);
        const value = c(item[1], item[2]);
        const cell = `${label} ${value}`;
        if (i < row.length - 1) {
          const visibleLen = labelWidths[i] + 1 + item[1].length;
          const targetLen = labelWidths[i] + 1 + valWidths[i] + rowGap;
          return cell + " ".repeat(Math.max(0, targetLen - visibleLen));
        }
        return cell;
      }).join("");
    };

    lines.push(renderRow(usageRow1, colLabelW, colValW, gap));
    lines.push(renderRow(usageRow2, colLabelW, colValW, gap));
    lines.push("");
    lines.push(c("Messages", TITLE));
    // Messages row: independent column widths, smaller gap
    const msgLabelW: number[] = msgRow.map((item) => item[0].length);
    const msgValW: number[] = msgRow.map((item) => item[1].length);
    lines.push(renderRow(msgRow, msgLabelW, msgValW, 4));
    lines.push("");

    lines.push(c("Models by cost", TITLE));
    const modelRows = [...data.models.values()].sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens).slice(0, 10);
    if (!modelRows.length) {
      lines.push(c("  No model usage data", MUTED));
    } else {
      const maxKeyLen = Math.max(...modelRows.map((m) => m.key.length));
      const maxCallsLen = Math.max(...modelRows.map((m) => String(m.calls).length));
      const maxTokensLen = Math.max(...modelRows.map((m) => fmtTokens(m.totalTokens).length));
      const maxCostLen = Math.max(...modelRows.map((m) => fmtCost(m.cost).length));
      for (const m of modelRows) {
        const key = c(m.key.padEnd(maxKeyLen), ACCENT);
        const calls = `${c("calls", MUTED)} ${c(String(m.calls).padStart(maxCallsLen), TOKEN)}`;
        const tokens = `${c("tokens", MUTED)} ${c(fmtTokens(m.totalTokens).padStart(maxTokensLen), TOKEN)}`;
        const cost = `${c("cost", MUTED)} ${c(fmtCost(m.cost).padStart(maxCostLen), GREEN)}`;
        lines.push(`  ${key}  ${calls}  ${tokens}  ${cost}`);
      }
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

  if (data.range === "7d") {
    // 7D: rows = last 7 calendar dates, columns = hours 0-23
    lines.push(c("Usage heatmap  date × hour", TITLE));
    lines.push(c("         00 03 06 09 12 15 18 21", MUTED));
    const maxHeat = Math.max(0, ...data.heatDays.map((row) => Math.max(0, ...row.values)));
    for (const row of data.heatDays) {
      lines.push(`  ${c(row.label, MUTED)}  ${row.values.map((v) => heatCell(v, maxHeat)).join("")}`);
    }
  } else {
    // 30D / ALL: rows = weekdays, columns = months
    lines.push(c("Usage heatmap  weekday × month", TITLE));
    const monthLabels = [...data.heatMonths.columns];
    const headerCols = monthLabels.map((m) => m.padEnd(3)).join(" ");
    lines.push(`  ${c("     " + headerCols, MUTED)}`);
    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const maxHeat = Math.max(0, ...data.heatMonths.grid.flat());
    for (let day = 0; day < 7; day++) {
      const cells = data.heatMonths.grid[day].map((v) => heatCell(v, maxHeat)).join(" ".repeat(3));
      lines.push(`  ${c(weekdayNames[day], MUTED)}  ${cells}`);
    }
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
    c("←/→ page   r range   q/Esc close", MUTED),
    "",
  ];
}

class StatsPage {
  private rangeIndex = 0;
  private page = 0;
  private data: StatsData;

  constructor(private branches: any[][], private skippedSessionCount: number, private requestRender: () => void, private done: () => void) {
    this.data = this.collect();
  }

  invalidate() {}

  private get range(): Range {
    return RANGES[this.rangeIndex];
  }

  private collect(): StatsData {
    const entries = this.branches.flat();
    return collectStats(entries, this.range, this.branches.length, this.skippedSessionCount);
  }

  private rebuild(): void {
    this.data = this.collect();
  }

  handleInput(data: string): void {
    if (data === "q" || data === "Q" || matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) {
      this.done();
      return;
    }
    if (data === "r" || data === "R") {
      this.rangeIndex = (this.rangeIndex + 1) % RANGES.length;
      this.rebuild();
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.left)) {
      this.page = Math.max(0, this.page - 1);
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.right)) {
      this.page = Math.min(1, this.page + 1);
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
    pi.events.emit("status-line:visible", false);
    ctx.ui.setWidget("stats-loading", ["Loading all device sessions for /stat..."], { placement: "aboveEditor" });
    try {
      const { entries, skipped } = await loadDeviceSessionEntries(ctx);
      ctx.ui.setWidget("stats-loading", undefined);
      await ctx.ui.custom((tui: any, _theme: any, _kb: any, done: () => void) =>
        new StatsPage(entries, skipped, () => tui.requestRender(), done)
      );
    } finally {
      ctx.ui.setWidget("stats-loading", undefined);
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
