import type { Task } from "@prisma/client";

export type TaskTreeNode<T> = T & {
  children: TaskTreeNode<T>[];
  /** All descendants at every depth, not counting the node itself. */
  descendantCount: number;
  descendantDoneCount: number;
};

type TreeInput = Pick<Task, "id" | "parentId" | "position" | "createdAt" | "isComplete">;

function bySiblingOrder(a: TreeInput, b: TreeInput) {
  return a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime();
}

/** Turns a flat list of one user's tasks into nested trees of top-level tasks. */
export function buildTree<T extends TreeInput>(tasks: T[]): TaskTreeNode<T>[] {
  const nodes = new Map<string, TaskTreeNode<T>>();
  for (const task of tasks) {
    nodes.set(task.id, { ...task, children: [], descendantCount: 0, descendantDoneCount: 0 });
  }

  const roots: TaskTreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else if (!node.parentId) roots.push(node);
  }

  const finish = (node: TaskTreeNode<T>) => {
    node.children.sort(bySiblingOrder);
    for (const child of node.children) {
      finish(child);
      node.descendantCount += 1 + child.descendantCount;
      node.descendantDoneCount += (child.isComplete ? 1 : 0) + child.descendantDoneCount;
    }
  };
  roots.sort(bySiblingOrder);
  roots.forEach(finish);
  return roots;
}

/** Ids of a task and everything beneath it. */
export function subtreeIds(tasks: Pick<Task, "id" | "parentId">[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const siblings = childrenOf.get(task.parentId) ?? [];
    siblings.push(task.id);
    childrenOf.set(task.parentId, siblings);
  }
  const ids: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    ids.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return ids;
}

type FinishInput = Pick<Task, "id" | "parentId" | "isComplete" | "completedOn">;

/**
 * Ticking a main task finishes the whole task: it moves to the Done tab, and
 * for the deadline numbers everything still open beneath it counts as done
 * that day. Returns the tasks seen that way, plus the ids inside finished tasks.
 */
export function withFinishedRoots<T extends FinishInput>(tasks: T[]): { tasks: T[]; finished: Set<string> } {
  const finishedOn = new Map<string, string>();
  for (const root of tasks) {
    if (root.parentId || !root.isComplete || !root.completedOn) continue;
    for (const id of subtreeIds(tasks, root.id)) finishedOn.set(id, root.completedOn);
  }
  return {
    tasks: tasks.map((task) => {
      const day = finishedOn.get(task.id);
      return day && !task.completedOn ? { ...task, completedOn: day } : task;
    }),
    finished: new Set(finishedOn.keys()),
  };
}

/** 0 for a top-level task, 1 for its children, and so on. */
export function depthOf(tasks: Pick<Task, "id" | "parentId">[], id: string): number {
  const parentOf = new Map(tasks.map((t) => [t.id, t.parentId]));
  let depth = 0;
  for (let current = parentOf.get(id); current; current = parentOf.get(current)) depth++;
  return depth;
}

/** `ids` with `id` inserted at `index` (clamped to the list). `ids` must not already contain `id`. */
export function insertAt(ids: string[], id: string, index: number): string[] {
  const at = Math.max(0, Math.min(index, ids.length));
  return [...ids.slice(0, at), id, ...ids.slice(at)];
}

type CompletionState = Pick<Task, "isComplete" | "completedAt" | "completedOn">;

/**
 * The spreadsheet's x -> date rule: completing stamps the day once, completing
 * an already-complete task leaves the stamp alone, un-completing clears it.
 */
export function completionPatch(
  task: CompletionState,
  nextIsComplete: boolean,
  now: Date,
  localDate: string,
): CompletionState {
  if (!nextIsComplete) return { isComplete: false, completedAt: null, completedOn: null };
  if (task.isComplete && task.completedAt && task.completedOn) {
    return { isComplete: true, completedAt: task.completedAt, completedOn: task.completedOn };
  }
  return { isComplete: true, completedAt: now, completedOn: localDate };
}
