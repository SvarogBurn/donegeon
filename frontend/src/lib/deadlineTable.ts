import type { CombinedItem, CombinedRow } from "../types";

/** How a day's "Per day" is counted: every deadline added up, only the soonest one with work left, or a column each. */
export type PerDayMode = "sum" | "soonest" | "columns";
export type DeadlineKind = "hard" | "soft" | "big";

/** The dashboard's deadlines box, as the user set it on their page (`User.deadlineTable`). */
export interface DeadlineTable {
  perDay: PerDayMode;
  /** Soft deadlines in the table. */
  soft: boolean;
  /** A deadline's colour by its kind: a big task (see isBigTask) before hard. */
  colors: Record<DeadlineKind, string>;
  /** A colour of a deadline's own, by task id: before its kind's. */
  taskColors: Record<string, string>;
}

export const PER_DAY_CHOICES: [PerDayMode, string][] = [
  ["sum", "Add up every deadline"],
  ["soonest", "Only the soonest"],
  ["columns", "A column each"],
];

export const KIND_NAMES: [DeadlineKind, string][] = [
  ["hard", "Hard"],
  ["soft", "Soft"],
  ["big", "Big task"],
];

// Picked from the lists' colours (LIST_COLORS), so the choices show which one is in use.
export const DEADLINE_DEFAULTS: DeadlineTable = {
  perDay: "sum",
  soft: true,
  colors: { hard: "#c8423b", soft: "#2a9ba8", big: "#ad61cb" },
  taskColors: {},
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const isHex = (value: unknown): value is string => typeof value === "string" && HEX.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The saved settings with what is missing or broken filled in from the defaults. */
export function normalizeDeadlineTable(saved: unknown): DeadlineTable {
  const s = isRecord(saved) ? saved : {};
  const colors = isRecord(s.colors) ? s.colors : {};
  const taskColors = isRecord(s.taskColors) ? s.taskColors : {};
  return {
    perDay: PER_DAY_CHOICES.some(([mode]) => mode === s.perDay) ? (s.perDay as PerDayMode) : DEADLINE_DEFAULTS.perDay,
    soft: typeof s.soft === "boolean" ? s.soft : DEADLINE_DEFAULTS.soft,
    colors: Object.fromEntries(KIND_NAMES.map(([kind]) => [kind, isHex(colors[kind]) ? colors[kind].toLowerCase() : DEADLINE_DEFAULTS.colors[kind]])) as Record<DeadlineKind, string>,
    taskColors: Object.fromEntries(Object.entries(taskColors).flatMap(([id, hex]) => (isHex(hex) ? [[id, hex.toLowerCase()]] : []))),
  };
}

/**
 * A day's Per day as the user counts it: every deadline added up (overdue work in full), or only the soonest deadline
 * still running with work left. `remaining` is what the pace is coloured by. Not for "columns": each column is its own pace.
 */
export function perDayOf(row: CombinedRow, mode: PerDayMode): { perDay: number; remaining: number; overdue: boolean } {
  if (mode !== "soonest") return { perDay: row.perDay, remaining: row.remaining, overdue: row.overdue };
  // Items are soonest first, so the first one running with work left is the one to do.
  const pace = row.paces.find((p) => p !== null && p.remaining > 0);
  if (!pace) return { perDay: 0, remaining: 0, overdue: false };
  return { perDay: pace.perDay ?? pace.remaining, remaining: pace.remaining, overdue: pace.perDay === null };
}

/**
 * The days before `before` (this Monday) that a passed deadline still open takes the table back to, folded into one
 * row: since when, what was done over them, and the last of them (its Left and pace). A deadline gone by months ago
 * would otherwise draw a red row for every day since. Null when there are none.
 */
export function foldedDays(rows: CombinedRow[], from: string, before: string): { since: string; done: number; last: CombinedRow } | null {
  const days = rows.filter((row) => row.date >= from && row.date < before);
  if (days.length === 0) return null;
  return { since: from, done: days.reduce((sum, row) => sum + row.doneThatDay, 0), last: days.at(-1)! };
}

/** A deadline's colour: its own if picked, else a big task's, else its kind's. */
export function deadlineColor(item: Pick<CombinedItem, "taskId" | "deadlineType">, isBig: boolean, table: DeadlineTable) {
  return table.taskColors[item.taskId] ?? table.colors[isBig ? "big" : item.deadlineType];
}
