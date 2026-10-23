import type { TaskTreeNode } from "../types";

/** A big task: a hard deadline and at least two subtasks. */
export function isBigTask(node: Pick<TaskTreeNode, "deadlineType" | "deadlineDate" | "children">) {
  return node.deadlineType === "hard" && Boolean(node.deadlineDate) && node.children.length >= 2;
}

/** Tasks with their own page: big tasks, and tasks with a note. */
export function hasTaskPage(node: Pick<TaskTreeNode, "deadlineType" | "deadlineDate" | "children" | "notes">) {
  return isBigTask(node) || Boolean(node.notes);
}

/** Any deadline, hard or soft, opens its page from the deadline boxes too, to be edited there; its row in a list still goes by hasTaskPage. */
export function hasDeadlinePage(node: Pick<TaskTreeNode, "deadlineType" | "deadlineDate" | "children" | "notes">) {
  return hasTaskPage(node) || Boolean(node.deadlineDate);
}
