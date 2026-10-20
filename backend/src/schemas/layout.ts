import { z } from "zod";

const key = z.string().min(1).max(60);
const column = z.array(key).max(200);

/**
 * A page's arrangement of boxes: the dashboard's, the stats boxes' on the Stats page, and the Calendar page's
 * (one column, so only an order). Tiles are named by key ("today", "goals",
 * "list:<id>", ...). Two arrangements are kept, "wide" and "phone", so
 * rearranging on a phone doesn't undo the desktop layout. (Older saves used
 * "1".."4"; the frontend converts those.) `hidden` are the tiles the user has
 * minimized away; they keep their place for when they are brought back.
 */
export const layoutSchema = z.object({
  pinned: column,
  hidden: column.optional(),
  /** The dashboard's only: boxes of other pages (the calendar's, "cal:<name>") that are shown on it too. */
  extras: column.optional(),
  byColumns: z.record(z.string().min(1).max(10), z.array(column).max(4)).refine((r) => Object.keys(r).length <= 8),
});

/**
 * The boxes a folder shows: lists ("list:<id>"), notes ("note:<id>"), boxes of the stats ("stat:<name>") and of the
 * calendar ("cal:<name>"), and the Today, Goals and Tags boxes ("box:today", "box:goals", "box:tags").
 */
export const viewsSchema = z
  .array(z.string().regex(/^((list|note):[0-9a-f-]{36}|stat:[a-z]{1,30}|cal:[a-z]{1,30}|box:(today|goals|tags))$/i, "No such box"))
  .max(200);
