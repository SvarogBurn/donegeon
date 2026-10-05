import { Router, type Request } from "express";
import { z } from "zod";
import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { layoutSchema } from "./layout.routes.js";
import { color } from "./lists.routes.js";

const name = z.string().trim().min(1, "Name is required").max(60);

const folderInput = z.object({
  name: name.optional(),
  color: color.optional(),
  /** Lists to put in the new folder straight away: the one dragged onto "New". */
  listIds: z.array(z.string().uuid()).max(100).optional(),
});
const folderPatch = z.object({ name: name.optional(), color: color.optional(), layout: layoutSchema.nullable().optional() });

async function ownFolder(req: Request, id: string) {
  const folder = await prisma.folder.findFirst({ where: { id, userId: userId(req) } });
  if (!folder) throw notFound("Folder");
  return folder;
}

/**
 * Folders are the user's own tabs in the task bar. A list sits in one folder
 * or on the Tasks page (List.folderId); a folder's page shows its lists.
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
  const last = await prisma.folder.aggregate({ where: { userId: owner }, _max: { position: true } });
  const folder = await prisma.$transaction(async (tx) => {
    const created = await tx.folder.create({
      data: { userId: owner, name: input.name ?? "Folder", color: input.color ?? null, position: (last._max.position ?? -1) + 1 },
    });
    await tx.list.updateMany({ where: { userId: owner, id: { in: input.listIds ?? [] } }, data: { folderId: created.id } });
    return created;
  });
  res.status(201).json({ folder });
});

foldersRouter.patch("/:id", async (req, res) => {
  const { layout, ...input } = folderPatch.parse(req.body);
  await ownFolder(req, req.params.id);
  const folder = await prisma.folder.update({
    where: { id: req.params.id },
    data: { ...input, ...(layout === undefined ? {} : { layout: layout ?? undefined }) },
  });
  res.json({ folder });
});

// Removes the tab only: its lists go back to the Tasks page (the relation sets their folderId to null).
foldersRouter.delete("/:id", async (req, res) => {
  const folder = await ownFolder(req, req.params.id);
  await prisma.folder.delete({ where: { id: folder.id } });
  res.status(204).end();
});
