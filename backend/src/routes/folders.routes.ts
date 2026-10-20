import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { color, id, name } from "../schemas/common.js";
import { layoutSchema, viewsSchema } from "../schemas/layout.js";
import { nextPosition, writeOrder } from "../services/ordering.service.js";
import { ownFolder } from "../services/ownership.js";

const folderInput = z.object({
  name: name(60).optional(),
  color: color.optional(),
  /** What the new folder shows straight away: the box dragged onto "New". */
  views: viewsSchema.optional(),
});
/** `views` is the full set: the folder ends up showing exactly these. `layout: null` goes back to the default arrangement. */
const folderPatch = z.object({
  name: name(60).optional(),
  color: color.optional(),
  layout: layoutSchema.nullable().optional(),
  views: viewsSchema.optional(),
});

/**
 * Folders are the user's own tabs in the task bar. A folder's page shows its
 * views (Folder.views): copies of boxes that live elsewhere, lists of the Tasks
 * page and boxes of the stats. Nothing is moved into a folder.
 */
export const foldersRouter = Router();

foldersRouter.get("/", async (req, res) => {
  const folders = await prisma.folder.findMany({
    where: { userId: userId(req) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  res.json({ folders });
});

foldersRouter.post("/", async (req, res) => {
  const input = folderInput.parse(req.body);
  const owner = userId(req);
  const folder = await prisma.folder.create({
    data: {
      userId: owner,
      name: input.name ?? "Folder",
      color: input.color ?? null,
      position: await nextPosition(prisma, "folder", owner),
      views: [...new Set(input.views ?? [])],
    },
  });
  res.status(201).json({ folder });
});

// The tabs dragged into another order: `ids` left to right. A folder left out (made meanwhile) keeps its place after them.
foldersRouter.put("/order", async (req, res) => {
  const { ids } = z.object({ ids: z.array(id).max(200) }).parse(req.body);
  const folders = await prisma.folder.findMany({
    where: { userId: userId(req) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true },
  });
  const own = new Set(folders.map((f) => f.id));
  const listed = [...new Set(ids)].filter((folderId) => own.has(folderId));
  const order = [...listed, ...folders.map((f) => f.id).filter((folderId) => !listed.includes(folderId))];
  await writeOrder(prisma, "folderPosition", order, new Map(folders.map((f) => [f.id, f.position])));
  res.status(204).end();
});

foldersRouter.patch("/:id", async (req, res) => {
  const { layout, views, ...input } = folderPatch.parse(req.body);
  const { id: folderId } = await ownFolder(userId(req), req.params.id);
  const folder = await prisma.folder.update({
    where: { id: folderId },
    data: {
      ...input,
      ...(layout !== undefined && { layout: layout ?? Prisma.DbNull }),
      ...(views && { views: [...new Set(views)] }),
    },
  });
  res.json({ folder });
});

// Removes the tab only: what it showed lives elsewhere and stays there.
foldersRouter.delete("/:id", async (req, res) => {
  const folder = await ownFolder(userId(req), req.params.id);
  await prisma.folder.delete({ where: { id: folder.id } });
  res.status(204).end();
});
