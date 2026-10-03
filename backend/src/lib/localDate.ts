import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      /** The user's calendar day, "YYYY-MM-DD", as reported by their device. */
      localDate: string;
    }
  }
}

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !LOCAL_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function serverLocalDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * "Today" is whatever day it is for the user, not for the server. The frontend
 * sends it in X-Local-Date; fall back to the server's date if it is missing.
 */
export function localDateMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.get("X-Local-Date");
  req.localDate = isLocalDate(header) ? header : serverLocalDate();
  next();
}
