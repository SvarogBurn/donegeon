import { daysBetween } from "../../../shared/dates";
import type { TaskTreeNode } from "../types";
import { plainFirstLine } from "./markup";
import { readStored, writeStored } from "./storage";

/** A task still open the day after its deadline: what the bell tells about. */
export interface PassedDeadline {
  node: TaskTreeNode;
  /** Titles of the tasks it sits under, outermost first (a subtask's main task). */
  path: string[];
  /** Days since the deadline day: 1 the day after it. */
  daysLate: number;
  /** The task and the deadline it missed: dismissing it hides this one, not a later deadline of the same task. */
  key: string;
}

export const passedKey = (node: Pick<TaskTreeNode, "id" | "deadlineDate">) => `${node.id}:${node.deadlineDate}`;

/**
 * Open tasks whose deadline day is over, the latest first. The deadline day itself is still the last day to do
 * the work in, so a task shows up here only the day after. Deadlines sit on main tasks and their direct subtasks;
 * a finished main task took its subtasks to the Done page with it.
 */
export function passedDeadlines(trees: TaskTreeNode[], today: string): PassedDeadline[] {
  const passed: PassedDeadline[] = [];
  const check = (node: TaskTreeNode, path: string[]) => {
    if (node.isComplete || !node.deadlineDate || node.deadlineDate >= today) return;
    passed.push({ node, path, daysLate: daysBetween(node.deadlineDate, today), key: passedKey(node) });
  };
  for (const main of trees) {
    if (main.isComplete) continue;
    check(main, []);
    for (const child of main.children) check(child, [plainFirstLine(main.title)]);
  }
  return passed.sort((a, b) => b.node.deadlineDate!.localeCompare(a.node.deadlineDate!));
}

// Dismissed notifications are this device's: the bell is a reminder, not part of the task.
const DISMISSED_KEY = "donegeon.dismissedNotifications";

export function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(readStored(DISMISSED_KEY) ?? "[]") as string[]);
  } catch {
    // Kept by an older version in another shape: nothing dismissed, then.
    return new Set();
  }
}

/**
 * Keeps only what still means something (`shown`: the keys of what the bell could show now): a dismissal of a
 * deadline since moved or done, or of yesterday's morning message, is forgotten.
 */
export function saveDismissed(dismissed: Set<string>, shown: string[]) {
  const live = shown.filter((key) => dismissed.has(key));
  // Storage full or blocked: the dismissal lasts until the page is closed.
  writeStored(DISMISSED_KEY, live.length ? JSON.stringify(live) : null);
}
