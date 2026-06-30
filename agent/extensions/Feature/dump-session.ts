import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("dump", {
    description: "将当前 session 的完整 JSONL 对话记录保存到工作目录",
    handler: async (_args, ctx) => {
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      const now = new Date();
      const ts = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
      ].join("-");
      const filename = `pi-session-${ts}.jsonl`;
      const dest = path.join(ctx.cwd, filename);

      if (sessionFile && fs.existsSync(sessionFile)) {
        fs.copyFileSync(sessionFile, dest);
      } else {
        const entries = ctx.sessionManager.getEntries();
        const lines = entries.map((entry: unknown) => JSON.stringify(entry)).join("\n") + "\n";
        fs.writeFileSync(dest, lines, "utf-8");
      }

      ctx.ui.notify(`Session dumped: ${filename}`, "info");
    },
  });
}
