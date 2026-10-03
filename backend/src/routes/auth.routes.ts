import bcrypt from "bcryptjs";
import { Router, type Request } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";

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
  res.status(201).json({ user: { id: user.id, username: user.username } });
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
  res.json({ user: { id: user.id, username: user.username } });
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
  res.json({ user: { id: user.id, username: user.username } });
});
