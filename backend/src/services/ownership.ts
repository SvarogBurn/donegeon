import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";

/**
 * The user's own rows, looked up by id: someone else's, or one deleted, is "not found", so nobody can even tell it
 * exists. Every route that takes an id goes through one of these.
 */

const live = (owner: string) => ({ userId: owner, deletedAt: null });

export async function ownTask(owner: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, ...live(owner) } });
  if (!task) throw notFound("Task");
  return task;
}

export async function ownList(owner: string, id: string) {
  const list = await prisma.list.findFirst({ where: { id, ...live(owner) } });
  if (!list) throw notFound("List");
  return list;
}

export async function ownNote(owner: string, id: string) {
  const note = await prisma.note.findFirst({ where: { id, ...live(owner) } });
  if (!note) throw notFound("Note");
  return note;
}

export async function ownNoteFolder(owner: string, id: string) {
  const folder = await prisma.noteFolder.findFirst({ where: { id, userId: owner } });
  if (!folder) throw notFound("Note folder");
  return folder;
}

export async function ownFolder(owner: string, id: string) {
  const folder = await prisma.folder.findFirst({ where: { id, userId: owner } });
  if (!folder) throw notFound("Folder");
  return folder;
}

export async function ownGoal(owner: string, id: string) {
  const goal = await prisma.goal.findFirst({ where: { id, userId: owner } });
  if (!goal) throw notFound("Goal");
  return goal;
}

export async function ownTag(owner: string, id: string) {
  const tag = await prisma.tag.findFirst({ where: { id, userId: owner } });
  if (!tag) throw notFound("Tag");
  return tag;
}

/** Goals and tags to put on a task must all be the user's own. Nothing to look up for none. */
export async function assertOwnLabels(owner: string, goalIds: string[] = [], tagIds: string[] = []) {
  const [goals, tags] = await Promise.all([
    goalIds.length > 0 ? prisma.goal.count({ where: { userId: owner, id: { in: goalIds } } }) : 0,
    tagIds.length > 0 ? prisma.tag.count({ where: { userId: owner, id: { in: tagIds } } }) : 0,
  ]);
  if (goals !== new Set(goalIds).size) throw notFound("Goal");
  if (tags !== new Set(tagIds).size) throw notFound("Tag");
}
