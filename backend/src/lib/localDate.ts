import type { NextFunction, Request, Response } from "express";
import { isLocalDate } from "../../../shared/dates.js";

declare global {
  namespace Express {
    interface Request {
      /** The user's calendar day, "YYYY-MM-DD", as reported by their device. */
      localDate: string;
      /** When the user made the change, as their device saw it: later than now for a change made offline and sent on reconnect. */
      clientTime: Date;
    }
  }
}

export function serverLocalDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** How far back a change made offline may say it was made. */
const CLIENT_TIME_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * The moment sent in X-Client-Time: when a change made offline was really made. Kept between a week ago and now,
 * so a wrong device clock can't put it in the future or long ago; `now` when it is missing or not a time.
 */
export function clientTimeFrom(header: string | undefined, now = new Date()): Date {
  const sent = header ? new Date(header) : null;
  if (!sent || Number.isNaN(sent.getTime())) return now;
  return new Date(Math.min(now.getTime(), Math.max(now.getTime() - CLIENT_TIME_MAX_AGE_MS, sent.getTime())));
}

/**
 * "Today" is whatever day it is for the user, not for the server. The frontend
 * sends it in X-Local-Date; fall back to the server's date if it is missing.
 */
export function localDateMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.get("X-Local-Date");
  req.localDate = isLocalDate(header) ? header : serverLocalDate();
  req.clientTime = clientTimeFrom(req.get("X-Client-Time"));
  next();
}
