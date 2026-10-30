import { addDays, daysBetween } from "../../../shared/dates";
import type { RepeatUnit } from "../types";
import type { Completion, StatTask } from "./stats";

// How well the habits (tasks persistent themselves) are kept: presses against what their schedules ask for. A score
// and no streak, so a round missed costs that round and nothing more. Only a habit's schedule of today is known, so
// its whole history is measured against that.

const UNIT_DAYS: Record<RepeatUnit, number> = { day: 1, week: 7, month: 30.44 };

/** How far back a score looks: 30 days, 90 once there are 90 days to look at, 365 once there is a year. */
export const windowFor = (age: number) => (age >= 365 ? 365 : age >= 90 ? 90 : 30);

/** The days each task was pressed on, a day once per press. */
export function pressDays(completions: Completion[]) {
  const days = new Map<string, string[]>();
  for (const { day, task, isPress } of completions) {
    if (!isPress) continue;
    if (!days.has(task.id)) days.set(task.id, []);
    days.get(task.id)!.push(day);
  }
  return days;
}

const ageOf = (task: StatTask, today: string) => daysBetween(task.createdOn, today);

/**
 * A habit's presses against its rounds over the `span` days before today, or up to today once it is pressed (the day
 * isn't over yet), from the day the habit was made at the earliest. Presses above what was asked for don't count, so
 * one good week can't make up for a bad one. Null: it has no schedule, or it is younger than a round and not done yet.
 */
export function habitRate(task: StatTask, presses: string[], today: string, span: number) {
  const every = task.habit?.every;
  if (!task.habit || !every) return null;
  const end = presses.includes(today) ? today : addDays(today, -1);
  const from = addDays(end, 1 - span);
  const start = task.createdOn > from ? task.createdOn : from;
  const days = daysBetween(start, end) + 1;
  if (days <= 0) return null;
  const done = presses.filter((day) => day >= start && day <= end).length;
  const round = every * UNIT_DAYS[task.habit.unit];
  if (days < round && done === 0) return null;
  const expected = Math.max(1, days / round);
  return { done: Math.min(done, expected), expected };
}

/** Every habit on a schedule together, over a window as long as the oldest of them allows; null = there is nothing to score yet. */
export function consistency(tasks: StatTask[], completions: Completion[], today: string) {
  const habits = tasks.filter((task) => task.habit?.every);
  if (habits.length === 0) return null;
  const span = windowFor(Math.max(...habits.map((task) => ageOf(task, today))));
  const days = pressDays(completions);
  const rates = habits.flatMap((task) => habitRate(task, days.get(task.id) ?? [], today, span) ?? []);
  if (rates.length === 0) return null;
  const expected = rates.reduce((sum, rate) => sum + rate.expected, 0);
  return { share: rates.reduce((sum, rate) => sum + rate.done, 0) / expected, span };
}

export interface HabitRow {
  task: StatTask;
  /** Its presses, as days. */
  days: string[];
  /** The share of its rounds done; null = none to go by (see habitRate). */
  share: number | null;
  /** The days `share` looks back over, by the habit's own age. */
  span: number;
}

/** The habits among `tasks`, the best kept first; those with nothing to score go last, the most pressed first. */
export function habitRows(tasks: StatTask[], completions: Completion[], today: string): HabitRow[] {
  const days = pressDays(completions);
  const rows = tasks
    .filter((task) => task.habit)
    .map((task): HabitRow => {
      const pressed = days.get(task.id) ?? [];
      const span = windowFor(ageOf(task, today));
      const rate = habitRate(task, pressed, today, span);
      return { task, days: pressed, span, share: rate && rate.done / rate.expected };
    });
  return rows.sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || b.days.length - a.days.length);
}
