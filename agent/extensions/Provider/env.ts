import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), ".env");

function parseEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function readProviderEnv(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  if (!existsSync(ENV_PATH)) {
    throw new Error(`Missing Provider .env file: ${ENV_PATH}`);
  }
  const value = parseEnv(readFileSync(ENV_PATH, "utf8"))[name];
  if (!value) {
    throw new Error(`Missing ${name} in ${ENV_PATH}`);
  }
  return value;
}
