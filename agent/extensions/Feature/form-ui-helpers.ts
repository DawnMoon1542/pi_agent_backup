import { InteractiveMode } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, decodeKittyPrintable, Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const ABOVE_STATUS_PATCHED = Symbol.for("pi.extensions.feature-user-tools.aboveStatusPatched.v1");
const ABOVE_STATUS_ORIGINAL = Symbol.for("pi.extensions.feature-user-tools.originalShowExtensionCustom.v1");

export type UserToolTheme = {
  fg?: (name: string, text: string) => string;
  bg?: (name: string, text: string) => string;
  bold?: (text: string) => string;
};

export type UserToolTui = {
  requestRender?: () => void;
};

export type UserToolComponent = {
  render: (width: number) => string[];
  handleInput?: (data: string) => void;
  invalidate: () => void;
  dispose?: () => void;
};

type PatchableInteractiveModePrototype = {
  showExtensionCustom?: (factory: unknown, options?: { overlay?: boolean; placement?: string }) => Promise<unknown>;
  [ABOVE_STATUS_PATCHED]?: boolean;
  [ABOVE_STATUS_ORIGINAL]?: (factory: unknown, options?: { overlay?: boolean; placement?: string }) => Promise<unknown>;
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
  createExtensionUIContext?: () => { theme: UserToolTheme };
};

type CustomContext = {
  hasUI?: boolean;
  ui: {
    custom?: <T>(
      factory: (tui: UserToolTui, theme: UserToolTheme, keybindings: unknown, done: (result: T) => void) => UserToolComponent,
      options?: { overlay?: boolean; placement?: "aboveStatus" }
    ) => Promise<T>;
  };
};

export type CustomFactory<T> = (
  tui: UserToolTui,
  theme: UserToolTheme,
  keybindings: unknown,
  done: (result: T) => void
) => UserToolComponent;

function installAboveStatusPlacement(): void {
  const proto = InteractiveMode.prototype as PatchableInteractiveModePrototype;
  if (proto[ABOVE_STATUS_PATCHED]) return;

  const original = proto.showExtensionCustom;
  if (typeof original !== "function") return;

  proto[ABOVE_STATUS_ORIGINAL] = original;
  proto.showExtensionCustom = function patchedShowExtensionCustom(
    this: InteractiveModeInstance,
    factory: (tui: unknown, theme: UserToolTheme, keybindings: unknown, done: (result: unknown) => void) => UserToolComponent | Promise<UserToolComponent>,
    options?: { overlay?: boolean; placement?: string }
  ): Promise<unknown> {
    if (options?.placement !== "aboveStatus") {
      return original.call(this, factory, options);
    }

    const savedText = this.editor?.getText?.() ?? "";
    return new Promise((resolve, reject) => {
      let component: UserToolComponent | undefined;
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

export async function customAboveStatus<T>(ctx: CustomContext, factory: CustomFactory<T>): Promise<T> {
  installAboveStatusPlacement();
  if (!ctx.hasUI || typeof ctx.ui.custom !== "function") {
    throw new Error("Interactive UI is not available");
  }
  return ctx.ui.custom<T>(factory, { placement: "aboveStatus" });
}

export function fg(theme: UserToolTheme, name: string, text: string): string {
  return theme.fg ? theme.fg(name, text) : text;
}

export function bg(theme: UserToolTheme, name: string, text: string): string {
  return theme.bg ? theme.bg(name, text) : text;
}

export function bold(theme: UserToolTheme, text: string): string {
  return theme.bold ? theme.bold(text) : text;
}

export function pushLine(lines: string[], width: number, text: string): void {
  lines.push(truncateToWidth(text, width));
}

export function pushWrapped(lines: string[], width: number, prefix: string, text: string): void {
  const bodyWidth = Math.max(12, width - prefix.length);
  const wrapped = wrapTextWithAnsi(text.replace(/\r/g, ""), bodyWidth);
  if (wrapped.length === 0) {
    pushLine(lines, width, prefix);
    return;
  }
  for (const line of wrapped) {
    pushLine(lines, width, `${prefix}${line}`);
  }
}

export function separator(theme: UserToolTheme, width: number): string {
  return fg(theme, "dim", "─".repeat(Math.max(0, Math.min(width, 96))));
}

export function focusPrefix(theme: UserToolTheme, focused: boolean): string {
  return focused ? fg(theme, "accent", "> ") : "  ";
}

export function selectedMark(selected: boolean): string {
  return selected ? "[x]" : "[ ]";
}

export function enabledButton(theme: UserToolTheme, focused: boolean, label: string): string {
  const raw = `[ ${label} ]`;
  const styled = focused ? bg(theme, "selectedBg", fg(theme, "success", bold(theme, raw))) : fg(theme, "success", raw);
  return `${focusPrefix(theme, focused)}${styled}`;
}

export function disabledButton(theme: UserToolTheme, focused: boolean, label: string): string {
  const raw = `[ ${label} ]`;
  const styled = focused ? bg(theme, "selectedBg", fg(theme, "dim", raw)) : fg(theme, "dim", raw);
  return `${focusPrefix(theme, focused)}${styled}`;
}

export function decodeTextInput(data: string): string | undefined {
  if (matchesKey(data, Key.space)) return " ";
  const decoded = decodeKittyPrintable(data);
  if (decoded !== undefined && decoded.length > 0) return decoded;
  if (data.length === 1) {
    const code = data.charCodeAt(0);
    if (code >= 32 && code !== 127) return data;
  }
  return undefined;
}

export function removeLastCharacter(text: string): string {
  const chars = Array.from(text);
  chars.pop();
  return chars.join("");
}

export function renderTextBox(theme: UserToolTheme, width: number, focused: boolean, value: string, placeholder: string, cursor?: number): string[] {
  const boxWidth = Math.max(16, width - 6);
  const innerWidth = Math.max(8, boxWidth - 4);
  const top = `${focusPrefix(theme, focused)}┌${"─".repeat(Math.max(0, boxWidth - 2))}┐`;
  const bottom = `  └${"─".repeat(Math.max(0, boxWidth - 2))}┘`;
  const content = value.length > 0 ? value : placeholder;
  const colorName = value.length > 0 ? "text" : "dim";
  const logicalLines = content.replace(/\r/g, "").split("\n");
  const rendered: string[] = [truncateToWidth(top, width)];
  const cursorPosition = value.length > 0 ? Math.max(0, Math.min(Array.from(value).length, cursor ?? Array.from(value).length)) : 0;
  let consumed = 0;

  for (const logicalLine of logicalLines) {
    const lineChars = Array.from(logicalLine);
    const lineStart = consumed;
    const lineEnd = lineStart + lineChars.length;
    const cursorOnLine = focused && cursorPosition >= lineStart && cursorPosition <= lineEnd;
    let visible: string;

    if (cursorOnLine) {
      const localCursor = Math.max(0, Math.min(lineChars.length, cursorPosition - lineStart));
      const before = lineChars.slice(0, localCursor).join("");
      const atCursor = lineChars[localCursor] ?? " ";
      const after = lineChars.slice(localCursor + (lineChars[localCursor] === undefined ? 0 : 1)).join("");
      visible = `${fg(theme, colorName, before)}${CURSOR_MARKER}\x1b[7m${fg(theme, colorName, atCursor)}\x1b[27m${fg(theme, colorName, after)}`;
    } else {
      visible = fg(theme, colorName, logicalLine);
    }

    const truncated = truncateToWidth(visible, innerWidth, "");
    const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
    rendered.push(truncateToWidth(`  │ ${truncated}${padding} │`, width));
    consumed = lineEnd + 1;
  }

  rendered.push(truncateToWidth(bottom, width));
  return rendered;
}
