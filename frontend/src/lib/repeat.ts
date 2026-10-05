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
