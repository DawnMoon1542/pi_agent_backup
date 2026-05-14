import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import hideThinkingDefault from "./hide-thinking-default";
import statusLine from "./status-line";
import suppressThinkingStatus from "./suppress-thinking-status";
import toolDisplayExtension from "./pi-tool-display/src/index";

export default async function (pi: ExtensionAPI) {
  await Promise.resolve(hideThinkingDefault(pi));
  await Promise.resolve(statusLine(pi));
  await Promise.resolve(suppressThinkingStatus(pi));
  toolDisplayExtension(pi);
}
