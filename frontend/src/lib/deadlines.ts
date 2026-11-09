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

/**
 * A big task whose deadline has passed, finished with what was done: its subtasks not done are deleted (`remove`), the
 * ticked ones stay, and an open one with something kept under it stays too, its own open parts deleted and it ticked
 * after them (`tick`, deepest first, the big task last). A persistent task is never finished and isn't counted above
 * it (it doesn't hold up a tick), so it is kept as it is, with everything beneath it, at any depth.
 */
export function finishingPlan(node: TaskTreeNode): { remove: string[]; tick: string[] } {
  const remove: string[] = [];
  const tick: string[] = [];
  const holdsKept = (task: TaskTreeNode): boolean => task.children.some((child) => child.isPersistent || child.isComplete || holdsKept(child));
  const finish = (task: TaskTreeNode) => {
    for (const child of task.children) {
      if (child.isPersistent || child.isComplete) continue;
      if (holdsKept(child)) finish(child);
      else remove.push(child.id);
    }
    tick.push(task.id);
  };
  finish(node);
  return { remove, tick };
}
