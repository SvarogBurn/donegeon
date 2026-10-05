/**
 * Sent on `window` when a box dropped on the task bar's "New" tab has made a
 * folder (detail: the folder's id), so the task bar opens its name for typing.
 */
export const NAME_FOLDER_EVENT = "donegeon:name-folder";

/** A folder's views are named by key: a list's, or a box of the stats'. */
export const listView = (listId: string) => `list:${listId}`;
export const statView = (name: string) => `stat:${name}`;
const STAT_PREFIX = "stat:";
/** The stats box a view shows, or null for any other view. */
export const statOfView = (view: string) => (view.startsWith(STAT_PREFIX) ? view.slice(STAT_PREFIX.length) : null);
