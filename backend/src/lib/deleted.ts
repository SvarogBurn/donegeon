import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";

/**
 * How long a deleted task or list can still be brought back: a little past the page's 10-second undo
 * (UNDO_WINDOW_MS in the frontend's TreeContext), so an undo on a slow connection still arrives in time.
 * After that it is removed for good.
 */
export const RESTORABLE_MS = 60_000;

/** The oldest delete that can still be undone at `now`. */
export const restorableSince = (now = Date.now()) => new Date(now - RESTORABLE_MS);

/** Whether a delete stamped `deletedAt` can still be undone at `now`. */
export const isRestorable = (deletedAt: Date, now = Date.now()) => deletedAt >= restorableSince(now);

/** The answer to an undo that came too late: the row is about to go, or has gone, for good. */
export const tooLateToRestore = () => new HttpError(410, "Too late to bring it back: it was deleted for good");

/**
 * Removes for good every task and list, of every user, deleted longer ago than RESTORABLE_MS. Subtasks,
 * presses and the tasks of a removed list go with them (cascade). Ledger rows stay, with their title.
 */
export async function purgeDeleted(now = Date.now()) {
  const before = restorableSince(now);
  await prisma.list.deleteMany({ where: { deletedAt: { lt: before } } });
  await prisma.task.deleteMany({ where: { deletedAt: { lt: before } } });
}
