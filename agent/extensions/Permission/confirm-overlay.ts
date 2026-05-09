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
        overlayOptions?: {
          width?: number | string;
          minWidth?: number;
          maxWidth?: number;
          maxHeight?: number | string;
          anchor?: string;
          margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
        };
      }
    ) => Promise<T>;
  };
};

function visibleWidth(text: string): number {
  return [...text.replace(/\x1b\[[0-9;]*m/g, "")].length;
}

function takeChars(text: string, width: number): string {
  return [...text].slice(0, Math.max(0, width)).join("");
}

function truncate(text: string, width: number): string {
  if (visibleWidth(text) <= width) return text;
  if (width <= 1) return takeChars(text, width);
  return `${takeChars(text, width - 1)}…`;
}

function padRight(text: string, width: number): string {
  const size = visibleWidth(text);
  if (size >= width) return text;
  return `${text}${" ".repeat(width - size)}`;
}

function fullWidth(line: string, width: number): string {
  return padRight(truncate(line, width), width);
}

function wrapLine(line: string, width: number): string[] {
  if (width <= 0) return [""];
  if (line.length === 0) return [""];

  const result: string[] = [];
  let remaining = line;

  while (visibleWidth(remaining) > width) {
    const probe = takeChars(remaining, width);
    const breakAt = Math.max(probe.lastIndexOf(" "), probe.lastIndexOf("/"), probe.lastIndexOf(","));
    const take = breakAt > Math.floor(width * 0.45) ? breakAt + 1 : width;
    result.push(remaining.slice(0, take).trimEnd());
    remaining = remaining.slice(take).trimStart();
  }

  result.push(remaining);
  return result;
}

function wrapText(text: string, width: number): string[] {
  return text.replace(/\r/g, "").split("\n").flatMap((line) => wrapLine(line, width));
}

function isEnter(data: string): boolean {
  return data === "\r" || data === "\n" || data === "\r\n";
}

function isEscape(data: string): boolean {
  return data === "\x1b";
}

function isUp(data: string): boolean {
  return data === "\x1b[A" || data === "k" || data === "K";
}

function isDown(data: string): boolean {
  return data === "\x1b[B" || data === "j" || data === "J";
}

function style(theme: ConfirmTheme, name: string, text: string): string {
  return theme.fg ? theme.fg(name, text) : text;
}

function bold(theme: ConfirmTheme, text: string): string {
  return theme.bold ? theme.bold(text) : text;
}

export async function confirmOverlay(ctx: ConfirmContext, title: string, message: string): Promise<boolean> {
  if (!ctx.hasUI || typeof ctx.ui.custom !== "function") {
    return ctx.ui.confirm(title, message);
  }

  return ctx.ui.custom<boolean>(
    (tui, theme, _keybindings, done) => {
      let selected: "no" | "yes" = "no";
      let cachedWidth = 0;
      let cachedBodyLines: string[] = [];

      function rebuildBody(innerWidth: number): string[] {
        if (cachedWidth === innerWidth && cachedBodyLines.length > 0) return cachedBodyLines;
        cachedWidth = innerWidth;
        cachedBodyLines = wrapText(message, innerWidth);
        return cachedBodyLines;
      }

      function choiceLine(value: "no" | "yes", label: string, hint: string): string {
        const marker = selected === value ? "●" : "○";
        const text = `${marker} ${label}  ${hint}`;
        if (selected === value) {
          const highlighted = style(theme, value === "yes" ? "success" : "warning", bold(theme, text));
          return theme.bg ? theme.bg("selectedBg", highlighted) : highlighted;
        }
        return style(theme, "muted", text);
      }

      return {
        render(width: number): string[] {
          const outerWidth = Math.max(4, Math.min(width, 96));
          const innerWidth = Math.max(1, outerWidth - 4);
          const maxBodyLines = 14;
          const bodyLines = rebuildBody(innerWidth);
          const visibleBody = bodyLines.slice(0, maxBodyLines);
          const hiddenCount = Math.max(0, bodyLines.length - visibleBody.length);
          const top = `╭${"─".repeat(outerWidth - 2)}╮`;
          const bottom = `╰${"─".repeat(outerWidth - 2)}╯`;
          const rendered: string[] = [];

          rendered.push(fullWidth(style(theme, "warning", top), width));
          rendered.push(fullWidth(`│ ${padRight(style(theme, "warning", truncate(bold(theme, title), innerWidth)), innerWidth)} │`, width));
          rendered.push(fullWidth(`│ ${" ".repeat(innerWidth)} │`, width));

          for (const line of visibleBody) {
            rendered.push(fullWidth(`│ ${padRight(truncate(line, innerWidth), innerWidth)} │`, width));
          }

          if (hiddenCount > 0) {
            const more = style(theme, "dim", `还有 ${hiddenCount} 行未显示，已隐藏以避免覆盖上下文`);
            rendered.push(fullWidth(`│ ${padRight(truncate(more, innerWidth), innerWidth)} │`, width));
          }

          rendered.push(fullWidth(`│ ${" ".repeat(innerWidth)} │`, width));
          rendered.push(fullWidth(`│ ${padRight(choiceLine("no", "否", "Esc / N / Enter"), innerWidth)} │`, width));
          rendered.push(fullWidth(`│ ${padRight(choiceLine("yes", "是", "Y / Enter"), innerWidth)} │`, width));
          rendered.push(fullWidth(`│ ${padRight(style(theme, "dim", "↑↓ 切换，Enter 确认"), innerWidth)} │`, width));
          rendered.push(fullWidth(style(theme, "warning", bottom), width));
          return rendered;
        },
        handleInput(data: string): void {
          if (isEscape(data) || data === "n" || data === "N") {
            done(false);
            return;
          }
          if (data === "y" || data === "Y") {
            done(true);
            return;
          }
          if (isEnter(data)) {
            done(selected === "yes");
            return;
          }
          if (isUp(data) || isDown(data)) {
            selected = selected === "yes" ? "no" : "yes";
            tui.requestRender?.();
          }
        },
        invalidate(): void {
          cachedWidth = 0;
          cachedBodyLines = [];
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        width: "80%",
        minWidth: 48,
        maxWidth: 100,
        maxHeight: "75%",
        anchor: "center",
        margin: 2,
      },
    }
  );
}
