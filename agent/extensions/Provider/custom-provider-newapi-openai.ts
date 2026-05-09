import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readProviderEnv } from "./env";

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("new-api-openai", {
    baseUrl: "http://192.168.22.2:11451/v1",
    apiKey: readProviderEnv("NEWAPI_API_KEY"),
    api: "openai-completions",
    models: [
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 2.0, output: 12.0, cacheRead: 0.2, cacheWrite: 2.0 },
        contextWindow: 1_048_576,
        maxTokens: 65_536,
      },
    ],
  });
}
