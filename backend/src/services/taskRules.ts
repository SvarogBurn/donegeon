import { Prisma, type Task } from "@prisma/client";
import { HttpError } from "../lib/httpError.js";
import type { TaskPatch } from "../schemas/task.js";

/** Deadlines are allowed on top-level tasks (depth 0) and their direct subtasks (depth 1). */
export const MAX_DEADLINE_DEPTH = 1;

const DEADLINE_TOO_DEEP = "Deadlines can only be set on main tasks and their direct subtasks";
const PERSISTENT_DEADLINE = "A persistent task is never finished, so it can't have a deadline. Remove one or the other.";

/** A deadline on a task this deep (0 = a main task) is refused. */
export function assertDeadlineDepth(depth: number) {
  if (depth > MAX_DEADLINE_DEPTH) throw new HttpError(400, DEADLINE_TOO_DEEP);
}

/** A task done again and again is never finished, so a deadline means nothing on it. */
export function assertNoDeadlineIfPersistent(isPersistent: boolean, deadlineDate: string | null | undefined) {
  if (isPersistent && deadlineDate) throw new HttpError(400, PERSISTENT_DEADLINE);
}

type Current = Pick<
  Task,
  "parentId" | "listId" | "weekDay" | "todaySince" | "isPersistent" | "isComplete" | "deadlineDate" | "deadlineType" | "repeatEvery" | "nextDue"
>;

/**
 * What an edit of `task` writes, on the user's `today`; throws when the edit isn't allowed. Labels and the deadline's
 * depth are checked by the caller, which has to read the database for them.
 */
export function taskPatchData(task: Current, input: TaskPatch, today: string): Prisma.TaskUpdateInput {
  const data: Prisma.TaskUpdateInput = {
    title: input.title,
    notes: input.notes === undefined ? undefined : input.notes || null,
    startDate: input.startDate,
    points: input.points,
  };

  // Any task, at any depth, can carry any number of goals and tags.
  if (input.goalIds) data.goals = { set: input.goalIds.map((id) => ({ id })) };
  if (input.tagIds) data.tags = { set: input.tagIds.map((id) => ({ id })) };

  // Hard/soft is the user's own choice and can be picked before there is a
  // date; it only has an effect once a date is set.
  if (input.deadlineType) data.deadlineType = input.deadlineType;
  if (input.pointsToSubtasks !== undefined) {
    if (task.parentId) throw new HttpError(400, "Only a main task can hand its points down to its subtasks");
    data.pointsToSubtasks = input.pointsToSubtasks;
  }

  // A task without a list lives in Today or in Week, so it can't leave the last of them.
  const inNoList = !task.parentId && !task.listId;
  if (input.today === false && inNoList && !task.weekDay) {
    throw new HttpError(400, "This task only lives in Today. Move it to a list first, or delete it.");
  }
  if (input.week === false && inNoList && !task.todaySince) {
    throw new HttpError(400, "This task only lives in Week. Move it to a list first, or delete it.");
  }
  if (input.today !== undefined) data.todaySince = input.today ? (task.todaySince ?? today) : null;
  if (input.week === false) data.weekDay = null;

  // A schedule only makes sense on a task that is done again and again, so setting one makes the task persistent.
  const isPersistent = input.isPersistent ?? (input.repeatEvery ? true : task.isPersistent);
  if (isPersistent && !task.isPersistent && task.isComplete) throw new HttpError(400, "Untick it first");
  assertNoDeadlineIfPersistent(isPersistent, input.deadlineDate === undefined ? task.deadlineDate : input.deadlineDate);
  data.isPersistent = isPersistent;
  const repeatEvery = input.repeatEvery === undefined ? task.repeatEvery : input.repeatEvery;
  // A changed schedule has other rounds: moved ones are forgotten.
  const reschedules = [input.repeatEvery, input.repeatUnit, input.repeatAfterDone, input.nextDue].some((v) => v !== undefined);
  if (!isPersistent || !repeatEvery || reschedules) data.roundMoves = Prisma.DbNull;
  if (!isPersistent || !repeatEvery) {
    data.repeatEvery = null;
    data.nextDue = null;
  } else {
    data.repeatEvery = repeatEvery;
    data.repeatUnit = input.repeatUnit;
    data.repeatAfterDone = input.repeatAfterDone;
    data.repeatMakeUp = input.repeatMakeUp;
    data.nextDue = input.nextDue ?? task.nextDue ?? today;
  }

  if (input.deadlineDate !== undefined) {
    data.deadlineDate = input.deadlineDate;
    // A date edit never rewrites an existing type, so it can't undo a concurrent hard/soft switch.
    if (input.deadlineDate && !input.deadlineType && !task.deadlineType) data.deadlineType = "hard";
  }
  return data;
}
