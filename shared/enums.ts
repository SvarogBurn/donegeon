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

/** The fonts the text in the boxes, or in the notes, can be in (see frontend/src/lib/fonts.ts). */
export const TEXT_FONTS = ["pixel", "plain", "dyslexic", "large"] as const;
export type TextFont = (typeof TEXT_FONTS)[number];

export const FEEDBACK_KINDS = ["bug", "feature", "feedback"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/**
 * What a notification is about: one of the user's reminders, a hard deadline coming, a deadline gone by, the week's
 * recap (its text written by the server when it is sent), tasks left undone in Today or Week, a reminder snoozed, and
 * the test sent from the settings.
 */
export const NOTIFICATION_KINDS = ["reminder", "deadline", "passed", "recap", "undone", "snooze", "test"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * What a reminder says: today's tasks, what is still open today, tomorrow's tasks, next week's plan, the week so far,
 * the hard deadlines coming, or the user's own words (on a task, a note, or nothing).
 */
export const REMINDER_KINDS = ["today", "open", "tomorrow", "nextWeek", "recap", "deadlines", "text"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** What the bell lists: everything (the reminders and deadline notices too, once their time has come today), or only what needs an answer. */
export const BELL_SHOWS = ["all", "actions"] as const;
export type BellShows = (typeof BELL_SHOWS)[number];

/** What cost the character health: a deadline gone by with the task still open, or a round of a schedule not done. */
export const HIT_KINDS = ["deadline", "round"] as const;
export type HitKind = (typeof HIT_KINDS)[number];
