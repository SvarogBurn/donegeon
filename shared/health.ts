import { addDays } from "./dates.js";
import { expFor, levelOf, spanOf } from "./levels.js";

/**
 * The character's health, worked out from what happened, like its level: nothing is stored but the hits (a deadline
 * gone by with its task still open, a round of a schedule not done; the server's Hit rows). A hit costs half a heart
 * (1 hp), whatever the task was worth (2026-11-04, playtest 1). Only a level reached heals, all of it. Health run out is
 * a knockout: the character drops 1 level and its hearts are full again; 3 tasks done in the next 3 days (the day of the
 * knockout and the 2 after) win that level back (a comeback). A day with nothing done, written down while the streak
 * freeze is on (a Hit of kind "day"), costs a level instead of the streak: the streak goes on across it (not counting
 * it), the exp keeps its share of the level, and at Lv 1, with no level left to pay with, the streak breaks. A rest day
 * (the user's: a day off, an exam week) costs nothing: no hits for what was missed on it, and the streak goes on across
 * it. The exp the lost levels took is `lost`, taken off the exp wherever the level is shown, so what those levels
 * unlocked has to be earned again.
 */

/** Hearts at a level: 5 at the start, one more every 2 levels, 10 from Lv 11. */
export const heartsAt = (level: number) => Math.min(10, 5 + Math.floor((Math.max(1, level) - 1) / 2));

/** Health at a level when full: each heart is two halves, one point each. */
export const maxHp = (level: number) => 2 * heartsAt(level);

/** A hit's cost: half a heart, whatever was missed. */
export const HIT_DAMAGE = 1;

/** The comeback after a knockout: this many tasks done, on the day of the knockout or the days after it, win the level back. */
export const COMEBACK_TASKS = 3;
export const COMEBACK_DAYS = 3;

/** Hearts as a hit count says them, half a heart each: 3 → "1½", 4 → "2". */
export const heartsText = (hits: number) => `${Math.floor(hits / 2) || (hits % 2 ? "" : "0")}${hits % 2 ? "½" : ""}`;

/** Days off, from and to (local days, both in). */
export interface RestRange {
  from: string;
  to: string;
}

/** The ranges as stored (User.restDays: JSON, null = none), anything else dropped. */
export function restRanges(value: unknown): RestRange[] {
  if (!Array.isArray(value)) return [];
  return value.filter((range): range is RestRange => typeof range?.from === "string" && typeof range?.to === "string" && range.from <= range.to);
}

/** How long rest days gone by are kept: as long as the hits are looked for. */
export const REST_KEPT_DAYS = 60;

/**
 * The rest days after a change: the days gone by stay as they were (a day already settled can't be taken back or made a
 * rest day after the fact), the days from today on are the new ones', and ranges that ended long ago are let go.
 */
export function settleRest(before: readonly RestRange[], next: readonly RestRange[], today: string): RestRange[] {
  const yesterday = addDays(today, -1);
  const past = before.filter(({ from }) => from < today).map(({ from, to }) => ({ from, to: to < today ? to : yesterday }));
  const coming = next.filter(({ to }) => to >= today).map(({ from, to }) => ({ from: from < today ? today : from, to }));
  const kept = addDays(today, -REST_KEPT_DAYS);
  return [...past.filter(({ to }) => to >= kept), ...coming].sort((a, b) => a.from.localeCompare(b.from));
}

/** Every day of the ranges, from `since` (at most) to `until` (at least) if given. */
export function restDays(ranges: readonly RestRange[], since = "", until = "9999-12-31"): Set<string> {
  const days = new Set<string>();
  for (const { from, to } of ranges) {
    for (let day = from < since ? since : from; day <= to && day <= until; day = addDays(day, 1)) days.add(day);
  }
  return days;
}

/** A level lost: to a knockout (`day` the hit's), or to a day with nothing done that kept the streak (`day` that day). */
export interface LevelDrop {
  day: string;
  from: number;
  to: number;
}

/** The comeback still open after the last knockout: `done` of `needed` tasks, from `day` to `until`. */
export interface Comeback {
  day: string;
  until: string;
  done: number;
  needed: number;
}

/** What a week (Monday to Sunday) cost and gave: its tasks done, hits, levels lost and won back, and days off. */
export interface WeekHealth {
  from: string;
  to: string;
  done: number;
  hits: number;
  /** Health lost, in hp (2 a heart). */
  hpLost: number;
  levelFrom: number;
  levelTo: number;
  knockouts: number;
  freezes: number;
  comebacks: number;
  rested: number;
}

export interface Health {
  hp: number;
  max: number;
  level: number;
  /** The exp the knockouts and the frozen days took: the level is that of every task done (and mail sent) minus this. */
  lost: number;
  knockouts: LevelDrop[];
  freezes: LevelDrop[];
  /** Levels won back by a comeback (`day` the one its last task was done on). */
  comebacks: LevelDrop[];
  /** The comeback to do, while there is time. */
  quest: Comeback | null;
  /** The days that carry the streak without adding to it: those with nothing done that kept it for a level, and the rest days with nothing done. */
  frozen: string[];
  /** The week before `today`'s, Monday to Sunday (only when asked for, with `week`). */
  lastWeek?: WeekHealth;
}

export interface HealthInput {
  /** What cost health, on the day it hit. */
  hits: { day: string; damage: number }[];
  /** Tasks done each day: exp, and the streak. */
  done: { day: string; count: number }[];
  /** Mails sent to the devs each day: exp only. */
  mail?: { day: string; count: number }[];
  /** The days with nothing done written down while the streak freeze was on: only these can be frozen. */
  missed?: string[];
  /** The days off: nothing missed on them hits, and the streak goes on across them. */
  rest?: ReadonlySet<string>;
  /** The Monday of the week to sum up in `lastWeek`. */
  week?: string;
  today: string;
}

/**
 * Plays every day through in order, up to today. First the day before is settled: a streak going into a rest day goes
 * on; going into a day written down as missed, with nothing done on it, it freezes it for a level. Then the day's hits
 * (a deadline or round missed the day before, so they land at the start of the day; none for a miss on a rest day), then
 * the exp of what was done that day, so a level reached later that same day heals them, and an open comeback counts it.
 */
export function healthOf({ hits, done, mail = [], missed = [], rest = new Set(), week, today }: HealthInput): Health {
  const expOn = new Map<string, number>();
  for (const { day, count } of [...done, ...mail]) expOn.set(day, (expOn.get(day) ?? 0) + count);
  const doneCount = new Map(done.map(({ day, count }) => [day, count]));
  const doneOn = new Set(done.filter(({ count }) => count > 0).map(({ day }) => day));
  const missedOn = new Set(missed);
  const hitsOn = new Map<string, number[]>();
  for (const { day, damage } of hits) if (!rest.has(addDays(day, -1))) hitsOn.set(day, [...(hitsOn.get(day) ?? []), damage]);
  const knockouts: LevelDrop[] = [];
  const freezes: LevelDrop[] = [];
  const comebacks: LevelDrop[] = [];
  const frozen: string[] = [];
  let exp = 0;
  let lost = 0;
  let level = 1;
  // The highest level since the last knockout: reaching past it heals.
  let top = 1;
  let hp = maxHp(1);
  // Whether the streak went on through the day before.
  let streak = false;
  // The last knockout's comeback, while it can still be done, with the exp it would give back.
  let quest: (Comeback & { took: number }) | null = null;
  const weekEnd = week && addDays(week, 6);
  const summary: WeekHealth | undefined = week ? { from: week, to: weekEnd!, done: 0, hits: 0, hpLost: 0, levelFrom: 1, levelTo: 1, knockouts: 0, freezes: 0, comebacks: 0, rested: 0 } : undefined;
  const inWeek = (day: string) => Boolean(week && day >= week && day <= weekEnd!);
  const first = [...hits, ...done, ...mail].map(({ day }) => day).sort()[0];
  for (let day = first; first && day <= today; day = addDays(day, 1)) {
    if (summary && day === week) summary.levelFrom = level;
    const before = addDays(day, -1);
    if (doneOn.has(before)) streak = true;
    else if (rest.has(before)) frozen.push(before);
    else if (streak && missedOn.has(before) && level > 1) {
      const { into, span } = levelOf(exp - lost);
      const to = level - 1;
      lost += exp - lost - (expFor(to) + Math.floor((into / span) * spanOf(to)));
      freezes.push({ day: before, from: level, to });
      frozen.push(before);
      if (inWeek(before)) summary!.freezes++;
      level = to;
      hp = Math.min(hp, maxHp(to));
    } else streak = false;

    for (const damage of hitsOn.get(day) ?? []) {
      hp -= damage;
      if (inWeek(day)) (summary!.hits++, (summary!.hpLost += damage));
      if (hp > 0) continue;
      const to = Math.max(1, level - 1);
      const took = exp - lost - expFor(to);
      lost += took;
      knockouts.push({ day, from: level, to });
      if (inWeek(day)) summary!.knockouts++;
      quest = { day, until: addDays(day, COMEBACK_DAYS - 1), done: 0, needed: COMEBACK_TASKS, took };
      level = top = to;
      hp = maxHp(to);
    }
    exp += expOn.get(day) ?? 0;
    if (quest && day <= quest.until) {
      quest.done += doneCount.get(day) ?? 0;
      if (quest.done >= quest.needed) {
        const from = levelOf(exp - lost).level;
        lost -= quest.took;
        comebacks.push({ day, from, to: levelOf(exp - lost).level });
        if (inWeek(day)) summary!.comebacks++;
        quest = null;
      }
    }
    level = levelOf(exp - lost).level;
    if (level > top) {
      top = level;
      hp = maxHp(level);
    }
    if (inWeek(day)) {
      summary!.done += doneCount.get(day) ?? 0;
      if (rest.has(day)) summary!.rested++;
    }
    if (summary && day === weekEnd) summary.levelTo = level;
  }
  const open = quest && quest.until >= today ? { day: quest.day, until: quest.until, done: quest.done, needed: quest.needed } : null;
  return { hp, max: maxHp(level), level, lost, knockouts, freezes, comebacks, quest: open, frozen, ...(summary && { lastWeek: summary }) };
}
