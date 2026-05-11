// @name: 隐藏重复 Thinking 状态
// @category: ui
// @description: 通过扩展屏蔽 Ctrl+T 产生的 Thinking blocks 状态行，只保留 hidden thinking label

import { InteractiveMode, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PATCHED = Symbol.for("pi.extensions.suppress-thinking-status.patched");
const ORIGINAL_SHOW_STATUS = Symbol.for("pi.extensions.suppress-thinking-status.originalShowStatus");

type PatchablePrototype = {
  showStatus?: (message: string) => void;
  [PATCHED]?: boolean;
  [ORIGINAL_SHOW_STATUS]?: (message: string) => void;
};

function patchThinkingStatus(): void {
  const proto = InteractiveMode.prototype as PatchablePrototype;
  if (proto[PATCHED]) return;

  const original = proto.showStatus;
  if (typeof original !== "function") return;

  proto[ORIGINAL_SHOW_STATUS] = original;
  proto.showStatus = function patchedShowStatus(this: unknown, message: string): void {
    if (typeof message === "string" && message.startsWith("Thinking blocks:")) return;
    return original.call(this, message);
  };
  proto[PATCHED] = true;
}

export default function (_pi: ExtensionAPI) {
  patchThinkingStatus();
}
