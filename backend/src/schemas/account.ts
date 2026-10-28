import { z } from "zod";
import { MAX_POINTS, MAX_REMINDER_TIMES, MAX_REMINDERS, NOTIFY_FROM, NOTIFY_TO } from "../../../shared/constants.js";
import { DEADLINE_TODAY, REMINDER_KINDS, TEXT_FONTS, TICKED_TASKS } from "../../../shared/enums.js";
import { hex } from "./common.js";

export const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-z0-9_.-]+$/, "Username may only contain letters, numbers, _ . and -"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

const ref = z.string().min(1).max(64);
/** At most `max` keys: a record has no limit of its own. */
const capped = <T extends z.ZodType>(value: T, max: number) =>
  z.record(z.string().max(40), value).refine((record) => Object.keys(record).length <= max, `At most ${max} entries`);

/**
 * The character on the user's page, saved as the app sends it; the app fills in what is missing and drops what no
 * longer exists (lib/character/profile.ts), so this only keeps it to a sane size.
 */
const profile = z
  .object({
    /** The id of a title the character earned (frontend/src/lib/character/titles.ts). */
    title: z.string().max(80).optional(),
    stats: z.array(z.string().max(24)).max(30),
    custom: z
      .array(
        z.object({
          id: ref,
          name: z.string().trim().min(1, "A stat needs a name").max(12, "A stat's name is at most 12 characters"),
          lists: z.array(ref).max(100),
          goals: z.array(ref).max(100),
          tags: z.array(ref).max(100),
          range: z.enum(["all", "7", "30", "90", "365"]),
          target: z.number().int().min(1).max(1_000_000).nullable().optional(),
        }),
      )
      .max(20, "At most 20 stats of your own"),
    skills: z
      .array(
        z.object({
          kind: z.enum(["list", "goal", "tag"]),
          id: ref,
          name: z.string().trim().max(20, "A skill's name is at most 20 characters").optional(),
          color: hex.optional(),
        }),
      )
      .max(30, "At most 30 skills"),
    look: z.object({ v: z.literal(2), body: z.string().max(40), options: capped(z.string().max(40), 30), colors: capped(hex, 40) }).optional(),
    /** The unlocks and titles already announced on the character sheet. */
    seen: z.array(z.string().max(80)).max(400).optional(),
    /** The user page's settings for the dot on the task bar's face and the sheet's Unlocked and News boxes. */
    hideDot: z.boolean().optional(),
    hideNews: z.boolean().optional(),
  })
  .nullable();

/** The task bar's items each side of the logo, left to right (see frontend/src/lib/taskBar.ts). */
const barSide = z.array(z.string().max(80)).max(200);
const taskBar = z.object({ left: barSide, right: barSide }).nullable();

/** The built-in boxes' picked colours, by box key (see useBoxColors in frontend/src/hooks/useAuth.ts). */
const boxColors = capped(hex.transform((value) => value.toLowerCase()), 100).nullable();

/** The dashboard's deadlines box (see frontend/src/lib/deadlineTable.ts); the app fills in what is missing. */
const lowerHex = hex.transform((value) => value.toLowerCase());
const deadlineTable = z
  .object({
    range: z.object({ amount: z.number().int().min(1).max(52), unit: z.enum(["day", "week"]) }).optional(),
    perDay: z.enum(["sum", "soonest", "columns"]).optional(),
    soft: z.boolean().optional(),
    colors: z.object({ hard: lowerHex.optional(), soft: lowerHex.optional(), big: lowerHex.optional() }).optional(),
    taskColors: capped(lowerHex, 200).optional(),
  })
  .nullable();

/** "HH:MM" between NOTIFY_FROM and NOTIFY_TO: the hours the server is awake to send. */
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "A time looks like 08:30")
  .refine((value) => value >= NOTIFY_FROM && value <= NOTIFY_TO, `Notifications come between ${NOTIFY_FROM} and ${NOTIFY_TO}`);

/** One of the user's reminders (see frontend/src/lib/notifySettings.ts). */
const reminder = z.object({
  id: ref,
  on: z.boolean(),
  kind: z.enum(REMINDER_KINDS),
  /** Every day, the days a task on a schedule is due, or weekdays (0 = Monday). */
  days: z.union([z.literal("all"), z.literal("due"), z.array(z.number().int().min(0).max(6)).min(1, "Pick a day").max(7)]),
  times: z.array(time).min(1, "A reminder needs a time").max(MAX_REMINDER_TIMES, `At most ${MAX_REMINDER_TIMES} times a day`),
  /** Made as "N times a day from A to B": kept to show it again. */
  spread: z.object({ count: z.number().int().min(1).max(MAX_REMINDER_TIMES), from: time, to: time }).optional(),
  text: z.string().trim().max(200, "A reminder's text is at most 200 characters").optional(),
  /** "deadlines": the next so many days. */
  ahead: z.number().int().min(1).max(60).optional(),
  taskId: ref.optional(),
  noteId: ref.optional(),
  linkTitle: z.string().max(200).optional(),
});

/** Which notifications the account gets, and when; the app fills in what is missing. */
const amount = (min: number, max: number) => z.object({ on: z.boolean(), amount: z.number().int().min(min).max(max) });
const notifications = z
  .object({
    deadline: z
      .object({ on: z.boolean(), dayBefore: z.boolean().optional(), days: amount(2, 13).optional(), weeks: amount(1, 8).optional(), time: time.optional() })
      .optional(),
    passed: z.object({ on: z.boolean() }).optional(),
    snoozeMinutes: z.number().int().min(5).max(120).optional(),
    reminders: z.array(reminder).max(MAX_REMINDERS, `At most ${MAX_REMINDERS} reminders`).optional(),
  })
  .nullable();

/** The account's own settings, from the user's page; any of them at a time. */
export const settings = z
  .object({
    tickedTasks: z.enum(TICKED_TASKS),
    sortByDeadline: z.boolean(),
    deadlineToday: z.enum(DEADLINE_TODAY),
    tutorialSeen: z.boolean(),
    boxFont: z.enum(TEXT_FONTS),
    notesFont: z.enum(TEXT_FONTS),
    notesTab: z.boolean(),
    boxColorEdit: z.boolean(),
    /** null = no cap. */
    pointsCap: z.number().int().min(1, "A cap is at least 1 point").max(MAX_POINTS).nullable(),
    /** null = no reminder. */
    breakEvery: z.number().int().min(1, "A reminder comes after at least 1 task").max(1000).nullable(),
    /** null = back to the defaults. */
    profile,
    /** null = back to the default. */
    taskBar,
    /** null = every box back to its own colour. */
    boxColors,
    /** null = back to the defaults. */
    deadlineTable,
    /** null = back to the defaults. */
    notifications,
  })
  .partial();
