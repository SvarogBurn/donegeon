/**
 * Sent on `window` when a box dropped on the task bar's "New" tab has made a
 * folder (detail: the folder's id), so the task bar opens its name for typing.
 */
export const NAME_FOLDER_EVENT = "donegeon:name-folder";

/** A folder's views are named by key: a list's, a note's, a box of the stats', a box of the calendar's, or the Today, Goals or Tags box. */
export const TODAY_VIEW = "box:today";
/** The Goals and Tags boxes: in a folder, picking one shows only its tasks in that folder's lists. */
export const GOALS_VIEW = "box:goals";
export const TAGS_VIEW = "box:tags";
export const listView = (listId: string) => `list:${listId}`;
export const statView = (name: string) => `stat:${name}`;
const STAT_PREFIX = "stat:";
/** The stats box a view shows, or null for any other view. */
export const statOfView = (view: string) => (view.startsWith(STAT_PREFIX) ? view.slice(STAT_PREFIX.length) : null);
const LIST_PREFIX = "list:";
/** The list a view shows, or null for any other view. */
export const listOfView = (view: string) => (view.startsWith(LIST_PREFIX) ? view.slice(LIST_PREFIX.length) : null);
const CAL_PREFIX = "cal:";
export const calView = (name: string) => `${CAL_PREFIX}${name}`;
/** The calendar box a view shows, or null for any other view. */
export const calOfView = (view: string) => (view.startsWith(CAL_PREFIX) ? view.slice(CAL_PREFIX.length) : null);
const NOTE_PREFIX = "note:";
export const noteView = (noteId: string) => `${NOTE_PREFIX}${noteId}`;
/** The note a view shows, or null for any other view. */
export const noteOfView = (view: string) => (view.startsWith(NOTE_PREFIX) ? view.slice(NOTE_PREFIX.length) : null);
