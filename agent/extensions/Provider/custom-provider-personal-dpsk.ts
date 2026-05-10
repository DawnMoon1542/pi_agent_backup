import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readProviderEnv } from "./env";

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("personal-dpsk", {
    baseUrl: "https://api.deepseek.com/anthropic",
    apiKey: readProviderEnv("DEEPSEEK_API_KEY"),
    api: "anthropic-messages",
    models: [
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 1.67, output: 3.33, cacheRead: 0.014, cacheWrite: 1.67 },
        contextWindow: 1_048_576,
        maxTokens: 384_000,
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        reasoning: false,
        input: ["text"],
        cost: { input: 0.14, output: 0.28, cacheRead: 0.003, cacheWrite: 0.14 },
        contextWindow: 1_048_576,
        maxTokens: 384_000,
      },
    ],
  });
}
