import { Router, type Request } from "express";
import { z } from "zod";
import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { MAX_POINTS } from "../services/points.service.js";
import { subtreeIds } from "../services/taskTree.service.js";

const DELETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const name = z.string().trim().min(1, "Name is required").max(200);
const kind = z.enum(["task", "reward"]);
const defaultPoints = z.number().int().min(0, "Points can't be negative").max(MAX_POINTS);

/** "#rrggbb", or null for the kind's own colour. */
export const color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "A colour looks like #5b6ee1")
  .transform((hex) => hex.toLowerCase())
  .nullable();

const listFields = z.object({
  name,
  kind: kind.optional(),
  defaultPoints: defaultPoints.optional(),
  color: color.optional(),
});
/** `folderId`: a folder that shows the new list straight away (it was made on that folder's page). */
const listInput = listFields.extend({ folderId: z.string().uuid().nullish() });
const listPatch = listFields.partial();

async function ownList(req: Request, id: string) {
  const list = await prisma.list.findFirst({ where: { id, userId: userId(req), deletedAt: null } });
  if (!list) throw notFound("List");
  return list;
}

/**
 * Lists are the user's own folders for top-level tasks. A list is a task list
 * (its items add points) or a reward list (its items cost points), and sets
 * what an item is worth unless the item has its own amount.
 */
export const listsRouter = Router();

listsRouter.get("/", async (req, res) => {
  const owner = userId(req);
  // Deleted lists stay restorable for a while, then go for good (their tasks cascade).
  await prisma.list.deleteMany({
    where: { userId: owner, deletedAt: { lt: new Date(Date.now() - DELETED_RETENTION_MS) } },
  });
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
  const folder = folderId ? await prisma.folder.findFirst({ where: { id: folderId, userId: owner } }) : null;
  if (folderId && !folder) throw notFound("Folder");
  const last = await prisma.list.aggregate({ where: { userId: owner }, _max: { position: true } });
  const list = await prisma.$transaction(async (tx) => {
    const created = await tx.list.create({
      data: { userId: owner, ...input, position: (last._max.position ?? -1) + 1 },
    });
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
  await ownList(req, req.params.id);
  res.json({ list: await prisma.list.update({ where: { id: req.params.id }, data: input }) });
});

// Soft-deletes the list together with every task in it, under one shared
// timestamp, so restore brings back exactly what this delete removed.
listsRouter.delete("/:id", async (req, res) => {
  const list = await ownList(req, req.params.id);
  const deletedAt = new Date();
  const roots = await prisma.task.findMany({
    where: { listId: list.id, deletedAt: null },
    select: { id: true },
  });
  const all = await prisma.task.findMany({
    where: { userId: list.userId, deletedAt: null },
    select: { id: true, parentId: true },
  });
  const taskIds = roots.flatMap((root) => subtreeIds(all, root.id));
  await prisma.$transaction([
    prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { deletedAt } }),
    prisma.list.update({ where: { id: list.id }, data: { deletedAt } }),
  ]);
  res.status(204).end();
});

// Undo of a delete: the list and the tasks that were deleted with it.
listsRouter.post("/:id/restore", async (req, res) => {
  const owner = userId(req);
  const list = await prisma.list.findFirst({
    where: { id: req.params.id, userId: owner, deletedAt: { not: null } },
  });
  if (!list) throw notFound("Deleted list");
  await prisma.$transaction([
    prisma.list.update({ where: { id: list.id }, data: { deletedAt: null } }),
    prisma.task.updateMany({ where: { userId: owner, deletedAt: list.deletedAt }, data: { deletedAt: null } }),
  ]);
  res.status(204).end();
});
