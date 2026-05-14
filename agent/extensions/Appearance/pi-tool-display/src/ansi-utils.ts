const ANSI_SGR_PATTERN = /\x1b\[([0-9;]*)m/g;
const STYLE_RESET_PARAMS = [39, 22, 23, 24, 25, 27, 28, 29, 59] as const;

export { ANSI_SGR_PATTERN, STYLE_RESET_PARAMS };

export function toSgrParams(rawParams: string): number[] {
  if (!rawParams.trim()) {
    return [0];
  }

  const parsed = rawParams
    .split(";")
    .map((token) => Number.parseInt(token, 10))
    .filter((value) => Number.isFinite(value));

  return parsed.length > 0 ? parsed : [];
}

export function stripBackgroundSgrParams(params: readonly number[]): number[] {
  const sanitized: number[] = [];

  for (let index = 0; index < params.length; index++) {
    const param = params[index] ?? 0;

    if (param === 0) {
      sanitized.push(...STYLE_RESET_PARAMS);
      continue;
    }

    if (param === 49) {
      continue;
    }

    if ((param >= 40 && param <= 47) || (param >= 100 && param <= 107)) {
      continue;
    }

    if (param === 48) {
      const colorMode = params[index + 1];
      if (colorMode === 5) {
        index += 2;
        continue;
      }
      if (colorMode === 2) {
        index += 4;
        continue;
      }
      continue;
    }

    sanitized.push(param);
  }

  return sanitized;
}

export function sanitizeAnsiForThemedOutput(text: string): string {
  if (!text || !text.includes("\x1b[")) {
    return text;
  }

  return text.replace(ANSI_SGR_PATTERN, (_sequence, rawParams: string) => {
    const parsed = toSgrParams(rawParams);
    if (parsed.length === 0) {
      return "";
    }

    const sanitized = stripBackgroundSgrParams(parsed);
    if (sanitized.length === 0) {
      return "";
    }

    return `\x1b[${sanitized.join(";")}m`;
  });
}
