import type { Prisma } from "@prisma/client";
import { Router, type Request } from "express";
import { z } from "zod";
import { HttpError, notFound } from "../lib/httpError.js";
import { isLocalDate } from "../lib/localDate.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { addDays, countdownForTask, todayPace } from "../services/countdown.service.js";
import { bookTask, MAX_POINTS, reverseBooking, reverseTaskBooking, subtaskValue, taskValue } from "../services/points.service.js";
import { dueAfter } from "../services/repeat.service.js";
import {
  buildTree,
  completionPatch,
  depthOf,
  insertAt,
  subtreeIds,
  withFinishedRoots,
} from "../services/taskTree.service.js";

const title = z.string().trim().min(1, "Title is required").max(300);
const notes = z.string().trim().max(5000).nullish();
const index = z.number().int().min(0);
const localDate = z.string().refine(isLocalDate, "Dates must look like 2026-10-02");

const taskInput = z.object({
  title,
  notes,
  /** parentId (a subtask), listId (a top-level task in a list), or neither: a task that lives only in Today. */
  parentId: z.string().uuid().nullish(),
  listId: z.string().uuid().nullish(),
  goalIds: z.array(z.string().uuid()).max(50).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
  /** Where to insert among the new siblings; omitted = at the end. */
  index: index.optional(),
});

const taskPatch = z.object({
  title: title.optional(),
  notes,
  /** Full replacement sets: the task ends up with exactly these goals / tags. */
  goalIds: z.array(z.string().uuid()).max(50).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
  startDate: localDate.optional(),
  deadlineDate: localDate.nullable().optional(),
  deadlineType: z.enum(["hard", "soft"]).optional(),
  /** Its own amount, or null to go back to what it gets by default: the list's amount (a main task), or what its main task hands down (a subtask). */
  points: z.number().int().min(0, "Points can't be negative").max(MAX_POINTS).nullable().optional(),
  /** Main tasks only: subtasks without their own amount are worth what this task is. */
  pointsToSubtasks: z.boolean().optional(),
  /** In or out of the Today box. */
  today: z.boolean().optional(),
  /** Main tasks only: done again and again instead of once. */
  isPersistent: z.boolean().optional(),
  /** Main tasks only: due again every so many days, weeks or months (which makes it persistent); null = no schedule. */
  repeatEvery: z.number().int().min(1, "Repeat every 1 or more").max(999).nullable().optional(),
  repeatUnit: z.enum(["day", "week", "month"]).optional(),
  /** Count the next round from the day it was done instead of keeping to the planned days. */
  repeatAfterDone: z.boolean().optional(),
  /** The day the next round is due; today when a schedule is first set. */
  nextDue: localDate.optional(),
});

/** Subtasks a press unticked, as stored on the TaskCompletion. */
const untickedSchema = z.array(z.object({ id: z.string(), completedAt: z.string(), completedOn: z.string() }));

const DELETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** A ticked task stays in its list for 24 hours (the frontend's isRecent), so yesterday's ticks still go to the lists. */
const KEPT_WHEN_DONE_DAYS = 1;
/** How many days of ticks the Done page gets at a time. */
const DONE_PAGE_DAYS = 5;
/** Deadlines are allowed on top-level tasks (depth 0) and their direct subtasks (depth 1). */
const MAX_DEADLINE_DEPTH = 1;

const moveInput = z.object({
  parentId: z.string().uuid().nullable(),
  listId: z.string().uuid().nullable(),
  index,
});

async function ownTask(req: Request, id: string) {
  const task = await prisma.task.findFirst({ where: { id, userId: userId(req), deletedAt: null } });
  if (!task) throw notFound("Task");
  return task;
}

async function assertOwnLabels(req: Request, goalIds: string[] = [], tagIds: string[] = []) {
  const owner = userId(req);
  const goals = await prisma.goal.count({ where: { userId: owner, id: { in: goalIds } } });
  if (goals !== new Set(goalIds).size) throw notFound("Goal");
  const tags = await prisma.tag.count({ where: { userId: owner, id: { in: tagIds } } });
  if (tags !== new Set(tagIds).size) throw notFound("Tag");
}

async function assertOwnList(req: Request, listId: string) {
  const list = await prisma.list.findFirst({ where: { id: listId, userId: userId(req), deletedAt: null } });
  if (!list) throw notFound("List");
}

const live = (owner: string) => ({ userId: owner, deletedAt: null });
const liveTasks = (owner: string) => prisma.task.findMany({ where: live(owner) });

/**
 * Puts `taskId` at `at` among the tasks sharing its place in the tree and
 * rewrites every sibling's position, so ties and gaps can't accumulate.
 * Top-level tasks are ordered within their list; subtasks within their parent.
 */
async function placeAmongSiblings(
  tx: Prisma.TransactionClient,
  owner: string,
  taskId: string,
  parentId: string | null,
  listId: string | null,
  at: number | undefined,
) {
  const siblings = await tx.task.findMany({
    where: {
      deletedAt: null,
      ...(parentId ? { userId: owner, parentId } : { userId: owner, parentId: null, listId }),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const others = siblings.map((s) => s.id).filter((id) => id !== taskId);
  const order = insertAt(others, taskId, at ?? others.length);
  await Promise.all(order.map((id, position) => tx.task.update({ where: { id }, data: { position } })));
}

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
async function wholeTrees(owner: string, where: Prisma.TaskWhereInput, presses: Prisma.TaskCompletionWhereInput) {
  const rootIds = new Set<string>();
  const asked = new Set<string>();
  let level = await prisma.task.findMany({ where: { ...live(owner), ...where }, select: { id: true, parentId: true } });
  while (level.length > 0) {
    const parentIds: string[] = [];
    for (const task of level) {
      if (!task.parentId) rootIds.add(task.id);
      else if (!asked.has(task.parentId)) parentIds.push(task.parentId);
      if (task.parentId) asked.add(task.parentId);
    }
    level =
      parentIds.length > 0
        ? await prisma.task.findMany({ where: { ...live(owner), id: { in: parentIds } }, select: { id: true, parentId: true } })
        : [];
  }

  const include = treeInclude(presses);
  const tasks: TreeRow[] = [];
  let row = await prisma.task.findMany({ where: { ...live(owner), id: { in: [...rootIds] } }, include });
  while (row.length > 0) {
    tasks.push(...row);
    row = await prisma.task.findMany({ where: { ...live(owner), parentId: { in: row.map((task) => task.id) } }, include });
  }
  return tasks;
}

/**
 * Whole trees (see wholeTrees) nested under their main tasks. Tasks with a
 * deadline (hard or soft) carry today's pace, which colours their deadline pill;
 * every task carries what it is worth (and whether that is earned or spent), persistent ones their presses.
 */
async function asTrees(owner: string, tasks: TreeRow[], today: string) {
  const [lists, { todayPoints }] = await Promise.all([
    prisma.list.findMany({ where: { userId: owner } }),
    prisma.user.findUniqueOrThrow({ where: { id: owner }, select: { todayPoints: true } }),
  ]);
  const listById = new Map(lists.map((list) => [list.id, list]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const forPace = withFinishedRoots(tasks).tasks;
  const flat = tasks.map(({ goals, tags, ...task }) => {
    let root = task;
    while (root.parentId && taskById.has(root.parentId)) root = taskById.get(root.parentId)!;
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
  return buildTree(flat);
}

export const tasksRouter = Router();

// The tasks the lists work with, as nested trees of top-level tasks: every main task still open, and
// anything ticked since yesterday (which the lists keep showing for 24 hours), each with its whole tree.
// Presses come along from yesterday on. What was finished before that is read by the Done page (/done),
// the dashboard's Done box (/done/:day) and the stats (/stats), so this stays small as the history grows.
tasksRouter.get("/", async (req, res) => {
  const owner = userId(req);
  // Deleted tasks stay restorable for a while, then are removed for good.
  await prisma.task.deleteMany({
    where: { userId: owner, deletedAt: { lt: new Date(Date.now() - DELETED_RETENTION_MS) } },
  });
  const since = addDays(req.localDate, -KEPT_WHEN_DONE_DAYS);
  const tasks = await wholeTrees(
    owner,
    { OR: [{ parentId: null, isComplete: false }, { completedOn: { gte: since } }] },
    { day: { gte: since } },
  );
  res.json({ tasks: await asTrees(owner, tasks, req.localDate) });
});

// The Done page, a few days at a time, newest first: the days on which something was ticked (before `before`,
// if given), and the trees holding what was ticked on them. `next` is the `before` of the days after these.
tasksRouter.get("/done", async (req, res) => {
  const before = localDate.optional().parse(req.query.before);
  const owner = userId(req);
  const found = await prisma.task.groupBy({
    by: ["completedOn"],
    where: { ...live(owner), isComplete: true, completedOn: { not: null, lt: before } },
    orderBy: { completedOn: "desc" },
    take: DONE_PAGE_DAYS + 1,
  });
  const days = found.slice(0, DONE_PAGE_DAYS).map((group) => group.completedOn!);
  const tasks = days.length > 0 ? await wholeTrees(owner, { isComplete: true, completedOn: { in: days } }, { day: { in: days } }) : [];
  res.json({
    days,
    tasks: await asTrees(owner, tasks, req.localDate),
    next: found.length > DONE_PAGE_DAYS ? days.at(-1) : null,
  });
});

// Everything ticked or pressed on one day, for the dashboard's Done box; of the presses, only that day's.
tasksRouter.get("/done/:day", async (req, res) => {
  const day = localDate.parse(req.params.day);
  const owner = userId(req);
  const tasks = await wholeTrees(owner, { OR: [{ completedOn: day }, { completions: { some: { day } } }] }, { day });
  res.json({ tasks: await asTrees(owner, tasks, req.localDate) });
});

// Every task there is, cut down to what the stats count with: one small flat row each.
tasksRouter.get("/stats", async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: live(userId(req)),
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
      isPersistent: true,
      createdAt: true,
      goals: { select: { id: true } },
      tags: { select: { id: true } },
      completions: { select: { day: true } },
    },
  });
  res.json({
    tasks: tasks.map(({ goals, tags, completions, ...task }) => ({
      ...task,
      goalIds: goals.map((g) => g.id),
      tagIds: tags.map((t) => t.id),
      pressDays: completions.map((press) => press.day),
    })),
  });
});

tasksRouter.get("/:id", async (req, res) => {
  res.json({ task: await ownTask(req, req.params.id) });
});

// The spreadsheet-style per-day table for a task with a hard deadline.
tasksRouter.get("/:id/countdown", async (req, res) => {
  const task = await ownTask(req, req.params.id);
  if (task.deadlineType !== "hard" || !task.deadlineDate) {
    throw new HttpError(400, "Only tasks with a hard deadline have a countdown");
  }
  const { tasks } = withFinishedRoots(await liveTasks(userId(req)));
  res.json({
    task: { id: task.id, title: task.title, parentId: task.parentId },
    countdown: countdownForTask(tasks, task, req.localDate),
  });
});

tasksRouter.post("/", async (req, res) => {
  const input = taskInput.parse(req.body);
  const owner = userId(req);
  const parentId = input.parentId ?? null;
  const listId = input.listId ?? null;

  if (parentId && listId) throw new HttpError(400, "A task goes either in a list or under a parent task");
  if (parentId) await ownTask(req, parentId);
  if (listId) await assertOwnList(req, listId);
  await assertOwnLabels(req, input.goalIds, input.tagIds);

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        userId: owner,
        parentId,
        listId,
        title: input.title,
        notes: input.notes || null,
        startDate: req.localDate,
        // Without a list or a parent it was written straight into Today, and lives only there until moved to a list.
        todaySince: parentId || listId ? null : req.localDate,
        goals: { connect: (input.goalIds ?? []).map((id) => ({ id })) },
        tags: { connect: (input.tagIds ?? []).map((id) => ({ id })) },
      },
    });
    await placeAmongSiblings(tx, owner, created.id, parentId, listId, input.index);
    return created;
  });
  res.status(201).json({ task });
});

tasksRouter.patch("/:id", async (req, res) => {
  const input = taskPatch.parse(req.body);
  const task = await ownTask(req, req.params.id);
  const data: Prisma.TaskUpdateInput = {
    title: input.title,
    notes: input.notes === undefined ? undefined : input.notes || null,
    startDate: input.startDate,
  };

  // Any task, at any depth, can carry any number of goals and tags.
  await assertOwnLabels(req, input.goalIds, input.tagIds);
  if (input.goalIds) data.goals = { set: input.goalIds.map((id) => ({ id })) };
  if (input.tagIds) data.tags = { set: input.tagIds.map((id) => ({ id })) };

  // Hard/soft is the user's own choice and can be picked before there is a
  // date; it only has an effect once a date is set.
  if (input.deadlineType) data.deadlineType = input.deadlineType;
  data.points = input.points;
  if (input.pointsToSubtasks !== undefined) {
    if (task.parentId) throw new HttpError(400, "Only a main task can hand its points down to its subtasks");
    data.pointsToSubtasks = input.pointsToSubtasks;
  }
  if (input.today === false && !task.parentId && !task.listId) {
    throw new HttpError(400, "This task only lives in Today. Move it to a list first, or delete it.");
  }
  if (input.today !== undefined) data.todaySince = input.today ? (task.todaySince ?? req.localDate) : null;

  // A schedule only makes sense on a task that is done again and again, so setting one makes the task persistent.
  const isPersistent = input.isPersistent ?? (input.repeatEvery ? true : task.isPersistent);
  if (isPersistent && !task.isPersistent) {
    if (task.parentId) throw new HttpError(400, "Only main tasks can be persistent");
    if (task.isComplete) throw new HttpError(400, "Untick it first");
  }
  if (isPersistent && (input.deadlineDate === undefined ? task.deadlineDate : input.deadlineDate)) {
    throw new HttpError(400, "A persistent task is never finished, so it can't have a deadline. Remove one or the other.");
  }
  data.isPersistent = isPersistent;
  const repeatEvery = input.repeatEvery === undefined ? task.repeatEvery : input.repeatEvery;
  if (!isPersistent || !repeatEvery) {
    data.repeatEvery = null;
    data.nextDue = null;
  } else {
    data.repeatEvery = repeatEvery;
    data.repeatUnit = input.repeatUnit;
    data.repeatAfterDone = input.repeatAfterDone;
    data.nextDue = input.nextDue ?? task.nextDue ?? req.localDate;
  }

  if (input.deadlineDate !== undefined) {
    if (input.deadlineDate && depthOf(await liveTasks(task.userId), task.id) > MAX_DEADLINE_DEPTH) {
      throw new HttpError(400, "Deadlines can only be set on main tasks and their direct subtasks");
    }
    data.deadlineDate = input.deadlineDate;
    // A date edit never rewrites an existing type, so it can't undo a concurrent hard/soft switch.
    if (input.deadlineDate && !input.deadlineType && !task.deadlineType) data.deadlineType = "hard";
  }

  res.json({ task: await prisma.task.update({ where: { id: task.id }, data }) });
});

// Flips completion for this one node only; parents and children are untouched.
// A task can only be ticked once everything beneath it is. Ticking a task that
// is worth something books its points (a reward's cost, in a reward list);
// un-ticking reverses exactly that booking.
tasksRouter.patch("/:id/toggle", async (req, res) => {
  const task = await ownTask(req, req.params.id);
  if (task.isPersistent) throw new HttpError(400, "A persistent task is done with its “done it” button");
  if (!task.isComplete) {
    const all = await liveTasks(task.userId);
    const below = new Set(subtreeIds(all, task.id));
    if (all.some((t) => below.has(t.id) && t.id !== task.id && !t.isComplete)) {
      throw new HttpError(400, "Tick its subtasks first");
    }
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (task.isComplete) await reverseTaskBooking(tx, task);
    else await bookTask(tx, task);
    return tx.task.update({
      where: { id: task.id },
      data: completionPatch(task, !task.isComplete, new Date(), req.localDate),
    });
  });
  res.json({ task: updated });
});

// One press of a persistent task's "done it" button: logs it, books the points
// and unticks its subtasks for the next round. The task itself stays open; on a
// schedule, it is due again one interval on.
tasksRouter.post("/:id/completions", async (req, res) => {
  const task = await ownTask(req, req.params.id);
  if (!task.isPersistent || task.parentId) throw new HttpError(400, "Only persistent tasks can be done again and again");
  const all = await liveTasks(task.userId);
  const below = new Set(subtreeIds(all, task.id));
  const ticked = all.filter((t) => below.has(t.id) && t.id !== task.id && t.completedAt && t.completedOn);

  const { repeatEvery, nextDue } = task;
  const dueBefore = repeatEvery && nextDue ? nextDue : null;

  const completion = await prisma.$transaction(async (tx) => {
    const booked = await bookTask(tx, task);
    if (repeatEvery && nextDue) {
      await tx.task.update({
        where: { id: task.id },
        data: { nextDue: dueAfter({ ...task, repeatEvery, nextDue }, req.localDate) },
      });
    }
    await tx.task.updateMany({
      where: { id: { in: ticked.map((t) => t.id) } },
      data: { isComplete: false, completedAt: null, completedOn: null },
    });
    return tx.taskCompletion.create({
      data: {
        userId: task.userId,
        taskId: task.id,
        day: req.localDate,
        pointTransactionId: booked?.id ?? null,
        dueBefore,
        unticked: ticked.map((t) => ({ id: t.id, completedAt: t.completedAt!.toISOString(), completedOn: t.completedOn! })),
      },
    });
  });
  res.status(201).json({ completion: { id: completion.id, day: completion.day } });
});

// Undo of a press: the log entry goes, its points are reversed, the subtasks
// it unticked get their ticks back and a scheduled task is due when it was before.
tasksRouter.delete("/:id/completions/:completionId", async (req, res) => {
  const task = await ownTask(req, req.params.id);
  const completion = await prisma.taskCompletion.findFirst({
    where: { id: req.params.completionId, taskId: task.id },
  });
  if (!completion) throw notFound("Completion");
  const unticked = untickedSchema.catch([]).parse(completion.unticked);

  await prisma.$transaction(async (tx) => {
    const booked = completion.pointTransactionId
      ? await tx.pointTransaction.findUnique({ where: { id: completion.pointTransactionId } })
      : null;
    if (booked) await reverseBooking(tx, booked);
    for (const sub of unticked) {
      await tx.task.updateMany({
        where: { id: sub.id, userId: task.userId, isComplete: false },
        data: { isComplete: true, completedAt: new Date(sub.completedAt), completedOn: sub.completedOn },
      });
    }
    if (completion.dueBefore && task.repeatEvery) {
      await tx.task.update({ where: { id: task.id }, data: { nextDue: completion.dueBefore } });
    }
    await tx.taskCompletion.delete({ where: { id: completion.id } });
  });
  res.status(204).end();
});

// Moves a task (with its subtree) anywhere: reorder among siblings, under
// another parent, or to the top level of a list. `index` counts the
// destination's siblings without the moved task itself.
tasksRouter.post("/:id/move", async (req, res) => {
  const input = moveInput.parse(req.body);
  const owner = userId(req);
  const task = await ownTask(req, req.params.id);
  const all = await liveTasks(owner);
  const moved = subtreeIds(all, task.id);

  if (input.parentId) {
    if (!all.some((t) => t.id === input.parentId)) throw notFound("Task");
    if (moved.includes(input.parentId)) throw new HttpError(400, "A task can't be moved inside itself");
  } else if (input.listId) {
    await assertOwnList(req, input.listId);
  } else if (task.parentId || task.listId) {
    // Only tasks written straight into Today live without a list; they can be reordered there.
    throw new HttpError(400, "Today is only a view: mark the task for today instead, it stays in its list");
  }
  if (input.parentId && task.isPersistent) {
    throw new HttpError(400, `"${task.title}" is persistent, and only main tasks can be. Switch that off first.`);
  }

  // Refuse rather than silently drop a deadline that would end up too deep.
  const depthChange = (input.parentId ? depthOf(all, input.parentId) + 1 : 0) - depthOf(all, task.id);
  const tooDeep = all.find(
    (t) => moved.includes(t.id) && t.deadlineDate && depthOf(all, t.id) + depthChange > MAX_DEADLINE_DEPTH,
  );
  if (tooDeep) {
    throw new HttpError(
      400,
      `"${tooDeep.title}" has a deadline, and deadlines only work on main tasks and their direct subtasks. Remove the deadline first.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: input.parentId
        ? // Subtasks belong to their parent's list implicitly.
          { parentId: input.parentId, listId: null }
        : { parentId: null, listId: input.listId },
    });
    await placeAmongSiblings(tx, owner, task.id, input.parentId, input.parentId ? null : input.listId, input.index);
  });
  res.status(204).end();
});

// Soft-deletes the task and everything beneath it, stamped with one shared
// time so restore can tell this delete apart from earlier ones in the subtree.
tasksRouter.delete("/:id", async (req, res) => {
  const task = await ownTask(req, req.params.id);
  const all = await liveTasks(userId(req));
  await prisma.task.updateMany({
    where: { id: { in: subtreeIds(all, task.id) } },
    data: { deletedAt: new Date() },
  });
  res.status(204).end();
});

// Undo of a delete: brings back the task and the subtasks deleted with it.
tasksRouter.post("/:id/restore", async (req, res) => {
  const owner = userId(req);
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, userId: owner, deletedAt: { not: null } },
  });
  if (!task) throw notFound("Deleted task");
  if (task.parentId) {
    const parent = await prisma.task.findFirst({ where: { id: task.parentId, deletedAt: null } });
    if (!parent) throw new HttpError(409, "Its parent task was deleted too; restore that one first");
  } else if (task.listId) {
    const list = await prisma.list.findFirst({ where: { id: task.listId, deletedAt: null } });
    if (!list) throw new HttpError(409, "Its list was deleted too; restore that one first");
  }
  await prisma.task.updateMany({ where: { userId: owner, deletedAt: task.deletedAt }, data: { deletedAt: null } });
  res.status(204).end();
});
