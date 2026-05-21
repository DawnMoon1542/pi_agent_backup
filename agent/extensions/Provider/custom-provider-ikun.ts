import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readProviderEnv } from "./env";

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("ikun", {
    baseUrl: readProviderEnv("IKUN_BASE_URL"),
    apiKey: readProviderEnv("IKUN_API_KEY"),
    api: "anthropic-messages",
    models: [
      {
        id: "claude-opus-4-7",
        name: "Claude Opus 4.7",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 5.5, output: 27.5, cacheRead: 0.55, cacheWrite: 6.875 },
        contextWindow: 200_000,
        maxTokens: 128_000,
      },
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 5.5, output: 27.5, cacheRead: 0.55, cacheWrite: 6.875 },
        contextWindow: 200_000,
        maxTokens: 128_000,
      },
    ],
  });
}
