import connectPgSimple from "connect-pg-simple";
import type { NextFunction, Request, Response } from "express";
import session from "express-session";
import pg from "pg";

declare module "express-session" {
  interface SessionData {
    /** The user's day the session was last written on (see keepSessionAlive). */
    seenOn: string;
  }
}

export const SESSION_COOKIE = "donegeon.sid";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let pool: pg.Pool | null = null;

/**
 * The sessions in Postgres, on a small pool of their own. Its connections are kept for minutes: by default they go
 * after 10 seconds, and the first click after any pause then waited for a new connection to the database. The
 * store's touch is off: it wrote the session's expiry before every answer, and the requests of one page load all
 * waited in turn on that one row. keepSessionAlive writes it once a day instead.
 */
export function sessions(secret: string, secure: boolean) {
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 5 * 60_000 });
  const PgStore = connectPgSimple(session);
  return session({
    name: SESSION_COOKIE,
    store: new PgStore({ pool, tableName: "session", disableTouch: true }),
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: "lax", secure, maxAge: THIRTY_DAYS_MS },
  });
}

/**
 * A logged-in session is written again on the first request of each of the user's days, which moves its expiry 30
 * days on: a login in use doesn't run out, and the other requests write nothing. Goes after localDateMiddleware.
 */
export function keepSessionAlive(req: Request, _res: Response, next: NextFunction) {
  if (req.session.userId && req.session.seenOn !== req.localDate) req.session.seenOn = req.localDate;
  next();
}

/** Closes the sessions' pool, when the server stops. */
export async function closeSessions() {
  await pool?.end();
  pool = null;
}
