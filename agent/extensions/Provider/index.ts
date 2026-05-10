import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import newApiClaude from "./custom-provider-newapi-claude";
import newApiCodex from "./custom-provider-newapi-codex";
import newApiOpenai from "./custom-provider-newapi-openai";
import personalDpsk from "./custom-provider-personal-dpsk";
import personalMimo from "./custom-provider-personal-mimo";

export default async function (pi: ExtensionAPI) {
  await Promise.resolve(newApiClaude(pi));
  await Promise.resolve(newApiCodex(pi));
  await Promise.resolve(newApiOpenai(pi));
  await Promise.resolve(personalDpsk(pi));
  await Promise.resolve(personalMimo(pi));
}
