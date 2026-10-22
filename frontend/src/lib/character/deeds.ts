import { addDays, daysBetween } from "../../../../shared/dates";
import type { StatRow } from "../../types";
import { localDay } from "../dates";
import { countByDay, deadlineOutcomes, isOnTime, type Completion, type StatTask } from "../stats";

// The deeds some bodies are earned by (unlocks.ts): presses of persistent tasks, tasks that waited a month and got
// done, mornings, deadlines met in a row, the busiest day, and the pace of the hard deadlines kept for a month. All
// worked out from what the Stats page loads.

export interface Deeds {
  /** Presses of persistent tasks, in all. */
  presses: number;
  /** Tasks done that waited 30 days or more. */
  frogs: number;
  /** Days with something done before 8 in the morning. */
  earlyDays: number;
  /** The most deadlines met in a row, none late or missed between. */
  onTimeRun: number;
  /** The most tasks done in one day. */
  busiestDay: number;
  /** The hard deadlines' pace was kept for 30 days in a row (see paceKept). */
  steady: boolean;
}

export const STEADY_DAYS = 30;
/** How much of each day's pace the steady days keep, on average. */
export const STEADY_PACE = 0.5;

/**
 * Whether the pace of the hard deadlines was kept for 30 days in a row. Each hard deadline (a main task's, or a
 * direct subtask's whose main task has none, as on the pressure card) counts the task and everything under it, the
 * persistent ones and what is under them left out, as the countdown does. On each day from its start day to its
 * deadline with work left, its pace is the tasks left that morning ÷ the days left (the deadline day counted). A day's
 * pace is all the deadlines' together, and its score what was done of their tasks that day ÷ that pace, at most 1. It
 * needs 30 days in a row, each with hard-deadline work left, whose scores average at least a half.
 */
export function paceKept(rows: StatRow[], tasks: StatTask[], today: string): boolean {
  const childrenOf = new Map<string, StatRow[]>();
  for (const row of rows) if (row.parentId) childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  // The stats leave out the reward lists' tasks; so does this.
  const roots = new Set(tasks.filter((t) => t.isRoot).map((t) => t.id));
  const isHard = (row: StatRow) => Boolean(row.deadlineDate) && (row.deadlineType ?? "hard") === "hard";
  const deadlines = rows.filter((row) => {
    if (!isHard(row) || row.isPersistent) return false;
    if (!row.parentId) return roots.has(row.id);
    const parent = byId.get(row.parentId);
    return Boolean(parent && !parent.parentId && roots.has(parent.id) && !isHard(parent));
  });

  const pace = new Map<string, number>();
  const done = new Map<string, number>();
  for (const task of deadlines) {
    const finished: (string | null)[] = [];
    const visit = (row: StatRow) => {
      if (row.isPersistent) return;
      finished.push(row.completedOn);
      (childrenOf.get(row.id) ?? []).forEach(visit);
    };
    visit(task);
    const end = task.deadlineDate!;
    const start = task.startDate ?? localDay(new Date(task.createdAt));
    const last = end < today ? end : today;
    // Keeps a mistyped far-off start from making an endless count.
    for (let day = daysBetween(start, last) > 1500 ? addDays(last, -1500) : start; day <= last; day = addDays(day, 1)) {
      const left = finished.filter((d) => d === null || d >= day).length;
      if (left === 0) break;
      pace.set(day, (pace.get(day) ?? 0) + left / (daysBetween(day, end) + 1));
      done.set(day, (done.get(day) ?? 0) + finished.filter((d) => d === day).length);
    }
  }

  const days = [...pace.keys()].sort();
  let run: number[] = [];
  for (let i = 0; i < days.length; i++) {
    if (i > 0 && daysBetween(days[i - 1], days[i]) !== 1) run = [];
    run.push(Math.min(1, (done.get(days[i]) ?? 0) / pace.get(days[i])!));
    if (run.length > STEADY_DAYS) run.shift();
    if (run.length === STEADY_DAYS && run.reduce((a, b) => a + b, 0) / STEADY_DAYS >= STEADY_PACE) return true;
  }
  return false;
}

/** The deeds done so far. */
export function deedsOf({ rows, tasks, completions, today }: { rows: StatRow[]; tasks: StatTask[]; completions: Completion[]; today: string }): Deeds {
  const early = new Set(completions.filter((c) => c.at && c.at.getHours() < 8).map((c) => c.day));
  let run = 0;
  let onTimeRun = 0;
  for (const outcome of deadlineOutcomes(tasks, today).sort((a, b) => a.day.localeCompare(b.day))) {
    run = isOnTime(outcome) ? run + 1 : 0;
    onTimeRun = Math.max(onTimeRun, run);
  }
  return {
    presses: completions.filter((c) => c.isPress).length,
    frogs: tasks.filter((t) => !t.isPersistent && t.completedOn && daysBetween(t.createdOn, t.completedOn) >= 30).length,
    earlyDays: early.size,
    onTimeRun,
    busiestDay: Math.max(0, ...countByDay(completions).values()),
    steady: paceKept(rows, tasks, today),
  };
}
