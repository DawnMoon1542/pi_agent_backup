// @name: AskUserQuestions tool
// @category: ui
// @description: 注册 AskUserQuestions 工具，通过自定义 TUI 向用户提出 1-5 个带选项的问题

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, Key, matchesKey, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
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
  selectedMark,
  separator,
  type UserToolTheme,
  type UserToolTui,
} from "./form-ui-helpers";

type QuestionOption = {
  id: string;
  label: string;
};

type QuestionSpec = {
  id: string;
  name?: string;
  question: string;
  options: QuestionOption[];
};

type QuestionAnswer =
  | { questionId: string; type: "option"; optionId: string }
  | { questionId: string; type: "custom"; value: string }
  | { questionId: string; type: "chat" };

type AskUserQuestionsResult = {
  cancelled: boolean;
  answers: QuestionAnswer[];
};

type AskUserQuestionsParams = {
  title?: string;
  questions: QuestionSpec[];
};

const QuestionOptionSchema = Type.Object({
  id: Type.String({ description: "Stable option id returned to the model when the user selects this option" }),
  label: Type.String({ description: "Human-readable option text shown to the user" }),
});

const QuestionSchema = Type.Object({
  id: Type.String({ description: "Stable question id returned with the answer" }),
  name: Type.Optional(Type.String({ description: "Short question name shown on the first line; defaults to the question id" })),
  question: Type.String({ description: "Question text shown on the second line" }),
  options: Type.Array(QuestionOptionSchema, {
    minItems: 2,
    maxItems: 5,
    description: "Two to five selectable options",
  }),
});

const AskUserQuestionsParameters = Type.Object({
  title: Type.Optional(Type.String({ description: "Optional title for the question set" })),
  questions: Type.Array(QuestionSchema, {
    minItems: 1,
    maxItems: 5,
    description: "One to five questions to ask the user",
  }),
});

function validateParams(params: AskUserQuestionsParams): string | undefined {
  if (!Array.isArray(params.questions) || params.questions.length < 1 || params.questions.length > 5) {
    return "AskUserQuestions requires between 1 and 5 questions.";
  }
  const seenQuestions = new Set<string>();
  for (const question of params.questions) {
    if (!question.id.trim()) return "Every question must have a non-empty id.";
    if (seenQuestions.has(question.id)) return `Duplicate question id: ${question.id}`;
    seenQuestions.add(question.id);
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 5) {
      return `Question ${question.id} must have between 2 and 5 options.`;
    }
    const seenOptions = new Set<string>();
    for (const option of question.options) {
      if (!option.id.trim()) return `Question ${question.id} has an option with an empty id.`;
      if (seenOptions.has(option.id)) return `Question ${question.id} has duplicate option id: ${option.id}`;
      seenOptions.add(option.id);
    }
  }
  return undefined;
}

function answerToFocus(question: QuestionSpec, answer: QuestionAnswer | undefined): number {
  if (!answer) return 0;
  if (answer.type === "option") {
    const optionIndex = question.options.findIndex((option) => option.id === answer.optionId);
    return optionIndex >= 0 ? optionIndex : 0;
  }
  if (answer.type === "custom") return 0;
  return question.options.length + 1;
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

function resultText(result: AskUserQuestionsResult): string {
  if (result.cancelled) return "User cancelled AskUserQuestions. No answers were submitted.";
  return result.answers
    .map((answer) => {
      if (answer.type === "option") return `${answer.questionId}: option=${answer.optionId}`;
      if (answer.type === "custom") return `${answer.questionId}: custom=${answer.value}`;
      return `${answer.questionId}: chat`;
    })
    .join("\n");
}

class AskUserQuestionsDialog {
  focused = false;

  private questionIndex = 0;
  private focusIndex = 0;
  private answers = new Map<string, QuestionAnswer>();
  private customTexts: string[];
  private customCursorPositions: number[];
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private params: AskUserQuestionsParams,
    private tui: UserToolTui,
    private theme: UserToolTheme,
    private done: (result: AskUserQuestionsResult) => void
  ) {
    this.customTexts = this.params.questions.map(() => "");
    this.customCursorPositions = this.params.questions.map(() => 0);
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private refresh(): void {
    this.invalidate();
    this.tui.requestRender?.();
  }

  private currentQuestion(): QuestionSpec {
    return this.params.questions[this.questionIndex];
  }

  private currentAnswer(): QuestionAnswer | undefined {
    return this.answers.get(this.currentQuestion().id);
  }

  private maxFocusIndex(): number {
    const question = this.currentQuestion();
    const baseLast = question.options.length + 1;
    return this.questionIndex === this.params.questions.length - 1 ? baseLast + 1 : baseLast;
  }

  private allAnswered(): boolean {
    return this.params.questions.every((question) => this.answers.has(question.id));
  }

  private switchQuestion(nextIndex: number): void {
    const clamped = Math.max(0, Math.min(this.params.questions.length - 1, nextIndex));
    this.questionIndex = clamped;
    this.focusIndex = answerToFocus(this.currentQuestion(), this.currentAnswer());
    this.refresh();
  }

  private advanceAfterAnswer(): void {
    if (this.questionIndex < this.params.questions.length - 1) {
      this.switchQuestion(this.questionIndex + 1);
      return;
    }
    this.focusIndex = this.currentQuestion().options.length + 2;
    this.refresh();
  }

  private setAnswer(answer: QuestionAnswer): void {
    this.answers.set(answer.questionId, answer);
    this.advanceAfterAnswer();
  }

  private submitIfReady(): void {
    if (!this.allAnswered()) return;
    const answers = this.params.questions
      .map((question) => this.answers.get(question.id))
      .filter((answer): answer is QuestionAnswer => answer !== undefined);
    this.done({ cancelled: false, answers });
  }

  private cancel(): void {
    this.done({ cancelled: true, answers: [] });
  }

  private padToWidth(text: string, targetWidth: number): string {
    return `${text}${" ".repeat(Math.max(0, targetWidth - visibleWidth(text)))}`;
  }

  private renderHeader(lines: string[], width: number, titleText: string): void {
    const boxWidth = Math.max(24, Math.min(width, 96));
    const innerWidth = Math.max(20, boxWidth - 4);
    const helpText = "←/→ switch question · ↑/↓ choose row · Esc cancel";
    const title = truncateToWidth(titleText, innerWidth, "");
    const help = truncateToWidth(helpText, innerWidth, "");

    lines.push("");
    pushLine(lines, width, fg(this.theme, "dim", `╭${"─".repeat(boxWidth - 2)}╮`));
    pushLine(lines, width, fg(this.theme, "dim", "│ ") + fg(this.theme, "accent", bold(this.theme, this.padToWidth(title, innerWidth))) + fg(this.theme, "dim", " │"));
    pushLine(lines, width, fg(this.theme, "dim", "│ ") + fg(this.theme, "dim", this.padToWidth(help, innerWidth)) + fg(this.theme, "dim", " │"));
    pushLine(lines, width, fg(this.theme, "dim", `╰${"─".repeat(boxWidth - 2)}╯`));
  }

  private renderCustomInput(lines: string[], width: number, focused: boolean, selected: boolean, value: string, cursor: number): void {
    const placeholder = "Your custom answer...";
    const content = value.length > 0 ? value : placeholder;
    const logicalLines = content.replace(/\r/g, "").split("\n");
    const backgroundName = focused ? "selectedBg" : "toolPendingBg";
    const colorName = value.length > 0 ? "text" : "dim";
    const prefix = `${focusPrefix(this.theme, focused)}${selectedMark(selected)} `;
    const continuationPrefix = " ".repeat(visibleWidth(prefix));
    const contentWidth = Math.max(8, width - visibleWidth(prefix) - 2);
    let consumed = 0;

    for (let lineIndex = 0; lineIndex < logicalLines.length; lineIndex++) {
      const logicalLine = logicalLines[lineIndex];
      const lineChars = Array.from(logicalLine);
      const lineStart = consumed;
      const lineEnd = lineStart + lineChars.length;
      const cursorOnLine = focused && cursor >= lineStart && cursor <= lineEnd;
      let renderedContent: string;

      if (cursorOnLine) {
        const localCursor = Math.max(0, Math.min(lineChars.length, cursor - lineStart));
        const before = lineChars.slice(0, localCursor).join("");
        const atCursor = lineChars[localCursor] ?? " ";
        const after = lineChars.slice(localCursor + (lineChars[localCursor] === undefined ? 0 : 1)).join("");
        renderedContent = `${fg(this.theme, colorName, before)}${CURSOR_MARKER}\x1b[7m${fg(this.theme, colorName, atCursor)}\x1b[27m${fg(this.theme, colorName, after)}`;
      } else {
        renderedContent = fg(this.theme, colorName, logicalLine);
      }

      const padded = this.padToWidth(truncateToWidth(renderedContent, contentWidth, ""), contentWidth);
      pushLine(lines, width, `${lineIndex === 0 ? prefix : continuationPrefix}${bg(this.theme, backgroundName, ` ${padded} `)}`);
      consumed = lineEnd + 1;
    }
  }

  handleInput(data: string): void {
    const question = this.currentQuestion();
    const inputIndex = question.options.length;
    const chatIndex = question.options.length + 1;
    const submitIndex = question.options.length + 2;

    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.cancel();
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.focusIndex = Math.max(0, this.focusIndex - 1);
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.focusIndex = Math.min(this.maxFocusIndex(), this.focusIndex + 1);
      this.refresh();
      return;
    }

    if (this.focusIndex === inputIndex) {
      const currentText = this.customTexts[this.questionIndex];
      const currentCursor = this.customCursorPositions[this.questionIndex];

      if (matchesKey(data, Key.left)) {
        this.customCursorPositions[this.questionIndex] = Math.max(0, currentCursor - 1);
        this.refresh();
        return;
      }
      if (matchesKey(data, Key.right)) {
        this.customCursorPositions[this.questionIndex] = Math.min(textLength(currentText), currentCursor + 1);
        this.refresh();
        return;
      }
      if (matchesKey(data, Key.home)) {
        this.customCursorPositions[this.questionIndex] = 0;
        this.refresh();
        return;
      }
      if (matchesKey(data, Key.end)) {
        this.customCursorPositions[this.questionIndex] = textLength(currentText);
        this.refresh();
        return;
      }
      if (matchesKey(data, Key.shift("enter"))) {
        const next = insertAt(currentText, currentCursor, "\n");
        this.customTexts[this.questionIndex] = next.text;
        this.customCursorPositions[this.questionIndex] = next.cursor;
        this.refresh();
        return;
      }
      if (matchesKey(data, Key.enter)) {
        const value = this.customTexts[this.questionIndex].trim();
        if (value.length > 0) {
          this.setAnswer({ questionId: question.id, type: "custom", value: this.customTexts[this.questionIndex] });
        } else {
          this.refresh();
        }
        return;
      }
      if (matchesKey(data, Key.backspace)) {
        const next = removeBefore(currentText, currentCursor);
        this.customTexts[this.questionIndex] = next.text;
        this.customCursorPositions[this.questionIndex] = next.cursor;
        if (this.currentAnswer()?.type === "custom") {
          const updated = this.customTexts[this.questionIndex];
          if (updated.trim().length > 0) {
            this.answers.set(question.id, { questionId: question.id, type: "custom", value: updated });
          } else {
            this.answers.delete(question.id);
          }
        }
        this.refresh();
        return;
      }
      if (matchesKey(data, Key.delete)) {
        const next = removeAt(currentText, currentCursor);
        this.customTexts[this.questionIndex] = next.text;
        this.customCursorPositions[this.questionIndex] = next.cursor;
        if (this.currentAnswer()?.type === "custom") {
          const updated = this.customTexts[this.questionIndex];
          if (updated.trim().length > 0) {
            this.answers.set(question.id, { questionId: question.id, type: "custom", value: updated });
          } else {
            this.answers.delete(question.id);
          }
        }
        this.refresh();
        return;
      }
      const printable = decodeTextInput(data);
      if (printable !== undefined) {
        const next = insertAt(currentText, currentCursor, printable);
        this.customTexts[this.questionIndex] = next.text;
        this.customCursorPositions[this.questionIndex] = next.cursor;
        if (this.currentAnswer()?.type === "custom") {
          this.answers.set(question.id, { questionId: question.id, type: "custom", value: this.customTexts[this.questionIndex] });
        }
        this.refresh();
      }
      return;
    }

    if (matchesKey(data, Key.left)) {
      this.switchQuestion(this.questionIndex - 1);
      return;
    }
    if (matchesKey(data, Key.right) || matchesKey(data, Key.tab)) {
      this.switchQuestion(this.questionIndex + 1);
      return;
    }
    if (matchesKey(data, Key.shift("tab"))) {
      this.switchQuestion(this.questionIndex - 1);
      return;
    }

    const selectKey = matchesKey(data, Key.enter) || matchesKey(data, Key.space);
    if (!selectKey) return;

    if (this.focusIndex >= 0 && this.focusIndex < question.options.length) {
      const option = question.options[this.focusIndex];
      this.setAnswer({ questionId: question.id, type: "option", optionId: option.id });
      return;
    }

    if (this.focusIndex === chatIndex) {
      this.setAnswer({ questionId: question.id, type: "chat" });
      return;
    }

    if (this.focusIndex === submitIndex && this.questionIndex === this.params.questions.length - 1) {
      this.submitIfReady();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const lines: string[] = [];
    const question = this.currentQuestion();
    const answer = this.currentAnswer();
    const inputIndex = question.options.length;
    const chatIndex = question.options.length + 1;
    const submitIndex = question.options.length + 2;
    const title = this.params.title ? `${this.params.title} · ` : "";
    const questionName = question.name?.trim() || question.id;

    this.renderHeader(lines, width, `${title}Question ${this.questionIndex + 1}/${this.params.questions.length}: ${questionName}`);
    pushWrapped(lines, width, "  ", fg(this.theme, "text", question.question));
    lines.push("");

    for (let i = 0; i < question.options.length; i++) {
      const option = question.options[i];
      const focused = this.focusIndex === i;
      const selected = answer?.type === "option" && answer.optionId === option.id;
      const raw = `${focusPrefix(this.theme, focused)}${selectedMark(selected)} ${option.label}`;
      const styled = focused ? bg(this.theme, "selectedBg", fg(this.theme, selected ? "success" : "accent", raw)) : fg(this.theme, selected ? "success" : "text", raw);
      pushLine(lines, width, styled);
    }

    lines.push("");
    this.renderCustomInput(lines, width, this.focusIndex === inputIndex, answer?.type === "custom", this.customTexts[this.questionIndex], this.customCursorPositions[this.questionIndex]);

    lines.push("");
    const chatFocused = this.focusIndex === chatIndex;
    const chatSelected = answer?.type === "chat";
    const chatRaw = `${focusPrefix(this.theme, chatFocused)}${selectedMark(chatSelected)} Chat about this.`;
    const chatLine = chatFocused ? bg(this.theme, "selectedBg", fg(this.theme, chatSelected ? "success" : "accent", chatRaw)) : fg(this.theme, chatSelected ? "success" : "text", chatRaw);
    pushLine(lines, width, chatLine);

    if (this.questionIndex === this.params.questions.length - 1) {
      lines.push("");
      pushLine(lines, width, separator(this.theme, width));
      const submitFocused = this.focusIndex === submitIndex;
      const submitLine = this.allAnswered()
        ? enabledButton(this.theme, submitFocused, "Submit Answers")
        : disabledButton(this.theme, submitFocused, "Submit Answers");
      pushLine(lines, width, submitLine);
    }

    lines.push("");
    const answeredCount = this.params.questions.filter((item) => this.answers.has(item.id)).length;
    const help = this.focusIndex === inputIndex
      ? "Typing enabled · Enter confirm answer · Shift+Enter newline · Backspace delete"
      : "Enter/Space choose option · Enter on Submit when enabled";
    pushLine(lines, width, fg(this.theme, "dim", `${help} · answered ${answeredCount}/${this.params.questions.length}`));

    this.cachedWidth = width;
    this.cachedLines = lines.map((line) => truncateToWidth(line, width));
    return this.cachedLines;
  }
}

export default function askUserQuestions(pi: ExtensionAPI) {
  pi.registerTool({
    name: "AskUserQuestions",
    label: "Ask User Questions",
    description: "Ask the user 1-5 questions. Each question has 2-5 options, an inline custom-answer box, and a Chat about this choice. Option answers return option ids only.",
    promptSnippet: "Ask the user multiple-choice clarification questions with optional custom answers.",
    promptGuidelines: [
      "Use AskUserQuestions when you need the user to choose among explicit options or provide a short custom answer before continuing.",
      "AskUserQuestions option ids should be stable and descriptive because selected options return ids rather than visible labels.",
    ],
    parameters: AskUserQuestionsParameters,
    async execute(toolCallId, params: AskUserQuestionsParams, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "AskUserQuestions failed: interactive UI is not available." }],
          details: { cancelled: true, answers: [] } as AskUserQuestionsResult,
        };
      }

      const validationError = validateParams(params);
      if (validationError) {
        return {
          content: [{ type: "text", text: validationError }],
          details: { cancelled: true, answers: [] } as AskUserQuestionsResult,
        };
      }

      const pauseReason = `AskUserQuestions:${toolCallId}`;
      pi.events.emit("status-line:timer-pause", pauseReason);
      let result: AskUserQuestionsResult;
      try {
        result = await customAboveStatus<AskUserQuestionsResult>(ctx, (tui, theme, _keybindings, done) =>
          new AskUserQuestionsDialog(params, tui, theme, done)
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
      const params = args as AskUserQuestionsParams;
      const count = Array.isArray(params.questions) ? params.questions.length : 0;
      const title = typeof params.title === "string" && params.title.trim() ? `${params.title.trim()} ` : "";
      return new Text(theme.fg("toolTitle", theme.bold("AskUserQuestions ")) + theme.fg("muted", `${title}${count} question${count === 1 ? "" : "s"}`), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as AskUserQuestionsResult | undefined;
      if (!details || details.cancelled) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }
      const lines = details.answers.map((answer) => {
        if (answer.type === "option") return `${theme.fg("success", "[x] ")}${theme.fg("accent", answer.questionId)}: option=${answer.optionId}`;
        if (answer.type === "custom") return `${theme.fg("success", "[x] ")}${theme.fg("accent", answer.questionId)}: custom=${answer.value}`;
        return `${theme.fg("success", "[x] ")}${theme.fg("accent", answer.questionId)}: chat`;
      });
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
