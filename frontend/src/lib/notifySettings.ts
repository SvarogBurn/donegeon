import { MAX_REMINDER_TIMES, MAX_REMINDERS, NOTIFY_FROM, NOTIFY_TO } from "../../../shared/constants";
import { BELL_SHOWS, REMINDER_KINDS, type BellShows, type ReminderKind } from "../../../shared/enums";

export { NOTIFY_FROM, NOTIFY_TO, MAX_REMINDERS, MAX_REMINDER_TIMES };
export type { BellShows, ReminderKind };

/**
 * One of the user's reminders: what it says, on which days, at what times. A reminder on a task (`taskId`, made from
 * its ⋯ menu) says the task (or its own text) and has Done and Snooze; one on a note opens it.
 */
export interface Reminder {
  id: string;
  on: boolean;
  kind: ReminderKind;
  /** Every day, the days a task on a schedule is due, or weekdays (0 = Monday). */
  days: "all" | "due" | number[];
  /** "HH:MM", between NOTIFY_FROM and NOTIFY_TO, sorted. */
  times: string[];
  /** Made as "N times a day from A to B": `times` are worked out from it, and it is kept to be shown again. */
  spread?: { count: number; from: string; to: string };
  /** Own text; on a task, what it says instead of the task's title. */
  text?: string;
  /** "deadlines": the hard deadlines in the next so many days. */
  ahead?: number;
  taskId?: string;
  noteId?: string;
  /** The note's title when it was linked, to say which note. */
  linkTitle?: string;
}

/** Which notifications the account gets, and when (`User.notifications`). Push is turned on per device, apart from this. */
export interface NotifySettings {
  /** Before a hard deadline: the day before, some days before, some weeks before, any of them; at `time`. */
  deadline: { on: boolean; dayBefore: boolean; days: { on: boolean; amount: number }; weeks: { on: boolean; amount: number }; time: string };
  /** A hard deadline gone by with work left, the morning after, at the deadline notices' time. */
  passed: { on: boolean };
  /**
   * Tasks left undone in Today or Week the day before: always in the bell; pushed too (`push`) at `time`, if the
   * user chose so.
   */
  undone: { push: boolean; time: string };
  /** How long Snooze puts a notification off. */
  snoozeMinutes: number;
  /** The bell: everything, today's reminders and deadline notices too once their time has come; or only what needs an answer (left undone, deadlines passed). */
  bell: BellShows;
  /** A new article in the News (news/features) comes into the bell, whatever `bell` says, until it is read or dismissed. */
  news: { on: boolean };
  reminders: Reminder[];
}

export const DAYS_BEFORE = { min: 2, max: 13 };
export const WEEKS_BEFORE = { min: 1, max: 8 };
export const SNOOZE = { min: 5, max: 120 };
export const AHEAD = { min: 1, max: 60, first: 7 };

export const KIND_NAMES: Record<ReminderKind, string> = {
  today: "Today's tasks",
  open: "Still open today",
  tomorrow: "Tomorrow's tasks",
  nextWeek: "Next week's plan",
  recap: "The week so far",
  deadlines: "Upcoming deadlines",
  text: "Own text",
};

export const KIND_NOTES: Record<ReminderKind, string> = {
  today: "What is in Today and planned in the Week for the day. Nothing comes on a day with nothing to do.",
  open: "What is still open in Today. Nothing comes when it is all done.",
  tomorrow: "What Today and the Week hold for the next day.",
  nextWeek: "The week after this one, day by day, as the Week box will show it.",
  recap: "The tasks done since Monday, and the points they earned.",
  deadlines: "The hard deadlines coming in the next days, soonest first.",
  text: "Your own words.",
};

/** The recap's note while the points system is off: it tells no points. */
export const RECAP_NOTE_NO_POINTS = "The tasks done since Monday.";

export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A new reminder's id: made on the device, unique enough among one account's few. */
export const newReminderId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const reminder = (id: string, kind: ReminderKind, days: Reminder["days"], time: string): Reminder => ({ id, on: true, kind, days, times: [time] });

export const NOTIFY_DEFAULTS: NotifySettings = {
  deadline: { on: true, dayBefore: true, days: { on: true, amount: 3 }, weeks: { on: false, amount: 2 }, time: "08:00" },
  passed: { on: true },
  undone: { push: false, time: "08:00" },
  snoozeMinutes: 15,
  bell: "all",
  news: { on: true },
  reminders: [
    reminder("morning", "today", "all", "08:00"),
    reminder("evening", "open", "all", "20:00"),
    reminder("saturday", "nextWeek", [5], "10:00"),
    reminder("recap", "recap", [6], "19:00"),
  ],
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const whole = (value: unknown, min: number, max: number) => (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null);
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A time a notification can come at: "HH:MM" within the hours the server is awake. */
export const isNotifyTime = (value: unknown): value is string => typeof value === "string" && TIME.test(value) && value >= NOTIFY_FROM && value <= NOTIFY_TO;
const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

function amountOf(saved: unknown, fallback: { on: boolean; amount: number }, bounds: { min: number; max: number }) {
  const s = isRecord(saved) ? saved : {};
  return { on: flag(s.on, fallback.on), amount: whole(s.amount, bounds.min, bounds.max) ?? fallback.amount };
}

/** A saved reminder as it can be used, or null when it can't (no time left in the hours, a kind no longer known). */
function normalizeReminder(saved: unknown): Reminder | null {
  if (!isRecord(saved) || typeof saved.id !== "string" || !(REMINDER_KINDS as readonly unknown[]).includes(saved.kind)) return null;
  const times = [...new Set(Array.isArray(saved.times) ? saved.times.filter(isNotifyTime) : [])].sort().slice(0, MAX_REMINDER_TIMES);
  if (!times.length) return null;
  const weekdays = Array.isArray(saved.days) ? [...new Set(saved.days.filter((day): day is number => whole(day, 0, 6) !== null))].sort() : [];
  const days = saved.days === "due" || saved.days === "all" ? saved.days : weekdays.length ? weekdays : "all";
  const s = isRecord(saved.spread) ? saved.spread : null;
  const spread = s && whole(s.count, 1, MAX_REMINDER_TIMES) && isNotifyTime(s.from) && isNotifyTime(s.to) ? { count: s.count as number, from: s.from, to: s.to } : undefined;
  return {
    id: saved.id,
    on: flag(saved.on, true),
    kind: saved.kind as ReminderKind,
    days,
    times,
    ...(spread && { spread }),
    ...(text(saved.text, 200) && { text: text(saved.text, 200) }),
    ...(saved.kind === "deadlines" && { ahead: whole(saved.ahead, AHEAD.min, AHEAD.max) ?? AHEAD.first }),
    ...(typeof saved.taskId === "string" && { taskId: saved.taskId }),
    ...(typeof saved.noteId === "string" && { noteId: saved.noteId }),
    ...(text(saved.linkTitle, 200) && { linkTitle: text(saved.linkTitle, 200) }),
  };
}

/** The saved settings with what is missing or broken filled in from the defaults. */
export function normalizeNotifications(saved: unknown): NotifySettings {
  const s = isRecord(saved) ? saved : {};
  const deadline = isRecord(s.deadline) ? s.deadline : {};
  const undone = isRecord(s.undone) ? s.undone : {};
  const d = NOTIFY_DEFAULTS;
  return {
    deadline: {
      on: flag(deadline.on, d.deadline.on),
      dayBefore: flag(deadline.dayBefore, d.deadline.dayBefore),
      days: amountOf(deadline.days, d.deadline.days, DAYS_BEFORE),
      weeks: amountOf(deadline.weeks, d.deadline.weeks, WEEKS_BEFORE),
      time: isNotifyTime(deadline.time) ? deadline.time : d.deadline.time,
    },
    passed: { on: flag(isRecord(s.passed) ? s.passed.on : undefined, d.passed.on) },
    undone: { push: flag(undone.push, d.undone.push), time: isNotifyTime(undone.time) ? undone.time : d.undone.time },
    snoozeMinutes: whole(s.snoozeMinutes, SNOOZE.min, SNOOZE.max) ?? d.snoozeMinutes,
    bell: (BELL_SHOWS as readonly unknown[]).includes(s.bell) ? (s.bell as BellShows) : d.bell,
    news: { on: flag(isRecord(s.news) ? s.news.on : undefined, d.news.on) },
    // Never saved: the reminders a new account starts with. Saved, even empty: the user's.
    reminders: Array.isArray(s.reminders) ? s.reminders.map(normalizeReminder).filter((r): r is Reminder => r !== null).slice(0, MAX_REMINDERS) : d.reminders,
  };
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const timeOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** `count` times from `from` to `to`, both ends included, evenly spaced and rounded to 5 minutes: 3 from 09:00 to 21:00 → 09:00, 15:00, 21:00. */
export function spreadTimes(count: number, from: string, to: string): string[] {
  const [start, end] = [minutesOf(from), minutesOf(to)].sort((a, b) => a - b);
  if (count <= 1) return [timeOf(start)];
  const step = (end - start) / (count - 1);
  return [...new Set(Array.from({ length: count }, (_, i) => timeOf(Math.round((start + i * step) / 5) * 5)))];
}

/** "Every day · 08:00", "Mon, Thu · 18:30, 21:00", "On days it's due · 3 times from 09:00 to 21:00". */
export function reminderSummary(reminder: Pick<Reminder, "days" | "times" | "spread">): string {
  const days = reminder.days === "all" ? "Every day" : reminder.days === "due" ? "On days it's due" : reminder.days.length === 7 ? "Every day" : reminder.days.map((day) => WEEKDAY_NAMES[day]).join(", ");
  const times = reminder.spread ? `${reminder.spread.count} times from ${reminder.spread.from} to ${reminder.spread.to}` : reminder.times.join(", ");
  return `${days} · ${times}`;
}
