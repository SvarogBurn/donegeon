import { Router } from "express";
import { z } from "zod";
import { isDev } from "../lib/devs.js";
import { HttpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";

const feedback = z.object({
  kind: z.enum(["bug", "feature"]),
  subject: z.string().trim().max(120, "Subject must be at most 120 characters"),
  message: z.string().trim().min(1, "Write a message first").max(4000, "Message must be at most 4000 characters"),
});

export const feedbackRouter = Router();

// The suggestion box on the user's page: kept, and shown only to the developers.
feedbackRouter.post("/", async (req, res) => {
  await prisma.feedback.create({ data: { ...feedback.parse(req.body), userId: userId(req) } });
  res.status(204).end();
});

// The inbox on a developer's page: every letter with who sent it, newest first.
feedbackRouter.get("/", async (req, res) => {
  const reader = await prisma.user.findUnique({ where: { id: userId(req) }, select: { username: true } });
  if (!reader || !isDev(reader.username)) throw new HttpError(403, "Only the developers can read the mail");
  const letters = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, subject: true, message: true, createdAt: true, user: { select: { username: true } } },
  });
  res.json(letters.map(({ user, ...letter }) => ({ ...letter, username: user.username })));
});
