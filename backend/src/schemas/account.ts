import { z } from "zod";
import { MAX_POINTS } from "../../../shared/constants.js";
import { DEADLINE_TODAY, TEXT_FONTS, TICKED_TASKS } from "../../../shared/enums.js";
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
  })
  .partial();
