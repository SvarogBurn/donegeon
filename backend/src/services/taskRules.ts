import { Prisma, type Task } from "@prisma/client";
import { addDays, mondayOf } from "../../../shared/dates.js";
import { HttpError } from "../lib/httpError.js";
import type { TaskInput, TaskPatch } from "../schemas/task.js";

/** Deadlines are allowed on top-level tasks (depth 0) and their direct subtasks (depth 1). */
export const MAX_DEADLINE_DEPTH = 1;

const DEADLINE_TOO_DEEP = "Deadlines can only be set on main tasks and their direct subtasks";
const PERSISTENT_DEADLINE = "A persistent task is never finished, so it can't have a deadline. Remove one or the other.";
const DEADLINE_IN_ROUND = "A subtask of a persistent task repeats with it, so it can't have a deadline.";

/** A deadline on a task this deep (0 = a main task) is refused. */
export function assertDeadlineDepth(depth: number) {
  if (depth > MAX_DEADLINE_DEPTH) throw new HttpError(400, DEADLINE_TOO_DEEP);
}

/** A task done again and again is never finished, so a deadline means nothing on it. */
export function assertNoDeadlineIfPersistent(isPersistent: boolean, deadlineDate: string | null | undefined) {
  if (isPersistent && deadlineDate) throw new HttpError(400, PERSISTENT_DEADLINE);
}

/** A press unticks what is under a persistent task, so a date on it would pass as missed however it was done. One it has already can stay, or move. */
export function assertNoNewDeadlineInRound(inRound: boolean) {
  if (inRound) throw new HttpError(400, DEADLINE_IN_ROUND);
}

/** Whether all that was sent is among `allowed`. */
const sentOnly = (input: object, allowed: string[]) => Object.entries(input).every(([key, value]) => value === undefined || allowed.includes(key));

/** A divider sits among the main tasks of a list. */
export function assertDividerPlace(parentId: string | null | undefined, listId: string | null | undefined) {
  if (parentId || !listId) throw new HttpError(400, "A divider goes among the main tasks of a list");
}

/** A divider is a title and a line: it takes no date, points, labels or note. */
export function assertNewDivider(input: TaskInput) {
  assertDividerPlace(input.parentId, input.listId);
  if (!sentOnly(input, ["id", "title", "parentId", "listId", "index", "after", "isDivider"])) throw new HttpError(400, "A divider only has a title");
}

export function assertDividerEdit(input: TaskPatch) {
  if (!sentOnly(input, ["title"])) throw new HttpError(400, "A divider only has a title");
}

/** What only a task can do: refused for a divider, with `message`. */
export function assertNotDivider(task: Pick<Task, "isDivider">, message: string) {
  if (task.isDivider) throw new HttpError(400, message);
}

type Current = Pick<
  Task,
  "parentId" | "listId" | "weekDay" | "todaySince" | "isPersistent" | "isComplete" | "deadlineDate" | "deadlineType" | "repeatEvery" | "nextDue"
>;

/** A schedule only makes sense on a task that is done again and again, so setting one makes the task persistent. */
const becomesPersistent = (task: Current, input: TaskPatch) => input.isPersistent ?? (input.repeatEvery ? true : task.isPersistent);

/** Whether the edit makes a ticked task persistent: its tick then becomes its first press. */
export const tickBecomesPress = (task: Current, input: TaskPatch) => becomesPersistent(task, input) && !task.isPersistent && task.isComplete;

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
  if (input.hideInStats !== undefined) data.hideInStats = input.hideInStats;

  // A task without a list lives in Today or in Week, so it can't leave the last of them.
  const inNoList = !task.parentId && !task.listId;
  if (input.today === false && inNoList && !task.weekDay) {
    throw new HttpError(400, "This task only lives in Today. Move it to a list first, or delete it.");
  }
  if (input.week === false && inNoList && !task.todaySince) {
    throw new HttpError(400, "This task only lives in Week. Move it to a list first, or delete it.");
  }
  // Marked for one day: today, or a day to come. A mark left from a day gone by is asked about in the bell, not kept.
  const markedFor = input.today === undefined || input.today === false ? null : input.today === true || input.today < today ? today : input.today;
  if (input.today !== undefined) data.todaySince = markedFor;
  if (input.week === false) data.weekDay = null;
  // Put in Today this week, a task put off to next week is taken out of it again: it is for this week after all.
  const nextMonday = addDays(mondayOf(today), 7);
  if (markedFor && markedFor < nextMonday && task.weekDay && task.weekDay >= nextMonday) data.weekDay = null;

  const isPersistent = becomesPersistent(task, input);
  // A ticked task made persistent (a reward bought once, now to be bought again): open again for the next time, its tick
  // kept as its first press (tickBecomesPress, in updateTask).
  if (tickBecomesPress(task, input)) Object.assign(data, { isComplete: false, completedAt: null, completedOn: null });
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
