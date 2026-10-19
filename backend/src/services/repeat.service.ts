import type { RepeatUnit } from "@prisma/client";
import { mondayOf } from "../lib/localDate.js";

const pad = (n: number) => String(n).padStart(2, "0");

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
    return `${year}-${pad(month + 1)}-${pad(Math.min(date.getUTCDate(), lastDay))}`;
  }
  date.setUTCDate(date.getUTCDate() + every * (unit === "week" ? 7 : 1));
  return date.toISOString().slice(0, 10);
}

/** A task's moved rounds as stored (JSON): planned day -> the day it was moved to; anything else counts as none. */
export function roundMovesOf(stored: unknown): Record<string, string> {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** The moves of rounds still to come: those of rounds before `nextDue` are done (or dropped) and go. Null = none left. */
export function movesFrom(stored: unknown, nextDue: string): Record<string, string> | null {
  const left = Object.entries(roundMovesOf(stored)).filter(([planned]) => planned >= nextDue);
  return left.length > 0 ? Object.fromEntries(left) : null;
}

interface Schedule {
  repeatEvery: number;
  repeatUnit: RepeatUnit;
  repeatAfterDone: boolean;
  /** Missed rounds are still to be done, one press each. */
  repeatMakeUp: boolean;
  /** Rounds moved to another day: planned day -> that day. */
  roundMoves?: unknown;
  /** The round that was just done. */
  nextDue: string;
}

/**
 * When a repeating task is due again after being done on `doneOn`.
 * Counted from the day it was done, or kept to the planned days: then it is
 * the first planned day after `doneOn`, so rounds missed altogether don't pile up,
 * and one done early doesn't come back before its own day has passed. With `repeatMakeUp` they do pile up:
 * the press does the oldest round still open, and the next one is due one interval after it. Without, a round
 * left open from a week before `doneOn`'s is dropped (the frontend's currentRound): the press is for the first
 * planned day from that Monday on, early or not.
 */
export function dueAfter(schedule: Schedule, doneOn: string): string {
  const { repeatEvery, repeatUnit } = schedule;
  if (schedule.repeatAfterDone) return addInterval(doneOn, repeatEvery, repeatUnit);
  if (schedule.repeatMakeUp) return addInterval(schedule.nextDue, repeatEvery, repeatUnit);
  const monday = mondayOf(doneOn);
  const moves = roundMovesOf(schedule.roundMoves);
  let round = schedule.nextDue;
  while ((moves[round] ?? round) < monday) round = addInterval(round, repeatEvery, repeatUnit);
  let next = addInterval(round, repeatEvery, repeatUnit);
  while (next <= doneOn) next = addInterval(next, repeatEvery, repeatUnit);
  return next;
}

/** What a row needs for staleRoundTicks: its place in the tree, its tick and, on a main task, its schedule. */
interface RoundRow {
  id: string;
  parentId: string | null;
  isPersistent: boolean;
  repeatEvery: number | null;
  repeatUnit: RepeatUnit;
  repeatAfterDone: boolean;
  repeatMakeUp: boolean;
  roundMoves?: unknown;
  nextDue: string | null;
  isComplete: boolean;
  completedOn: string | null;
}

/**
 * The subtasks (any depth) still ticked from a round the Skip rule dropped by `today`. A press unticks a persistent
 * task's subtasks for the next round; a round that was never pressed but dropped (its day is before today's Monday,
 * on planned days without making rounds up: the frontend's currentRound, `missed`) starts the next one the same way.
 * Ticks from this Monday on are kept: they are for the round now open.
 */
export function staleRoundTicks(rows: RoundRow[], today: string): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const monday = mondayOf(today);
  const rootOf = (row: RoundRow) => {
    let root = row;
    while (root.parentId && byId.has(root.parentId)) root = byId.get(root.parentId)!;
    return root;
  };
  const dropped = (root: RoundRow) => {
    if (!root.isPersistent || root.parentId || !root.repeatEvery || !root.nextDue || root.repeatAfterDone || root.repeatMakeUp) return false;
    return (roundMovesOf(root.roundMoves)[root.nextDue] ?? root.nextDue) < monday;
  };
  return rows
    .filter((row) => row.parentId && row.isComplete && row.completedOn && row.completedOn < monday && dropped(rootOf(row)))
    .map((row) => row.id);
}
