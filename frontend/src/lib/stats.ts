import type { List, PointsSummary, StatRow } from "../types";
import { addDays, daysBetween, formatDay } from "./dates";

// The numbers behind the stats on the user's page. Everything is worked out
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
  /** Still to do: not ticked, not inside a finished main task, not persistent. */
  isOpen: boolean;
  /** Carries no deadline, goal or tag of its own. */
  isLoose: boolean;
}

/** One thing done: a tick, or one press of a persistent task. */
export interface Completion {
  day: string;
  task: StatTask;
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
      completedOn: node.completedOn,
      isOpen: !node.isComplete && !insideFinished && !root.isPersistent,
      isLoose: !node.deadlineDate && node.goalIds.length === 0 && node.tagIds.length === 0,
    };
    tasks.push(task);
    if (node.completedOn) completions.push({ day: node.completedOn, task });
    for (const day of node.pressDays) completions.push({ day, task });
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

/** Done today, this week (from Monday), this month, and ever. */
export function periodCounts(byDay: Map<string, number>, today: string) {
  const monday = addDays(today, -weekdayIndex(today));
  const month = today.slice(0, 7);
  const counts = { today: byDay.get(today) ?? 0, week: 0, month: 0, all: 0 };
  for (const [day, count] of byDay) {
    counts.all += count;
    if (day >= monday && day <= today) counts.week += count;
    if (day.startsWith(month) && day <= today) counts.month += count;
  }
  return counts;
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

/** 0 for nothing, then 1-4 by how close a count is to the largest one. */
export function heatLevel(count: number, max: number) {
  return count <= 0 || max <= 0 ? 0 : Math.max(1, Math.ceil((count / max) * 4));
}

export const DAY_PARTS = [
  { name: "Morning", from: 5, to: 12 },
  { name: "Afternoon", from: 12, to: 17 },
  { name: "Evening", from: 17, to: 22 },
  { name: "Night", from: 22, to: 5 },
] as const;

/** How many tasks were written down in each hour of each weekday (rows Monday to Sunday), by the device's clock. */
export function createdGrid(tasks: StatTask[]) {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const parts = DAY_PARTS.map(() => 0);
  for (const { createdAt } of tasks) {
    const hour = createdAt.getHours();
    grid[(createdAt.getDay() + 6) % 7][hour]++;
    parts[DAY_PARTS.findIndex(({ from, to }) => (from < to ? hour >= from && hour < to : hour >= from || hour < to))]++;
  }
  return { grid, parts, max: Math.max(0, ...grid.flat()), total: tasks.length };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Days from writing a task down to ticking it off; never negative. */
export const turnaround = (task: StatTask) => Math.max(0, daysBetween(task.createdOn, task.completedOn!));
/** Days a task was finished before its deadline; negative = late. */
export const daysEarly = (task: StatTask) => daysBetween(task.completedOn!, task.deadlineDate!);

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

/** Finished tasks by how far from their deadline they were done, earliest first. */
export function earlyLateBuckets(tasks: StatTask[]): (Bucket & { late: boolean })[] {
  const early = tasks.map(daysEarly);
  return EARLY_LATE.map(({ label, has }, i) => ({ label, count: early.filter(has).length, late: i > 3 }));
}

// Upper ends of the duration buckets to choose from, in days.
const DURATION_STEPS = [0, 1, 3, 7, 14, 30, 90, 180, 365];

/**
 * Durations in at most `max` buckets, shortest first. The buckets follow the
 * data: they are spread up to where nine in ten durations fall, and whatever
 * took longer than the last one goes into "Longer".
 */
export function durationBuckets(days: number[], max = 6): Bucket[] {
  if (days.length === 0) return [];
  const sorted = [...days].sort((a, b) => a - b);
  const most = sorted[Math.floor((sorted.length - 1) * 0.9)];
  const last = DURATION_STEPS.findIndex((step) => step >= most);
  const top = last === -1 ? DURATION_STEPS.length - 1 : last;
  const count = Math.min(max - 1, top + 1);
  const ends = Array.from({ length: count }, (_, i) => DURATION_STEPS[count === 1 ? 0 : Math.round((i * top) / (count - 1))]);

  const buckets = ends.map((end, i) => {
    const start = i === 0 ? 0 : ends[i - 1] + 1;
    const label = end === 0 ? "Same day" : start === end ? `${end} day${end === 1 ? "" : "s"}` : `${start}-${end} days`;
    return { label, count: days.filter((d) => d >= start && d <= end).length };
  });
  const longer = days.filter((d) => d > ends.at(-1)!).length;
  return longer > 0 ? [...buckets, { label: "Longer", count: longer }] : buckets;
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
  /** Share of its finished tasks with a deadline that made it; null = none had one. */
  onTime: number | null;
  /** Median days from written down to done. */
  median: number | null;
}

/**
 * Per list, goal or tag: how much was done, how often on time, and how long it
 * took. A task with several goals (or tags) counts under each of them.
 */
export function groupStats(key: GroupKey, completions: Completion[], finished: StatTask[]): Map<string, GroupRow> {
  const work = new Map<string, { done: number; due: number; onTime: number; days: number[] }>();
  const at = (id: string) => {
    if (!work.has(id)) work.set(id, { done: 0, due: 0, onTime: 0, days: [] });
    return work.get(id)!;
  };
  for (const { task } of completions) for (const id of groupsOf(task, key)) at(id).done++;
  for (const task of finished) {
    for (const id of groupsOf(task, key)) {
      const group = at(id);
      group.days.push(turnaround(task));
      if (!task.deadlineDate) continue;
      group.due++;
      if (daysEarly(task) >= 0) group.onTime++;
    }
  }
  return new Map(
    [...work].map(([id, g]) => [id, { id, done: g.done, onTime: g.due ? g.onTime / g.due : null, median: median(g.days) }]),
  );
}

export interface SharePeriod {
  key: string;
  label: string;
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
    for (const id of groupsOf(task, key)) {
      period.parts.set(id, (period.parts.get(id) ?? 0) + 1);
      period.total++;
    }
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
