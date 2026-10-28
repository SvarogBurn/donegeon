import { Prisma } from "@prisma/client";
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { HttpError } from "./lib/httpError.js";
import { localDateMiddleware } from "./lib/localDate.js";
import { keepSessionAlive, sessions } from "./lib/sessions.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { authRouter } from "./routes/auth.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { feedbackRouter } from "./routes/feedback.routes.js";
import { foldersRouter } from "./routes/folders.routes.js";
import { goalsRouter } from "./routes/goals.routes.js";
import { layoutRouter } from "./routes/layout.routes.js";
import { listsRouter } from "./routes/lists.routes.js";
import { notesRouter } from "./routes/notes.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { pointsRouter } from "./routes/points.routes.js";
import { storiesRouter } from "./routes/stories.routes.js";
import { tagsRouter } from "./routes/tags.routes.js";
import { tasksRouter } from "./routes/tasks.routes.js";

/**
 * The backend folder, wherever this file runs from: src/ (in development) or dist/backend/src/ (built, as the shared/
 * folder beside backend/ is compiled along).
 */
const backendRoot = () => {
  const here = import.meta.dirname;
  return path.resolve(here, here.split(path.sep).includes("dist") ? "../../.." : "..");
};

/** "GET /api/tasks 200 41ms", when the answer has gone. The host's "is it up?" checks are left out. */
function logRequests(req: Request, res: Response, next: NextFunction) {
  const start = performance.now();
  res.on("finish", () => {
    if (req.originalUrl === "/api/health") return;
    console.log(`${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${Math.round(performance.now() - start)}ms`);
  });
  next();
}

export function createApp() {
  const isProd = process.env.NODE_ENV === "production";
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("SESSION_SECRET is not set");

  const app = express();
  // Behind the host's HTTPS proxy in production; needed for secure cookies.
  if (isProd) app.set("trust proxy", 1);

  // One line per request, in production (or with LOG_REQUESTS=1): the host keeps what the process writes.
  if ((process.env.LOG_REQUESTS ?? (isProd ? "1" : "0")) === "1") app.use(logRequests);

  app.use(express.json({ limit: "100kb" }));

  app.use(sessions(sessionSecret, isProd));
  app.use(localDateMiddleware);
  app.use(keepSessionAlive);

  const api = express.Router();
  // For the host's "is it up?" check; needs no login and no database.
  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  api.use("/auth", authRouter);
  api.use("/goals", requireAuth, goalsRouter);
  api.use("/tags", requireAuth, tagsRouter);
  api.use("/lists", requireAuth, listsRouter);
  api.use("/folders", requireAuth, foldersRouter);
  api.use("/tasks", requireAuth, tasksRouter);
  api.use("/notes", requireAuth, notesRouter);
  api.use("/dashboard", requireAuth, dashboardRouter);
  api.use("/points", requireAuth, pointsRouter);
  api.use("/layout", requireAuth, layoutRouter);
  api.use("/feedback", requireAuth, feedbackRouter);
  api.use("/stories", requireAuth, storiesRouter);
  // Its own requireAuth: the hourly call that wakes the server comes with a secret, not a session.
  api.use("/notifications", notificationsRouter);
  api.use((_req, _res) => {
    throw new HttpError(404, "No such endpoint");
  });
  app.use("/api", api);

  // In production this server also hands out the built app (frontend/dist), so
  // the page and the API share one origin. Every other address is a page of
  // the app, which finds its own way from index.html.
  const frontend = process.env.FRONTEND_DIST ?? path.join(backendRoot(), "../frontend/dist");
  if (isProd && existsSync(frontend)) {
    // Built files carry a hash of their content in their name: safe to keep forever.
    app.use("/assets", express.static(path.join(frontend, "assets"), { immutable: true, maxAge: "1y" }));
    app.use("/assets", (_req, res) => {
      res.status(404).end();
    });
    app.use(express.static(frontend, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.set("Cache-Control", "no-cache").sendFile(path.join(frontend, "index.html"));
    });
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input" });
    } else if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Invalid JSON" });
    } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      // The row went between being looked up and being written (deleted meanwhile, in another tab).
      res.status(404).json({ error: "Not found: it may have just been deleted" });
    } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Two requests at once making the same unique thing (a username).
      res.status(409).json({ error: "That already exists" });
    } else {
      console.error(`${req.method} ${req.originalUrl} failed:`, err);
      res.status(500).json({ error: "Something went wrong" });
    }
  });

  return app;
}
