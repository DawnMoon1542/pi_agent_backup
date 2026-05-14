import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  fuzzyFilter,
  matchesKey,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

const MAX_SUGGESTIONS = 20;
const SKILL_COMMAND_PREFIX = "skill:";
const DOLLAR_SKILL_MESSAGE_TYPE = "dollar-skill-references";
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

type SourceInfoLike = {
  path: string;
  baseDir?: string;
};

type SkillCommandLike = {
  name: string;
  description?: string;
  source: string;
  sourceInfo: SourceInfoLike;
};

type SkillLike = {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
};

type PrivateAutocompleteEditor = {
  tryTriggerAutocomplete?: () => void;
};

type EditorInternalState = {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
};

type EditorInternals = {
  state: EditorInternalState;
  pushUndoSnapshot: () => void;
  setCursorCol: (col: number) => void;
  onChange?: (text: string) => void;
  historyIndex: number;
  lastAction: unknown;
  cancelAutocomplete: () => void;
  keybindings?: { matches: (data: string, action: string) => boolean };
};

type DollarToken = {
  prefix: string;
  query: string;
};

function isDollarInput(data: string): boolean {
  return data === "$" || matchesKey(data, "$") || matchesKey(data, "shift+4");
}

function isBackspaceInput(data: string, keybindings?: { matches: (data: string, action: string) => boolean }): boolean {
  if (keybindings?.matches(data, "tui.editor.deleteCharBackward")) {
    return true;
  }
  return matchesKey(data, "backspace") || matchesKey(data, "shift+backspace");
}

type SkillRefSpan = {
  start: number;
  end: number;
};

function findSkillRefSpanAtCursor(line: string, cursorCol: number): SkillRefSpan | undefined {
  const pattern = /\$skill:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?/g;
  let match = pattern.exec(line);

  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    if (cursorCol > start && cursorCol <= end) {
      return { start, end };
    }
    match = pattern.exec(line);
  }

  return undefined;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractDollarToken(textBeforeCursor: string): DollarToken | undefined {
  const dollarIndex = textBeforeCursor.lastIndexOf("$");
  if (dollarIndex < 0) {
    return undefined;
  }

  const rawQuery = textBeforeCursor.slice(dollarIndex + 1);
  if (!/^[a-z0-9:-]*$/.test(rawQuery)) {
    return undefined;
  }

  if (rawQuery === "" || "skill:".startsWith(rawQuery)) {
    return {
      prefix: textBeforeCursor.slice(dollarIndex),
      query: "",
    };
  }

  if (rawQuery.startsWith(SKILL_COMMAND_PREFIX)) {
    return {
      prefix: textBeforeCursor.slice(dollarIndex),
      query: rawQuery.slice(SKILL_COMMAND_PREFIX.length),
    };
  }

  // Allow fuzzy matching without the skill: prefix
  // e.g. $br -> fuzzy match against skill names with query "br"
  return {
    prefix: textBeforeCursor.slice(dollarIndex),
    query: rawQuery,
  };
}

function extractSkillReferenceNames(text: string): string[] {
  const names: string[] = [];
  const pattern = /(^|[^A-Za-z0-9_$:-])\$skill:([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)(?=$|[^A-Za-z0-9-])/g;
  let match = pattern.exec(text);

  while (match) {
    const name = match[2];
    if (name && SKILL_NAME_PATTERN.test(name)) {
      names.push(name);
    }
    match = pattern.exec(text);
  }

  return names;
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function getSkillCommands(pi: ExtensionAPI): SkillCommandLike[] {
  return pi
    .getCommands()
    .filter((command): command is SkillCommandLike => {
      return command.source === "skill" && command.name.startsWith(SKILL_COMMAND_PREFIX);
    });
}

function skillNameFromCommand(commandName: string): string {
  return commandName.slice(SKILL_COMMAND_PREFIX.length);
}

function formatSkillCompletionItem(command: SkillCommandLike): AutocompleteItem {
  return {
    value: `$${command.name}`,
    label: `$${command.name}`,
    description: command.description,
  };
}

function filterSkillCompletionItems(commands: SkillCommandLike[], query: string): AutocompleteItem[] {
  const candidates = commands.map((command) => ({
    command,
    skillName: skillNameFromCommand(command.name),
  }));

  if (!query) {
    return candidates.slice(0, MAX_SUGGESTIONS).map((item) => formatSkillCompletionItem(item.command));
  }

  return fuzzyFilter(candidates, query, (item) => item.skillName)
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => formatSkillCompletionItem(item.command));
}

function filterSlashSkillSuggestions(
  suggestions: AutocompleteSuggestions | null,
  lines: string[],
  cursorLine: number,
  cursorCol: number,
): AutocompleteSuggestions | null {
  if (!suggestions || !suggestions.prefix.startsWith("/")) {
    return suggestions;
  }

  const currentLine = lines[cursorLine] ?? "";
  const textBeforeCursor = currentLine.slice(0, cursorCol).trimStart();
  if (!textBeforeCursor.startsWith("/") || textBeforeCursor.includes(" ")) {
    return suggestions;
  }

  const items = suggestions.items.filter((item) => !item.value.startsWith(SKILL_COMMAND_PREFIX));
  return items.length > 0 ? { ...suggestions, items } : null;
}

function applyDollarCompletion(
  lines: string[],
  cursorLine: number,
  cursorCol: number,
  item: AutocompleteItem,
  prefix: string,
): { lines: string[]; cursorLine: number; cursorCol: number } {
  const currentLine = lines[cursorLine] ?? "";
  const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
  const afterCursor = currentLine.slice(cursorCol);
  const suffix = afterCursor.length === 0 ? " " : "";
  const nextLine = `${beforePrefix}${item.value}${suffix}${afterCursor}`;
  const nextLines = [...lines];
  nextLines[cursorLine] = nextLine;

  return {
    lines: nextLines,
    cursorLine,
    cursorCol: beforePrefix.length + item.value.length + suffix.length,
  };
}

function createDollarSkillAutocompleteProvider(pi: ExtensionAPI, current: AutocompleteProvider): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      const dollarToken = extractDollarToken(textBeforeCursor);

      if (dollarToken) {
        const items = filterSkillCompletionItems(getSkillCommands(pi), dollarToken.query);
        if (options.signal.aborted || items.length === 0) {
          return null;
        }
        return {
          prefix: dollarToken.prefix,
          items,
        };
      }

      const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
      return filterSlashSkillSuggestions(suggestions, lines, cursorLine, cursorCol);
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      if (prefix.startsWith("$")) {
        return applyDollarCompletion(lines, cursorLine, cursorCol, item, prefix);
      }
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      if (extractDollarToken(textBeforeCursor)) {
        return true;
      }
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

function buildSkillBlock(skill: SkillLike): string {
  const content = readFileSync(skill.filePath, "utf-8");
  const body = stripFrontmatter(content).trim();
  const location = escapeXmlAttribute(skill.filePath);
  const name = escapeXmlAttribute(skill.name);

  return `<skill name="${name}" location="${location}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

function resolveSkillBaseDir(command: SkillCommandLike): string {
  return command.sourceInfo.baseDir ?? dirname(command.sourceInfo.path);
}

function skillFromCommand(command: SkillCommandLike): SkillLike {
  return {
    name: skillNameFromCommand(command.name),
    description: command.description ?? "",
    filePath: command.sourceInfo.path,
    baseDir: resolveSkillBaseDir(command),
  };
}

function getAvailableSkills(pi: ExtensionAPI, eventSkills: readonly SkillLike[] | undefined): Map<string, SkillLike> {
  const skills = new Map<string, SkillLike>();

  for (const skill of eventSkills ?? []) {
    skills.set(skill.name, skill);
  }

  for (const command of getSkillCommands(pi)) {
    const name = skillNameFromCommand(command.name);
    if (!skills.has(name)) {
      skills.set(name, skillFromCommand(command));
    }
  }

  return skills;
}

class DollarSkillEditor extends CustomEditor {
  handleInput(data: string): void {
    const internals = this as unknown as EditorInternals;
    const kb = internals.keybindings;

    if (isBackspaceInput(data, kb)) {
      const { lines, cursorLine, cursorCol } = internals.state;
      const currentLine = lines[cursorLine] ?? "";
      const span = findSkillRefSpanAtCursor(currentLine, cursorCol);

      if (span) {
        internals.cancelAutocomplete();
        internals.pushUndoSnapshot();
        internals.historyIndex = -1;
        internals.lastAction = null;

        const before = currentLine.slice(0, span.start);
        const after = currentLine.slice(span.end);
        const trimmedAfter = after.startsWith(" ") ? after.slice(1) : after;
        internals.state.lines[cursorLine] = before + trimmedAfter;
        internals.setCursorCol(span.start);

        if (internals.onChange) {
          internals.onChange(this.getText());
        }
        return;
      }
    }

    super.handleInput(data);

    if (!isDollarInput(data)) {
      return;
    }

    const editor = this as unknown as PrivateAutocompleteEditor;
    if (typeof editor.tryTriggerAutocomplete === "function") {
      editor.tryTriggerAutocomplete.call(this);
      return;
    }

    super.handleInput("\t");
  }
}

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) => createDollarSkillAutocompleteProvider(pi, current));
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new DollarSkillEditor(tui, theme, keybindings));
  });

  pi.on("before_agent_start", (event, ctx) => {
    const referencedNames = uniqueInOrder(extractSkillReferenceNames(event.prompt));
    if (referencedNames.length === 0) {
      return undefined;
    }

    const skills = getAvailableSkills(pi, event.systemPromptOptions.skills as readonly SkillLike[] | undefined);
    const referencedSkills = referencedNames
      .map((name) => skills.get(name))
      .filter((skill): skill is SkillLike => Boolean(skill));

    if (referencedSkills.length === 0) {
      return undefined;
    }

    const blocks: string[] = [];
    const failed: string[] = [];

    for (const skill of referencedSkills) {
      try {
        blocks.push(buildSkillBlock(skill));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failed.push(`${skill.name}: ${reason}`);
      }
    }

    if (failed.length > 0 && ctx.hasUI) {
      ctx.ui.notify(`Failed to load referenced skill(s): ${failed.join("; ")}`, "warning");
    }

    if (blocks.length === 0) {
      return undefined;
    }

    const content = [
      "The user referenced the following skills with $skill:name syntax. Use these skill instructions as additional context for this turn. The visible user prompt remains unchanged.",
      "",
      blocks.join("\n\n"),
    ].join("\n");

    return {
      message: {
        customType: DOLLAR_SKILL_MESSAGE_TYPE,
        content,
        display: false,
        details: {
          referencedSkills: referencedSkills.map((skill) => skill.name),
        },
      },
    };
  });
}
