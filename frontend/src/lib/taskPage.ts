import type { TaskTreeNode } from "../types";

/** Only big tasks get their own page: a hard deadline and at least two subtasks. */
export function hasTaskPage(node: Pick<TaskTreeNode, "deadlineType" | "deadlineDate" | "children">) {
  return node.deadlineType === "hard" && Boolean(node.deadlineDate) && node.children.length >= 2;
}
