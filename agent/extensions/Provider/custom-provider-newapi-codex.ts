import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readProviderEnv } from "./env";

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("new-api-codex", {
    baseUrl: "http://192.168.22.2:11451/v1",
    apiKey: readProviderEnv("NEWAPI_API_KEY"),
    api: "openai-responses",
    models: [
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 5.0, output: 30.0, cacheRead: 0.5, cacheWrite: 5.0 },
        contextWindow: 1_050_000,
        maxTokens: 128_000,
      },
    ],
  });
}
