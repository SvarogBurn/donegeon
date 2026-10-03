// Hand-mirrored from the backend's Prisma models (see PLAN.md: no shared package in v1).

export interface User {
  id: string;
  username: string;
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
}

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
  /** Top-level tasks only: a hand-set amount; null = the list's default. */
  points: number | null;
  /** The day it was marked for Today; null = not in Today. */
  todaySince: string | null;
  /** Top-level tasks only: done again and again with a button instead of ticked once. */
  isPersistent: boolean;
  position: number;
}

/** One press of a persistent task's "done it" button. */
export interface TaskPress {
  id: string;
  day: string;
  createdAt: string;
}

export interface PointsSummary {
  balance: number;
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
  /** What a top-level task is worth right now; null for subtasks. */
  value: number | null;
  /** Presses of a persistent task, oldest first. */
  completions: TaskPress[];
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
