import { Router } from "express";
import { z } from "zod";
import { LIST_KINDS } from "../../../shared/enums.js";
import { needsRestore } from "../lib/deleted.js";
import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { color, id, name, points } from "../schemas/common.js";
import { nextPosition } from "../services/ordering.service.js";
import { ownFolder, ownList } from "../services/ownership.js";
import { findSubtree } from "../services/taskTree.service.js";

const listFields = z.object({
  name: name(200),
  kind: z.enum(LIST_KINDS).optional(),
  defaultPoints: points.optional(),
  color: color.optional(),
});
/** `folderId`: a folder that shows the new list straight away (it was made on that folder's page). */
const listInput = listFields.extend({ folderId: id.nullish() });
const listPatch = listFields.partial();

/**
 * Lists are the user's own folders for top-level tasks. A list is a task list
 * (its items add points) or a reward list (its items cost points), and sets
 * what an item is worth unless the item has its own amount.
 */
export const listsRouter = Router();

listsRouter.get("/", async (req, res) => {
  const owner = userId(req);
  const lists = await prisma.list.findMany({
    where: { userId: owner, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    // Its main tasks, finished long ago or not: the task trees only hold the open and the just ticked.
    include: { _count: { select: { tasks: { where: { deletedAt: null } } } } },
  });
  res.json({ lists: lists.map(({ _count, ...list }) => ({ ...list, taskCount: _count.tasks })) });
});

listsRouter.post("/", async (req, res) => {
  const { folderId, ...input } = listInput.parse(req.body);
  const owner = userId(req);
  const folder = folderId ? await ownFolder(owner, folderId) : null;
  const list = await prisma.$transaction(async (tx) => {
    const created = await tx.list.create({ data: { userId: owner, ...input, position: await nextPosition(tx, "list", owner) } });
    if (folder) {
      const views = z.array(z.string()).catch([]).parse(folder.views);
      await tx.folder.update({ where: { id: folder.id }, data: { views: [...views, `list:${created.id}`] } });
    }
    return created;
  });
  res.status(201).json({ list });
});

listsRouter.patch("/:id", async (req, res) => {
  // Changing kind or default only affects what gets booked from now on; the ledger stays as it is.
  const input = listPatch.parse(req.body);
  const list = await ownList(userId(req), req.params.id);
  res.json({ list: await prisma.list.update({ where: { id: list.id }, data: input }) });
});

// Soft-deletes the list together with every task in it, under one shared
// timestamp, so restore brings back exactly what this delete removed.
listsRouter.delete("/:id", async (req, res) => {
  const list = await ownList(userId(req), req.params.id);
  const deletedAt = new Date();
  const roots = await prisma.task.findMany({
    where: { listId: list.id, deletedAt: null },
    select: { id: true },
  });
  const taskIds = (await findSubtree(prisma, roots.map((root) => root.id))).map((task) => task.id);
  await prisma.$transaction([
    prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { deletedAt } }),
    prisma.list.update({ where: { id: list.id }, data: { deletedAt } }),
  ]);
  res.status(204).end();
});

// Undo of a delete: the list and the tasks that were deleted with it, within a minute of the delete. Back already
// (an undo sent twice) is no error, as for tasks and notes.
listsRouter.post("/:id/restore", async (req, res) => {
  const owner = userId(req);
  const list = await prisma.list.findFirst({ where: { id: req.params.id, userId: owner } });
  if (!list) throw notFound("Deleted list");
  if (needsRestore(list.deletedAt)) {
    await prisma.$transaction([
      prisma.list.update({ where: { id: list.id }, data: { deletedAt: null } }),
      prisma.task.updateMany({ where: { userId: owner, deletedAt: list.deletedAt }, data: { deletedAt: null } }),
    ]);
  }
  res.status(204).end();
});
