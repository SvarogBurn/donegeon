import { Prisma } from "@prisma/client";
import { addDays, mondayOf } from "../../../shared/dates.js";
import { insertAt } from "./taskTree.service.js";

/** The orders the user arranges by hand: a column of a table, named here so no other text reaches the SQL. */
const ORDERS = {
  taskPosition: { table: "Task", column: "position" },
  weekPosition: { table: "Task", column: "weekPosition" },
  folderPosition: { table: "Folder", column: "position" },
  noteFolderPosition: { table: "NoteFolder", column: "position" },
} as const;

/**
 * Gives each row of `order` its index there as its place in `kind`, in one statement, writing only the rows whose
 * place (`current`) changes: appending to a long list touches one row, not every task it ever had. Raw SQL,
 * so a reorder doesn't count as an edit: updatedAt, which the search sorts by, stays as it was.
 */
export async function writeOrder(db: Prisma.TransactionClient, kind: keyof typeof ORDERS, order: string[], current: Map<string, number>) {
  const { table, column } = ORDERS[kind];
  const changed = order.flatMap((id, at) => (current.get(id) === at ? [] : [{ id, at }]));
  if (changed.length === 0) return;
  await db.$executeRaw`
    UPDATE ${Prisma.raw(`"${table}"`)} SET ${Prisma.raw(`"${column}"`)} = v.at
    FROM unnest(${changed.map((row) => row.id)}::text[], ${changed.map((row) => row.at)}::int[]) AS v(id, at)
    WHERE ${Prisma.raw(`"${table}"`)}.id = v.id`;
}

/** The tables whose rows are ordered by `position`, a new one going last. */
const LAST_PLACED = { list: "List", folder: "Folder", noteFolder: "NoteFolder" } as const;

/** The place after the user's last list, folder or note folder: where a new one goes. */
export async function nextPosition(db: Prisma.TransactionClient, kind: keyof typeof LAST_PLACED, owner: string): Promise<number> {
  const [{ next }] = await db.$queryRaw<{ next: number }[]>`
    SELECT (COALESCE(MAX(position), -1) + 1)::int AS next FROM ${Prisma.raw(`"${LAST_PLACED[kind]}"`)} WHERE "userId" = ${owner}`;
  return next;
}

/**
 * Puts `taskId` at `at` among the tasks sharing its place in the tree and
 * rewrites every sibling's position, so ties and gaps can't accumulate.
 * Top-level tasks are ordered within their list; subtasks within their parent.
 */
export async function placeAmongSiblings(
  tx: Prisma.TransactionClient,
  owner: string,
  taskId: string,
  parentId: string | null,
  listId: string | null,
  at: number | undefined,
) {
  // Without a list, the tasks written into Today and those written into Week are ordered apart.
  const inWeek = !parentId && !listId && (await tx.task.findUniqueOrThrow({ where: { id: taskId } })).weekDay !== null;
  const siblings = await tx.task.findMany({
    where: {
      deletedAt: null,
      ...(parentId
        ? { userId: owner, parentId }
        : { userId: owner, parentId: null, listId, ...(!listId && { weekDay: inWeek ? { not: null } : null }) }),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true },
  });
  const others = siblings.map((s) => s.id).filter((id) => id !== taskId);
  const order = insertAt(others, taskId, at ?? others.length);
  await writeOrder(tx, "taskPosition", order, new Map(siblings.map((s) => [s.id, s.position])));
}

/**
 * Puts `taskId` on `day` of the Week box, right after `afterId` there (null = first, undefined = last), and
 * rewrites the order of that day. Each day has an order of its own, apart from the task's place in its list.
 * The Monday of this week (`today`'s) also holds what is still open from the weeks before. Only what the box
 * shows is ordered (see weekDays in the frontend's lib/week.ts): open tasks, and those ticked this week.
 * Put off to next week (or later), it is no longer for today: it leaves Today, and how long it waited there with it.
 */
export async function placeInWeek(
  tx: Prisma.TransactionClient,
  owner: string,
  taskId: string,
  day: string,
  afterId: string | null | undefined,
  today: string,
) {
  const monday = mondayOf(today);
  const onDay = await tx.task.findMany({
    where: {
      userId: owner,
      deletedAt: null,
      id: { not: taskId },
      weekDay: day === monday ? { lte: day } : day,
      OR: [{ isComplete: false }, { completedOn: { gte: monday } }],
    },
    orderBy: [{ weekPosition: "asc" }, { createdAt: "asc" }],
    select: { id: true, weekPosition: true },
  });
  const others = onDay.map((t) => t.id);
  const after = afterId ? others.indexOf(afterId) : -1;
  // A task that is no longer there (deleted or moved meanwhile) to go after: then last.
  const order = insertAt(others, taskId, afterId === undefined || (afterId && after < 0) ? others.length : after + 1);
  const putOff = day >= addDays(monday, 7);
  await tx.task.update({ where: { id: taskId }, data: { weekDay: day, ...(putOff && { todaySince: null }) } });
  await writeOrder(tx, "weekPosition", order, new Map(onDay.map((t) => [t.id, t.weekPosition])));
}
