import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import clearCommand from "./clear-command";
import retryPolicy from "./retry-policy";
import stats from "./stats";

export default async function (pi: ExtensionAPI) {
  await Promise.resolve(clearCommand(pi));
  await Promise.resolve(retryPolicy(pi));
  await Promise.resolve(stats(pi));
}
