import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toRecord } from "./tool-metadata.js";

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEBUG_CONFIG_FILE = join(EXTENSION_ROOT, "config.json");
const DEBUG_DIR = join(EXTENSION_ROOT, "debug");
const DEBUG_LOG_FILE = join(DEBUG_DIR, "debug.log");

function isDebugEnabled(): boolean {
  try {
    if (!existsSync(DEBUG_CONFIG_FILE)) {
      return false;
    }

    const rawConfig = JSON.parse(readFileSync(DEBUG_CONFIG_FILE, "utf8")) as unknown;
    return toRecord(rawConfig).debug === true;
  } catch {
    return false;
  }
}

export function logToolDisplayDebug(message: string, error?: unknown): void {
  if (!isDebugEnabled()) {
    return;
  }

  try {
    mkdirSync(DEBUG_DIR, { recursive: true });
    const errorText = error instanceof Error
      ? `${error.name}: ${error.message}`
      : error === undefined
        ? ""
        : String(error);
    const suffix = errorText ? ` ${errorText}` : "";
    appendFileSync(DEBUG_LOG_FILE, `${new Date().toISOString()} ${message}${suffix}\n`, "utf8");
  } catch {
    // Debug logging must never affect extension behavior.
  }
}
