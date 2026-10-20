import { mondayOf } from "./dates.js";
import type { RepeatUnit } from "./enums.js";

/**
 * The rules of tasks on a schedule, shared by the server (which moves a round on at a press) and the app (which
 * shows the round at once, offline too). One copy, so the two can't drift apart.
 */

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * "2026-10-05", 3, "week" -> "2026-10-26". Months keep the day of the month,
 * or stop at the month's last day when it has no such day (31 Jan + 1 month = 28 Feb).
 */
export function addInterval(day: string, every: number, unit: RepeatUnit): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (unit === "month") {
    const months = date.getUTCFullYear() * 12 + date.getUTCMonth() + every;
    const year = Math.floor(months / 12);
    const month = months % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return `${year}-${pad2(month + 1)}-${pad2(Math.min(date.getUTCDate(), lastDay))}`;
  }
  date.setUTCDate(date.getUTCDate() + every * (unit === "week" ? 7 : 1));
  return date.toISOString().slice(0, 10);
}

/** A task's moved rounds as stored (JSON): planned day -> the day it was moved to; anything else counts as none. */
export function roundMovesOf(stored: unknown): Record<string, string> {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** The day a round planned on `planned` is done on: its own, or the one it was moved to in the Week box. */
export const movedDay = (task: { roundMoves?: unknown }, planned: string) => roundMovesOf(task.roundMoves)[planned] ?? planned;

/** The moves of rounds still to come: those of rounds before `nextDue` are done (or dropped) and go. Null = none left. */
export function movesFrom(stored: unknown, nextDue: string): Record<string, string> | null {
  const left = Object.entries(roundMovesOf(stored)).filter(([planned]) => planned >= nextDue);
  return left.length > 0 ? Object.fromEntries(left) : null;
}

/** What decides which round a task on a schedule is at. */
export interface Rounds {
  repeatEvery: number | null;
  repeatUnit: RepeatUnit;
  /** Count the next round from the day it was done instead of keeping to the planned days. */
  repeatAfterDone: boolean;
  /** Keeping to the planned days: missed rounds are still to be done, one press each, instead of skipped. */
  repeatMakeUp: boolean;
  /** Rounds moved to another day: planned day -> that day. */
  roundMoves?: unknown;
  /** The round still to be done. */
  nextDue: string | null;
}

/**
 * The round a task on a schedule is at: its `nextDue`, unless it skips missed rounds (keeping to its planned days,
 * not making them up) and that round is from a week before today's. Such a round doesn't have to be done: it is
 * dropped, the round is the first planned day from this Monday on, and `missed` says the one before wasn't done
 * (the Week box flags it). `planned` is the round's planned day, `day` the day it is done on (moved, or the same).
 * Null = no schedule.
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

/**
 * When a task on a schedule is due again after a press on `doneOn`. Counted from the day it was done, or kept to the
 * planned days: then it is the first planned day after the round pressed, so rounds missed altogether don't pile up,
 * and one done early doesn't come back before its own day has passed. With `repeatMakeUp` they do pile up: the press
 * does the oldest round still open, and the next one is due one interval after it. Without, the press is for the
 * current round (currentRound): one left open from a week before `doneOn`'s was dropped.
 */
export function dueAfter(task: Rounds & { repeatEvery: number; nextDue: string }, doneOn: string): string {
  const { repeatEvery, repeatUnit } = task;
  if (task.repeatAfterDone) return addInterval(doneOn, repeatEvery, repeatUnit);
  if (task.repeatMakeUp) return addInterval(task.nextDue, repeatEvery, repeatUnit);
  let next = addInterval(currentRound(task, doneOn)!.planned, repeatEvery, repeatUnit);
  while (next <= doneOn) next = addInterval(next, repeatEvery, repeatUnit);
  return next;
}
