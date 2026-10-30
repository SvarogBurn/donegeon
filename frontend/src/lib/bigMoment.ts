/** Every so many tasks of a day until the user sets their own. */
export const BIG_EVERY = 10;

/** The settings kept in the user's profile, read without making the whole profile (lib/character/profile.ts). */
const settingsIn = (profile: unknown) => (profile ?? {}) as { soundOff?: unknown; bigEvery?: unknown };

export const soundOffIn = (profile: unknown) => settingsIn(profile).soundOff === true;

/** After how many tasks of a day a big moment comes; null = none. */
export function bigEveryIn(profile: unknown) {
  const { bigEvery } = settingsIn(profile);
  return bigEvery === null ? null : typeof bigEvery === "number" && bigEvery >= 1 ? bigEvery : BIG_EVERY;
}

export const isBigMoment = (doneToday: number, every: number | null) => Boolean(every && doneToday > 0 && doneToday % every === 0);

export type MomentKind = "lightning" | "confetti";

/** Lightning first, then confetti, in turn. */
export const kindOf = (id: number): MomentKind => (id % 2 === 1 ? "lightning" : "confetti");

export interface Moment {
  /** Counts up, so one right after another starts afresh. */
  id: number;
  kind: MomentKind;
  /** The tasks of the day it came at. */
  count: number;
}

let current: Moment | null = null;
const listeners = new Set<() => void>();

/** Called after every tick and "done it" press with the day's count so far. */
export function celebrate(doneToday: number, every: number | null) {
  if (!isBigMoment(doneToday, every)) return;
  const id = (current?.id ?? 0) + 1;
  current = { id, kind: kindOf(id), count: doneToday };
  listeners.forEach((listener) => listener());
}

export const getBigMoment = () => current;
export function onBigMoment(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
