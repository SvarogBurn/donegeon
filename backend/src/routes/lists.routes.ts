import { Router, type Request } from "express";
import { z } from "zod";
import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { subtreeIds } from "../services/taskTree.service.js";

const DELETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const listInput = z.object({ name: z.string().trim().min(1, "Name is required").max(200) });

async function ownList(req: Request, id: string) {
  const list = await prisma.list.findFirst({ where: { id, userId: userId(req), deletedAt: null } });
  if (!list) throw notFound("List");
  return list;
}

/** Lists are the user's own folders for top-level tasks; they carry no deadline or points logic. */
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
  });
  res.json({ lists });
});

listsRouter.post("/", async (req, res) => {
  const { name } = listInput.parse(req.body);
  const owner = userId(req);
  const last = await prisma.list.aggregate({ where: { userId: owner }, _max: { position: true } });
  const list = await prisma.list.create({
    data: { userId: owner, name, position: (last._max.position ?? -1) + 1 },
  });
  res.status(201).json({ list });
});

listsRouter.patch("/:id", async (req, res) => {
  const { name } = listInput.parse(req.body);
  await ownList(req, req.params.id);
  res.json({ list: await prisma.list.update({ where: { id: req.params.id }, data: { name } }) });
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
