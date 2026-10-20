import { addDays, daysBetween } from "../../../shared/dates";
import type { Folder, Goal, List, Tag } from "../types";
import { listOfView } from "./folders";
import {
  NO_GROUP,
  NO_GROUP_ROW,
  deadlineOutcomes,
  groupStats,
  matchesFilter,
  rangeStart,
  shareOverTime,
  type Completion,
  type GroupKey,
  type GroupRow,
  type Outcome,
  type StatFilter,
  type StatTask,
} from "./stats";

/**
 * What every box of the stats starts from: the tasks and completions the filter lets through, and the few cuts of
 * them more than one box uses. Each box works out the rest of its own numbers, so a folder showing one box of the
 * stats only counts that one.
 */
export interface StatsView {
  today: string;
  /** The first day of the Dates filter; null = all time. */
  from: string | null;
  inRange: (day: string) => boolean;
  tasks: StatTask[];
  /** Every completion (a tick at any depth, a press) of a task the filter lets through, whatever its day. */
  done: Completion[];
  doneInRange: Completion[];
  /** One-off tasks ticked off in the range: the ones with a time to finish. */
  finished: StatTask[];
  /** Tasks written down in the range. */
  written: StatTask[];
  /** What is still to do, the longest waiting first. */
  open: StatTask[];
  /** Days since a task was written down. */
  age: (task: StatTask) => number;
  outcomes: Outcome[];
  /** Deadlines met or missed in the range. */
  settled: Outcome[];
}

export function statsView(all: { tasks: StatTask[]; completions: Completion[] }, folders: Folder[], filter: StatFilter, today: string): StatsView {
  const from = rangeStart(today, filter.range);
  const inRange = (day: string) => (!from || day >= from) && day <= today;
  // A folder narrows the stats to the lists it shows. One that has since been removed narrows nothing.
  const folder = folders.find((f) => f.id === filter.folderId);
  const folderLists = folder ? new Set(folder.views.flatMap((view) => listOfView(view) ?? [])) : null;
  const tasks = all.tasks.filter((task) => matchesFilter(task, filter, folderLists));
  const done = all.completions.filter(({ task }) => matchesFilter(task, filter, folderLists));
  const age = (task: StatTask) => Math.max(0, daysBetween(task.createdOn, today));
  const outcomes = deadlineOutcomes(tasks, today);
  return {
    today,
    from,
    inRange,
    tasks,
    done,
    doneInRange: done.filter(({ day }) => inRange(day)),
    finished: tasks.filter((task) => task.completedOn && !task.isPersistent && inRange(task.completedOn)),
    written: tasks.filter((task) => inRange(task.createdOn)),
    open: tasks.filter((task) => task.isOpen).sort((a, b) => age(b) - age(a)),
    age,
    outcomes,
    settled: outcomes.filter(({ day }) => inRange(day)),
  };
}

/** Of what was done in the last 30 days: main tasks ticked, subtasks ticked, and presses of persistent tasks. */
export function doneKinds(done: Completion[], today: string) {
  const last30 = done.filter(({ day }) => day >= addDays(today, 1 - 30) && day <= today);
  return {
    tasks: last30.filter((c) => !c.isPress && c.task.isRoot).length,
    subtasks: last30.filter((c) => !c.isPress && !c.task.isRoot).length,
    repeats: last30.filter((c) => c.isPress).length,
  };
}

/** The lists (task lists only), goals or tags the "By …" box has a row for. */
export const groupItems = (key: GroupKey, lists: List[], goals: Goal[], tags: Tag[]): { id: string; name: string }[] =>
  key === "list" ? lists.filter((list) => list.kind === "task") : key === "goal" ? goals : tags;

/**
 * The rows of the "By …" box: one per list, goal or tag, plus `noneName` for what has none (when there is any), the
 * most done first.
 */
export function groupTable(key: GroupKey, view: StatsView, items: { id: string; name: string }[], noneName: string): (GroupRow & { name: string })[] {
  const groups = groupStats(key, view.doneInRange, view.finished, view.settled, view.open);
  return [...items, ...(groups.has(NO_GROUP) ? [{ id: NO_GROUP, name: noneName }] : [])]
    .map((item) => ({ name: item.name, ...(groups.get(item.id) ?? { id: item.id, ...NO_GROUP_ROW }) }))
    .sort((a, b) => b.done - a.done);
}

/** One part of a share bar: a list, goal or tag (or "Other", or none), its colour and how much was done in it. */
export interface ShareSegment {
  id: string;
  name: string;
  color: string;
  count: number;
}

/** How many lists, goals or tags get a colour of their own (--series-1 to 7); the rest share one as "Other". */
const SERIES = 7;

/**
 * The share bars of the "By …" box: per week or month, how what was done splits over the lists, goals or tags. A
 * colour belongs to the list, goal or tag itself (its place among all of them), so filtering never repaints it.
 */
export function shareBars(key: GroupKey, view: StatsView, items: { id: string; name: string }[], noneName: string) {
  const segmentOf = (id: string): Omit<ShareSegment, "count"> => {
    if (id === NO_GROUP) return { id, name: noneName, color: "var(--series-none)" };
    const index = items.findIndex((item) => item.id === id);
    if (index === -1 || index >= SERIES) return { id: "other", name: "Other", color: "var(--series-other)" };
    return { id, name: items[index].name, color: `var(--series-${index + 1})` };
  };
  const share = shareOverTime(key, view.doneInRange, view.from, view.today);
  const order = [...items.map((item) => item.id), NO_GROUP];
  // "Other" and the group without a label go last.
  const last = (segment: ShareSegment) => (segment.id === NO_GROUP ? 2 : segment.id === "other" ? 1 : 0);
  const periods = share.periods.map((period) => {
    const segments = new Map<string, ShareSegment>();
    for (const id of order) {
      const count = period.parts.get(id);
      if (!count) continue;
      const segment = segmentOf(id);
      segments.set(segment.id, { ...segment, count: (segments.get(segment.id)?.count ?? 0) + count });
    }
    return { ...period, segments: [...segments.values()].sort((a, b) => last(a) - last(b)) };
  });
  const legend = [...new Map(periods.flatMap((period) => period.segments).map((s) => [s.id, s])).values()];
  return { unit: share.unit, periods, legend };
}
