import { Router } from "express";
import { z } from "zod";
import { alreadyMade } from "../lib/clientId.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { id, name } from "../schemas/common.js";
import { ownGoal } from "../services/ownership.js";

const goalInput = z.object({
  name: name(200),
  description: z.string().trim().max(2000).nullish(),
});

const goalPatch = goalInput.partial().extend({ isArchived: z.boolean().optional() });

export const goalsRouter = Router();

goalsRouter.get("/", async (req, res) => {
  const goals = await prisma.goal.findMany({
    where: { userId: userId(req) },
    orderBy: { createdAt: "asc" },
  });
  res.json({ goals });
});

goalsRouter.post("/", async (req, res) => {
  // `id`: made on the device for a goal typed offline; see lib/clientId.
  const input = goalInput.extend({ id: id.optional() }).parse(req.body);
  const owner = userId(req);
  const made = input.id && alreadyMade(await prisma.goal.findUnique({ where: { id: input.id } }), owner);
  if (made) return void res.json({ goal: made });
  const goal = await prisma.goal.create({
    data: { id: input.id, userId: owner, name: input.name, description: input.description || null, createdAt: req.clientTime },
  });
  res.status(201).json({ goal });
});

goalsRouter.get("/:id", async (req, res) => {
  res.json({ goal: await ownGoal(userId(req), req.params.id) });
});

goalsRouter.patch("/:id", async (req, res) => {
  const data = goalPatch.parse(req.body);
  const { id: goalId } = await ownGoal(userId(req), req.params.id);
  const goal = await prisma.goal.update({
    where: { id: goalId },
    data: { ...data, description: data.description === undefined ? undefined : data.description || null },
  });
  res.json({ goal });
});

// A goal is a label on tasks: deleting it just takes the label off them.
goalsRouter.delete("/:id", async (req, res) => {
  const goal = await ownGoal(userId(req), req.params.id);
  await prisma.goal.delete({ where: { id: goal.id } });
  res.status(204).end();
});
