import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readProviderEnv } from "./env";

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("new-api-claude", {
    baseUrl: "http://192.168.22.2:11451",
    apiKey: readProviderEnv("NEWAPI_API_KEY"),
    api: "anthropic-messages",
    models: [
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 5.0, output: 25.0, cacheRead: 0.5, cacheWrite: 6.25 },
        contextWindow: 200_000,
        maxTokens: 128_000,
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
        contextWindow: 200_000,
        maxTokens: 128_000,
      },
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
