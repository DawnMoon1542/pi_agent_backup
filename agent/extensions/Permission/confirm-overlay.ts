import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

type ConfirmTheme = {
  fg?: (name: string, text: string) => string;
  bg?: (name: string, text: string) => string;
  bold?: (text: string) => string;
};

type ConfirmTui = {
  requestRender?: () => void;
};

type ConfirmContext = {
  hasUI?: boolean;
  ui: {
    confirm: (title: string, message: string) => Promise<boolean>;
    custom?: <T>(
      factory: (tui: ConfirmTui, theme: ConfirmTheme, keybindings: unknown, done: (result: T) => void) => {
        render: (width: number) => string[];
        handleInput?: (data: string) => void;
        invalidate: () => void;
      },
      options?: {
        overlay?: boolean;
      }
    ) => Promise<T>;
  };
};

function style(theme: ConfirmTheme, name: string, text: string): string {
  return theme.fg ? theme.fg(name, text) : text;
}

function background(theme: ConfirmTheme, name: string, text: string): string {
  return theme.bg ? theme.bg(name, text) : text;
}

function bold(theme: ConfirmTheme, text: string): string {
  return theme.bold ? theme.bold(text) : text;
}

function visibleMessageLines(message: string, width: number): string[] {
  const bodyWidth = Math.max(20, width - 4);
  const wrapped = message
    .replace(/\r/g, "")
    .split("\n")
    .flatMap((line) => wrapTextWithAnsi(line, bodyWidth));

  const maxLines = 12;
  if (wrapped.length <= maxLines) return wrapped;
  return [
    ...wrapped.slice(0, maxLines),
    styleLine(`还有 ${wrapped.length - maxLines} 行未显示`, bodyWidth),
  ];
}

function styleLine(text: string, width: number): string {
  return truncateToWidth(text, width);
}

function optionLine(theme: ConfirmTheme, selected: "no" | "yes", value: "no" | "yes", width: number): string {
  const active = selected === value;
  const marker = active ? "❯" : " ";
  const label = value === "yes" ? "允许" : "拒绝";
  const hint = value === "yes" ? "Y" : "N / Esc";
  const raw = `${marker} ${label}  ${hint}`;
  const colored = active
    ? background(theme, "selectedBg", style(theme, value === "yes" ? "success" : "warning", bold(theme, raw)))
    : style(theme, "muted", raw);
  return truncateToWidth(colored, width);
}

export async function confirmOverlay(ctx: ConfirmContext, title: string, message: string): Promise<boolean> {
  if (!ctx.hasUI || typeof ctx.ui.custom !== "function") {
    return ctx.ui.confirm(title, message);
  }

  return ctx.ui.custom<boolean>((tui, theme, _keybindings, done) => {
    let selected: "no" | "yes" = "no";

    function toggle(): void {
      selected = selected === "yes" ? "no" : "yes";
      tui.requestRender?.();
    }

    return {
      render(width: number): string[] {
        const bodyWidth = Math.max(20, width - 4);
        const lines: string[] = [];
        lines.push(style(theme, "warning", bold(theme, title)));
        lines.push(style(theme, "dim", "─".repeat(Math.min(width, 72))));

        for (const line of visibleMessageLines(message, width)) {
          lines.push(`  ${truncateToWidth(line, bodyWidth)}`);
        }

        lines.push("");
        lines.push(optionLine(theme, selected, "no", width));
        lines.push(optionLine(theme, selected, "yes", width));
        lines.push(style(theme, "dim", "↑↓ 切换 · Enter 确认 · Esc/N 拒绝 · Y 允许"));
        return lines.map((line) => truncateToWidth(line, width));
      },
      handleInput(data: string): void {
        if (matchesKey(data, Key.escape) || data === "n" || data === "N") {
          done(false);
          return;
        }
        if (data === "y" || data === "Y") {
          done(true);
          return;
        }
        if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
          toggle();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          done(selected === "yes");
        }
      },
      invalidate(): void {},
    };
  });
}
