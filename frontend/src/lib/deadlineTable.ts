import { addDays } from "../../../shared/dates";
import type { CombinedItem, CombinedRow } from "../types";

/** How a day's "Per day" is counted: every deadline added up, only the soonest one with work left, or a column each. */
export type PerDayMode = "sum" | "soonest" | "columns";
export type RangeUnit = "day" | "week";
export interface DeadlineRange {
  amount: number;
  unit: RangeUnit;
}
export type DeadlineKind = "hard" | "soft" | "big";

/** The dashboard's deadlines box, as the user set it on their page (`User.deadlineTable`). */
export interface DeadlineTable {
  /** What the first tab shows: today and the days after it. */
  range: DeadlineRange;
  perDay: PerDayMode;
  /** Soft deadlines in the table (and the List tab). */
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
  range: { amount: 2, unit: "week" },
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
  const range = isRecord(s.range) ? s.range : {};
  const amount = typeof range.amount === "number" && Number.isInteger(range.amount) && range.amount >= 1 && range.amount <= 52 ? range.amount : null;
  const unit = range.unit === "day" || range.unit === "week" ? range.unit : null;
  const colors = isRecord(s.colors) ? s.colors : {};
  const taskColors = isRecord(s.taskColors) ? s.taskColors : {};
  return {
    range: amount && unit ? { amount, unit } : DEADLINE_DEFAULTS.range,
    perDay: PER_DAY_CHOICES.some(([mode]) => mode === s.perDay) ? (s.perDay as PerDayMode) : DEADLINE_DEFAULTS.perDay,
    soft: typeof s.soft === "boolean" ? s.soft : DEADLINE_DEFAULTS.soft,
    colors: Object.fromEntries(KIND_NAMES.map(([kind]) => [kind, isHex(colors[kind]) ? colors[kind].toLowerCase() : DEADLINE_DEFAULTS.colors[kind]])) as Record<DeadlineKind, string>,
    taskColors: Object.fromEntries(Object.entries(taskColors).flatMap(([id, hex]) => (isHex(hex) ? [[id, hex.toLowerCase()]] : []))),
  };
}

/** The range's last day: today counts as its first. */
export const rangeEnd = (today: string, { amount, unit }: DeadlineRange) => addDays(today, amount * (unit === "week" ? 7 : 1) - 1);

/** The range tab's name: "2 weeks", "1 day". */
export const rangeLabel = ({ amount, unit }: DeadlineRange) => `${amount} ${unit}${amount === 1 ? "" : "s"}`;

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

/** A deadline's colour: its own if picked, else a big task's, else its kind's. */
export function deadlineColor(item: Pick<CombinedItem, "taskId" | "deadlineType">, isBig: boolean, table: DeadlineTable) {
  return table.taskColors[item.taskId] ?? table.colors[isBig ? "big" : item.deadlineType];
}
