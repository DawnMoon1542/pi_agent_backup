// @name: 系统提示注入
// @category: agent
// @description: 在每次 AI 响应前注入额外的系统提示指令(如角色设定、输出格式要求)

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPT_DIR = dirname(fileURLToPath(import.meta.url));

function loadExtraInstructions(): string {
  const files = readdirSync(PROMPT_DIR)
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b, "en"));

  const sections = files
    .map((name) => readFileSync(join(PROMPT_DIR, name), "utf-8").trim())
    .filter((content) => content.length > 0);

  if (sections.length === 0) {
    return "";
  }

  return ["<SYSTEM_PROMPT>", ...sections, "</SYSTEM_PROMPT>"].join("\n\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, _ctx) => {
    const extraInstructions = loadExtraInstructions();
    if (!extraInstructions) {
      return;
    }
    return {
      systemPrompt: event.systemPrompt + "\n\n" + extraInstructions,
    };
  });
}
