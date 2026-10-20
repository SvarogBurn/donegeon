import { Prisma, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router, type Request } from "express";
import { z } from "zod";
import { isDev } from "../lib/devs.js";
import { HttpError } from "../lib/httpError.js";
import { LoginLimit } from "../lib/loginLimit.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, userId } from "../middleware/requireAuth.js";
import { credentials, settings } from "../schemas/account.js";

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
  sortByDeadline: user.sortByDeadline,
  deadlineToday: user.deadlineToday,
  tutorialSeen: user.tutorialSeen,
  pointsCap: user.pointsCap,
  breakEvery: user.breakEvery,
  plainFont: user.plainFont,
  notesTab: user.notesTab,
  profile: user.profile,
  isDev: isDev(user.username),
});

export const authRouter = Router();

/** Wrong passwords, counted per username and address (see LoginLimit). */
const loginLimit = new LoginLimit();

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
  const tries = `${parsed.success ? parsed.data.username : ""}|${req.ip}`;
  const wait = loginLimit.waitFor(tries);
  if (wait > 0) throw new HttpError(429, `Too many wrong passwords. Try again in ${wait} minute${wait === 1 ? "" : "s"}`);
  const user = parsed.success
    ? await prisma.user.findUnique({ where: { username: parsed.data.username } })
    : null;
  if (!parsed.success || !user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    loginLimit.failed(tries);
    throw new HttpError(401, "Wrong username or password");
  }
  loginLimit.succeeded(tries);
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
  const { profile, ...rest } = settings.parse(req.body);
  const data = { ...rest, ...(profile !== undefined && { profile: profile ?? Prisma.DbNull }) };
  res.json({ user: publicUser(await prisma.user.update({ where: { id: userId(req) }, data })) });
});

// Deletes the account and everything in it, for good. `confirm` is what the user typed to say they mean it.
authRouter.delete("/me", requireAuth, async (req, res, next) => {
  const { confirm } = z.object({ confirm: z.string() }).parse(req.body);
  const id = userId(req);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(401, "Not logged in");
  if (confirm.trim().toLowerCase() !== `donegeon/${user.username}`) {
    throw new HttpError(400, `Type donegeon/${user.username} to delete your account`);
  }
  await prisma.$transaction([
    // Everything the account owns goes with it (onDelete: Cascade).
    prisma.user.delete({ where: { id } }),
    // Its sessions on other devices too, so none is left logged in to an account that is gone.
    prisma.$executeRaw`DELETE FROM "session" WHERE sess->>'userId' = ${id}`,
  ]);
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("donegeon.sid");
    res.status(204).end();
  });
});
