import type { RepeatUnit, Task } from "../types";

export const REPEAT_UNITS: [RepeatUnit, plural: string][] = [
  ["day", "days"],
  ["week", "weeks"],
  ["month", "months"],
];

type Scheduled = Pick<Task, "repeatEvery" | "repeatUnit" | "nextDue">;
/** What decides which round a task on a schedule is at (see currentRound). */
type Rounds = Scheduled & Pick<Task, "repeatMakeUp" | "repeatAfterDone" | "roundMoves">;

/** The day a round planned on `planned` is done on: its own, or the one it was moved to in the Week box. */
export const movedDay = (task: Pick<Task, "roundMoves">, planned: string) => task.roundMoves?.[planned] ?? planned;

/** "every week", "every 3 weeks". */
export function repeatLabel({ repeatEvery, repeatUnit }: Scheduled) {
  return repeatEvery === 1 ? `every ${repeatUnit}` : `every ${repeatEvery} ${repeatUnit}s`;
}

/** The Monday of the week `day` is in; weeks run Monday to Sunday. */
export const mondayOf = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

/**
 * The round a task on a schedule is at: its `nextDue`, unless it skips missed rounds (keeping to its planned days,
 * not making them up) and that round is from a week before today's. Such a round doesn't have to be done: it is
 * dropped, the round is the first planned day from this Monday on, and `missed` says the one before wasn't done
 * (the Week box flags it). `planned` is the round's planned day, `day` the day it is done on (moved, or the same).
 * The server counts a press from the same round (dueAfter in repeat.service.ts). Null = no schedule.
 */
export function currentRound(task: Rounds, today: string): { day: string; planned: string; missed: boolean } | null {
  if (!task.nextDue || !task.repeatEvery) return null;
  const monday = mondayOf(today);
  let planned = task.nextDue;
  if (!task.repeatMakeUp && !task.repeatAfterDone) {
    while (movedDay(task, planned) < monday) planned = addInterval(planned, task.repeatEvery, task.repeatUnit);
  }
  return { day: movedDay(task, planned), planned, missed: planned !== task.nextDue };
}

/** A task on a schedule whose day has come (or passed) and that hasn't been done since. */
export const isDue = (task: Rounds, today: string) => (currentRound(task, today)?.day ?? "9") <= today;

/** A task on a schedule that was done for now: nothing to do until its next day. */
export const isWaiting = (task: Rounds, today: string) => (currentRound(task, today)?.day ?? "") > today;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "2026-10-05", 3, "week" -> "2026-10-26", as the server counts it (repeat.service.ts): months keep the
 * day of the month, or stop at the month's last day when it has no such day.
 */
export function addInterval(day: string, every: number, unit: RepeatUnit): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (unit === "month") {
    const months = date.getUTCFullYear() * 12 + date.getUTCMonth() + every;
    const year = Math.floor(months / 12);
    const month = months % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return `${year}-${pad(month + 1)}-${pad(Math.min(date.getUTCDate(), lastDay))}`;
  }
  date.setUTCDate(date.getUTCDate() + every * (unit === "week" ? 7 : 1));
  return date.toISOString().slice(0, 10);
}

/**
 * How many rounds of a task on a schedule are to be done by `today`: its due one and, if it makes up missed rounds,
 * every one after it up to today. 0 = not due.
 */
export function roundsDue(task: Rounds, today: string): number {
  if (!isDue(task, today)) return 0;
  if (!task.repeatMakeUp || task.repeatAfterDone || !task.nextDue || !task.repeatEvery) return 1;
  let count = 0;
  for (let day = task.nextDue; day <= today; day = addInterval(day, task.repeatEvery, task.repeatUnit)) if (movedDay(task, day) <= today) count++;
  return count;
}

/** The moves of rounds still to come, as the server keeps them after a press (movesFrom in repeat.service.ts). */
export function movesFrom(moves: Task["roundMoves"], nextDue: string): Task["roundMoves"] {
  const left = Object.entries(moves ?? {}).filter(([planned]) => planned >= nextDue);
  return left.length > 0 ? Object.fromEntries(left) : null;
}

/**
 * When a task on a schedule is due again after a press on `doneOn`, as the server works it out (dueAfter in
 * repeat.service.ts); shown at once, before the server answers, and for a press made offline.
 */
export function dueAfter(task: Rounds & { repeatEvery: number; nextDue: string }, doneOn: string): string {
  const { repeatEvery, repeatUnit } = task;
  if (task.repeatAfterDone) return addInterval(doneOn, repeatEvery, repeatUnit);
  if (task.repeatMakeUp) return addInterval(task.nextDue, repeatEvery, repeatUnit);
  const monday = mondayOf(doneOn);
  let round = task.nextDue;
  while (movedDay(task, round) < monday) round = addInterval(round, repeatEvery, repeatUnit);
  let next = addInterval(round, repeatEvery, repeatUnit);
  while (next <= doneOn) next = addInterval(next, repeatEvery, repeatUnit);
  return next;
}
