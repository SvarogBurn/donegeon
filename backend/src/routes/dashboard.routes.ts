import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { combinedCountdown, todayPressure } from "../services/countdown.service.js";
import { withFinishedRoots } from "../services/taskTree.service.js";

export const dashboardRouter = Router();

// Combined "how much today" across every hard deadline. Soft deadlines and
// list membership play no part.
dashboardRouter.get("/", async (req, res) => {
  const { tasks, finished } = withFinishedRoots(
    await prisma.task.findMany({ where: { userId: userId(req), deletedAt: null } }),
  );
  res.json({ pressure: todayPressure(tasks, req.localDate, finished) });
});

// One table for every deadline, hard and soft, added up day by day.
dashboardRouter.get("/countdown", async (req, res) => {
  const { tasks } = withFinishedRoots(await prisma.task.findMany({ where: { userId: userId(req), deletedAt: null } }));
  res.json({ countdown: combinedCountdown(tasks, req.localDate) });
});
