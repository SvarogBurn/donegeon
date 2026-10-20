import { addDays } from "../../../shared/dates";
import type { DeadlineToday, TaskTreeNode } from "../types";

type Dated = Pick<TaskTreeNode, "deadlineDate" | "nextDue">;

/** The day a task is ordered by: its deadline (hard or soft), or else the next day of its schedule. Null = it has no date. */
export const orderDay = (task: Dated) => task.deadlineDate ?? task.nextDue;

/** Soonest date first; tasks without a date under them. Tasks on the same day, or without one, keep the user's own order. */
export function soonestFirst<T extends Dated>(tasks: T[]): T[] {
  // "9" is past every day there is.
  const key = (task: T) => orderDay(task) ?? "9";
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => key(a.task).localeCompare(key(b.task)) || a.index - b.index)
    .map(({ task }) => task);
}

/**
 * The day a task comes into Today because of its deadline, by the user's choice on their page: the day of the
 * deadline, or the day before it. Null = it doesn't: the choice is off, it has no deadline, or it is done again
 * and again (such a task would never leave).
 */
export function deadlineTodayFrom(task: Pick<TaskTreeNode, "deadlineDate" | "isPersistent">, choice: DeadlineToday): string | null {
  if (choice === "never" || !task.deadlineDate || task.isPersistent) return null;
  return choice === "dayBefore" ? addDays(task.deadlineDate, -1) : task.deadlineDate;
}
