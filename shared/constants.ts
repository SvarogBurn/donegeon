/** Numbers the server and the app must agree on. */

/** The most an amount (a task's, a list's, Today's, the user's cap) can be set to. */
export const MAX_POINTS = 1_000_000_000;

/** What a task written straight into Today earns until the user sets another amount (User.todayPoints's default). */
export const DEFAULT_TODAY_POINTS = 2;

/** How long the page offers to undo a delete, a tick that hides a task, or a press. */
export const UNDO_WINDOW_MS = 10_000;

/**
 * How long a deleted task, list or note can still be brought back: a little past the page's undo, so an undo on a
 * slow connection still arrives in time. After that it is removed for good.
 */
export const RESTORABLE_MS = 60_000;

/** A ticked task stays in its list this long, shown as done so it can still be taken back; after that only the Done page has it. */
export const KEPT_WHEN_DONE_MS = 24 * 60 * 60 * 1000;

/**
 * The hours a reminder or notice can be set for, "HH:MM" on the user's clock: the server is kept awake only then
 * (a health check every 15 minutes from 07:00 to 22:00), and asleep it sends nothing.
 */
export const NOTIFY_FROM = "07:00";
export const NOTIFY_TO = "22:00";

/** The most reminders an account can have, and times a reminder can come in a day. */
export const MAX_REMINDERS = 50;
export const MAX_REMINDER_TIMES = 12;
