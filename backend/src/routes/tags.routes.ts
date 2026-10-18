import { Router } from "express";
import { z } from "zod";
import { alreadyMade } from "../lib/clientId.js";
import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";

const tagInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  /** Made on the device for a tag typed offline; see lib/clientId. */
  id: z.string().uuid().optional(),
});

/** Free-form labels. Any task can carry several; the dashboard can filter by them. */
export const tagsRouter = Router();

tagsRouter.get("/", async (req, res) => {
  const tags = await prisma.tag.findMany({ where: { userId: userId(req) }, orderBy: { createdAt: "asc" } });
  res.json({ tags });
});

tagsRouter.post("/", async (req, res) => {
  const { name, id } = tagInput.parse(req.body);
  const owner = userId(req);
  const made = id && alreadyMade(await prisma.tag.findUnique({ where: { id } }), owner);
  if (made) return void res.json({ tag: made });
  const tag = await prisma.tag.create({ data: { id, userId: owner, name, createdAt: req.clientTime } });
  res.status(201).json({ tag });
});

// Deleting a tag just takes it off its tasks.
tagsRouter.delete("/:id", async (req, res) => {
  const tag = await prisma.tag.findFirst({ where: { id: req.params.id, userId: userId(req) } });
  if (!tag) throw notFound("Tag");
  await prisma.tag.delete({ where: { id: tag.id } });
  res.status(204).end();
});
