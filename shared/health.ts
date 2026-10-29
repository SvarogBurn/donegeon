import { expFor, levelOf } from "./levels.js";

/**
 * The character's health, worked out from what happened, like its level: nothing is stored but the hits (a deadline
 * gone by with its task still open, a round of a schedule not done; the server's Hit rows). A hit costs as much health
 * as what was left undone was worth, in points (one point is half a heart). Only a level reached heals, all of it.
 * Health run out is a knockout: the character drops levels (1 the first time, then 2, 3 … up to 5, until it reaches a
 * level it never had before) and its hearts are full again. The exp the lost levels took is `lost`, taken off the exp
 * wherever the level is shown, so what those levels unlocked has to be earned again.
 */

/** Hearts at a level: 5 at the start, one more every 2 levels, 10 from Lv 11. */
export const heartsAt = (level: number) => Math.min(10, 5 + Math.floor((Math.max(1, level) - 1) / 2));

/** Health at a level when full: each heart is two halves, one point each. */
export const maxHp = (level: number) => 2 * heartsAt(level);

/** The most levels a knockout costs. */
export const MAX_LEVELS_LOST = 5;

export interface Knockout {
  /** The day the hit that ran the health out came. */
  day: string;
  from: number;
  to: number;
}

export interface Health {
  hp: number;
  max: number;
  level: number;
  /** The exp the knockouts took: the level is that of every task done (and mail sent) minus this. */
  lost: number;
  knockouts: Knockout[];
}

/**
 * Plays the days through in order: each day's hits first (a deadline or round missed the day before, so it lands at
 * the start of the day), then the exp of the tasks done that day, so a level reached later that same day heals it.
 */
export function healthOf(hits: { day: string; damage: number }[], expDays: { day: string; count: number }[]): Health {
  const days = [...new Set([...hits.map((hit) => hit.day), ...expDays.map((d) => d.day)])].sort();
  const expOn = new Map<string, number>();
  for (const { day, count } of expDays) expOn.set(day, (expOn.get(day) ?? 0) + count);
  const hitsOn = new Map<string, number[]>();
  for (const { day, damage } of hits) hitsOn.set(day, [...(hitsOn.get(day) ?? []), damage]);
  const knockouts: Knockout[] = [];
  let exp = 0;
  let lost = 0;
  let level = 1;
  // The highest level since the last knockout (reaching past it heals), and the highest ever (reaching past it forgives the knockouts).
  let top = 1;
  let peak = 1;
  let inARow = 0;
  let hp = maxHp(1);
  for (const day of days) {
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
  return { hp, max: maxHp(level), level, lost, knockouts };
}
