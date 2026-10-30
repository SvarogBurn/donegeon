import type { Prisma, Task } from "@prisma/client";
import { KEPT_WHEN_DONE_MS } from "../../../shared/constants.js";
import { addDays, mondayOf } from "../../../shared/dates.js";
import { prisma } from "../lib/prisma.js";
import { countdownForTask, todayPace } from "./countdown.service.js";
import { recordHits } from "./health.service.js";
import { subtaskValue, taskValue } from "./points.service.js";
import { staleRoundTicks } from "./repeat.service.js";
import { ancestorsOf, buildTree, wholeTreeIds, withFinishedRoots } from "./taskTree.service.js";

/** A ticked task stays in its list for 24 hours (the app's isRecent), so yesterday's ticks still go to the lists. */
const KEPT_WHEN_DONE_DAYS = Math.ceil(KEPT_WHEN_DONE_MS / (24 * 60 * 60 * 1000));
/** How many days of ticks the Done page gets at a time. */
const DONE_PAGE_DAYS = 5;
/** How many tasks a search answers with at most. */
const SEARCH_LIMIT = 30;

const live = (owner: string) => ({ userId: owner, deletedAt: null });

/** What a task is read with for the trees: its goals and tags, and those of its presses that match `presses`. */
const treeInclude = (presses: Prisma.TaskCompletionWhereInput) =>
  ({
    goals: { select: { id: true } },
    tags: { select: { id: true } },
    completions: { where: presses, select: { id: true, day: true, createdAt: true }, orderBy: { createdAt: "asc" } },
  }) satisfies Prisma.TaskInclude;

type TreeRow = Prisma.TaskGetPayload<{ include: ReturnType<typeof treeInclude> }>;

/**
 * The tasks matching `where`, each with the whole tree it sits in: up to its main task, then everything
 * beneath that. The rest of the user's tasks are never read, however many there are.
 */
async function wholeTrees(owner: string, where: Prisma.TaskWhereInput, presses: Prisma.TaskCompletionWhereInput): Promise<TreeRow[]> {
  const ids = await wholeTreeIds(prisma, owner, where);
  return ids.length > 0 ? prisma.task.findMany({ where: { id: { in: ids } }, include: treeInclude(presses) }) : [];
}

/**
 * Whole trees (see wholeTrees), each task with what the app shows on it. Tasks with a
 * deadline (hard or soft) carry today's pace, which colours their deadline pill;
 * every task carries what it is worth (and whether that is earned or spent), persistent ones their presses.
 * With them the user's health settings, for recordHits.
 */
async function valuedRows(owner: string, tasks: TreeRow[], today: string) {
  const [lists, user] = await Promise.all([
    prisma.list.findMany({ where: { userId: owner } }),
    prisma.user.findUniqueOrThrow({ where: { id: owner }, select: { todayPoints: true, healthOff: true, healthSince: true } }),
  ]);
  const { todayPoints } = user;
  const listById = new Map(lists.map((list) => [list.id, list]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const forPace = withFinishedRoots(tasks).tasks;
  const flat = tasks.map(({ goals, tags, ...task }) => {
    const root = ancestorsOf(taskById, task)[0] ?? task;
    const list = listById.get(root.listId ?? "") ?? null;
    const rootValue = taskValue(root, list, todayPoints);
    return {
      ...task,
      goalIds: goals.map((g) => g.id),
      tagIds: tags.map((t) => t.id),
      value: task.parentId ? subtaskValue(task, root, rootValue) : rootValue,
      valueKind: list?.kind ?? "task",
      pace: task.deadlineDate ? todayPace(forPace, task, today) : null,
    };
  });
  return { rows: flat, user };
}

/** Whole trees (see wholeTrees) nested under their main tasks, valued (see valuedRows). */
async function asTrees(owner: string, tasks: TreeRow[], today: string) {
  return buildTree((await valuedRows(owner, tasks, today)).rows);
}

/**
 * Subtasks of a persistent task still ticked from a round the Skip rule dropped start this one unticked, as a press
 * would have left them; their points stay, as after a press. Done when the trees are read, because only the user's
 * day says which rounds were dropped: a read that writes, on purpose.
 */
async function clearStaleRoundTicks(owner: string, tasks: TreeRow[], today: string): Promise<TreeRow[]> {
  const stale = new Set(staleRoundTicks(tasks, today));
  if (stale.size === 0) return tasks;
  const unticked = { isComplete: false, completedAt: null, completedOn: null };
  await prisma.task.updateMany({ where: { id: { in: [...stale] }, userId: owner }, data: unticked });
  return tasks.map((task) => (stale.has(task.id) ? { ...task, ...unticked } : task));
}

/**
 * The tasks the lists work with, as nested trees of top-level tasks: every main task still open, and
 * anything ticked since yesterday (which the lists keep showing for 24 hours), each with its whole tree.
 * Presses come along from yesterday on. What was finished before that is read by the Done page (donePage),
 * the dashboard's Done box (doneOn) and the stats (statRows), so this stays small as the history grows.
 */
export async function openTrees(owner: string, today: string) {
  const since = addDays(today, -KEPT_WHEN_DONE_DAYS);
  const tasks = await wholeTrees(
    owner,
    {
      OR: [
        { parentId: null, isComplete: false },
        { completedOn: { gte: since } },
        // The Week box keeps showing what was ticked in it until the week is over.
        { weekDay: { not: null }, completedOn: { gte: mondayOf(today) } },
      ],
    },
    { day: { gte: since } },
  );
  const { rows, user } = await valuedRows(owner, await clearStaleRoundTicks(owner, tasks, today), today);
  // What was missed costs the character health: a read that writes, as above, since only the user's day says what went by.
  await recordHits(owner, rows, today, user);
  return buildTree(rows);
}

/**
 * The Done page, a few days at a time, newest first: the days on which something was ticked (before `before`,
 * if given), and the trees holding what was ticked on them. `next` is the `before` of the days after these.
 */
export async function donePage(owner: string, before: string | undefined, today: string) {
  const found = await prisma.task.groupBy({
    by: ["completedOn"],
    where: { ...live(owner), isComplete: true, completedOn: { not: null, lt: before } },
    orderBy: { completedOn: "desc" },
    take: DONE_PAGE_DAYS + 1,
  });
  const days = found.slice(0, DONE_PAGE_DAYS).map((group) => group.completedOn!);
  const tasks = days.length > 0 ? await wholeTrees(owner, { isComplete: true, completedOn: { in: days } }, { day: { in: days } }) : [];
  return {
    days,
    tasks: await asTrees(owner, tasks, today),
    next: found.length > DONE_PAGE_DAYS ? days.at(-1) : null,
  };
}

/** Everything ticked or pressed on one day, for the dashboard's Done box; of the presses, only that day's. */
export async function doneOn(owner: string, day: string, today: string) {
  const tasks = await wholeTrees(owner, { OR: [{ completedOn: day }, { completions: { some: { day } } }] }, { day });
  return asTrees(owner, tasks, today);
}

/** Every task there is, cut down to what the stats count with: one small flat row each. */
export async function statRows(owner: string) {
  const tasks = await prisma.task.findMany({
    where: live(owner),
    select: {
      id: true,
      parentId: true,
      listId: true,
      title: true,
      startDate: true,
      deadlineDate: true,
      deadlineType: true,
      isComplete: true,
      completedOn: true,
      completedAt: true,
      isPersistent: true,
      repeatEvery: true,
      repeatUnit: true,
      createdAt: true,
      goals: { select: { id: true } },
      tags: { select: { id: true } },
      completions: { select: { day: true, createdAt: true } },
    },
  });
  return tasks.map(({ goals, tags, completions, ...task }) => ({
    ...task,
    goalIds: goals.map((g) => g.id),
    tagIds: tags.map((t) => t.id),
    pressDays: completions.map((press) => press.day),
    pressTimes: completions.map((press) => press.createdAt),
  }));
}

/**
 * How many tasks were done on each day, counted as the stats count them (the app's collectStats): every tick at any
 * depth and every press, of the tasks under main tasks that are not in a reward list. The task bar's face works out
 * the level and the streak from it, without loading every task there is. `only` = that day alone.
 */
export function progressDays(owner: string, only: string | null = null): Promise<{ day: string; count: number }[]> {
  return prisma.$queryRaw`
    WITH RECURSIVE counted AS (
      SELECT t.id, 0 AS depth FROM "Task" t LEFT JOIN "List" l ON l.id = t."listId"
      WHERE t."userId" = ${owner} AND t."deletedAt" IS NULL AND t."parentId" IS NULL AND (l.kind IS NULL OR l.kind <> 'reward')
      UNION ALL
      SELECT t.id, c.depth + 1 FROM "Task" t JOIN counted c ON t."parentId" = c.id WHERE t."deletedAt" IS NULL AND c.depth < 100
    ),
    done AS (
      SELECT t."completedOn" AS day FROM "Task" t JOIN counted c ON c.id = t.id
      WHERE t."completedOn" IS NOT NULL AND (${only}::text IS NULL OR t."completedOn" = ${only})
      UNION ALL
      SELECT p.day FROM "TaskCompletion" p JOIN counted c ON c.id = p."taskId" WHERE ${only}::text IS NULL OR p.day = ${only}
    )
    SELECT day, count(*)::int AS count FROM done GROUP BY day ORDER BY day`;
}

type PathRow = Pick<Task, "id" | "parentId" | "listId" | "title">;

/**
 * The search at the top of the Tasks page: every task there is whose title holds `q`, in any case, the ones finished
 * long ago too. The open ones come first, then the newest. Each says where it sits: the tasks above it (their titles
 * and ids, outermost first), and its list.
 */
export async function searchTasks(owner: string, q: string) {
  const found = await prisma.task.findMany({
    // A % or _ that was typed is looked for as itself.
    where: { ...live(owner), title: { contains: q.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } },
    orderBy: [{ isComplete: "asc" }, { updatedAt: "desc" }],
    take: SEARCH_LIMIT + 1,
    select: { id: true, parentId: true, listId: true, title: true, isComplete: true, completedOn: true, isPersistent: true },
  });
  const results = found.slice(0, SEARCH_LIMIT);

  // The tasks above the found ones, a level at a time, up to their main tasks.
  const above = new Map<string, PathRow>(results.map((task) => [task.id, task]));
  const parentsMissing = (rows: PathRow[]) => [...new Set(rows.flatMap((task) => (task.parentId && !above.has(task.parentId) ? [task.parentId] : [])))];
  for (let missing = parentsMissing(results); missing.length > 0; ) {
    const parents = await prisma.task.findMany({
      where: { ...live(owner), id: { in: missing } },
      select: { id: true, parentId: true, listId: true, title: true },
    });
    for (const parent of parents) above.set(parent.id, parent);
    missing = parentsMissing(parents);
  }

  return {
    results: results.map((task) => {
      const path = ancestorsOf(above, task);
      return {
        id: task.id,
        title: task.title,
        isComplete: task.isComplete,
        completedOn: task.completedOn,
        isPersistent: task.isPersistent,
        path: path.map((row) => row.title),
        pathIds: path.map((row) => row.id),
        listId: (path[0] ?? task).listId,
      };
    }),
    more: found.length > SEARCH_LIMIT,
  };
}

/** The spreadsheet-style per-day table of a task with a hard deadline, counted over its whole tree. */
export async function countdownOf(task: Task, today: string) {
  // Its whole tree: whether its main task is finished decides what counts as done.
  const ids = await wholeTreeIds(prisma, task.userId, { id: task.id });
  const { tasks } = withFinishedRoots(await prisma.task.findMany({ where: { id: { in: ids } } }));
  return countdownForTask(tasks, task, today);
}
