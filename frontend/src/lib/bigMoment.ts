import type { ReceivedCheer } from "../api/people";
import { levelOf } from "./character/levels";
import { TITLES } from "./character/titles";
import { daysProgress } from "./character/unlocks";

/** Every so many tasks of a day until the user sets their own. */
export const BIG_EVERY = 3;

/** The settings kept in the user's profile, read without making the whole profile (lib/character/profile.ts). */
const settingsIn = (profile: unknown) => (profile ?? {}) as { soundOff?: unknown; bigEvery?: unknown; bigOff?: unknown; streakOff?: unknown; milestoneOff?: unknown; levelOff?: unknown };

export const soundOffIn = (profile: unknown) => settingsIn(profile).soundOff === true;

/** No streak moment on the first task of a day (Settings › Gamification). */
export const streakOffIn = (profile: unknown) => settingsIn(profile).streakOff === true;

/** No milestone moments: no level up at the tick, and a streak milestone is the plain streak moment (Settings › Gamification). */
export const milestoneOffIn = (profile: unknown) => settingsIn(profile).milestoneOff === true;

/** After how many tasks of a day a big moment comes; null = none. */
export function bigEveryIn(profile: unknown) {
  const { bigEvery } = settingsIn(profile);
  return bigEvery === null ? null : typeof bigEvery === "number" && bigEvery >= 1 ? bigEvery : BIG_EVERY;
}

/** What a big moment can be, in the order they take turns; each can be unticked in Settings (`bigOff`, the ones unticked, so one added later starts ticked). */
export const BIG_KINDS = ["lightning", "confetti"] as const;
export type BigKind = (typeof BIG_KINDS)[number];

/** The kinds still ticked, in their turn order. */
export function bigKindsIn(profile: unknown): BigKind[] {
  const { bigOff } = settingsIn(profile);
  return BIG_KINDS.filter((kind) => !(Array.isArray(bigOff) && bigOff.includes(kind)));
}

/** How long a moment's words are on screen ("N tasks today!", in at 0.42 s for 1.2 s; index.css): what waits for it. */
export const MOMENT_WORDS_MS = 1700;

export const isBigMoment = (doneToday: number, every: number | null) => Boolean(every && doneToday > 0 && doneToday % every === 0);

/** How long the character is up cheering the streak (.streak-cheer in index.css): what waits for it. */
export const STREAK_MS = 2600;

/** The streak once today is done too: the days something was done (today may be among them already), and the days the freeze kept. */
export const streakAfterFirst = (days: string[], today: string, frozen: string[] = []) => daysProgress([...new Set([...days, today])], today, frozen).current;

/** How a level up looks, in the order they take turns; each can be unticked in Settings (`levelOff`, as `bigOff`). */
export const LEVEL_KINDS = ["pillar", "banner"] as const;
export type LevelKind = (typeof LEVEL_KINDS)[number];

/** The level-up looks still ticked, in their turn order; none ticked, no level-up moment. */
export function levelKindsIn(profile: unknown): LevelKind[] {
  const { levelOff } = settingsIn(profile);
  return LEVEL_KINDS.filter((kind) => !(Array.isArray(levelOff) && levelOff.includes(kind)));
}

/** How long a level up is on screen (.level-pillar, .level-banner in index.css): what waits for it. */
export const LEVEL_MS = 3400;

/** How long the character cheers a streak milestone (.streak-cheer.is-milestone): what waits for it. */
export const STREAK_MILESTONE_MS = 3400;

/**
 * The level a tick or press takes the character to, when it is a new one; null when it isn't. From the counts the task
 * bar's face reads (tasks done per day, mails sent, the exp knockouts took): today's count is the server's `doneToday`,
 * so it is right whether the days in the cache have this tick yet or not.
 */
export function levelReached(days: { day: string; count: number }[], today: string, doneToday: number, mail: number, lost: number) {
  const exp = days.reduce((sum, { day, count }) => sum + (day === today ? 0 : count), 0) + doneToday + mail - lost;
  const { level } = levelOf(exp);
  return exp > 0 && level > levelOf(exp - 1).level ? level : null;
}

// The longest streak a title is earned with (Undying, 100 days): past it, every 100 days is a milestone of its own.
const STREAK_DAYS = TITLES.flatMap((t) => t.rules.flatMap((rule) => ("streak" in rule ? [rule.streak] : [])));
const LAST_STREAK_DAY = Math.max(...STREAK_DAYS);

/** Whether a streak is a milestone: the days a streak title is earned on (3, 7 … 100; the title itself isn't said), and every 100 days past the last. */
export const isStreakMilestone = (streak: number) => STREAK_DAYS.includes(streak) || (streak > LAST_STREAK_DAY && streak % 100 === 0);

/** "words": every kind unticked, the words alone. "streak": the character cheers the first task of a day. A level kind: a level up. */
export type MomentKind = BigKind | LevelKind | "words" | "cheer" | "streak";

/** The ticked kinds in turn, the first at turn 1; the words alone with none ticked. */
export const kindOf = (turn: number, kinds: readonly BigKind[] = BIG_KINDS): MomentKind => (kinds.length ? kinds[(turn - 1) % kinds.length] : "words");

export interface Moment {
  /** Counts up, so one right after another starts afresh. */
  id: number;
  kind: MomentKind;
  /** The tasks of the day it came at; for a streak, the streak; for a level up, the level. */
  count: number;
  /** A streak on a milestone day. */
  milestone?: boolean;
  /** The cheers it says, newest first: none for a cheer you sent. */
  cheers?: ReceivedCheer[];
}

let current: Moment | null = null;
// Kept apart from the id, so a cheer between two moments doesn't skip a turn.
let turns = 0;
let levelTurns = 0;
const listeners = new Set<() => void>();

/** Called after every tick and "done it" press with the day's count so far. */
export function celebrate(doneToday: number, every: number | null, kinds: readonly BigKind[] = BIG_KINDS) {
  if (!isBigMoment(doneToday, every)) return;
  current = { id: (current?.id ?? 0) + 1, kind: kindOf(++turns, kinds), count: doneToday };
  listeners.forEach((listener) => listener());
}

/** A cheer sent, or those got, whose words it shows: a pop of confetti, not counted in tasks and not one of the turns above. */
export function popCheer(cheers: ReceivedCheer[] = []) {
  current = { id: (current?.id ?? 0) + 1, kind: "cheer", count: 0, cheers };
  listeners.forEach((listener) => listener());
}

/** The first task of a day: the character pops up to cheer the streak it makes, a bigger cheer on a milestone (isStreakMilestone). Not one of the turns above. */
export function celebrateStreak(streak: number, milestone = false) {
  current = { id: (current?.id ?? 0) + 1, kind: "streak", count: streak, ...(milestone && { milestone }) };
  listeners.forEach((listener) => listener());
}

/** A new level: the looks ticked in turn (their own turns). */
export function celebrateLevel(level: number, kinds: readonly LevelKind[] = LEVEL_KINDS) {
  if (!kinds.length) return;
  current = { id: (current?.id ?? 0) + 1, kind: kinds[levelTurns++ % kinds.length], count: level };
  listeners.forEach((listener) => listener());
}

export const getBigMoment = () => current;
export function onBigMoment(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
