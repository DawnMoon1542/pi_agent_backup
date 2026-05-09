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

function plainVisibleWidth(text: string): number {
  return [...text.replace(/\x1b\[[0-9;]*m/g, "")].length;
}

function sliceVisible(text: string, width: number): string {
  const chars = [...text];
  if (chars.length <= width) return text;
  if (width <= 1) return chars.slice(0, Math.max(0, width)).join("");
  return `${chars.slice(0, width - 1).join("")}…`;
}

function padRight(text: string, width: number): string {
  const visible = plainVisibleWidth(text);
  if (visible >= width) return text;
  return `${text}${" ".repeat(width - visible)}`;
}

function wrapLine(line: string, width: number): string[] {
  if (width <= 0) return [""];
  if (line.length === 0) return [""];

  const result: string[] = [];
  let remaining = line;

  while (plainVisibleWidth(remaining) > width) {
    const hardSlice = sliceVisible(remaining, width + 1);
    const withoutEllipsis = hardSlice.endsWith("…") ? hardSlice.slice(0, -1) : hardSlice;
    const breakAt = Math.max(withoutEllipsis.lastIndexOf(" "), withoutEllipsis.lastIndexOf("/"), withoutEllipsis.lastIndexOf(","));
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

function isTab(data: string): boolean {
  return data === "\t";
}

function isLeft(data: string): boolean {
  return data === "\x1b[D" || data === "h" || data === "H";
}

function isRight(data: string): boolean {
  return data === "\x1b[C" || data === "l" || data === "L";
}

function isUp(data: string): boolean {
  return data === "\x1b[A" || data === "k" || data === "K";
}

function isDown(data: string): boolean {
  return data === "\x1b[B" || data === "j" || data === "J";
}

function isPageUp(data: string): boolean {
  return data === "\x1b[5~";
}

function isPageDown(data: string): boolean {
  return data === "\x1b[6~";
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
      let scroll = 0;
      let cachedWidth = 0;
      let cachedBodyLines: string[] = [];
      let cachedViewportHeight = 0;

      function rebuildBody(innerWidth: number): string[] {
        if (cachedWidth === innerWidth && cachedBodyLines.length > 0) return cachedBodyLines;
        cachedWidth = innerWidth;
        cachedBodyLines = wrapText(message, innerWidth);
        return cachedBodyLines;
      }

      function button(label: string, value: "no" | "yes"): string {
        const content = selected === value ? ` ${label} ` : ` ${label} `;
        if (selected === value) {
          return theme.bg ? theme.bg("selectedBg", style(theme, "accent", bold(theme, content))) : `[${label}]`;
        }
        return style(theme, value === "yes" ? "success" : "warning", content);
      }

      function clampScroll(totalLines: number): void {
        const maxScroll = Math.max(0, totalLines - cachedViewportHeight);
        scroll = Math.max(0, Math.min(scroll, maxScroll));
      }

      return {
        render(width: number): string[] {
          const outerWidth = Math.max(4, Math.min(width, 96));
          const innerWidth = Math.max(1, outerWidth - 4);
          const bodyLines = rebuildBody(innerWidth);
          cachedViewportHeight = Math.min(18, Math.max(6, bodyLines.length));
          clampScroll(bodyLines.length);

          const top = `╭${"─".repeat(outerWidth - 2)}╮`;
          const bottom = `╰${"─".repeat(outerWidth - 2)}╯`;
          const titleText = sliceVisible(bold(theme, title), innerWidth);
          const rendered: string[] = [style(theme, "warning", top), `│ ${padRight(style(theme, "warning", titleText), innerWidth)} │`, `│ ${" ".repeat(innerWidth)} │`];

          const visibleBody = bodyLines.slice(scroll, scroll + cachedViewportHeight);
          for (const line of visibleBody) {
            rendered.push(`│ ${padRight(sliceVisible(line, innerWidth), innerWidth)} │`);
          }

          while (visibleBody.length < cachedViewportHeight) {
            visibleBody.push("");
            rendered.push(`│ ${" ".repeat(innerWidth)} │`);
          }

          if (bodyLines.length > cachedViewportHeight) {
            const maxScroll = Math.max(0, bodyLines.length - cachedViewportHeight);
            const scrollInfo = `行 ${scroll + 1}-${Math.min(scroll + cachedViewportHeight, bodyLines.length)}/${bodyLines.length}，↑↓/PgUp/PgDn 查看详情`;
            rendered.push(`│ ${padRight(style(theme, "dim", sliceVisible(scrollInfo, innerWidth)), innerWidth)} │`);
            if (scroll > maxScroll) scroll = maxScroll;
          } else {
            rendered.push(`│ ${" ".repeat(innerWidth)} │`);
          }

          rendered.push(`│ ${padRight(`${button("否 Esc/N", "no")}  ${button("是 Enter/Y", "yes")}`, innerWidth)} │`);
          rendered.push(style(theme, "warning", bottom));
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
          if (isTab(data) || isLeft(data) || isRight(data)) {
            selected = selected === "yes" ? "no" : "yes";
            tui.requestRender?.();
            return;
          }
          if (isUp(data)) {
            scroll = Math.max(0, scroll - 1);
            tui.requestRender?.();
            return;
          }
          if (isDown(data)) {
            scroll += 1;
            tui.requestRender?.();
            return;
          }
          if (isPageUp(data)) {
            scroll = Math.max(0, scroll - Math.max(1, cachedViewportHeight - 1));
            tui.requestRender?.();
            return;
          }
          if (isPageDown(data)) {
            scroll += Math.max(1, cachedViewportHeight - 1);
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
