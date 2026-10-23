import type { Task } from "@prisma/client";
import { addDays, daysBetween } from "../../../shared/dates.js";
import { countedIds } from "./taskTree.service.js";

/** Where a task stands on one day: the spreadsheet's Days left / Left / Per day. */
export interface Pace {
  /** Days to work in from this date, both it and the deadline day counted: 1 on the deadline day, 0 or less after it. */
  daysLeft: number;
  remaining: number;
  /** Tasks per day still needed; null when there is work left and no days left to do it in. */
  perDay: number | null;
}

/** `done` holds the completion day of every finished task in the subtree. */
function paceOn(date: string, totalTasks: number, done: string[], deadlineDate: string): Pace {
  // The deadline day is the last day to do the work in, not a day too late.
  const daysLeft = daysBetween(date, deadlineDate) + 1;
  const remaining = totalTasks - done.filter((day) => day <= date).length;
  const perDay = daysLeft > 0 ? remaining / daysLeft : remaining > 0 ? null : 0;
  return { daysLeft, remaining, perDay };
}

export interface CountdownRow extends Pace {
  date: string;
  doneThatDay: number;
}

export interface Countdown {
  totalTasks: number;
  startDate: string;
  deadlineDate: string;
  today: string;
  rows: CountdownRow[];
}

interface CountdownInput {
  /** One entry per task in the subtree: the day it was completed, or null if still open. */
  completedOn: (string | null)[];
  startDate: string;
  deadlineDate: string;
  today: string;
}

// Keeps a mistyped far-off date from producing an endless table.
const MAX_ROWS = 1500;

/**
 * The spreadsheet's left-hand table: one row per day from the start to the
 * deadline (or to today, once past it). Each row is computed directly from the
 * completion dates rather than from the row above, so nothing can drift.
 * Days after today show what is left now, i.e. the pace if nothing more gets done.
 */
export function buildCountdown({ completedOn, startDate, deadlineDate, today }: CountdownInput): Countdown {
  const totalTasks = completedOn.length;
  const end = deadlineDate > today ? deadlineDate : today;
  let start = [startDate, deadlineDate, today].sort()[0];
  if (daysBetween(start, end) >= MAX_ROWS) start = addDays(end, -(MAX_ROWS - 1));

  const done = completedOn.filter((day): day is string => day !== null);

  const rows: CountdownRow[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    rows.push({
      date,
      doneThatDay: done.filter((day) => day === date).length,
      ...paceOn(date, totalTasks, done, deadlineDate),
    });
  }
  return { totalTasks, startDate: start, deadlineDate, today, rows };
}

type PressureTask = Pick<
  Task,
  "id" | "parentId" | "title" | "startDate" | "createdAt" | "deadlineDate" | "deadlineType" | "completedOn" | "isPersistent"
>;

/** Countdown for one task: itself plus its descendants at every depth (persistent ones left out: see countedIds). */
export function countdownForTask(tasks: PressureTask[], task: PressureTask, today: string): Countdown {
  const ids = new Set(countedIds(tasks, task.id));
  return buildCountdown({
    completedOn: tasks.filter((t) => ids.has(t.id)).map((t) => t.completedOn),
    startDate: task.startDate ?? task.createdAt.toISOString().slice(0, 10),
    deadlineDate: task.deadlineDate!,
    today,
  });
}

/** Today's pace for any task with a deadline, hard or soft: what colours its deadline pill. */
export function todayPace(tasks: PressureTask[], task: PressureTask, today: string): Pace {
  const ids = new Set(countedIds(tasks, task.id));
  const subtree = tasks.filter((t) => ids.has(t.id));
  const done = subtree.map((t) => t.completedOn).filter((day): day is string => day !== null);
  return paceOn(today, subtree.length, done, task.deadlineDate!);
}

export interface PressureItem extends Pace {
  taskId: string;
  title: string;
  deadlineDate: string;
}

export interface PressureSummary {
  totalOutstanding: number;
  /** Combined pace needed today. Overdue work counts in full: it is all due now. */
  perDayToday: number;
  items: PressureItem[];
}

/**
 * "How much today" across every hard deadline. A subtask's hard deadline is
 * skipped when its parent has one too, so no task is counted twice. Deadlines
 * in `skip` (inside finished main tasks, which sit in the Done page) are left out.
 */
export function todayPressure(tasks: PressureTask[], today: string, skip = new Set<string>()): PressureSummary {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const isHard = (t: PressureTask | undefined) => t?.deadlineType === "hard" && Boolean(t.deadlineDate);

  const items = tasks
    .filter((t) => isHard(t) && !skip.has(t.id) && !(t.parentId && isHard(byId.get(t.parentId))))
    .map((task): PressureItem => ({
      taskId: task.id,
      title: task.title,
      deadlineDate: task.deadlineDate!,
      ...todayPace(tasks, task, today),
    }))
    .sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate));

  return {
    totalOutstanding: items.reduce((sum, item) => sum + item.remaining, 0),
    perDayToday: items.reduce((sum, item) => sum + (item.perDay ?? item.remaining), 0),
    items,
  };
}

export interface CombinedItem {
  taskId: string;
  title: string;
  deadlineDate: string;
  deadlineType: "hard" | "soft";
}

export interface CombinedRow {
  date: string;
  /** Tasks finished that day, across every deadline. */
  doneThatDay: number;
  /** Tasks still open after that day, across deadlines whose task existed by then. */
  remaining: number;
  /** Sum of each deadline's own per-day pace; overdue work counts in full (it is all due now). */
  perDay: number;
  /** Some deadline had work left and no days left that day. */
  overdue: boolean;
}

export interface CombinedCountdown {
  today: string;
  totalTasks: number;
  items: CombinedItem[];
  rows: CombinedRow[];
}

interface CombinedSource {
  total: number;
  done: string[];
  deadlineDate: string;
}

/**
 * A future day on the dashboard's table, as in the spreadsheet: what is open now over the days left
 * from that day, so each day without work shows the pace climbing (6 tasks over 4 days, then 3, 2, 1).
 * After its deadline day the deadline leaves the later rows; one already overdue today stays overdue.
 */
function futurePace(item: CombinedSource, date: string, today: string): Pace {
  const pace = paceOn(date, item.total, item.done, item.deadlineDate);
  if (pace.daysLeft > 0 || paceOn(today, item.total, item.done, item.deadlineDate).perDay === null) return pace;
  return { daysLeft: pace.daysLeft, remaining: 0, perDay: 0 };
}

/**
 * The dashboard's table: every deadline, hard and soft, added up day by day.
 * Each deadline keeps its own pace (its tasks left over its days left), and a
 * day's "Per day" is the sum of the paces of the deadlines running that day.
 * Past days and today use what was actually done; later days show the pace if nothing more gets done.
 * A subtask's deadline is skipped when its parent has one too, so nothing is counted twice.
 * A deadline whose task is ticked (or sits in a finished main task) leaves the table at once, with its numbers.
 */
export function combinedCountdown(tasks: PressureTask[], today: string): CombinedCountdown {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const hasDeadline = (t: PressureTask | undefined) => Boolean(t?.deadlineDate);

  const items = tasks
    .filter((t) => hasDeadline(t) && !t.completedOn && !(t.parentId && hasDeadline(byId.get(t.parentId))))
    .sort((a, b) => a.deadlineDate!.localeCompare(b.deadlineDate!))
    .map((task) => {
      const ids = new Set(countedIds(tasks, task.id));
      const subtree = tasks.filter((t) => ids.has(t.id));
      const deadlineDate = task.deadlineDate!;
      const writtenOn = task.startDate ?? task.createdAt.toISOString().slice(0, 10);
      return {
        task,
        deadlineDate,
        start: writtenOn < deadlineDate ? writtenOn : deadlineDate,
        total: subtree.length,
        done: subtree.map((t) => t.completedOn).filter((day): day is string => day !== null),
      };
    });

  const rows: CombinedRow[] = [];
  if (items.length > 0) {
    const end = [today, ...items.map((i) => i.deadlineDate)].sort().at(-1)!;
    let start = [today, ...items.map((i) => i.start)].sort()[0];
    if (daysBetween(start, end) >= MAX_ROWS) start = addDays(end, -(MAX_ROWS - 1));

    for (let date = start; date <= end; date = addDays(date, 1)) {
      const row: CombinedRow = { date, doneThatDay: 0, remaining: 0, perDay: 0, overdue: false };
      for (const item of items) {
        if (date < item.start) continue;
        const pace = date > today ? futurePace(item, date, today) : paceOn(date, item.total, item.done, item.deadlineDate);
        row.doneThatDay += item.done.filter((day) => day === date).length;
        row.remaining += pace.remaining;
        row.perDay += pace.perDay ?? pace.remaining;
        row.overdue ||= pace.perDay === null;
      }
      rows.push(row);
    }
  }

  return {
    today,
    totalTasks: items.reduce((sum, item) => sum + item.total, 0),
    items: items.map(({ task, deadlineDate }) => ({
      taskId: task.id,
      title: task.title,
      deadlineDate,
      deadlineType: task.deadlineType === "soft" ? "soft" : "hard",
    })),
    rows,
  };
}
