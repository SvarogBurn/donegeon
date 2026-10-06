import { appNow, localDate } from "../api/client";
import type { TaskTreeNode, TickedTasks } from "../types";
import { daysBetween } from "./dates";

/** How long something ticked stays where it was, shown as done, so it can still be taken back. */
export const KEPT_WHEN_DONE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether something done on `day` (at `at`, the server's time of it, if known yet)
 * was done less than 24 hours ago. The day settles it when it can: done today
 * is always recent, the day before yesterday never is; only for yesterday does the hour count.
 */
export function isRecent(day: string, at: string | null): boolean {
  const daysAgo = daysBetween(day, localDate());
  if (daysAgo <= 0) return true;
  if (daysAgo >= 2 || !at) return daysAgo < 2;
  return appNow().getTime() - new Date(at).getTime() < KEPT_WHEN_DONE_MS;
}

/**
 * Whether a list shows the task. A ticked one, main or subtask, stays for 24 hours, so it can be unticked;
 * after that only the Done page has it. If the user chose to hide ticked tasks, it goes at once.
 */
export function isShown(task: TaskTreeNode, ticked: TickedTasks): boolean {
  if (!task.isComplete) return true;
  if (ticked === "hide") return false;
  return !task.completedOn || isRecent(task.completedOn, task.completedAt);
}
