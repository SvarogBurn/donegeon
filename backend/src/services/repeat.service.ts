import type { RepeatUnit } from "@prisma/client";

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

interface Schedule {
  repeatEvery: number;
  repeatUnit: RepeatUnit;
  repeatAfterDone: boolean;
  /** The round that was just done. */
  nextDue: string;
}

/**
 * When a repeating task is due again after being done on `doneOn`.
 * Counted from the day it was done, or kept to the planned days: then it is
 * the first planned day after `doneOn`, so rounds missed altogether don't pile up,
 * and one done early doesn't come back before its own day has passed.
 */
export function dueAfter(schedule: Schedule, doneOn: string): string {
  const { repeatEvery, repeatUnit } = schedule;
  if (schedule.repeatAfterDone) return addInterval(doneOn, repeatEvery, repeatUnit);
  let next = addInterval(schedule.nextDue, repeatEvery, repeatUnit);
  while (next <= doneOn) next = addInterval(next, repeatEvery, repeatUnit);
  return next;
}
