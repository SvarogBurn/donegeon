// Hand-mirrored from the backend's Prisma models (see PLAN.md: no shared package in v1).
import type { DashboardLayout } from "../lib/tileLayout";

/** What the lists do with a ticked task: put it under the open ones, leave it where it is, or take it out of sight. */
export type TickedTasks = "bottom" | "stay" | "hide";

export interface User {
  id: string;
  username: string;
  tickedTasks: TickedTasks;
  /** False until the tutorial was finished or skipped: it shows while this is false. */
  tutorialSeen: boolean;
}

export interface Goal {
  id: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  createdAt: string;
}

/** A free-form label; like a goal, any task can carry several. */
export interface Tag {
  id: string;
  name: string;
}

export type ListKind = "task" | "reward";

/** A user-made folder of top-level tasks. */
export interface List {
  id: string;
  name: string;
  position: number;
  /** Items in a task list add points when done; items in a reward list cost points. */
  kind: ListKind;
  /** What an item is worth unless it has its own amount. */
  defaultPoints: number;
  /** The colour picked for its box, "#rrggbb"; null = the kind's own (blue for tasks, orange for rewards). */
  color: string | null;
  /** Its main tasks when the lists were loaded, those finished long ago too. */
  taskCount: number;
}

/** A tab of the user's own in the task bar: a page of views, copies of boxes that live elsewhere. */
export interface Folder {
  id: string;
  name: string;
  /** The colour of its icon, "#rrggbb"; null = the icon as drawn. */
  color: string | null;
  /** How its page arranges its boxes. */
  layout: DashboardLayout | null;
  /** The boxes it shows, by key: "list:<id>" (the list stays on the Tasks page too) or "stat:<name>" (a box of the stats). */
  views: string[];
}

export type RepeatUnit = "day" | "week" | "month";

export interface Task {
  id: string;
  parentId: string | null;
  /** Set on top-level tasks only; subtasks belong to their parent's list. */
  listId: string | null;
  /** Any task can carry several goals and several tags; both are empty by default. */
  goalIds: string[];
  tagIds: string[];
  title: string;
  notes: string | null;
  startDate: string | null;
  deadlineDate: string | null;
  deadlineType: "hard" | "soft" | null;
  isComplete: boolean;
  completedAt: string | null;
  /** The user's calendar day the task was completed on, "YYYY-MM-DD". */
  completedOn: string | null;
  /** A hand-set amount; null = the list's default (a main task), or what its main task hands down, if anything (a subtask). */
  points: number | null;
  /** Top-level tasks only: subtasks without their own amount are worth what this task is. */
  pointsToSubtasks: boolean;
  /** The day it was marked for Today; null = not in Today. */
  todaySince: string | null;
  /** Top-level tasks only: done again and again with a button instead of ticked once. */
  isPersistent: boolean;
  /** A persistent task on a schedule: due again every so many units. null = no schedule. */
  repeatEvery: number | null;
  repeatUnit: RepeatUnit;
  /** The next round is counted from the day it was done, instead of keeping to the planned days. */
  repeatAfterDone: boolean;
  /** The day the next round is due, "YYYY-MM-DD"; set while repeatEvery is. */
  nextDue: string | null;
  position: number;
  /** The moment it was written down. */
  createdAt: string;
}

/** One press of a persistent task's "done it" button. */
export interface TaskPress {
  id: string;
  day: string;
  createdAt: string;
}

export interface PointsSummary {
  balance: number;
  /** What a task written straight into Today is worth, unless it has its own amount. */
  todayPoints: number;
  /** Newest first. */
  transactions: { id: string; type: "earned" | "redeemed" | "reversal"; amount: number; title: string; createdAt: string }[];
}

/** Where a task stands on one day: Days left / Left / Per day. */
export interface Pace {
  /** Deadline minus the day; 0 on the deadline day, negative after it. */
  daysLeft: number;
  remaining: number;
  /** null = work left but no days left. */
  perDay: number | null;
}

export interface TaskTreeNode extends Task {
  children: TaskTreeNode[];
  descendantCount: number;
  descendantDoneCount: number;
  /** Today's pace, for tasks with a deadline (hard or soft). */
  pace: Pace | null;
  /** What the task is worth right now; 0 = nothing, as for a subtask that was given no points. */
  value: number;
  /** Whether that is earned or spent: the kind of the list its main task is in. */
  valueKind: ListKind;
  /** Presses of a persistent task, oldest first: those since yesterday, or of the day that was asked for. */
  completions: TaskPress[];
}

/** A few days of the Done page, newest first. */
export interface DonePage {
  /** The days in it, on each of which something was ticked. */
  days: string[];
  /** The whole trees holding what was ticked on those days. */
  tasks: TaskTreeNode[];
  /** What to ask the days after these with; null = there are none. */
  next: string | null;
}

/** A task as the server hands it to the stats: every task there is, each cut down to what they count with. */
export type StatRow = Pick<
  Task,
  | "id"
  | "parentId"
  | "listId"
  | "title"
  | "startDate"
  | "deadlineDate"
  | "deadlineType"
  | "isComplete"
  | "completedOn"
  | "isPersistent"
  | "createdAt"
  | "goalIds"
  | "tagIds"
> & {
  /** The day of each press of a persistent task. */
  pressDays: string[];
};

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

export interface PressureItem extends Pace {
  taskId: string;
  title: string;
  deadlineDate: string;
}

export interface PressureSummary {
  totalOutstanding: number;
  perDayToday: number;
  items: PressureItem[];
}

/** The dashboard's table: every deadline, hard and soft, added up day by day. */
export interface CombinedCountdown {
  today: string;
  totalTasks: number;
  /** Soonest deadline first. */
  items: { taskId: string; title: string; deadlineDate: string; deadlineType: "hard" | "soft" }[];
  rows: {
    date: string;
    doneThatDay: number;
    remaining: number;
    /** Sum of each deadline's pace; overdue work counts in full. */
    perDay: number;
    overdue: boolean;
  }[];
}
