import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { balanceOf } from "../services/points.service.js";

const HISTORY_ROWS = 300;

export const pointsRouter = Router();

// The balance (everything ever earned, spent and reversed, added up) and the newest ledger rows.
pointsRouter.get("/", async (req, res) => {
  const owner = userId(req);
  const [balance, transactions] = await Promise.all([
    balanceOf(prisma, owner),
    prisma.pointTransaction.findMany({
      where: { userId: owner },
      orderBy: { createdAt: "desc" },
      take: HISTORY_ROWS,
      select: { id: true, type: true, amount: true, title: true, createdAt: true },
    }),
  ]);
  res.json({ balance, transactions });
});
