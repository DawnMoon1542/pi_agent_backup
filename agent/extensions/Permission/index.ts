import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import permissionGate from "./permission-gate";
import sensitiveFileGate from "./sensitive-file-gate";

export default async function (pi: ExtensionAPI) {
  await Promise.resolve(permissionGate(pi));
  await Promise.resolve(sensitiveFileGate(pi));
}
