import { KEPT_WHEN_DONE_MS } from "../../../shared/constants";
import { daysBetween } from "../../../shared/dates";
import { appNow, localDate } from "./clock";
import type { TaskTreeNode, TickedTasks } from "../types";

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
 * after that only the Done page has it. A subtask of a persistent task (`inRound`) stays ticked until the next
 * round unticks it, however long that is. If the user chose to hide ticked tasks, it goes at once.
 */
export function isShown(task: TaskTreeNode, ticked: TickedTasks, inRound = false): boolean {
  if (!task.isComplete) return true;
  if (ticked === "hide") return false;
  return inRound || !task.completedOn || isRecent(task.completedOn, task.completedAt);
}

/** Whether `task` sits, at any depth, under a persistent task, looked up through `byId`. */
export function isInRound(task: TaskTreeNode, byId: Map<string, TaskTreeNode>): boolean {
  for (let above = task.parentId ? byId.get(task.parentId) : undefined; above; above = above.parentId ? byId.get(above.parentId) : undefined) {
    if (above.isPersistent) return true;
  }
  return false;
}
