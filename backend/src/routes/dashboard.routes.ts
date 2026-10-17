import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { combinedCountdown, todayPressure } from "../services/countdown.service.js";
import { wholeTreeIds, withFinishedRoots } from "../services/taskTree.service.js";

export const dashboardRouter = Router();

/**
 * The trees that hold a deadline, whole: the deadline maths reads nothing else (a deadline's own subtree,
 * its parent, and whether its main task is finished), so the user's other tasks aren't read.
 */
async function deadlineTrees(owner: string) {
  const ids = await wholeTreeIds(prisma, owner, { deadlineDate: { not: null } });
  return withFinishedRoots(ids.length > 0 ? await prisma.task.findMany({ where: { id: { in: ids } } }) : []);
}

// Combined "how much today" across every hard deadline. Soft deadlines and
// list membership play no part.
dashboardRouter.get("/", async (req, res) => {
  const { tasks, finished } = await deadlineTrees(userId(req));
  res.json({ pressure: todayPressure(tasks, req.localDate, finished) });
});

// One table for every deadline, hard and soft, added up day by day.
dashboardRouter.get("/countdown", async (req, res) => {
  const { tasks } = await deadlineTrees(userId(req));
  res.json({ countdown: combinedCountdown(tasks, req.localDate) });
});
