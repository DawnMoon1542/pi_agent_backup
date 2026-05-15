// @name: FormFilling tool
// @category: ui
// @description: 注册 FormFilling 工具，通过自定义 TUI 让用户填写 2-25 个元素的表单

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Key, matchesKey, Text, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  bg,
  bold,
  customAboveStatus,
  decodeTextInput,
  disabledButton,
  enabledButton,
  fg,
  focusPrefix,
  pushLine,
  pushWrapped,
  renderTextBox,
  selectedMark,
  separator,
  type UserToolTheme,
  type UserToolTui,
} from "./form-ui-helpers";

type FormOption = {
  id: string;
  label: string;
};

type FormFieldType = "boolean" | "select" | "multiselect" | "input" | "text";

type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  options?: FormOption[];
  allowEmpty?: boolean;
  placeholder?: string;
  content?: string;
};

type FormFillingParams = {
  title: string;
  description?: string;
  fields: FormField[];
};

type FormValue =
  | { fieldId: string; type: "boolean"; value: boolean }
  | { fieldId: string; type: "select"; optionId: string }
  | { fieldId: string; type: "multiselect"; optionIds: string[] }
  | { fieldId: string; type: "input"; value: string };

type FormFillingResult = {
  cancelled: boolean;
  values: FormValue[];
};

type FieldRuntimeState = {
  optionIndex: number;
  booleanValue: boolean | null;
  selectOptionId: string | null;
  multiselectOptionIds: Set<string>;
  inputValue: string;
  inputCursor: number;
};

const FormOptionSchema = Type.Object({
  id: Type.String({ description: "Stable option id returned to the model when selected" }),
  label: Type.String({ description: "Human-readable option text shown to the user" }),
});

const FieldTypeEnum = StringEnum(["boolean", "select", "multiselect", "input", "text"] as const);

const FormFieldSchema = Type.Object({
  id: Type.String({ description: "Stable field id returned with the value; text display elements still need a stable id" }),
  label: Type.String({ description: "Field label or short title" }),
  type: FieldTypeEnum,
  options: Type.Optional(Type.Array(FormOptionSchema, {
    minItems: 1,
    maxItems: 5,
    description: "One to five options for select and multiselect fields",
  })),
  allowEmpty: Type.Optional(Type.Boolean({ description: "Whether this field may be left empty; defaults to false. Ignored for text display elements." })),
  placeholder: Type.Optional(Type.String({ description: "Placeholder for input fields" })),
  content: Type.Optional(Type.String({ description: "Body text for text display elements" })),
});

const FormFillingParameters = Type.Object({
  title: Type.String({ description: "Form title" }),
  description: Type.Optional(Type.String({ description: "Optional form description shown below the title" })),
  fields: Type.Array(FormFieldSchema, {
    minItems: 2,
    maxItems: 25,
    description: "Two to twenty-five form elements. Use type=input for fill-in fields and type=text for read-only explanatory text.",
  }),
});

function fieldAllowsEmpty(field: FormField): boolean {
  return field.allowEmpty === true || field.type === "text";
}

function textLength(text: string): number {
  return Array.from(text).length;
}

function insertAt(text: string, cursor: number, value: string): { text: string; cursor: number } {
  const chars = Array.from(text);
  const valueChars = Array.from(value);
  const safeCursor = Math.max(0, Math.min(chars.length, cursor));
  chars.splice(safeCursor, 0, ...valueChars);
  return { text: chars.join(""), cursor: safeCursor + valueChars.length };
}

function removeBefore(text: string, cursor: number): { text: string; cursor: number } {
  const chars = Array.from(text);
  const safeCursor = Math.max(0, Math.min(chars.length, cursor));
  if (safeCursor === 0) return { text, cursor: safeCursor };
  chars.splice(safeCursor - 1, 1);
  return { text: chars.join(""), cursor: safeCursor - 1 };
}

function removeAt(text: string, cursor: number): { text: string; cursor: number } {
  const chars = Array.from(text);
  const safeCursor = Math.max(0, Math.min(chars.length, cursor));
  if (safeCursor >= chars.length) return { text, cursor: safeCursor };
  chars.splice(safeCursor, 1);
  return { text: chars.join(""), cursor: safeCursor };
}

function validateParams(params: FormFillingParams): string | undefined {
  if (!params.title || !params.title.trim()) return "FormFilling requires a non-empty title.";
  if (!Array.isArray(params.fields) || params.fields.length < 2 || params.fields.length > 25) {
    return "FormFilling requires between 2 and 25 form elements.";
  }
  const seenFields = new Set<string>();
  for (const field of params.fields) {
    if (!field.id || !field.id.trim()) return "Every form element must have a non-empty id.";
    if (seenFields.has(field.id)) return `Duplicate form element id: ${field.id}`;
    seenFields.add(field.id);
    if (!field.label || !field.label.trim()) return `Form element ${field.id} must have a non-empty label.`;
    if (field.type === "select" || field.type === "multiselect") {
      if (!Array.isArray(field.options) || field.options.length < 1 || field.options.length > 5) {
        return `Form element ${field.id} must have between 1 and 5 options.`;
      }
      const seenOptions = new Set<string>();
      for (const option of field.options) {
        if (!option.id || !option.id.trim()) return `Form element ${field.id} has an option with an empty id.`;
        if (seenOptions.has(option.id)) return `Form element ${field.id} has duplicate option id: ${option.id}`;
        seenOptions.add(option.id);
      }
    }
  }
  return undefined;
}

function createRuntimeState(field: FormField): FieldRuntimeState {
  return {
    optionIndex: 0,
    booleanValue: null,
    selectOptionId: null,
    multiselectOptionIds: new Set<string>(),
    inputValue: "",
    inputCursor: 0,
  };
}

function fieldIsFilled(field: FormField, state: FieldRuntimeState): boolean {
  if (fieldAllowsEmpty(field)) return true;
  if (field.type === "boolean") return state.booleanValue !== null;
  if (field.type === "select") return state.selectOptionId !== null;
  if (field.type === "multiselect") return state.multiselectOptionIds.size > 0;
  if (field.type === "input") return state.inputValue.trim().length > 0;
  return true;
}

function fieldToValue(field: FormField, state: FieldRuntimeState): FormValue | undefined {
  if (field.type === "text") return undefined;
  if (field.type === "boolean") {
    if (state.booleanValue === null) return field.allowEmpty ? undefined : { fieldId: field.id, type: "boolean", value: false };
    return { fieldId: field.id, type: "boolean", value: state.booleanValue };
  }
  if (field.type === "select") {
    if (!state.selectOptionId) return undefined;
    return { fieldId: field.id, type: "select", optionId: state.selectOptionId };
  }
  if (field.type === "multiselect") {
    if (state.multiselectOptionIds.size === 0 && field.allowEmpty) return undefined;
    return { fieldId: field.id, type: "multiselect", optionIds: Array.from(state.multiselectOptionIds) };
  }
  if (field.type === "input") {
    if (state.inputValue.trim().length === 0 && field.allowEmpty) return undefined;
    return { fieldId: field.id, type: "input", value: state.inputValue };
  }
  return undefined;
}

function resultText(result: FormFillingResult): string {
  if (result.cancelled) return "User cancelled FormFilling. No form values were submitted.";
  return result.values
    .map((value) => {
      if (value.type === "boolean") return `${value.fieldId}: boolean=${value.value}`;
      if (value.type === "select") return `${value.fieldId}: option=${value.optionId}`;
      if (value.type === "multiselect") return `${value.fieldId}: options=${value.optionIds.join(",")}`;
      return `${value.fieldId}: input=${value.value}`;
    })
    .join("\n");
}

class FormFillingDialog {
  private states: FieldRuntimeState[];
  private focusFieldIndex: number;
  private submitFocused = false;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private params: FormFillingParams,
    private tui: UserToolTui,
    private theme: UserToolTheme,
    private done: (result: FormFillingResult) => void
  ) {
    this.states = this.params.fields.map(createRuntimeState);
    this.focusFieldIndex = this.firstInteractiveFieldIndex();
    if (this.focusFieldIndex < 0) this.submitFocused = true;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private refresh(): void {
    this.invalidate();
    this.tui.requestRender?.();
  }

  private firstInteractiveFieldIndex(): number {
    return this.params.fields.findIndex((field) => field.type !== "text");
  }

  private interactiveFieldIndices(): number[] {
    return this.params.fields
      .map((field, index) => ({ field, index }))
      .filter((item) => item.field.type !== "text")
      .map((item) => item.index);
  }

  private moveFocus(delta: number): void {
    const indices = this.interactiveFieldIndices();
    const sequence = [...indices, -1];
    if (sequence.length === 0) {
      this.submitFocused = true;
      this.refresh();
      return;
    }
    const current = this.submitFocused ? -1 : this.focusFieldIndex;
    const currentPosition = Math.max(0, sequence.indexOf(current));
    const nextPosition = (currentPosition + delta + sequence.length) % sequence.length;
    const next = sequence[nextPosition];
    this.submitFocused = next === -1;
    if (next !== -1) this.focusFieldIndex = next;
    this.refresh();
  }

  private allRequiredFilled(): boolean {
    return this.params.fields.every((field, index) => fieldIsFilled(field, this.states[index]));
  }

  private requiredProgress(): { filled: number; total: number } {
    let filled = 0;
    let total = 0;
    for (let i = 0; i < this.params.fields.length; i++) {
      const field = this.params.fields[i];
      if (fieldAllowsEmpty(field)) continue;
      total++;
      if (fieldIsFilled(field, this.states[i])) filled++;
    }
    return { filled, total };
  }

  private submitIfReady(): void {
    if (!this.allRequiredFilled()) return;
    const values = this.params.fields
      .map((field, index) => fieldToValue(field, this.states[index]))
      .filter((value): value is FormValue => value !== undefined);
    this.done({ cancelled: false, values });
  }

  private cancel(): void {
    this.done({ cancelled: true, values: [] });
  }

  private currentField(): FormField | undefined {
    return this.submitFocused ? undefined : this.params.fields[this.focusFieldIndex];
  }

  private currentState(): FieldRuntimeState | undefined {
    return this.submitFocused ? undefined : this.states[this.focusFieldIndex];
  }

  private currentOptions(): FormOption[] {
    return this.currentField()?.options ?? [];
  }

  private moveOption(delta: number): void {
    const field = this.currentField();
    const state = this.currentState();
    if (!field || !state) return;
    const optionCount = field.type === "boolean" ? 2 : this.currentOptions().length;
    if (optionCount <= 0) return;
    state.optionIndex = (state.optionIndex + delta + optionCount) % optionCount;
    this.refresh();
  }

  private chooseCurrentOption(): void {
    const field = this.currentField();
    const state = this.currentState();
    if (!field || !state) return;

    if (field.type === "boolean") {
      state.booleanValue = state.optionIndex === 0;
      this.refresh();
      return;
    }

    if (field.type === "select") {
      const option = this.currentOptions()[state.optionIndex];
      if (!option) return;
      state.selectOptionId = option.id;
      this.refresh();
      return;
    }

    if (field.type === "multiselect") {
      const option = this.currentOptions()[state.optionIndex];
      if (!option) return;
      if (state.multiselectOptionIds.has(option.id)) {
        state.multiselectOptionIds.delete(option.id);
      } else {
        state.multiselectOptionIds.add(option.id);
      }
      this.refresh();
    }
  }

  private handleInputField(data: string, field: FormField, state: FieldRuntimeState): boolean {
    if (field.type !== "input") return false;
    if (matchesKey(data, Key.left)) {
      state.inputCursor = Math.max(0, state.inputCursor - 1);
      this.refresh();
      return true;
    }
    if (matchesKey(data, Key.right)) {
      state.inputCursor = Math.min(textLength(state.inputValue), state.inputCursor + 1);
      this.refresh();
      return true;
    }
    if (matchesKey(data, Key.home)) {
      state.inputCursor = 0;
      this.refresh();
      return true;
    }
    if (matchesKey(data, Key.end)) {
      state.inputCursor = textLength(state.inputValue);
      this.refresh();
      return true;
    }
    if (matchesKey(data, Key.shift("enter"))) {
      const next = insertAt(state.inputValue, state.inputCursor, "\n");
      state.inputValue = next.text;
      state.inputCursor = next.cursor;
      this.refresh();
      return true;
    }
    if (matchesKey(data, Key.enter)) {
      if (field.allowEmpty || state.inputValue.trim().length > 0) {
        this.moveFocus(1);
      } else {
        this.refresh();
      }
      return true;
    }
    if (matchesKey(data, Key.backspace)) {
      const next = removeBefore(state.inputValue, state.inputCursor);
      state.inputValue = next.text;
      state.inputCursor = next.cursor;
      this.refresh();
      return true;
    }
    if (matchesKey(data, Key.delete)) {
      const next = removeAt(state.inputValue, state.inputCursor);
      state.inputValue = next.text;
      state.inputCursor = next.cursor;
      this.refresh();
      return true;
    }
    const printable = decodeTextInput(data);
    if (printable !== undefined) {
      const next = insertAt(state.inputValue, state.inputCursor, printable);
      state.inputValue = next.text;
      state.inputCursor = next.cursor;
      this.refresh();
      return true;
    }
    return false;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.cancel();
      return;
    }

    if (matchesKey(data, Key.up) || matchesKey(data, Key.shift("tab"))) {
      this.moveFocus(-1);
      return;
    }
    if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) {
      this.moveFocus(1);
      return;
    }

    if (this.submitFocused) {
      if (matchesKey(data, Key.enter)) this.submitIfReady();
      return;
    }

    const field = this.currentField();
    const state = this.currentState();
    if (!field || !state) return;

    if (this.handleInputField(data, field, state)) return;

    if (matchesKey(data, Key.left)) {
      this.moveOption(-1);
      return;
    }
    if (matchesKey(data, Key.right)) {
      this.moveOption(1);
      return;
    }

    if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
      this.chooseCurrentOption();
    }
  }

  private renderRequirementTag(field: FormField, state: FieldRuntimeState): string {
    if (fieldAllowsEmpty(field)) return fg(this.theme, "dim", "[optional]");
    if (fieldIsFilled(field, state)) return fg(this.theme, "success", "[required]");
    return fg(this.theme, "warning", "[required]");
  }

  private renderTypeTag(field: FormField): string {
    if (field.type === "input" || field.type === "text") return "";
    return fg(this.theme, "dim", `[${field.type}]`);
  }

  private renderFieldTitle(field: FormField): string {
    const typeTag = this.renderTypeTag(field);
    return typeTag ? `${typeTag} ${fg(this.theme, "accent", field.label)}` : fg(this.theme, "accent", field.label);
  }

  private radioMark(selected: boolean): string {
    return selected ? "(*)" : "( )";
  }

  private checkboxMark(selected: boolean): string {
    return selectedMark(selected);
  }

  private renderBooleanField(lines: string[], width: number, focused: boolean, state: FieldRuntimeState): void {
    const yesFocused = focused && state.optionIndex === 0;
    const noFocused = focused && state.optionIndex === 1;
    const yesSelected = state.booleanValue === true;
    const noSelected = state.booleanValue === false;
    const yesRaw = `${yesFocused ? ">" : " "} ${this.radioMark(yesSelected)} Yes`;
    const noRaw = `${noFocused ? ">" : " "} ${this.radioMark(noSelected)} No`;
    const yes = yesFocused ? bg(this.theme, "selectedBg", fg(this.theme, yesSelected ? "success" : "accent", yesRaw)) : fg(this.theme, yesSelected ? "success" : "text", yesRaw);
    const no = noFocused ? bg(this.theme, "selectedBg", fg(this.theme, noSelected ? "success" : "accent", noRaw)) : fg(this.theme, noSelected ? "success" : "text", noRaw);
    pushLine(lines, width, `  ${yes}   ${no}`);
  }

  private renderSelectField(lines: string[], width: number, focused: boolean, field: FormField, state: FieldRuntimeState): void {
    for (let index = 0; index < (field.options ?? []).length; index++) {
      const option = (field.options ?? [])[index];
      const itemFocused = focused && state.optionIndex === index;
      const selected = state.selectOptionId === option.id;
      const prefix = `${itemFocused ? ">" : " "} ${this.radioMark(selected)} `;
      const colorName = selected ? "success" : (itemFocused ? "accent" : "text");
      const styledPrefix = itemFocused
        ? bg(this.theme, "selectedBg", fg(this.theme, colorName, prefix))
        : fg(this.theme, colorName, prefix);
      const labelWidth = Math.max(12, width - 6 - visibleWidth(prefix));
      const wrapped = wrapTextWithAnsi(fg(this.theme, colorName, option.label), labelWidth);
      if (wrapped.length === 0) {
        const line = `  ${styledPrefix}`;
        lines.push(itemFocused ? bg(this.theme, "selectedBg", line) : line);
      } else {
        const firstLine = `  ${styledPrefix}${wrapped[0]}`;
        lines.push(itemFocused ? bg(this.theme, "selectedBg", firstLine) : firstLine);
        const continuationIndent = " ".repeat(2 + visibleWidth(prefix));
        for (let i = 1; i < wrapped.length; i++) {
          const contLine = `${continuationIndent}${wrapped[i]}`;
          lines.push(itemFocused ? bg(this.theme, "selectedBg", contLine) : contLine);
        }
      }
    }
  }

  private renderMultiselectField(lines: string[], width: number, focused: boolean, field: FormField, state: FieldRuntimeState): void {
    for (let index = 0; index < (field.options ?? []).length; index++) {
      const option = (field.options ?? [])[index];
      const itemFocused = focused && state.optionIndex === index;
      const selected = state.multiselectOptionIds.has(option.id);
      const prefix = `${itemFocused ? ">" : " "} ${this.checkboxMark(selected)} `;
      const colorName = selected ? "success" : (itemFocused ? "accent" : "text");
      const styledPrefix = itemFocused
        ? bg(this.theme, "selectedBg", fg(this.theme, colorName, prefix))
        : fg(this.theme, colorName, prefix);
      const labelWidth = Math.max(12, width - 6 - visibleWidth(prefix));
      const wrapped = wrapTextWithAnsi(fg(this.theme, colorName, option.label), labelWidth);
      if (wrapped.length === 0) {
        const line = `  ${styledPrefix}`;
        lines.push(itemFocused ? bg(this.theme, "selectedBg", line) : line);
      } else {
        const firstLine = `  ${styledPrefix}${wrapped[0]}`;
        lines.push(itemFocused ? bg(this.theme, "selectedBg", firstLine) : firstLine);
        const continuationIndent = " ".repeat(2 + visibleWidth(prefix));
        for (let i = 1; i < wrapped.length; i++) {
          const contLine = `${continuationIndent}${wrapped[i]}`;
          lines.push(itemFocused ? bg(this.theme, "selectedBg", contLine) : contLine);
        }
      }
    }
  }

  private renderField(lines: string[], width: number, field: FormField, index: number): void {
    const state = this.states[index];
    const focused = !this.submitFocused && this.focusFieldIndex === index;

    if (field.type === "text") {
      pushLine(lines, width, fg(this.theme, "dim", "─".repeat(Math.min(width, 48))));
      pushWrapped(lines, width, "  ", fg(this.theme, "accent", bold(this.theme, field.label)));
      const content = field.content?.trim() || field.label;
      if (content !== field.label) {
        pushWrapped(lines, width, "  ", fg(this.theme, "text", content));
      }
      return;
    }

    const marker = focusPrefix(this.theme, focused);
    const tag = this.renderRequirementTag(field, state);
    pushLine(lines, width, `${marker}${this.renderFieldTitle(field)} ${tag}`);

    if (field.type === "boolean") {
      this.renderBooleanField(lines, width, focused, state);
      return;
    }
    if (field.type === "select") {
      this.renderSelectField(lines, width, focused, field, state);
      return;
    }
    if (field.type === "multiselect") {
      this.renderMultiselectField(lines, width, focused, field, state);
      return;
    }
    if (field.type === "input") {
      for (const line of renderTextBox(this.theme, width, focused, state.inputValue, field.placeholder || "Enter text", state.inputCursor)) {
        lines.push(line);
      }
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const lines: string[] = [];
    const progress = this.requiredProgress();

    lines.push("");
    pushLine(lines, width, fg(this.theme, "accent", bold(this.theme, `Form: ${this.params.title}`)));
    pushLine(lines, width, fg(this.theme, "dim", "↑/↓ field · ←/→ option · Enter/Space choose · Esc cancel"));
    pushLine(lines, width, separator(this.theme, width));

    if (this.params.description?.trim()) {
      pushWrapped(lines, width, "  ", fg(this.theme, "text", this.params.description.trim()));
      lines.push("");
    }

    for (let i = 0; i < this.params.fields.length; i++) {
      this.renderField(lines, width, this.params.fields[i], i);
      lines.push("");
    }

    pushLine(lines, width, separator(this.theme, width));
    const submitLabel = `Submit Form · ${progress.filled}/${progress.total} required`;
    const submit = this.allRequiredFilled()
      ? enabledButton(this.theme, this.submitFocused, submitLabel)
      : disabledButton(this.theme, this.submitFocused, submitLabel);
    pushLine(lines, width, submit);

    const field = this.currentField();
    let help = "Enter on Submit when enabled";
    if (field?.type === "input") {
      help = "Typing enabled · Enter next field · Shift+Enter newline · Backspace delete";
    } else if (field?.type === "multiselect") {
      help = "←/→ move option · Enter/Space toggle current option";
    } else if (field?.type === "boolean" || field?.type === "select") {
      help = "←/→ move option · Enter/Space choose";
    }
    lines.push("");
    pushLine(lines, width, fg(this.theme, "dim", help));

    this.cachedWidth = width;
    this.cachedLines = lines.map((line) => truncateToWidth(line, width));
    return this.cachedLines;
  }
}

export default function formFilling(pi: ExtensionAPI) {
  pi.registerTool({
    name: "FormFilling",
    label: "Form Filling",
    description: "Show the user a 2-25 element form and collect structured values. Field types: boolean, select, multiselect, input, and text. Use input for fill-in fields and text for read-only explanatory text.",
    promptSnippet: "Ask the user to fill a structured form with boolean, select, multiselect, input, and explanatory text elements.",
    promptGuidelines: [
      "Use FormFilling when you need multiple structured pieces of information from the user in one interaction.",
      "FormFilling select and multiselect options should use stable ids because returned values contain option ids rather than labels.",
      "Use FormFilling type=input for fill-in fields and type=text for read-only explanatory text inside the form.",
    ],
    parameters: FormFillingParameters,
    async execute(toolCallId, params: FormFillingParams, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "FormFilling failed: interactive UI is not available." }],
          details: { cancelled: true, values: [] } as FormFillingResult,
        };
      }

      const validationError = validateParams(params);
      if (validationError) {
        return {
          content: [{ type: "text", text: validationError }],
          details: { cancelled: true, values: [] } as FormFillingResult,
        };
      }

      const pauseReason = `FormFilling:${toolCallId}`;
      pi.events.emit("status-line:timer-pause", pauseReason);
      let result: FormFillingResult;
      try {
        result = await customAboveStatus<FormFillingResult>(ctx, (tui, theme, _keybindings, done) =>
          new FormFillingDialog(params, tui, theme, done)
        );
      } finally {
        pi.events.emit("status-line:timer-resume", pauseReason);
      }

      return {
        content: [{ type: "text", text: resultText(result) }],
        details: result,
      };
    },
    renderCall(args, theme) {
      const params = args as FormFillingParams;
      const count = Array.isArray(params.fields) ? params.fields.length : 0;
      const title = typeof params.title === "string" ? params.title : "Untitled form";
      return new Text(theme.fg("toolTitle", theme.bold("FormFilling ")) + theme.fg("muted", `${title} · ${count} elements`), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as FormFillingResult | undefined;
      if (!details || details.cancelled) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }
      const lines = details.values.map((value) => {
        if (value.type === "boolean") return `${theme.fg("success", "[x] ")}${theme.fg("accent", value.fieldId)}: ${String(value.value)}`;
        if (value.type === "select") return `${theme.fg("success", "[x] ")}${theme.fg("accent", value.fieldId)}: option=${value.optionId}`;
        if (value.type === "multiselect") return `${theme.fg("success", "[x] ")}${theme.fg("accent", value.fieldId)}: options=${value.optionIds.join(", ")}`;
        return `${theme.fg("success", "[x] ")}${theme.fg("accent", value.fieldId)}: ${value.value}`;
      });
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
