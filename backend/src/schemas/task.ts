import { z } from "zod";
import { DEADLINE_TYPES, REPEAT_UNITS } from "../../../shared/enums.js";
import { id, index, labelIds, localDate, points } from "./common.js";

const title = z.string().trim().min(1, "Title is required").max(300);
const notes = z.string().trim().max(5000).nullish();
const deadlineType = z.enum(DEADLINE_TYPES);
const repeatEvery = z.number().int().min(1, "Repeat every 1 or more").max(999);
const repeatUnit = z.enum(REPEAT_UNITS);

export const taskInput = z.object({
  /** Made on the device for a task written offline; see lib/clientId. */
  id: id.optional(),
  title,
  notes,
  /** parentId (a subtask), listId (a top-level task in a list), or neither: a task that lives only in Today (or in Week, with `weekDay`). */
  parentId: id.nullish(),
  listId: id.nullish(),
  goalIds: labelIds.optional(),
  tagIds: labelIds.optional(),
  /** Where to insert among the new siblings; omitted = at the end. */
  index: index.optional(),
  /** A main task written into a day of the calendar starts with that day as its deadline; soft unless said otherwise. */
  deadlineDate: localDate.optional(),
  deadlineType: deadlineType.optional(),
  /** What the short syntax of the add fields can set from the start; each means what it does in taskPatch. */
  points: points.optional(),
  today: z.boolean().optional(),
  /** In the Week box from the start, on this day, after `weekAfter` there (null = first; left out = last). */
  weekDay: localDate.optional(),
  weekAfter: id.nullish(),
  /** Done again and again; a schedule makes it persistent too. */
  isPersistent: z.boolean().optional(),
  repeatEvery: repeatEvery.optional(),
  repeatUnit: repeatUnit.optional(),
  nextDue: localDate.optional(),
});
export type TaskInput = z.infer<typeof taskInput>;

export const taskPatch = z.object({
  title: title.optional(),
  notes,
  /** Full replacement sets: the task ends up with exactly these goals / tags. */
  goalIds: labelIds.optional(),
  tagIds: labelIds.optional(),
  startDate: localDate.optional(),
  deadlineDate: localDate.nullable().optional(),
  deadlineType: deadlineType.optional(),
  /** Its own amount, or null to go back to what it gets by default: the list's amount (a main task), or what its main task hands down (a subtask). */
  points: points.nullable().optional(),
  /** Main tasks only: subtasks without their own amount are worth what this task is. */
  pointsToSubtasks: z.boolean().optional(),
  /** In or out of the Today box; a day = in it on that day (today if it has gone by). */
  today: z.union([z.boolean(), localDate]).optional(),
  /** In or out of the Week box; one coming in goes last on today. */
  week: z.boolean().optional(),
  /** Done again and again instead of once. */
  isPersistent: z.boolean().optional(),
  /** Due again every so many days, weeks or months (which makes it persistent); null = no schedule. */
  repeatEvery: repeatEvery.nullable().optional(),
  repeatUnit: repeatUnit.optional(),
  /** Count the next round from the day it was done instead of keeping to the planned days. */
  repeatAfterDone: z.boolean().optional(),
  /** Keeping to the planned days: every missed round is still to be done, instead of skipped. */
  repeatMakeUp: z.boolean().optional(),
  /** The day the next round is due; today when a schedule is first set. */
  nextDue: localDate.optional(),
});
export type TaskPatch = z.infer<typeof taskPatch>;

export const moveInput = z.object({
  parentId: id.nullable(),
  listId: id.nullable(),
  index,
});
export type MoveInput = z.infer<typeof moveInput>;

/** A place in the Week box: on `day`, right after `after` there (null = first, left out = last). */
export const weekInput = z.object({ day: localDate, after: id.nullish() });

/** A round of a schedule moved in the Week box: the one planned on `from` is done on `to`. */
export const roundInput = z.object({ from: localDate, to: localDate });

/** Subtasks a press unticked, as stored on the TaskCompletion. */
export const untickedSchema = z.array(z.object({ id: z.string(), completedAt: z.string(), completedOn: z.string() }));
