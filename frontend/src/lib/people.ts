import { addDays, daysBetween, mondayOf } from "../../../shared/dates";
import type { ShareKey } from "../../../shared/enums";
import type { Look } from "./character/bodies";
import { levelOf } from "./character/levels";
import type { StatValue } from "./character/profileStats";
import { STAT_NAMES } from "./character/profileStats";
import type { StatKey } from "./character/profile";

// The card: what other people can read of the character. Level, title, stats and skills are worked out in the browser
// from every task, and the server can't do that for someone else (it writes health as it reads it, has no one's local
// day, and its rows hold task titles). So each person's app publishes a small card, in two parts: `cardBasics` wherever
// the app is open, from what the task bar's face reads anyway, and `cardSheet` from the character sheet, which alone
// has the rest. Only values and names the owner chose to show are on it, never ids or task titles.

export interface CardActivity {
  /** The owner's day it was published: it says how old the other two are. */
  day: string;
  streak: number;
  week: number;
}

export interface CardStat {
  key: string;
  value: number;
  text?: string;
  of?: number;
}

export interface CardSkill {
  name: string;
  level: number;
  into: number;
  span: number;
  color?: string;
}

/** A card as the server gives it: only the parts both people share. Empty until its owner's app has published one. */
export interface Card {
  level?: number;
  into?: number;
  span?: number;
  title?: string;
  look?: unknown;
  activity?: CardActivity;
  hearts?: { hp: number; max: number };
  stats?: { day: string; rows: CardStat[] };
  skills?: CardSkill[];
}

export interface Person {
  id: string;
  username: string;
  card: Card;
  canCheer: boolean;
  hasCheered: boolean;
}

/** The days of the week the given day is in, so far. */
const doneThisWeek = (days: { day: string; count: number }[], today: string) => {
  const monday = mondayOf(today);
  return days.reduce((sum, { day, count }) => (day >= monday && day <= today ? sum + count : sum), 0);
};

/** The part of the card that can be published from anywhere in the app. */
export function cardBasics({ exp, look, streak, days, today, hearts, shares }: { exp: number; look: Look; streak: number; days: { day: string; count: number }[]; today: string; hearts?: { hp: number; max: number }; shares: ShareKey[] }): Card {
  const { level, into, span } = levelOf(exp);
  return {
    level,
    into,
    span,
    look,
    ...(shares.includes("activity") && { activity: { day: today, streak, week: doneThisWeek(days, today) } }),
    ...(shares.includes("hearts") && hearts && { hearts: { hp: hearts.hp, max: hearts.max } }),
  };
}

/** The part that needs the character sheet's numbers. Stats of the user's own aren't on it: their names are private. */
export function cardSheet({ title, stats, skills, today, shares }: { title: string; stats: { key: StatKey; stat: StatValue }[]; skills: { name: string; color?: string; exp: number }[]; today: string; shares: ShareKey[] }): Card {
  return {
    title,
    ...(shares.includes("stats") && {
      stats: { day: today, rows: stats.map(({ key, stat }) => ({ key, value: stat.value, ...(stat.text !== undefined && { text: stat.text }), ...(stat.of !== undefined && { of: stat.of }) })) },
    }),
    ...(shares.includes("skills") && {
      skills: skills.filter(({ name }) => name).map(({ name, color, exp }) => ({ name, ...levelOf(exp), ...(color && { color }) })),
    }),
  };
}

/**
 * A card's activity as of the viewer's today. It is only as new as its owner's last visit: a streak not published
 * since before yesterday may be over, so the day they were last here stands in for it, and a week gone by counts 0.
 */
export function shownActivity({ day, streak, week }: CardActivity, today: string) {
  return {
    streak: daysBetween(day, today) <= 1 ? streak : null,
    week: mondayOf(day) === mondayOf(today) ? week : 0,
    lastHere: day < addDays(today, -1) ? day : null,
  };
}

/** A card's stats with their names: the names are the viewer's app's own, so none comes from the card, and one it doesn't know is left out. */
export const shownStats = (rows: CardStat[]) => rows.flatMap((row) => (row.key in STAT_NAMES ? [{ ...row, name: STAT_NAMES[row.key as StatKey] }] : []));
