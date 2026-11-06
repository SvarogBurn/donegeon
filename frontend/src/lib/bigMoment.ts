import type { ReceivedCheer } from "../api/people";

/** Every so many tasks of a day until the user sets their own. */
export const BIG_EVERY = 3;

/** The settings kept in the user's profile, read without making the whole profile (lib/character/profile.ts). */
const settingsIn = (profile: unknown) => (profile ?? {}) as { soundOff?: unknown; bigEvery?: unknown; bigOff?: unknown };

export const soundOffIn = (profile: unknown) => settingsIn(profile).soundOff === true;

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

/** "words": every kind unticked, the words alone. */
export type MomentKind = BigKind | "words" | "cheer";

/** The ticked kinds in turn, the first at turn 1; the words alone with none ticked. */
export const kindOf = (turn: number, kinds: readonly BigKind[] = BIG_KINDS): MomentKind => (kinds.length ? kinds[(turn - 1) % kinds.length] : "words");

export interface Moment {
  /** Counts up, so one right after another starts afresh. */
  id: number;
  kind: MomentKind;
  /** The tasks of the day it came at. */
  count: number;
  /** The cheers it says, newest first: none for a cheer you sent. */
  cheers?: ReceivedCheer[];
}

let current: Moment | null = null;
// Kept apart from the id, so a cheer between two moments doesn't skip a turn.
let turns = 0;
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

export const getBigMoment = () => current;
export function onBigMoment(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
