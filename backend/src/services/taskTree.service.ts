import type { Prisma, Task } from "@prisma/client";

export type TaskTreeNode<T> = T & {
  children: TaskTreeNode<T>[];
  /** Its descendants at every depth that are finished with it (see countedIds), not counting the node itself. */
  descendantCount: number;
  descendantDoneCount: number;
};

type TreeInput = Pick<Task, "id" | "parentId" | "position" | "createdAt" | "isComplete" | "isPersistent">;

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
      // A persistent subtask is never finished: neither it nor its own rounds are counted by the tasks above it.
      if (child.isPersistent) continue;
      node.descendantCount += 1 + child.descendantCount;
      node.descendantDoneCount += (child.isComplete ? 1 : 0) + child.descendantDoneCount;
    }
  };
  roots.sort(bySiblingOrder);
  roots.forEach(finish);
  return roots;
}

/** Ids of a task and everything beneath it, through the subtasks `follows` lets in (with everything beneath them). */
function idsBeneath<T extends Pick<Task, "id" | "parentId">>(tasks: T[], rootId: string, follows: (task: T) => boolean): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.parentId || !follows(task)) continue;
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

/** Ids of a task and everything beneath it. */
export const subtreeIds = (tasks: Pick<Task, "id" | "parentId">[], rootId: string) => idsBeneath(tasks, rootId, () => true);

/**
 * Ids of a task and everything beneath it that has to be done for it to be finished: what a deadline counts and what
 * must be ticked before it. A persistent task under it is never finished, so it and everything beneath it (its own
 * rounds) are left out.
 */
export const countedIds = (tasks: Pick<Task, "id" | "parentId" | "isPersistent">[], rootId: string) =>
  idsBeneath(tasks, rootId, (task) => !task.isPersistent);

type FinishInput = Pick<Task, "id" | "parentId" | "isComplete" | "completedOn">;

/**
 * Ticking a main task finishes the whole task: it moves to the Done page, and
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

/** A tree is never this deep; the queries below stop there, so a loop in the data can't make them run forever. */
const MAX_DEPTH = 100;

/**
 * `rootIds` and everything beneath them that isn't deleted, at every depth, each with how far below its
 * root it sits (the root itself: 0). One query, however deep the trees, without reading the rest of the tasks.
 */
export function findSubtree(db: Prisma.TransactionClient, rootIds: string[]): Promise<{ id: string; depth: number }[]> {
  if (rootIds.length === 0) return Promise.resolve([]);
  return db.$queryRaw`
    WITH RECURSIVE below AS (
      SELECT id, 0 AS depth FROM "Task" WHERE id = ANY(${rootIds}::text[]) AND "deletedAt" IS NULL
      UNION ALL
      SELECT t.id, b.depth + 1 FROM "Task" t JOIN below b ON t."parentId" = b.id
      WHERE t."deletedAt" IS NULL AND b.depth < ${MAX_DEPTH}
    )
    SELECT id, depth FROM below`;
}

/** How deep a task sits: 0 for a top-level task, 1 for its children, and so on. */
export async function findDepth(db: Prisma.TransactionClient, id: string): Promise<number> {
  const [{ depth }] = await db.$queryRaw<{ depth: number }[]>`
    WITH RECURSIVE up AS (
      SELECT "parentId", 0 AS steps FROM "Task" WHERE id = ${id}
      UNION ALL
      SELECT t."parentId", up.steps + 1 FROM "Task" t JOIN up ON t.id = up."parentId" WHERE up.steps < ${MAX_DEPTH}
    )
    SELECT GREATEST(count(*) - 1, 0)::int AS depth FROM up`;
  return depth;
}

/**
 * Ids of the whole trees the user's tasks matching `where` sit in: up to their main tasks, then everything
 * beneath those. The rest of the user's tasks are never read, however many there are.
 */
export async function wholeTreeIds(db: Prisma.TransactionClient, owner: string, where: Prisma.TaskWhereInput): Promise<string[]> {
  const live = { userId: owner, deletedAt: null };
  const rootIds = new Set<string>();
  const asked = new Set<string>();
  let level = await db.task.findMany({ where: { ...live, ...where }, select: { id: true, parentId: true } });
  while (level.length > 0) {
    const parentIds: string[] = [];
    for (const task of level) {
      if (!task.parentId) rootIds.add(task.id);
      else if (!asked.has(task.parentId)) parentIds.push(task.parentId);
      if (task.parentId) asked.add(task.parentId);
    }
    level =
      parentIds.length > 0
        ? await db.task.findMany({ where: { ...live, id: { in: parentIds } }, select: { id: true, parentId: true } })
        : [];
  }
  return (await findSubtree(db, [...rootIds])).map((task) => task.id);
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
