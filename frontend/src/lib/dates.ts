import { addInterval } from "./repeat";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-07" -> "07/10" (or "Wed 07/10"). Day first, no year. */
export function formatDay(day: string, withWeekday = false) {
  const [, month, date] = day.split("-");
  const short = `${date}/${month}`;
  if (!withWeekday) return short;
  const weekday = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${short}`;
}

/** "2026-10-07", -1 -> "2026-10-06". */
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`: "2026-10-07", "2026-10-09" -> 2. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
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

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY = "(sun|mon|tue|wed|thu|fri|sat)[a-z]*";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH = `((?:${MONTHS.map((name) => name.slice(0, 3)).join("|")})[a-z]*)`;
/** The typed words end where the text does, or at a space. */
const END = "(?=\\s|$)";
const UNIT = { d: "day", w: "week", m: "month" } as const;

/** "wed" or "Wednesday" -> 3; -1 for anything else that starts like a weekday ("sunny"). */
const weekdayOf = (word: string) => WEEKDAYS.findIndex((name) => name.startsWith(word.toLowerCase()));
/** "dec" or "December" -> 12; 0 for anything else that starts like a month ("janitor"). */
const monthOf = (word: string) => MONTHS.findIndex((name) => name.startsWith(word.toLowerCase())) + 1;
const weekdayOn = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** A day and month without a year: this year's, or next year's once that day has passed. */
function comingDay(date: number, month: number, today: string) {
  const year = Number(today.slice(0, 4));
  if (!month) return null;
  const day = parseDay(`${date}/${month}/${year}`);
  return day && day < today ? parseDay(`${date}/${month}/${year + 1}`) : day;
}

/**
 * Reads a day written in words at the start of `text`: "today", "tomorrow", "fri" (the next one, never today),
 * "next week", "in 3 days", "2w", "25/12", "25/12/26", "25 dec". Returns the day and how many characters said it,
 * or null when the text doesn't start with a day.
 */
export function parseDayWords(text: string, today: string): { day: string; length: number } | null {
  const read = (pattern: string) => text.match(new RegExp(`^${pattern}${END}`, "i"));
  let m: RegExpMatchArray | null;
  const found = (day: string | null) => (day ? { day, length: m![0].length } : null);

  if ((m = read("today"))) return found(today);
  if ((m = read("(tomorrow|tmrw?)"))) return found(addDays(today, 1));
  if ((m = read("next (week|month)"))) return found(addInterval(today, 1, m[1].toLowerCase() as "week" | "month"));
  if ((m = read("in (\\d{1,3}) ?(d|w|m)[a-z]*")) || (m = read("(\\d{1,3})(d|w|m)"))) {
    const unit = UNIT[m[2].toLowerCase() as keyof typeof UNIT];
    // "in 3 dogs" is not a day.
    return /^(d|w|m|days?|weeks?|months?)$/i.test(m[0].replace(/^in |\d+ ?/gi, "")) ? found(addInterval(today, Number(m[1]), unit)) : null;
  }
  if ((m = read(WEEKDAY))) {
    const weekday = weekdayOf(m[0]);
    return weekday < 0 ? null : found(addDays(today, ((weekday - weekdayOn(today) + 6) % 7) + 1));
  }
  if ((m = read("\\d{1,2}[./-]\\d{1,2}[./-](\\d{4}|\\d{2})"))) return found(parseDay(m[0]));
  if ((m = read("(\\d{1,2})[./-](\\d{1,2})"))) return found(comingDay(Number(m[1]), Number(m[2]), today));
  if ((m = read(`(\\d{1,2}) ${MONTH}`))) return found(comingDay(Number(m[1]), monthOf(m[2]), today));
  if ((m = read(`${MONTH} (\\d{1,2})`))) return found(comingDay(Number(m[2]), monthOf(m[1]), today));
  return null;
}

/** A schedule as typed: due every so many units, first on `nextDue`. */
export interface TypedRepeat {
  every: number;
  unit: "day" | "week" | "month";
  nextDue: string;
  length: number;
}

/**
 * Reads a schedule written in words at the start of `text`: "daily", "weekly", "monthly", "every week",
 * "every 2 weeks", "every fri" (weekly, from the coming Friday; today if it is one).
 */
export function parseRepeatWords(text: string, today: string): TypedRepeat | null {
  const read = (pattern: string) => text.match(new RegExp(`^${pattern}${END}`, "i"));
  let m: RegExpMatchArray | null;
  if ((m = read("(dai|week|month)ly"))) {
    return { every: 1, unit: ({ dai: "day", week: "week", month: "month" } as const)[m[1].toLowerCase() as "dai"], nextDue: today, length: m[0].length };
  }
  if ((m = read("every (?:(\\d{1,3}) )?(day|week|month)s?"))) {
    const every = Number(m[1] ?? 1);
    return every < 1 ? null : { every, unit: m[2].toLowerCase() as TypedRepeat["unit"], nextDue: today, length: m[0].length };
  }
  if ((m = read(`every ${WEEKDAY}`))) {
    const weekday = weekdayOf(m[0].slice(6));
    return weekday < 0 ? null : { every: 1, unit: "week", nextDue: addDays(today, (weekday - weekdayOn(today) + 7) % 7), length: m[0].length };
  }
  return null;
}
