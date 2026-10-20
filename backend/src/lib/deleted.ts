import { RESTORABLE_MS } from "../../../shared/constants.js";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";


/** The oldest delete that can still be undone at `now`. */
export const restorableSince = (now = Date.now()) => new Date(now - RESTORABLE_MS);

/** Whether a delete stamped `deletedAt` can still be undone at `now`. */
export const isRestorable = (deletedAt: Date, now = Date.now()) => deletedAt >= restorableSince(now);

/** The answer to an undo that came too late: the row is about to go, or has gone, for good. */
export const tooLateToRestore = () => new HttpError(410, "Too late to bring it back: it was deleted for good");

/**
 * Whether a row deleted at `deletedAt` is to be brought back: not when it is back already (an undo sent twice, which
 * is no error), and an undo that came too late is refused.
 */
export function needsRestore(deletedAt: Date | null, now = Date.now()): deletedAt is Date {
  if (!deletedAt) return false;
  if (!isRestorable(deletedAt, now)) throw tooLateToRestore();
  return true;
}

/**
 * Removes for good every task, list and note, of every user, deleted longer ago than RESTORABLE_MS. Subtasks,
 * presses and the tasks of a removed list go with them (cascade). Ledger rows stay, with their title.
 */
export async function purgeDeleted(now = Date.now()) {
  const before = restorableSince(now);
  await prisma.list.deleteMany({ where: { deletedAt: { lt: before } } });
  await prisma.task.deleteMany({ where: { deletedAt: { lt: before } } });
  await prisma.note.deleteMany({ where: { deletedAt: { lt: before } } });
}
