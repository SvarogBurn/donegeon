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

/** A task the user meant to do on a day gone by, in Today or on a day of the Week, still open: the bell asks when to do it. */
export interface LeftUndone {
  node: TaskTreeNode;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
  /** The day it was left on: the later of its mark for Today and its day in Week. */
  day: string;
  /** Where it was left: what an answer moves (both, for a task that was in both). */
  inToday: boolean;
  inWeek: boolean;
  key: string;
}

/**
 * What was left undone: open tasks (any depth) marked for Today on a day gone by, or planned in Week for one,
 * and not since marked or planned for today or a day to come. Nothing is carried on to the next day by itself;
 * these wait in the bell until the user does them, picks a new day, or drops them. A persistent task pressed
 * since that day was done; a finished main task took its subtasks to the Done page. Latest first.
 */
export function leftUndone(trees: TaskTreeNode[], today: string): LeftUndone[] {
  const found: LeftUndone[] = [];
  const visit = (nodes: TaskTreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.isComplete) continue;
      const inToday = node.todaySince !== null && node.todaySince < today;
      const inWeek = node.weekDay !== null && node.weekDay < today;
      const planned = (node.todaySince ?? "") >= today || (node.weekDay ?? "") >= today;
      if ((inToday || inWeek) && !planned) {
        const day = [inToday ? node.todaySince! : "", inWeek ? node.weekDay! : ""].sort()[1];
        if (!(node.isPersistent && node.completions.some((press) => press.day >= day))) found.push({ node, path, day, inToday, inWeek, key: `undone:${node.id}:${day}` });
      }
      visit(node.children, [...path, plainFirstLine(node.title)]);
    }
  };
  visit(trees, []);
  return found.sort((a, b) => b.day.localeCompare(a.day));
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

// What came into Today by itself (a round due, a deadline near) and was taken out for the day, on this device: back tomorrow.
const NOT_TODAY_KEY = "donegeon.notToday";

/** The tasks taken out of Today for `day`; a list kept from another day is forgotten. */
export function readNotToday(day: string): Set<string> {
  try {
    const saved = JSON.parse(readStored(NOT_TODAY_KEY) ?? "null") as { day: string; ids: string[] } | null;
    return new Set(saved?.day === day ? saved.ids : []);
  } catch {
    return new Set();
  }
}

export function saveNotToday(day: string, ids: Set<string>) {
  writeStored(NOT_TODAY_KEY, ids.size ? JSON.stringify({ day, ids: [...ids] }) : null);
}
