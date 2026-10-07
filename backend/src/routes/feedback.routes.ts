import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";

const feedback = z.object({
  kind: z.enum(["bug", "feature"]),
  subject: z.string().trim().max(120, "Subject must be at most 120 characters"),
  message: z.string().trim().min(1, "Write a message first").max(4000, "Message must be at most 4000 characters"),
});

export const feedbackRouter = Router();

// The suggestion box on the user's page: kept, never shown back.
feedbackRouter.post("/", async (req, res) => {
  await prisma.feedback.create({ data: { ...feedback.parse(req.body), userId: userId(req) } });
  res.status(204).end();
});
