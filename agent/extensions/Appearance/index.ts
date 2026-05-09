import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import bashLastThreeLines from "./bash-last-three-lines";
import editProgress from "./edit-progress";
import hideThinkingDefault from "./hide-thinking-default";
import readHideContent from "./read-hide-content";
import statusLine from "./status-line";
import suppressThinkingStatus from "./suppress-thinking-status";
import writeLastThreeLines from "./write-last-three-lines";

export default async function (pi: ExtensionAPI) {
  await Promise.resolve(bashLastThreeLines(pi));
  await Promise.resolve(editProgress(pi));
  await Promise.resolve(hideThinkingDefault(pi));
  await Promise.resolve(readHideContent(pi));
  await Promise.resolve(statusLine(pi));
  await Promise.resolve(suppressThinkingStatus(pi));
  await Promise.resolve(writeLastThreeLines(pi));
}
