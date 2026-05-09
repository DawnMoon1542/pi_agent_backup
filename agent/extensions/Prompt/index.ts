import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import systemPrompt from "./system-prompt";

export default async function (pi: ExtensionAPI) {
  await Promise.resolve(systemPrompt(pi));
}
