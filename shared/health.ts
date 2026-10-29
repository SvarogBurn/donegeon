import { addDays } from "./dates.js";
import { expFor, levelOf, spanOf } from "./levels.js";

/**
 * The character's health, worked out from what happened, like its level: nothing is stored but the hits (a deadline
 * gone by with its task still open, a round of a schedule not done; the server's Hit rows). A hit costs as much health
 * as what was left undone was worth, in points (one point is half a heart). Only a level reached heals, all of it.
 * Health run out is a knockout: the character drops levels (1 the first time, then 2, 3 … up to 5, until it reaches a
 * level it never had before) and its hearts are full again. A day with nothing done, written down while the streak
 * freeze is on (a Hit of kind "day"), costs a level instead of the streak: the streak goes on across it (not counting
 * it), the exp keeps its share of the level, and at Lv 1, with no level left to pay with, the streak breaks. The exp the
 * lost levels took is `lost`, taken off the exp wherever the level is shown, so what those levels unlocked has to be
 * earned again.
 */

/** Hearts at a level: 5 at the start, one more every 2 levels, 10 from Lv 11. */
export const heartsAt = (level: number) => Math.min(10, 5 + Math.floor((Math.max(1, level) - 1) / 2));

/** Health at a level when full: each heart is two halves, one point each. */
export const maxHp = (level: number) => 2 * heartsAt(level);

/** The most levels a knockout costs. */
export const MAX_LEVELS_LOST = 5;

/** A level lost: to a knockout (`day` the hit's), or to a day with nothing done that kept the streak (`day` that day). */
export interface LevelDrop {
  day: string;
  from: number;
  to: number;
}

export interface Health {
  hp: number;
  max: number;
  level: number;
  /** The exp the knockouts and the frozen days took: the level is that of every task done (and mail sent) minus this. */
  lost: number;
  knockouts: LevelDrop[];
  freezes: LevelDrop[];
  /** The days with nothing done that kept the streak going: they bridge it without adding to it. */
  frozen: string[];
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
  today: string;
}

/**
 * Plays every day through in order, up to today. First the day before is settled: a streak going into a day written
 * down as missed, with nothing done on it, freezes it for a level. Then the day's hits (a deadline or round missed the
 * day before, so they land at the start of the day), then the exp of what was done that day, so a level reached later
 * that same day heals them.
 */
export function healthOf({ hits, done, mail = [], missed = [], today }: HealthInput): Health {
  const expOn = new Map<string, number>();
  for (const { day, count } of [...done, ...mail]) expOn.set(day, (expOn.get(day) ?? 0) + count);
  const doneOn = new Set(done.filter(({ count }) => count > 0).map(({ day }) => day));
  const missedOn = new Set(missed);
  const hitsOn = new Map<string, number[]>();
  for (const { day, damage } of hits) hitsOn.set(day, [...(hitsOn.get(day) ?? []), damage]);
  const knockouts: LevelDrop[] = [];
  const freezes: LevelDrop[] = [];
  let exp = 0;
  let lost = 0;
  let level = 1;
  // The highest level since the last knockout (reaching past it heals), and the highest ever (reaching past it forgives the knockouts).
  let top = 1;
  let peak = 1;
  let inARow = 0;
  let hp = maxHp(1);
  // Whether the streak went on through the day before.
  let streak = false;
  const first = [...hits, ...done, ...mail].map(({ day }) => day).sort()[0];
  for (let day = first; first && day <= today; day = addDays(day, 1)) {
    const before = addDays(day, -1);
    if (doneOn.has(before)) streak = true;
    else if (streak && missedOn.has(before) && level > 1) {
      const { into, span } = levelOf(exp - lost);
      const to = level - 1;
      lost += exp - lost - (expFor(to) + Math.floor((into / span) * spanOf(to)));
      freezes.push({ day: before, from: level, to });
      level = to;
      hp = Math.min(hp, maxHp(to));
    } else streak = false;

    for (const damage of hitsOn.get(day) ?? []) {
      hp -= damage;
      if (hp > 0) continue;
      inARow++;
      const to = Math.max(1, level - Math.min(inARow, MAX_LEVELS_LOST));
      lost += exp - lost - expFor(to);
      knockouts.push({ day, from: level, to });
      level = top = to;
      hp = maxHp(to);
    }
    exp += expOn.get(day) ?? 0;
    level = levelOf(exp - lost).level;
    if (level > top) {
      top = level;
      hp = maxHp(level);
    }
    if (level > peak) {
      peak = level;
      inARow = 0;
    }
  }
  return { hp, max: maxHp(level), level, lost, knockouts, freezes, frozen: freezes.map(({ day }) => day) };
}
