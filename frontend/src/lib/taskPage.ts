import type { TaskTreeNode } from "../types";

/** Tasks with their own page: big tasks (a hard deadline and at least two subtasks), and main tasks with a note. */
export function hasTaskPage(node: Pick<TaskTreeNode, "deadlineType" | "deadlineDate" | "children" | "parentId" | "notes">) {
  const isBig = node.deadlineType === "hard" && Boolean(node.deadlineDate) && node.children.length >= 2;
  return isBig || (!node.parentId && Boolean(node.notes));
}
