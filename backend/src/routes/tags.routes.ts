import { Router } from "express";
import { z } from "zod";
import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";

const tagInput = z.object({ name: z.string().trim().min(1, "Name is required").max(100) });

/** Free-form labels. Any task can carry several; the dashboard can filter by them. */
export const tagsRouter = Router();

tagsRouter.get("/", async (req, res) => {
  const tags = await prisma.tag.findMany({ where: { userId: userId(req) }, orderBy: { createdAt: "asc" } });
  res.json({ tags });
});

tagsRouter.post("/", async (req, res) => {
  const { name } = tagInput.parse(req.body);
  const tag = await prisma.tag.create({ data: { userId: userId(req), name } });
  res.status(201).json({ tag });
});

// Deleting a tag just takes it off its tasks.
tagsRouter.delete("/:id", async (req, res) => {
  const tag = await prisma.tag.findFirst({ where: { id: req.params.id, userId: userId(req) } });
  if (!tag) throw notFound("Tag");
  await prisma.tag.delete({ where: { id: tag.id } });
  res.status(204).end();
});
