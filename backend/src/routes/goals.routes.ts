import { Router } from "express";
import { z } from "zod";
import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";

const goalInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).nullish(),
});

const goalPatch = goalInput.partial().extend({ isArchived: z.boolean().optional() });

async function ownGoal(req: Parameters<typeof userId>[0], id: string) {
  const goal = await prisma.goal.findFirst({ where: { id, userId: userId(req) } });
  if (!goal) throw notFound("Goal");
  return goal;
}

export const goalsRouter = Router();

goalsRouter.get("/", async (req, res) => {
  const goals = await prisma.goal.findMany({
    where: { userId: userId(req) },
    orderBy: { createdAt: "asc" },
  });
  res.json({ goals });
});

goalsRouter.post("/", async (req, res) => {
  const { name, description } = goalInput.parse(req.body);
  const goal = await prisma.goal.create({
    data: { userId: userId(req), name, description: description || null },
  });
  res.status(201).json({ goal });
});

goalsRouter.get("/:id", async (req, res) => {
  res.json({ goal: await ownGoal(req, req.params.id) });
});

goalsRouter.patch("/:id", async (req, res) => {
  const data = goalPatch.parse(req.body);
  await ownGoal(req, req.params.id);
  const goal = await prisma.goal.update({
    where: { id: req.params.id },
    data: { ...data, description: data.description === undefined ? undefined : data.description || null },
  });
  res.json({ goal });
});

// A goal is a label on tasks: deleting it just takes the label off them.
goalsRouter.delete("/:id", async (req, res) => {
  await ownGoal(req, req.params.id);
  await prisma.goal.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
