export const TASKS = ["tasks"];
// What was done before yesterday is loaded apart from the task trees. These sit under their key, so whatever refreshes the trees refreshes them.
export const DONE = [...TASKS, "done"];
export const STATS = [...TASKS, "stats"];
export const GOALS = ["goals"];
export const TAGS = ["tags"];
export const LISTS = ["lists"];
export const FOLDERS = ["folders"];
// The free-standing notes and the Notes page's folders, in one answer.
export const NOTES = ["notes"];
export const COUNTDOWN = ["countdown"];
export const PRESSURE = ["pressure"];
export const POINTS = ["points"];
export const LAYOUT = ["layout"];
// Any change to a task can change the countdown tables, the dashboard totals, the point balance, and how many tasks a
// list holds (which decides whether deleting it asks first).
export const TASK_DATA = [TASKS, COUNTDOWN, PRESSURE, POINTS, LISTS];
// The developers' inbox of letters from the suggestion box.
export const FEEDBACK = ["feedback"];
/** Under FEEDBACK, so a letter sent refreshes both. */
export const FEEDBACK_SENT = ["feedback", "sent"];
