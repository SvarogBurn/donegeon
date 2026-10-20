/**
 * Calendar days, "YYYY-MM-DD", always the user's own (the app sends its today; the server never decides the day).
 * The arithmetic is done in UTC on those strings, so no timezone or daylight-saving shift can move a day.
 * Shared by the server and the app: both count days the same way.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** A real day written as "YYYY-MM-DD": "2026-02-30" is not one. */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !LOCAL_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** "2026-10-07", -1 -> "2026-10-06". */
export function addDays(day: string, days: number): string {
  return new Date(toMs(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier): "2026-10-07", "2026-10-09" -> 2. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** The Monday of the week `day` is in (weeks run Monday to Sunday): "2026-10-17" -> "2026-10-12". */
export function mondayOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
