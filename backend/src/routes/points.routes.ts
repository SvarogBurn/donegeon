import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { balanceOf, MAX_POINTS } from "../services/points.service.js";

const HISTORY_ROWS = 300;

export const pointsRouter = Router();

// The balance (everything ever earned, spent and reversed, added up), the newest ledger rows,
// and what a task written straight into Today is worth.
pointsRouter.get("/", async (req, res) => {
  const owner = userId(req);
  const [balance, transactions, { todayPoints }] = await Promise.all([
    balanceOf(prisma, owner),
    prisma.pointTransaction.findMany({
      where: { userId: owner },
      orderBy: { createdAt: "desc" },
      take: HISTORY_ROWS,
      select: { id: true, type: true, amount: true, title: true, createdAt: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: owner }, select: { todayPoints: true } }),
  ]);
  res.json({ balance, transactions, todayPoints });
});

const todayInput = z.object({ points: z.number().int().min(0, "Points can't be negative").max(MAX_POINTS) });

// What a Today-only task without its own amount earns from now on; points already booked stay as they are.
pointsRouter.put("/today", async (req, res) => {
  const { points } = todayInput.parse(req.body);
  await prisma.user.update({ where: { id: userId(req) }, data: { todayPoints: points } });
  res.json({ todayPoints: points });
});
