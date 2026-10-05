import { Router, type Request } from "express";
import { z } from "zod";
import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { layoutSchema } from "./layout.routes.js";
import { color } from "./lists.routes.js";

const name = z.string().trim().min(1, "Name is required").max(60);

/** The boxes a folder shows: lists ("list:<id>") and boxes of the stats ("stat:<name>"). */
export const viewsSchema = z.array(z.string().regex(/^(list:[0-9a-f-]{36}|stat:[a-z]{1,30})$/i, "No such box")).max(200);

const folderInput = z.object({
  name: name.optional(),
  color: color.optional(),
  /** What the new folder shows straight away: the box dragged onto "New". */
  views: viewsSchema.optional(),
});
/** `views` is the full set: the folder ends up showing exactly these. */
const folderPatch = z.object({
  name: name.optional(),
  color: color.optional(),
  layout: layoutSchema.nullable().optional(),
  views: viewsSchema.optional(),
});

async function ownFolder(req: Request, id: string) {
  const folder = await prisma.folder.findFirst({ where: { id, userId: userId(req) } });
  if (!folder) throw notFound("Folder");
  return folder;
}

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
  const last = await prisma.folder.aggregate({ where: { userId: owner }, _max: { position: true } });
  const folder = await prisma.folder.create({
    data: {
      userId: owner,
      name: input.name ?? "Folder",
      color: input.color ?? null,
      position: (last._max.position ?? -1) + 1,
      views: [...new Set(input.views ?? [])],
    },
  });
  res.status(201).json({ folder });
});

foldersRouter.patch("/:id", async (req, res) => {
  const { layout, views, ...input } = folderPatch.parse(req.body);
  await ownFolder(req, req.params.id);
  const folder = await prisma.folder.update({
    where: { id: req.params.id },
    data: { ...input, ...(layout === undefined ? {} : { layout: layout ?? undefined }), ...(views ? { views: [...new Set(views)] } : {}) },
  });
  res.json({ folder });
});

// Removes the tab only: what it showed lives elsewhere and stays there.
foldersRouter.delete("/:id", async (req, res) => {
  const folder = await ownFolder(req, req.params.id);
  await prisma.folder.delete({ where: { id: folder.id } });
  res.status(204).end();
});
