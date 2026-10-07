import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router, type Request } from "express";
import { z } from "zod";
import { isDev } from "../lib/devs.js";
import { HttpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userId } from "../middleware/requireAuth.js";
import { MAX_POINTS } from "../services/points.service.js";

const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-z0-9_.-]+$/, "Username may only contain letters, numbers, _ . and -"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

// Rotate the session id on login so a pre-login cookie can't be reused.
function startSession(req: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

/** What the app is told about the account: never the password hash. */
const publicUser = (user: User) => ({
  id: user.id,
  username: user.username,
  tickedTasks: user.tickedTasks,
  tutorialSeen: user.tutorialSeen,
  pointsCap: user.pointsCap,
  breakEvery: user.breakEvery,
  isDev: isDev(user.username),
});

const settings = z
  .object({
    tickedTasks: z.enum(["bottom", "stay", "hide"]),
    tutorialSeen: z.boolean(),
    /** null = no cap. */
    pointsCap: z.number().int().min(1, "A cap is at least 1 point").max(MAX_POINTS).nullable(),
    /** null = no reminder. */
    breakEvery: z.number().int().min(1, "A reminder comes after at least 1 task").max(1000).nullable(),
  })
  .partial();

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const { username, password } = credentials.parse(req.body);
  if (await prisma.user.findUnique({ where: { username } })) {
    throw new HttpError(409, "That username is taken");
  }
  // Every account starts with one list, so there is somewhere to put the first task.
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      lists: { create: { name: "List" } },
    },
  });
  await startSession(req, user.id);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  const user = parsed.success
    ? await prisma.user.findUnique({ where: { username: parsed.data.username } })
    : null;
  if (!parsed.success || !user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    throw new HttpError(401, "Wrong username or password");
  }
  await startSession(req, user.id);
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("donegeon.sid");
    res.status(204).end();
  });
});

authRouter.get("/me", async (req, res) => {
  const id = req.session.userId;
  const user = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!user) throw new HttpError(401, "Not logged in");
  res.json({ user: publicUser(user) });
});

// The account's own settings, from the user's page.
authRouter.patch("/me", requireAuth, async (req, res) => {
  const data = settings.parse(req.body);
  res.json({ user: publicUser(await prisma.user.update({ where: { id: userId(req) }, data })) });
});
