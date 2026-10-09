import { formatDay, parseDayWords, parseRepeatWords } from "./dates";
import { MAX_POINTS } from "./points";
import type { RepeatUnit } from "../types";

/** Something a typed name can stand for: a tag, a goal or a list. */
export interface Named {
  id: string;
  name: string;
}

/** What the typed shortcuts are read against. */
export interface SyntaxContext {
  /** The app's today, "YYYY-MM-DD". */
  today: string;
  tags: Named[];
  goals: Named[];
  lists: Named[];
  /** How deep the new task will sit: 0 for a main task. Decides which shortcuts it can take. */
  depth: number;
}

export type TokenKind = "tag" | "goal" | "hard" | "soft" | "today" | "repeat" | "points" | "list";

/** One shortcut found in the text: where it was typed, and what it says in the preview under the field. */
export interface SyntaxToken {
  start: number;
  end: number;
  kind: TokenKind;
  label: string;
}

export interface ParsedTask {
  /** The text without its shortcuts. */
  title: string;
  tagIds: string[];
  goalIds: string[];
  /** Names typed that no tag (goal) has yet. */
  newTags: string[];
  newGoals: string[];
  deadlineDate?: string;
  deadlineType?: "hard" | "soft";
  today: boolean;
  points?: number;
  listId?: string;
  repeat?: { every: number; unit: RepeatUnit; nextDue: string };
  tokens: SyntaxToken[];
}

/** The characters that start a shortcut. A backslash in front of one keeps it as text. */
const TRIGGERS = "#^@~/";
/** Deadlines are for main tasks and their direct subtasks, as on the server. */
const MAX_DEADLINE_DEPTH = 1;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isWordStart = (text: string, at: number) => at === 0 || /\s/.test(text[at - 1]);
const repeatText = (every: number, unit: RepeatUnit) => (every === 1 ? `every ${unit}` : `every ${every} ${unit}s`);

/**
 * The name typed at the start of `rest`: the longest existing one it starts with (names can hold spaces), or else its first word.
 * Nothing for no word at all, or one made of digits only ("#123" is an issue number, not a tag).
 */
function readName(rest: string, known: Named[]): { name: string; id?: string } | null {
  const fits = known
    .filter(({ name }) => name !== "" && same(rest.slice(0, name.length), name) && /^(\s|$)/.test(rest.slice(name.length)))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (fits) return fits;
  const word = rest.match(/^\S+/)?.[0];
  return !word || /^\d+$/.test(word) ? null : { name: word };
}

/**
 * Reads the shortcuts typed into a new task's title: #tag, ^goal, @date (hard deadline), ~date (soft deadline),
 * @today / @now (do today), @every ... (a schedule), 5p (points) and /list. Each counts only at the start of a
 * word. What can't apply (a second deadline, a schedule on a subtask, a list nobody made, ...) stays in the title
 * as it was typed, so nothing goes missing without a trace.
 */
export function parseShortSyntax(text: string, ctx: SyntaxContext): ParsedTask {
  const parsed: ParsedTask = { title: "", tagIds: [], goalIds: [], newTags: [], newGoals: [], today: false, tokens: [] };
  /** The stretches of the text that are not title: the shortcuts, and the backslashes that kept a character plain. */
  const cuts: [start: number, end: number][] = [];
  const take = (start: number, length: number, kind: TokenKind, label: string) => {
    parsed.tokens.push({ start, end: start + length, kind, label });
    cuts.push([start, start + length]);
    return start + length;
  };
  const canHaveDeadline = () => ctx.depth <= MAX_DEADLINE_DEPTH && !parsed.deadlineDate && !parsed.repeat;

  for (let at = 0; at < text.length; at++) {
    if (!isWordStart(text, at)) continue;
    const mark = text[at];
    const rest = text.slice(at + 1);

    if (mark === "\\" && (TRIGGERS.includes(rest[0] ?? " ") || /^\d+p(\s|$)/i.test(rest))) {
      cuts.push([at, at + 1]);
    } else if (mark === "#" || mark === "^") {
      const isTag = mark === "#";
      const found = readName(rest, isTag ? ctx.tags : ctx.goals);
      if (!found) continue;
      const ids = isTag ? parsed.tagIds : parsed.goalIds;
      const names = isTag ? parsed.newTags : parsed.newGoals;
      if (found.id && !ids.includes(found.id)) ids.push(found.id);
      if (!found.id && !names.some((name) => same(name, found.name))) names.push(found.name);
      at = take(at, 1 + found.name.length, isTag ? "tag" : "goal", `${mark}${found.name}${found.id ? "" : " (new)"}`) - 1;
    } else if (mark === "/") {
      const found = ctx.depth === 0 && parsed.listId === undefined ? readName(rest, ctx.lists) : null;
      if (!found?.id) continue;
      parsed.listId = found.id;
      at = take(at, 1 + found.name.length, "list", `→ ${found.name}`) - 1;
    } else if (mark === "@" || mark === "~") {
      const doToday = mark === "@" && rest.match(/^(today|now)(?=\s|$)/i);
      const repeat = mark === "@" && ctx.depth === 0 && !parsed.repeat && !parsed.deadlineDate ? parseRepeatWords(rest, ctx.today) : null;
      const date = canHaveDeadline() ? parseDayWords(rest, ctx.today) : null;
      if (doToday) {
        parsed.today = true;
        at = take(at, 1 + doToday[0].length, "today", "Today") - 1;
      } else if (repeat) {
        parsed.repeat = { every: repeat.every, unit: repeat.unit, nextDue: repeat.nextDue };
        const from = repeat.nextDue === ctx.today ? "" : ` from ${formatDay(repeat.nextDue, true)}`;
        at = take(at, 1 + repeat.length, "repeat", repeatText(repeat.every, repeat.unit) + from) - 1;
      } else if (date) {
        parsed.deadlineDate = date.day;
        parsed.deadlineType = mark === "@" ? "hard" : "soft";
        at = take(at, 1 + date.length, parsed.deadlineType, `${parsed.deadlineType} ${formatDay(date.day, true)}`) - 1;
      }
    } else if (parsed.points === undefined) {
      const points = text.slice(at).match(/^(\d{1,10})p(?=\s|$)/i);
      if (!points || Number(points[1]) > MAX_POINTS) continue;
      parsed.points = Number(points[1]);
      at = take(at, points[0].length, "points", `${parsed.points} pts`) - 1;
    }
  }

  let title = "";
  let from = 0;
  for (const [start, end] of cuts) {
    title += text.slice(from, start);
    // A shortcut takes the space after it along, so the words around it stay one space apart.
    from = end + (end - start > 1 ? (text.slice(end).match(/^[ \t]+/)?.[0].length ?? 0) : 0);
  }
  parsed.title = (title + text.slice(from)).replace(/[ \t]+$/gm, "").trim();
  return parsed;
}

/** One line of the dropdown under the field. */
export interface Suggestion {
  /** What is written in place of what was typed, its first character the shortcut's own. */
  insert: string;
  /** Small, at the right: what picking it does. */
  detail: string;
}

/** The shortcut the caret is in, and what could finish it. */
export interface ActiveToken {
  start: number;
  /** What is typed so far, the first character included. */
  typed: string;
  suggestions: Suggestion[];
}

const MOST_SUGGESTIONS = 8;
const DAY_WORDS = ["tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "next week", "next month", "in 3 days", "in 2 weeks"];
const REPEAT_WORDS = ["daily", "weekly", "monthly", "every 2 weeks", "every monday"];

function nameSuggestions(mark: string, query: string, known: Named[], kind: string, canCreate: boolean): Suggestion[] {
  const q = query.toLowerCase();
  const starts = known.filter(({ name }) => name.toLowerCase().startsWith(q));
  const holds = known.filter(({ name }) => !starts.some((other) => other.name === name) && name.toLowerCase().includes(q));
  // Names can be had twice; one line each is enough.
  const names = [...new Set([...starts, ...holds].map(({ name }) => name))].slice(0, MOST_SUGGESTIONS);
  const found = names.map((name) => ({ insert: mark + name, detail: kind }));
  const isNew = canCreate && /^\S+$/.test(query) && !/^\d+$/.test(query) && !known.some(({ name }) => same(name, query));
  return isNew ? [...found, { insert: mark + query, detail: `New ${kind.toLowerCase()}` }] : found;
}

function dateSuggestions(mark: string, query: string, ctx: SyntaxContext): Suggestion[] {
  const describe = (words: string): Suggestion | null => {
    const parsed = parseShortSyntax(mark + words, ctx);
    const token = parsed.tokens[0];
    // Only what the whole of the words says: "@fri x" is a Friday and a stray x.
    return token && token.end === words.length + 1 ? { insert: mark + words, detail: token.kind === "today" ? "Do today" : token.label } : null;
  };
  const words = mark === "@" ? ["today", ...DAY_WORDS, ...REPEAT_WORDS] : ["today", ...DAY_WORDS];
  const offered = words.filter((word) => word.startsWith(query.toLowerCase()) && !same(word, query));
  return [query, ...offered].flatMap((word) => describe(word) ?? []).slice(0, MOST_SUGGESTIONS);
}

function suggestionsFor(mark: string, query: string, ctx: SyntaxContext): Suggestion[] {
  if (mark === "#") return nameSuggestions(mark, query, ctx.tags, "Tag", true);
  if (mark === "^") return nameSuggestions(mark, query, ctx.goals, "Goal", true);
  if (mark === "/") return ctx.depth === 0 ? nameSuggestions(mark, query, ctx.lists, "List", false) : [];
  return dateSuggestions(mark, query, ctx);
}

/**
 * The shortcut being typed where the caret is, for the dropdown: the nearest one before the caret on its line.
 * One word of it always counts; more words only while they can still become something ("#deep wo", "@in 3").
 */
export function activeToken(text: string, caret: number, ctx: SyntaxContext): ActiveToken | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  for (let start = caret - 1; start >= lineStart; start--) {
    if (!TRIGGERS.includes(text[start]) || !isWordStart(text, start)) continue;
    const query = text.slice(start + 1, caret);
    const suggestions = suggestionsFor(text[start], query, ctx);
    if (/\s/.test(query) && suggestions.length === 0) continue;
    return { start, typed: text.slice(start, caret), suggestions };
  }
  return null;
}

/** The cheat sheet's lines: what to type, what it does, and an example. */
export const SYNTAX_HELP: [type: string, does: string, example: string][] = [
  ["#name", "Adds a tag. A name nobody used yet makes a new tag.", "Buy stamps #errand"],
  ["^name", "Adds a goal. A new name makes a new goal.", "Run 5 km ^Fitness"],
  ["@date", "A hard deadline.", "Hand in essay @fri"],
  ["~date", "A soft deadline.", "Call the bank ~tomorrow"],
  ["@today or @now", "Do today: it shows in the Today box and stays in its list.", "Water plants @today"],
  ["@every …", "Repeats: @daily, @weekly, @monthly, @every 2 weeks, @every fri.", "Vacuum @every 2 weeks"],
  ["5p", "Its points, instead of the list's amount.", "Clean the oven 20p"],
  ["/list", "Puts it in that list, whichever box you type in.", "Buy milk /Chores"],
  ["\\", "In front of a shortcut keeps it as plain text.", "Fix \\#home sign"],
];

/** The ways to write a date after @ or ~. */
export const DATE_HELP = "tomorrow (tmr), a weekday (fri, friday), next week, next month, in 3 days, 3d, 2w, 25/12, 25/12/26, 25 dec. After ~ also today.";
