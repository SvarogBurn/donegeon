import { Prisma, type User } from "@prisma/client";
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

const ref = z.string().min(1).max(64);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A colour is #rrggbb");
/** At most `max` keys: a record has no limit of its own. */
const capped = <T extends z.ZodType>(value: T, max: number) =>
  z.record(z.string().max(40), value).refine((record) => Object.keys(record).length <= max, `At most ${max} entries`);

/**
 * The character on the user's page, saved as the app sends it; the app fills in what is missing and drops what no
 * longer exists (lib/character/profile.ts), so this only keeps it to a sane size.
 */
const profile = z
  .object({
    name: z.string().trim().max(24, "A name is at most 24 characters").optional(),
    title: z.string().trim().max(20, "A title is at most 20 characters").optional(),
    stats: z.array(z.string().max(24)).max(30),
    custom: z
      .array(
        z.object({
          id: ref,
          name: z.string().trim().min(1, "A stat needs a name").max(12, "A stat's name is at most 12 characters"),
          lists: z.array(ref).max(100),
          goals: z.array(ref).max(100),
          tags: z.array(ref).max(100),
          range: z.enum(["all", "7", "30", "90", "365"]),
          target: z.number().int().min(1).max(1_000_000).nullable().optional(),
        }),
      )
      .max(20, "At most 20 stats of your own"),
    skills: z
      .array(
        z.object({
          kind: z.enum(["list", "goal", "tag"]),
          id: ref,
          name: z.string().trim().max(20, "A skill's name is at most 20 characters").optional(),
          color: hex.optional(),
        }),
      )
      .max(30, "At most 30 skills"),
    look: z.object({ v: z.literal(2), body: z.string().max(40), options: capped(z.string().max(40), 30), colors: capped(hex, 40) }).optional(),
  })
  .nullable();

const settings = z
  .object({
    tickedTasks: z.enum(["bottom", "stay", "hide"]),
    sortByDeadline: z.boolean(),
    deadlineToday: z.enum(["never", "day", "dayBefore"]),
    tutorialSeen: z.boolean(),
    plainFont: z.boolean(),
    notesTab: z.boolean(),
    /** null = no cap. */
    pointsCap: z.number().int().min(1, "A cap is at least 1 point").max(MAX_POINTS).nullable(),
    /** null = no reminder. */
    breakEvery: z.number().int().min(1, "A reminder comes after at least 1 task").max(1000).nullable(),
    /** null = back to the defaults. */
    profile,
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
