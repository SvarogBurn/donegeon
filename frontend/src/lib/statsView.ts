import { addDays, daysBetween } from "../../../shared/dates";
import type { Folder } from "../types";
import { listOfView } from "./folders";
import { deadlineOutcomes, matchesFilter, rangeStart, type Completion, type Outcome, type StatFilter, type StatTask } from "./stats";

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
  /** Days since a task was written down. */
  age: (task: StatTask) => number;
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
    age,
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
