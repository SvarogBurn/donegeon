import { addInterval, currentRound, movedDay, type Rounds } from "../../../shared/repeat";
import type { RepeatUnit, Task } from "../types";

/** The units of a schedule, with their plural; the rules of rounds are shared with the server (shared/repeat.ts). */
export const REPEAT_UNIT_NAMES: [RepeatUnit, plural: string][] = [
  ["day", "days"],
  ["week", "weeks"],
  ["month", "months"],
];

type Scheduled = Pick<Task, "repeatEvery" | "repeatUnit">;

/** "every week", "every 3 weeks". */
export function repeatLabel({ repeatEvery, repeatUnit }: Scheduled) {
  return repeatEvery === 1 ? `every ${repeatUnit}` : `every ${repeatEvery} ${repeatUnit}s`;
}

/** A task on a schedule whose day has come (or passed) and that hasn't been done since. */
export const isDue = (task: Rounds, today: string) => (currentRound(task, today)?.day ?? "9") <= today;

/** A task on a schedule that was done for now: nothing to do until its next day. */
export const isWaiting = (task: Rounds, today: string) => (currentRound(task, today)?.day ?? "") > today;

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
