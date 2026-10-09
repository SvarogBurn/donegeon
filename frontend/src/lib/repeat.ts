import type { RepeatUnit, Task } from "../types";

export const REPEAT_UNITS: [RepeatUnit, plural: string][] = [
  ["day", "days"],
  ["week", "weeks"],
  ["month", "months"],
];

type Scheduled = Pick<Task, "repeatEvery" | "repeatUnit" | "nextDue">;

/** "every week", "every 3 weeks". */
export function repeatLabel({ repeatEvery, repeatUnit }: Scheduled) {
  return repeatEvery === 1 ? `every ${repeatUnit}` : `every ${repeatEvery} ${repeatUnit}s`;
}

/** A task on a schedule whose day has come (or passed) and that hasn't been done since. */
export const isDue = (task: Scheduled, today: string) => task.nextDue !== null && task.nextDue <= today;

/** A task on a schedule that was done for now: nothing to do until its next day. */
export const isWaiting = (task: Scheduled, today: string) => task.nextDue !== null && task.nextDue > today;

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
