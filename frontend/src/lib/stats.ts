import type { List, PointsSummary, StatRow } from "../types";
import { addDays, daysBetween, formatDay } from "./dates";

// The numbers behind the stats on the Stats page. Everything is worked out
// in the browser from every task there is (cut down to a small row each, see
// StatRow) and the points history it already has.
// Reward lists are left out: these are stats about tasks.

/** A task as the stats see it, at any depth. */
export interface StatTask {
  id: string;
  title: string;
  isRoot: boolean;
  /** Its main task's list; null for a task that lives only in Today. */
  listId: string | null;
  /** Its own goals and tags plus those of the tasks it sits under. */
  goalIds: string[];
  tagIds: string[];
  /** Its own deadline, the one it is on time or late for. */
  deadlineDate: string | null;
  /** Its own deadline's type, or that of the nearest task above it; what the deadline filter looks at. */
  deadlineKind: "hard" | "soft" | null;
  /** Its main task is persistent (done again and again). */
  isPersistent: boolean;
  /** The moment it was written down, for the time of day. */
  createdAt: Date;
  /** The day it was written down, in the user's calendar. */
  createdOn: string;
  completedOn: string | null;
  /** The day it stopped being something to do: when it was ticked, or when the nearest finished task above it was. */
  closedOn: string | null;
  /** Still to do: not ticked, not inside a finished main task, not persistent. */
  isOpen: boolean;
  /** Carries no deadline, goal or tag of its own. */
  isLoose: boolean;
}

/** One thing done: a tick, or one press of a persistent task. */
export interface Completion {
  day: string;
  task: StatTask;
  /** The moment of it, for the time of day. */
  at: Date | null;
  /** A press of a persistent task, not a tick. */
  isPress: boolean;
}

export type RangeKey = "all" | "7" | "30" | "90" | "365";

/** "" = no filter on that field. */
export interface StatFilter {
  range: RangeKey;
  listId: string;
  /** Only the lists this folder shows. */
  folderId: string;
  goalId: string;
  tagId: string;
  deadline: "" | "hard" | "soft" | "none";
  repeating: "" | "yes" | "no";
}

export const NO_STAT_FILTER: StatFilter = { range: "all", listId: "", folderId: "", goalId: "", tagId: "", deadline: "", repeating: "" };

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** 0 = Monday ... 6 = Sunday. */
export const weekdayIndex = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

export function collectStats(rows: StatRow[], lists: List[]): { tasks: StatTask[]; completions: Completion[] } {
  const rewardLists = new Set(lists.filter((list) => list.kind === "reward").map((list) => list.id));
  const tasks: StatTask[] = [];
  const completions: Completion[] = [];
  const childrenOf = new Map<string, StatRow[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    if (!childrenOf.has(row.parentId)) childrenOf.set(row.parentId, []);
    childrenOf.get(row.parentId)!.push(row);
  }

  const visit = (node: StatRow, root: StatRow, above: StatTask | null, insideFinished: boolean) => {
    const completedOn = node.completedOn;
    const createdAt = new Date(node.createdAt);
    const ownKind = node.deadlineDate ? (node.deadlineType ?? "hard") : null;
    const task: StatTask = {
      id: node.id,
      title: node.title,
      isRoot: node === root,
      listId: root.listId,
      goalIds: [...new Set([...(above?.goalIds ?? []), ...node.goalIds])],
      tagIds: [...new Set([...(above?.tagIds ?? []), ...node.tagIds])],
      deadlineDate: node.deadlineDate,
      deadlineKind: ownKind ?? above?.deadlineKind ?? null,
      isPersistent: root.isPersistent,
      createdAt,
      createdOn: node.startDate ?? localDay(createdAt),
      completedOn,
      closedOn: completedOn ?? above?.closedOn ?? null,
      isOpen: !node.isComplete && !insideFinished && !root.isPersistent,
      isLoose: !node.deadlineDate && node.goalIds.length === 0 && node.tagIds.length === 0,
    };
    tasks.push(task);
    if (completedOn) completions.push({ day: completedOn, task, at: node.completedAt ? new Date(node.completedAt) : null, isPress: false });
    node.pressDays.forEach((day, i) => completions.push({ day, task, at: node.pressTimes[i] ? new Date(node.pressTimes[i]) : null, isPress: true }));
    for (const child of childrenOf.get(node.id) ?? []) visit(child, root, task, insideFinished || node.isComplete);
  };
  for (const root of rows) {
    if (!root.parentId && !rewardLists.has(root.listId ?? "")) visit(root, root, null, false);
  }
  return { tasks, completions };
}

/** Everything in the filter except the date range, which each section applies to its own date. */
/** `folderLists`: the lists shown by the filter's folder; null = no folder picked. */
export function matchesFilter(task: StatTask, filter: StatFilter, folderLists: Set<string> | null = null) {
  return (
    (!filter.listId || task.listId === filter.listId) &&
    (!folderLists || (task.listId !== null && folderLists.has(task.listId))) &&
    (!filter.goalId || task.goalIds.includes(filter.goalId)) &&
    (!filter.tagId || task.tagIds.includes(filter.tagId)) &&
    (!filter.deadline || (task.deadlineKind ?? "none") === filter.deadline) &&
    (!filter.repeating || (filter.repeating === "yes") === task.isPersistent)
  );
}

/** The first day of the range, counting today; null = all time. */
export function rangeStart(today: string, range: RangeKey): string | null {
  return range === "all" ? null : addDays(today, 1 - Number(range));
}

export function countByDay(completions: Completion[]) {
  const counts = new Map<string, number>();
  for (const { day } of completions) counts.set(day, (counts.get(day) ?? 0) + 1);
  return counts;
}

/**
 * Done today, in the last 7 and 30 days (today counted) and in the 7 and 30 before those, this year, and ever.
 * The windows roll with the day, so each is a whole one and can be set against the one before.
 */
export function periodCounts(byDay: Map<string, number>, today: string) {
  const year = today.slice(0, 4);
  const back = (n: number) => addDays(today, 1 - n);
  const counts = { today: byDay.get(today) ?? 0, last7: 0, prev7: 0, last30: 0, prev30: 0, year: 0, all: 0 };
  for (const [day, count] of byDay) {
    counts.all += count;
    if (day > today) continue;
    if (day.startsWith(year)) counts.year += count;
    if (day >= back(7)) counts.last7 += count;
    else if (day >= back(14)) counts.prev7 += count;
    if (day >= back(30)) counts.last30 += count;
    else if (day >= back(60)) counts.prev30 += count;
  }
  return counts;
}

/** The first day anything was done; null = nothing yet. */
export function firstDay(byDay: Map<string, number>): string | null {
  let first: string | null = null;
  for (const day of byDay.keys()) if (first === null || day < first) first = day;
  return first;
}

/**
 * What a week usually holds: the median of the `weeks` 7-day windows before the last 7 days.
 * null until the history reaches back that far, so a new account is not measured against empty weeks.
 */
export function typicalWeek(byDay: Map<string, number>, today: string, weeks = 4): number | null {
  const first = firstDay(byDay);
  if (first === null || first > addDays(today, 1 - 7 * (weeks + 1))) return null;
  const sums = Array.from({ length: weeks }, (_, w) => {
    let sum = 0;
    for (let d = 0; d < 7; d++) sum += byDay.get(addDays(today, -7 * (w + 1) - d)) ?? 0;
    return sum;
  });
  return median(sums);
}

/** On how many of the last `span` days (today counted) something was done. Unlike a streak, a day off costs one day. */
export function activeDays(byDay: Map<string, number>, today: string, span: number) {
  let active = 0;
  for (let d = 0; d < span; d++) if ((byDay.get(addDays(today, -d)) ?? 0) > 0) active++;
  return active;
}

/**
 * Runs of days in a row with at least one thing done. The current run ends
 * today, or yesterday while today is still empty: the day isn't over yet.
 */
export function streaks(byDay: Map<string, number>, today: string) {
  const days = [...byDay.keys()].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of days) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  let current = 0;
  for (let day = byDay.has(today) ? today : addDays(today, -1); byDay.has(day); day = addDays(day, -1)) current++;
  return { current, longest };
}

/** Columns of the calendar of dots: whole weeks, Monday first, the last one holding today; days after today are null. */
export function calendarWeeks(byDay: Map<string, number>, today: string, weeks: number) {
  const lastMonday = addDays(today, -weekdayIndex(today));
  return Array.from({ length: weeks }, (_, w) => {
    const monday = addDays(lastMonday, (w - weeks + 1) * 7);
    return Array.from({ length: 7 }, (_, d) => {
      const day = addDays(monday, d);
      return { day, count: day > today ? null : (byDay.get(day) ?? 0) };
    });
  });
}

/**
 * The count that gets the strongest colour: nine in ten of the counts above zero are at or under it, so one
 * day far above the rest doesn't wash all the others out. With only a few counts it is the largest.
 */
export function heatCap(counts: number[]) {
  const sorted = counts.filter((count) => count > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[sorted.length < 10 ? sorted.length - 1 : Math.floor((sorted.length - 1) * 0.9)];
}

/** 0 for nothing, then 1-4 by how close a count is to `cap` (see heatCap); anything over it is a 4. */
export function heatLevel(count: number, cap: number) {
  return count <= 0 || cap <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / cap) * 4)));
}

export const DAY_PARTS = [
  { name: "Morning", from: 5, to: 12 },
  { name: "Afternoon", from: 12, to: 17 },
  { name: "Evening", from: 17, to: 22 },
  { name: "Night", from: 22, to: 5 },
] as const;

/** Which of DAY_PARTS a moment falls in, by the device's clock. */
export const dayPartOf = (at: Date) => {
  const hour = at.getHours();
  return DAY_PARTS.findIndex(({ from, to }) => (from < to ? hour >= from && hour < to : hour >= from || hour < to));
};

/** How many of `moments` fall in each hour of each weekday (rows Monday to Sunday), by the device's clock. */
export function hourGrid(moments: Date[]) {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const parts = DAY_PARTS.map(() => 0);
  for (const at of moments) {
    grid[(at.getDay() + 6) % 7][at.getHours()]++;
    parts[dayPartOf(at)]++;
  }
  return { grid, parts, cap: heatCap(grid.flat()), total: moments.length };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Days from writing a task down to ticking it off; never negative. */
export const turnaround = (task: StatTask) => Math.max(0, daysBetween(task.createdOn, task.completedOn!));

/** How a deadline went, once that is settled: the task was finished, or it is still open with the deadline behind it. */
export interface Outcome {
  task: StatTask;
  /** Days it was finished before its deadline; negative = late. For an open task: how far behind it is today. */
  early: number;
  /** Still open, with its deadline passed. */
  isOpen: boolean;
  /** The day it was settled: when it was finished, or the deadline it missed. */
  day: string;
}

/**
 * One-off tasks with a deadline of their own whose deadline has been settled. The open ones past their
 * deadline are in, as late: without them the tasks put off the longest would be the ones never counted.
 */
export function deadlineOutcomes(tasks: StatTask[], today: string): Outcome[] {
  const outcomes: Outcome[] = [];
  for (const task of tasks) {
    if (!task.deadlineDate || task.isPersistent) continue;
    if (task.completedOn) outcomes.push({ task, early: daysBetween(task.completedOn, task.deadlineDate), isOpen: false, day: task.completedOn });
    else if (task.isOpen && task.deadlineDate < today) outcomes.push({ task, early: daysBetween(today, task.deadlineDate), isOpen: true, day: task.deadlineDate });
  }
  return outcomes;
}

export const isOnTime = (outcome: Outcome) => !outcome.isOpen && outcome.early >= 0;

export interface Bucket {
  label: string;
  count: number;
}

const EARLY_LATE: { label: string; has: (early: number) => boolean }[] = [
  { label: "7+ days early", has: (n) => n >= 7 },
  { label: "2-6 days early", has: (n) => n >= 2 && n <= 6 },
  { label: "1 day early", has: (n) => n === 1 },
  { label: "On the day", has: (n) => n === 0 },
  { label: "1 day late", has: (n) => n === -1 },
  { label: "2-6 days late", has: (n) => n <= -2 && n >= -6 },
  { label: "7+ days late", has: (n) => n <= -7 },
];
export const STILL_OPEN = "Still open, overdue";

/** Settled deadlines by how far from the deadline the task was done, earliest first; the ones still open go last, in a row of their own. */
export function earlyLateBuckets(outcomes: Outcome[]): (Bucket & { late: boolean })[] {
  const early = outcomes.filter((outcome) => !outcome.isOpen).map((outcome) => outcome.early);
  return [
    ...EARLY_LATE.map(({ label, has }, i) => ({ label, count: early.filter(has).length, late: i > 3 })),
    { label: STILL_OPEN, count: outcomes.length - early.length, late: true },
  ];
}

// The duration buckets, by their last day. Always the same ones, so the bars can be read at a glance
// and set against each other (Time to finish beside Open work, this month beside the last).
const DURATION_ENDS = [0, 1, 3, 7, 14, 30, 90];

/** Durations in days, in fixed buckets, shortest first: same day, 1 day, 2-3, 4-7, 8-14, 15-30, 31-90, and over 90. Empty ones are kept. */
export function durationBuckets(days: number[]): Bucket[] {
  const buckets = DURATION_ENDS.map((end, i) => {
    const start = i === 0 ? 0 : DURATION_ENDS[i - 1] + 1;
    const label = end === 0 ? "Same day" : start === end ? `${end} day` : `${start}-${end} days`;
    return { label, count: days.filter((d) => d >= start && d <= end).length };
  });
  const last = DURATION_ENDS.at(-1)!;
  return [...buckets, { label: `Over ${last} days`, count: days.filter((d) => d > last).length }];
}

export type GroupKey = "list" | "goal" | "tag";
/** The group of tasks that carry no goal (or tag, or sit in no list). */
export const NO_GROUP = "";

const groupsOf = (task: StatTask, key: GroupKey): string[] => {
  const ids = key === "list" ? (task.listId ? [task.listId] : []) : key === "goal" ? task.goalIds : task.tagIds;
  return ids.length > 0 ? ids : [NO_GROUP];
};

export interface GroupRow {
  id: string;
  done: number;
  /** Tasks and subtasks still to do. */
  open: number;
  /** Its settled deadlines (see deadlineOutcomes), and how many of them were met. */
  due: number;
  onTime: number;
  /** Median days from written down to done, over its finished tasks; null = none. */
  median: number | null;
}

export const NO_GROUP_ROW: Omit<GroupRow, "id"> = { done: 0, open: 0, due: 0, onTime: 0, median: null };

/**
 * Per list, goal or tag: how much was done, how much is open, how often on time, and how long it
 * took. A task with several goals (or tags) counts under each of them.
 */
export function groupStats(key: GroupKey, completions: Completion[], finished: StatTask[], outcomes: Outcome[], open: StatTask[]): Map<string, GroupRow> {
  const work = new Map<string, Omit<GroupRow, "id" | "median"> & { days: number[] }>();
  const at = (id: string) => {
    if (!work.has(id)) work.set(id, { done: 0, open: 0, due: 0, onTime: 0, days: [] });
    return work.get(id)!;
  };
  for (const { task } of completions) for (const id of groupsOf(task, key)) at(id).done++;
  for (const task of open) for (const id of groupsOf(task, key)) at(id).open++;
  for (const task of finished) for (const id of groupsOf(task, key)) at(id).days.push(turnaround(task));
  for (const outcome of outcomes) {
    for (const id of groupsOf(outcome.task, key)) {
      at(id).due++;
      if (isOnTime(outcome)) at(id).onTime++;
    }
  }
  return new Map([...work].map(([id, { days, ...counts }]) => [id, { id, ...counts, median: median(days) }]));
}

export interface SharePeriod {
  key: string;
  label: string;
  /** Things done in the period, each counted once. */
  total: number;
  /** Done per group id. */
  parts: Map<string, number>;
}

// Few enough rows to take in at a glance.
const MAX_PERIODS = 6;

/**
 * What was done per day, week or month (whichever suits the span), split by
 * list, goal or tag: the newest periods, oldest first, empty ones included.
 */
export function shareOverTime(key: GroupKey, completions: Completion[], from: string | null, today: string) {
  const first = from ?? completions.reduce((min, c) => (c.day < min ? c.day : min), today);
  const span = Math.max(0, daysBetween(first, today)) + 1;
  // A week of days at most, then weeks, then months: the rows never pile up.
  const unit = span <= 7 ? "day" : span <= 7 * MAX_PERIODS ? "week" : "month";
  const periodOf = (day: string) => (unit === "day" ? day : unit === "week" ? addDays(day, -weekdayIndex(day)) : day.slice(0, 7));
  const labelOf = (period: string) => (unit === "month" ? `${period.slice(5)}/${period.slice(2, 4)}` : formatDay(period));

  const periods = new Map<string, SharePeriod>();
  for (let day = first; day <= today; day = addDays(day, 1)) {
    const period = periodOf(day);
    if (!periods.has(period)) periods.set(period, { key: period, label: labelOf(period), total: 0, parts: new Map() });
  }
  for (const { day, task } of completions) {
    const period = periods.get(periodOf(day));
    if (!period) continue;
    period.total++;
    for (const id of groupsOf(task, key)) period.parts.set(id, (period.parts.get(id) ?? 0) + 1);
  }
  return { unit, periods: [...periods.values()].slice(-MAX_PERIODS) };
}

/**
 * The balance at the end of each day, from the first day in the points history
 * (or `from`, if later) to today. The history holds the newest rows only, so
 * it is counted back from the balance of now.
 */
export function balanceSeries(points: PointsSummary, from: string | null, today: string): { day: string; balance: number }[] {
  const rows = [...points.transactions].reverse();
  if (rows.length === 0) return [];
  const opening = points.balance - rows.reduce((sum, row) => sum + row.amount, 0);
  let balance = opening;
  const firstDay = localDay(new Date(rows[0].createdAt));
  const lastDay = localDay(new Date(rows.at(-1)!.createdAt));
  const closing = new Map<string, number>();
  for (const row of rows) {
    balance += row.amount;
    closing.set(localDay(new Date(row.createdAt)), balance);
  }

  const series: { day: string; balance: number }[] = [];
  let running = opening;
  const end = lastDay > today ? lastDay : today;
  for (let day = firstDay; day <= end; day = addDays(day, 1)) {
    running = closing.get(day) ?? running;
    if (!from || day >= from) series.push({ day, balance: running });
  }
  return series;
}

export interface FlowWeek {
  /** The Monday the week starts on. */
  monday: string;
  written: number;
  /** Ticked, or closed with the task above it. */
  done: number;
  /** Open at the end of the week (or today, in a week still running). */
  open: number;
  /** The week holding today: not over yet. */
  isPartial: boolean;
}

/** A one-off task was written down in these days / stopped being something to do in them / was open at the end of `day`. */
const writtenIn = (task: StatTask, from: string, to: string) => task.createdOn >= from && task.createdOn <= to;
const closedIn = (task: StatTask, from: string, to: string) => task.closedOn !== null && task.closedOn >= from && task.closedOn <= to;
const openAt = (task: StatTask, day: string) => task.createdOn <= day && (task.closedOn === null || task.closedOn > day);

/**
 * Written down against done, week by week (Monday first), the newest last. One-off tasks and their subtasks:
 * a persistent task is never finished, so it has no place in a count of what is left. A subtask left unticked
 * counts as done on the day its main task was, so that written minus done is how the pile of open tasks moved.
 */
export function flowWeeks(tasks: StatTask[], today: string, weeks: number): FlowWeek[] {
  const oneOff = tasks.filter((task) => !task.isPersistent);
  const lastMonday = addDays(today, -weekdayIndex(today));
  return Array.from({ length: weeks }, (_, w) => {
    const monday = addDays(lastMonday, (w - weeks + 1) * 7);
    const sunday = addDays(monday, 6);
    const end = sunday > today ? today : sunday;
    const week: FlowWeek = { monday, written: 0, done: 0, open: 0, isPartial: sunday > today };
    for (const task of oneOff) {
      if (writtenIn(task, monday, end)) week.written++;
      if (closedIn(task, monday, end)) week.done++;
      if (openAt(task, end)) week.open++;
    }
    return week;
  });
}

/** The same over the last `span` days, today counted, as the tasks themselves; `openBefore` is how many were open the day before those. */
export function flowOver(tasks: StatTask[], today: string, span: number) {
  const oneOff = tasks.filter((task) => !task.isPersistent);
  const from = addDays(today, 1 - span);
  return {
    written: oneOff.filter((task) => writtenIn(task, from, today)),
    done: oneOff.filter((task) => closedIn(task, from, today)),
    open: oneOff.filter((task) => openAt(task, today)),
    openBefore: oneOff.filter((task) => openAt(task, addDays(from, -1))).length,
  };
}

/**
 * Points earned and spent in the history's rows from `from` on. A reversal takes back what it cancels:
 * a negative one an earning, a positive one a spending.
 */
export function pointsFlow(points: PointsSummary, from: string | null) {
  let earned = 0;
  let spent = 0;
  for (const row of points.transactions) {
    if (from && localDay(new Date(row.createdAt)) < from) continue;
    if (row.type === "earned" || (row.type === "reversal" && row.amount < 0)) earned += row.amount;
    else spent -= row.amount;
  }
  return { earned, spent };
}
