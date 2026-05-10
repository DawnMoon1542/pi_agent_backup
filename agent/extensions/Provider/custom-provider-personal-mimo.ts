import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readProviderEnv } from "./env";

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("personal-mimo", {
    baseUrl: "https://token-plan-sgp.xiaomimimo.com/anthropic",
    apiKey: readProviderEnv("MIMO_API_KEY"),
    api: "anthropic-messages",
    models: [
      {
        id: "mimo-v2.5-pro",
        name: "MiMo V2.5 Pro",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 1.0, output: 3.0 },
        contextWindow: 1_000_000,
        maxTokens: 200_000,
      },
    ],
  });
}
