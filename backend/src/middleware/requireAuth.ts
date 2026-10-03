import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.userId) throw new HttpError(401, "Not logged in");
  next();
}

/** Only call behind requireAuth. */
export function userId(req: Request): string {
  return req.session.userId!;
}
