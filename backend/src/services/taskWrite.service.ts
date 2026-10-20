import { Prisma, type Task } from "@prisma/client";
import { roundMovesOf } from "../../../shared/repeat.js";
import { alreadyMade } from "../lib/clientId.js";
import { needsRestore } from "../lib/deleted.js";
import { HttpError, notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import type { MoveInput, TaskInput, TaskPatch } from "../schemas/task.js";
import { placeAmongSiblings, placeInWeek } from "./ordering.service.js";
import { assertOwnLabels, ownList, ownTask } from "./ownership.js";
import { bookTick, reverseTaskBooking } from "./points.service.js";
import { assertDeadlineDepth, assertNoDeadlineIfPersistent, MAX_DEADLINE_DEPTH, taskPatchData } from "./taskRules.js";
import { completionPatch, countedIds, findDepth, findSubtree } from "./taskTree.service.js";

/** When a change was made, as the device saw it, and on which of the user's days. */
interface Moment {
  today: string;
  at: Date;
}

/**
 * A new task: under `parentId`, at the top of `listId`, or in neither (written straight into Today, or into a day of
 * Week). `id` is made on the device for a task written offline: the task already made under it is the answer the
 * second time.
 */
export async function createTask(owner: string, input: TaskInput, { today, at }: Moment): Promise<{ task: Task; isNew: boolean }> {
  const made = input.id && alreadyMade(await prisma.task.findUnique({ where: { id: input.id } }), owner);
  if (made) return { task: made, isNew: false };
  const parentId = input.parentId ?? null;
  const listId = input.listId ?? null;

  if (parentId && listId) throw new HttpError(400, "A task goes either in a list or under a parent task");
  if (parentId) await ownTask(owner, parentId);
  if (parentId && input.deadlineDate) assertDeadlineDepth((await findDepth(prisma, parentId)) + 1);
  const isPersistent = Boolean(input.isPersistent || input.repeatEvery);
  assertNoDeadlineIfPersistent(isPersistent, input.deadlineDate);
  if (listId) await ownList(owner, listId);
  await assertOwnLabels(owner, input.goalIds, input.tagIds);

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        id: input.id,
        userId: owner,
        parentId,
        listId,
        title: input.title,
        createdAt: at,
        notes: input.notes || null,
        startDate: today,
        deadlineDate: input.deadlineDate,
        deadlineType: input.deadlineDate ? (input.deadlineType ?? "soft") : undefined,
        // Without a list or a parent it was written straight into Today (or Week), and lives only there until moved to a list.
        todaySince: input.today || (!(parentId || listId) && !input.weekDay) ? today : null,
        points: input.points,
        isPersistent,
        // A schedule makes the task persistent, due today unless another day was given.
        ...(input.repeatEvery && {
          repeatEvery: input.repeatEvery,
          repeatUnit: input.repeatUnit,
          nextDue: input.nextDue ?? today,
        }),
        goals: { connect: (input.goalIds ?? []).map((id) => ({ id })) },
        tags: { connect: (input.tagIds ?? []).map((id) => ({ id })) },
      },
    });
    if (input.weekDay) await placeInWeek(tx, owner, created.id, input.weekDay, input.weekAfter, today);
    await placeAmongSiblings(tx, owner, created.id, parentId, listId, input.index);
    return input.weekDay ? tx.task.findUniqueOrThrow({ where: { id: created.id } }) : created;
  });
  return { task, isNew: true };
}

/** An edit of anything a task has (see taskPatchData for the rules); one coming into Week goes last on today. */
export async function updateTask(task: Task, input: TaskPatch, today: string) {
  await assertOwnLabels(task.userId, input.goalIds, input.tagIds);
  if (input.deadlineDate) assertDeadlineDepth(await findDepth(prisma, task.id));
  const data = taskPatchData(task, input, today);
  return prisma.$transaction(async (tx) => {
    const changed = await tx.task.update({ where: { id: task.id }, data });
    if (!input.week || task.weekDay) return changed;
    await placeInWeek(tx, task.userId, task.id, today, undefined, today);
    return tx.task.findUniqueOrThrow({ where: { id: task.id } });
  });
}

/**
 * A round of a task on a schedule moved to another day in the Week box: the one planned on `from` is done on `to`
 * (back on its own day when `to` is `from`). Only that round moves; the ones after it keep their planned days.
 */
export function moveRound(task: Task, from: string, to: string) {
  if (!task.repeatEvery || !task.nextDue) throw new HttpError(400, "Only a task on a schedule has rounds to move");
  const { [from]: _, ...others } = roundMovesOf(task.roundMoves);
  const moves = from === to ? others : { ...others, [from]: to };
  return prisma.task.update({
    where: { id: task.id },
    data: { roundMoves: Object.keys(moves).length > 0 ? moves : Prisma.DbNull },
  });
}

/**
 * Everything beneath a task (not the task itself) that has to be done for it to be finished: a persistent task under
 * it, never finished, is left out with what is beneath it (see countedIds).
 */
export async function countedBelow(id: string) {
  const below = await prisma.task.findMany({
    where: { id: { in: (await findSubtree(prisma, [id])).map((t) => t.id) } },
    select: { id: true, parentId: true, isPersistent: true, isComplete: true, completedAt: true, completedOn: true },
  });
  const counted = new Set(countedIds(below, id));
  return below.filter((t) => t.id !== id && counted.has(t.id));
}

/**
 * Ticks (`done: true`) or unticks this one node only; parents and children are untouched. Without `done` it
 * flips. Asking for what it already is changes nothing, so a request sent twice is harmless.
 * A task can only be ticked once everything beneath it is. Ticking a task that
 * is worth something books its points (a reward's cost, in a reward list);
 * un-ticking reverses exactly that booking.
 */
export async function toggleTask(task: Task, done: boolean | undefined, { today, at }: Moment) {
  if (task.isPersistent) throw new HttpError(400, "A persistent task is done with its “done it” button");
  const next = done ?? !task.isComplete;
  if (next && !task.isComplete && (await countedBelow(task.id)).some((t) => !t.isComplete)) {
    throw new HttpError(400, "Tick its subtasks first");
  }
  return prisma.$transaction(async (tx) => {
    // The row itself is the guard: of two requests at once, only the first still finds it the other way
    // round (the second waits for it, then matches nothing), so the points are booked or reversed once.
    const { count } = await tx.task.updateMany({
      where: { id: task.id, isComplete: !next, deletedAt: null },
      data: completionPatch(task, next, at, today),
    });
    if (count === 1) {
      // A refused booking (not enough points, over the cap) throws, which takes the tick back too.
      if (next) await bookTick(tx, task);
      else await reverseTaskBooking(tx, task);
    }
    return tx.task.findUniqueOrThrow({ where: { id: task.id } });
  });
}

/** How many tasks the user has done on this day: every ticked one (subtasks too) and every "done it" press. */
export async function doneToday(owner: string, day: string) {
  const [ticked, pressed] = await Promise.all([
    prisma.task.count({ where: { userId: owner, deletedAt: null, isComplete: true, completedOn: day } }),
    prisma.taskCompletion.count({ where: { userId: owner, day } }),
  ]);
  return ticked + pressed;
}

/**
 * Moves a task (with its subtree) anywhere: reorder among siblings, under another parent, or to the top level of a
 * list. `index` counts the destination's siblings without the moved task itself.
 */
export async function moveTask(task: Task, input: MoveInput) {
  const owner = task.userId;
  // The task and everything that moves with it, each with its depth below the task.
  const moved = await findSubtree(prisma, [task.id]);

  if (input.parentId) {
    await ownTask(owner, input.parentId);
    if (moved.some((t) => t.id === input.parentId)) throw new HttpError(400, "A task can't be moved inside itself");
  } else if (input.listId) {
    await ownList(owner, input.listId);
  } else if (task.parentId || task.listId) {
    // Only tasks written straight into Today live without a list; they can be reordered there.
    throw new HttpError(400, "Today is only a view: mark the task for today instead, it stays in its list");
  }

  // Refuse rather than silently drop a deadline that would end up too deep.
  const newDepth = input.parentId ? (await findDepth(prisma, input.parentId)) + 1 : 0;
  const deepIds = moved.filter((t) => newDepth + t.depth > MAX_DEADLINE_DEPTH).map((t) => t.id);
  const tooDeep =
    deepIds.length > 0
      ? await prisma.task.findFirst({ where: { id: { in: deepIds }, deadlineDate: { not: null } }, select: { title: true } })
      : null;
  if (tooDeep) {
    throw new HttpError(
      400,
      `"${tooDeep.title}" has a deadline, and deadlines only work on main tasks and their direct subtasks. Remove the deadline first.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      // Subtasks belong to their parent's list implicitly.
      data: input.parentId ? { parentId: input.parentId, listId: null } : { parentId: null, listId: input.listId },
    });
    await placeAmongSiblings(tx, owner, task.id, input.parentId, input.parentId ? null : input.listId, input.index);
  });
}

/**
 * Soft-deletes the task and everything beneath it, stamped with one shared time so restore can tell this delete
 * apart from earlier ones in the subtree. Deleted already (a delete sent twice): nothing.
 */
export async function deleteTask(owner: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, userId: owner } });
  if (!task) throw notFound("Task");
  if (task.deletedAt) return;
  await prisma.task.updateMany({
    where: { id: { in: (await findSubtree(prisma, [task.id])).map((t) => t.id) } },
    data: { deletedAt: new Date() },
  });
}

/** Undo of a delete: brings back the task and the subtasks deleted with it, within a minute of the delete. */
export async function restoreTask(owner: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, userId: owner } });
  if (!task) throw notFound("Deleted task");
  if (!needsRestore(task.deletedAt)) return;
  if (task.parentId) {
    const parent = await prisma.task.findFirst({ where: { id: task.parentId, deletedAt: null } });
    if (!parent) throw new HttpError(409, "Its parent task was deleted too; restore that one first");
  } else if (task.listId) {
    const list = await prisma.list.findFirst({ where: { id: task.listId, deletedAt: null } });
    if (!list) throw new HttpError(409, "Its list was deleted too; restore that one first");
  }
  await prisma.task.updateMany({ where: { userId: owner, deletedAt: task.deletedAt }, data: { deletedAt: null } });
}
