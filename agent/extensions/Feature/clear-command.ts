// @name: Clear 命令
// @category: ui
// @description: 注册 /clear，功能等同 /new，开启一个新会话

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("clear", {
    description: "清空当前上下文并开启新会话（等同 /new）",
    handler: async (_args, ctx) => {
      await ctx.newSession();
    },
  });
}
