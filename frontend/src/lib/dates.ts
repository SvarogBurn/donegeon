const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-07" -> "07/10" (or "Wed 07/10"). Day first, no year. */
export function formatDay(day: string, withWeekday = false) {
  const [, month, date] = day.split("-");
  const short = `${date}/${month}`;
  if (!withWeekday) return short;
  const weekday = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${short}`;
}

/** "2026-10-07" -> "07/10/26", as in the countdown table. */
export function formatShortDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year.slice(2)}`;
}

/** "2026-10-07" -> "07/10/2026", for the editable deadline field. */
export function formatFullDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

/**
 * Reads a typed date, day first: "7/10/2026", "07.10.26", "7-10". Without a
 * year it means this year. Returns "YYYY-MM-DD", or null if it isn't a real date.
 */
export function parseDay(text: string, thisYear = new Date().getFullYear()): string | null {
  const match = text.trim().match(/^(\d{1,2})[./\- ](\d{1,2})(?:[./\- ](\d{2}|\d{4}))?\.?$/);
  if (!match) return null;
  const date = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] === undefined ? thisYear : match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, date));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null;
  return `${year}-${pad(month)}-${pad(date)}`;
}

/** 1.25 -> "1.3", 2 -> "2". */
export function formatPace(perDay: number) {
  return String(Math.round(perDay * 10) / 10);
}
