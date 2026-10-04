import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";

const key = z.string().min(1).max(60);
const column = z.array(key).max(200);

/**
 * The dashboard's arrangement. Tiles are named by key ("today", "goals",
 * "list:<id>", ...). Two arrangements are kept, "wide" and "phone", so
 * rearranging on a phone doesn't undo the desktop layout. (Older saves used
 * "1".."4"; the frontend converts those.)
 */
const layoutSchema = z.object({
  pinned: column,
  byColumns: z.record(z.string().min(1).max(10), z.array(column).max(4)).refine((r) => Object.keys(r).length <= 8),
});

export const layoutRouter = Router();

layoutRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: userId(req) }, select: { dashboardLayout: true } });
  const saved = layoutSchema.safeParse(user?.dashboardLayout);
  res.json({ layout: saved.success ? saved.data : null });
});

layoutRouter.put("/", async (req, res) => {
  const layout = layoutSchema.parse(req.body);
  await prisma.user.update({ where: { id: userId(req) }, data: { dashboardLayout: layout } });
  res.json({ layout });
});
