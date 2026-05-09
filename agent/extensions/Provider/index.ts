import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import newApiClaude from "./custom-provider-newapi-claude";
import newApiCodex from "./custom-provider-newapi-codex";
import newApiOpenai from "./custom-provider-newapi-openai";

export default async function (pi: ExtensionAPI) {
  await Promise.resolve(newApiClaude(pi));
  await Promise.resolve(newApiCodex(pi));
  await Promise.resolve(newApiOpenai(pi));
}
