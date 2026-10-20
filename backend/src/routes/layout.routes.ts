import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { layoutSchema } from "../schemas/layout.js";

export const layoutRouter = Router();

// "/" is the dashboard's, "/stats" the stats boxes', "/calendar" the Calendar page's, "/notes" the Notes page's, "/user" the user page's.
for (const [path, field] of [
  ["/", "dashboardLayout"],
  ["/stats", "statsLayout"],
  ["/calendar", "calendarLayout"],
  ["/notes", "notesLayout"],
  ["/user", "userLayout"],
] as const) {
  layoutRouter.get(path, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: userId(req) }, select: { [field]: true } });
    const saved = layoutSchema.safeParse(user?.[field]);
    res.json({ layout: saved.success ? saved.data : null });
  });

  layoutRouter.put(path, async (req, res) => {
    const layout = layoutSchema.parse(req.body);
    await prisma.user.update({ where: { id: userId(req) }, data: { [field]: layout } });
    res.json({ layout });
  });
}
