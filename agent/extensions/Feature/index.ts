import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import askUserQuestions from "./ask-user-questions";
import clearCommand from "./clear-command";
import formFilling from "./form-filling";
import retryPolicy from "./retry-policy";
import skillDollarReference from "./skill-dollar-reference";
import stats from "./stats";
import rtkOptimizer from "./pi-rtk-optimizer/src/index";
import piRewind from "./pi-rewind/src/index";
import piSubagents from "./pi-subagents/src/index";

export default async function (pi: ExtensionAPI) {
  await Promise.resolve(askUserQuestions(pi));
  await Promise.resolve(clearCommand(pi));
  await Promise.resolve(formFilling(pi));
  await Promise.resolve(retryPolicy(pi));
  await Promise.resolve(skillDollarReference(pi));
  await Promise.resolve(stats(pi));
  rtkOptimizer(pi);
  piRewind(pi);
  piSubagents(pi);
}
