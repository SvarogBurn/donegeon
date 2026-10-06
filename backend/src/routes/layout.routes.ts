import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";

const key = z.string().min(1).max(60);
const column = z.array(key).max(200);

/**
 * A page's arrangement of boxes: the dashboard's, and the stats boxes' on the Stats page. Tiles are named by key ("today", "goals",
 * "list:<id>", ...). Two arrangements are kept, "wide" and "phone", so
 * rearranging on a phone doesn't undo the desktop layout. (Older saves used
 * "1".."4"; the frontend converts those.) `hidden` are the tiles the user has
 * minimized away; they keep their place for when they are brought back.
 */
export const layoutSchema = z.object({
  pinned: column,
  hidden: column.optional(),
  byColumns: z.record(z.string().min(1).max(10), z.array(column).max(4)).refine((r) => Object.keys(r).length <= 8),
});

export const layoutRouter = Router();

// "/" is the dashboard's, "/stats" the stats boxes'.
for (const [path, field] of [
  ["/", "dashboardLayout"],
  ["/stats", "statsLayout"],
] as const) {
  layoutRouter.get(path, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: userId(req) } });
    const saved = layoutSchema.safeParse(user?.[field]);
    res.json({ layout: saved.success ? saved.data : null });
  });

  layoutRouter.put(path, async (req, res) => {
    const layout = layoutSchema.parse(req.body);
    await prisma.user.update({ where: { id: userId(req) }, data: { [field]: layout } });
    res.json({ layout });
  });
}
