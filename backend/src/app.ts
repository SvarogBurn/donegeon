import connectPgSimple from "connect-pg-simple";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import { existsSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { HttpError } from "./lib/httpError.js";
import { localDateMiddleware } from "./lib/localDate.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { authRouter } from "./routes/auth.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { feedbackRouter } from "./routes/feedback.routes.js";
import { foldersRouter } from "./routes/folders.routes.js";
import { goalsRouter } from "./routes/goals.routes.js";
import { layoutRouter } from "./routes/layout.routes.js";
import { listsRouter } from "./routes/lists.routes.js";
import { pointsRouter } from "./routes/points.routes.js";
import { tagsRouter } from "./routes/tags.routes.js";
import { tasksRouter } from "./routes/tasks.routes.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function createApp() {
  const isProd = process.env.NODE_ENV === "production";
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("SESSION_SECRET is not set");

  const app = express();
  // Behind the host's HTTPS proxy in production; needed for secure cookies.
  if (isProd) app.set("trust proxy", 1);

  app.use(express.json({ limit: "100kb" }));

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      name: "donegeon.sid",
      store: new PgStore({ conString: process.env.DATABASE_URL, tableName: "session" }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: THIRTY_DAYS_MS },
    }),
  );
  app.use(localDateMiddleware);

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
  api.use("/dashboard", requireAuth, dashboardRouter);
  api.use("/points", requireAuth, pointsRouter);
  api.use("/layout", requireAuth, layoutRouter);
  api.use("/feedback", requireAuth, feedbackRouter);
  api.use((_req, _res) => {
    throw new HttpError(404, "No such endpoint");
  });
  app.use("/api", api);

  // In production this server also hands out the built app (frontend/dist), so
  // the page and the API share one origin. Every other address is a page of
  // the app, which finds its own way from index.html.
  const frontend = path.resolve(import.meta.dirname, "../../frontend/dist");
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

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input" });
    } else if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Invalid JSON" });
    } else {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  });

  return app;
}
