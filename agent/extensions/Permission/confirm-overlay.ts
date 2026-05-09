import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const ABOVE_STATUS_PATCHED = Symbol.for("pi.extensions.permission-confirm.aboveStatusPatched");
const ABOVE_STATUS_ORIGINAL = Symbol.for("pi.extensions.permission-confirm.originalShowExtensionCustom");

type ConfirmTheme = {
  fg?: (name: string, text: string) => string;
  bg?: (name: string, text: string) => string;
  bold?: (text: string) => string;
};

type ConfirmTui = {
  requestRender?: () => void;
};

type ConfirmComponent = {
  render: (width: number) => string[];
  handleInput?: (data: string) => void;
  invalidate: () => void;
  dispose?: () => void;
};

type ConfirmContext = {
  hasUI?: boolean;
  ui: {
    confirm: (title: string, message: string) => Promise<boolean>;
    custom?: <T>(
      factory: (tui: ConfirmTui, theme: ConfirmTheme, keybindings: unknown, done: (result: T) => void) => ConfirmComponent,
      options?: {
        overlay?: boolean;
        placement?: "aboveStatus";
      }
    ) => Promise<T>;
  };
};

type PatchableInteractiveMode = {
  prototype: {
    showExtensionCustom?: (factory: unknown, options?: { overlay?: boolean; placement?: string }) => Promise<unknown>;
    [ABOVE_STATUS_PATCHED]?: boolean;
    [ABOVE_STATUS_ORIGINAL]?: (factory: unknown, options?: { overlay?: boolean; placement?: string }) => Promise<unknown>;
  };
};

type InteractiveModeInstance = {
  ui: {
    children: unknown[];
    setFocus: (component: unknown) => void;
    removeChild: (component: unknown) => void;
    requestRender: () => void;
  };
  statusContainer?: unknown;
  editor?: {
    setText?: (text: string) => void;
    getText?: () => string;
  };
  keybindings?: unknown;
  createExtensionUIContext?: () => { theme: ConfirmTheme };
};

function getInteractiveMode(): PatchableInteractiveMode | undefined {
  try {
    const req = eval("require") as (name: string) => Record<string, unknown>;
    const mod = req("@mariozechner/pi-coding-agent") as Record<string, unknown>;
    return mod.InteractiveMode as PatchableInteractiveMode | undefined;
  } catch {
    try {
      const req = eval("require") as (name: string) => Record<string, unknown>;
      const mod = req("@earendil-works/pi-coding-agent") as Record<string, unknown>;
      return mod.InteractiveMode as PatchableInteractiveMode | undefined;
    } catch {
      return undefined;
    }
  }
}

function installAboveStatusPlacement(): void {
  const InteractiveMode = getInteractiveMode();
  const proto = InteractiveMode?.prototype;
  if (!proto || proto[ABOVE_STATUS_PATCHED]) return;

  const original = proto.showExtensionCustom;
  if (typeof original !== "function") return;

  proto[ABOVE_STATUS_ORIGINAL] = original;
  proto.showExtensionCustom = function patchedShowExtensionCustom(
    this: InteractiveModeInstance,
    factory: (tui: unknown, theme: ConfirmTheme, keybindings: unknown, done: (result: unknown) => void) => ConfirmComponent | Promise<ConfirmComponent>,
    options?: { overlay?: boolean; placement?: string }
  ): Promise<unknown> {
    if (options?.placement !== "aboveStatus") {
      return original.call(this, factory, options);
    }

    const savedText = this.editor?.getText?.() ?? "";
    return new Promise((resolve, reject) => {
      let component: ConfirmComponent | undefined;
      let closed = false;

      const close = (result: unknown): void => {
        if (closed) return;
        closed = true;
        if (component) {
          this.ui.removeChild(component);
        }
        this.editor?.setText?.(savedText);
        if (this.editor) {
          this.ui.setFocus(this.editor);
        }
        this.ui.requestRender();
        resolve(result);
        try {
          component?.dispose?.();
        } catch {
          return;
        }
      };

      const theme = this.createExtensionUIContext?.().theme ?? {};
      Promise.resolve(factory(this.ui, theme, this.keybindings, close))
        .then((created) => {
          if (closed) return;
          component = created;
          const statusIndex = this.statusContainer ? this.ui.children.indexOf(this.statusContainer) : -1;
          if (statusIndex >= 0) {
            this.ui.children.splice(statusIndex, 0, component);
          } else {
            this.ui.children.push(component);
          }
          this.ui.setFocus(component);
          this.ui.requestRender();
        })
        .catch((error) => {
          if (!closed) reject(error);
        });
    });
  };
  proto[ABOVE_STATUS_PATCHED] = true;
}

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
    truncateToWidth(`还有 ${wrapped.length - maxLines} 行未显示`, bodyWidth),
  ];
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

  installAboveStatusPlacement();

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
  }, { placement: "aboveStatus" });
}
