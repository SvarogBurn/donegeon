/**
 * The fixed choices the server checks and the app offers, in one place: the server's checks are made from these
 * lists and the app's types from the same lists, so a choice added to one is there for the other.
 */

export const DEADLINE_TYPES = ["hard", "soft"] as const;
export type DeadlineType = (typeof DEADLINE_TYPES)[number];

export const REPEAT_UNITS = ["day", "week", "month"] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

/** A task list earns points; a reward list spends them. */
export const LIST_KINDS = ["task", "reward"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

/** Where a ticked task goes in its list: under the open ones, where it was, or out of sight. */
export const TICKED_TASKS = ["bottom", "stay", "hide"] as const;
export type TickedTasks = (typeof TICKED_TASKS)[number];

/** Whether deadlines come into Today by themselves: never, on the day, or from the day before. */
export const DEADLINE_TODAY = ["never", "day", "dayBefore"] as const;
export type DeadlineToday = (typeof DEADLINE_TODAY)[number];

export const FEEDBACK_KINDS = ["bug", "feature"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
