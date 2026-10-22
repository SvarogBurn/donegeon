import { earnedRewards, isEarned, ruleText, type Progress, type Reward, type Rule } from "./unlocks";

// The character's titles are earned, not typed: ranks that come with levels, and titles for streaks, deadlines met,
// mail to the devs, coming back, and a skill grown far. The user picks one of the earned ones in the editor; until
// they do (or if the one picked is no longer earned), the sheet shows the highest rank.

export interface Title {
  id: string;
  name: string;
  rules: Rule[];
  /** A rank: the default title is the highest one earned. */
  rank?: boolean;
}

const RANKS: [number, string][] = [
  [1, "Scavenger"],
  [3, "Wanderer"],
  [5, "Wayfarer"],
  [8, "Torchbearer"],
  [12, "Delver"],
  [16, "Pathfinder"],
  [20, "Dungeoneer"],
  [25, "Warden"],
  [30, "Champion"],
  [35, "Legend"],
  [40, "Lord of the Donegeon"],
];

const DEEDS: [string, string, Rule][] = [
  ["kindled", "Kindled", { streak: 3 }],
  ["steadfast", "Steadfast", { streak: 7 }],
  ["unbroken", "Unbroken", { streak: 14 }],
  ["ironwilled", "Ironwilled", { streak: 30 }],
  ["relentless", "Relentless", { streak: 60 }],
  ["undying", "Undying", { streak: 100 }],
  ["punctual", "Punctual", { onTime: 10 }],
  ["clockwork", "Clockwork", { onTime: 50 }],
  ["herald", "Herald", { mail: 1 }],
];

export const TITLES: Title[] = [
  ...RANKS.map(([level, name]): Title => ({ id: `rank:${name.toLowerCase().replaceAll(" ", "-")}`, name, rules: [{ level }], rank: true })),
  ...DEEDS.map(([id, name, rule]): Title => ({ id, name, rules: [rule] })),
];

/** Back after 7 days or more with nothing done. */
const RETURNER: Title = { id: "returner", name: "Returner", rules: [] };

/** A skill's titles: [level, the word before "of <skill>"]. */
const SKILL_TITLES: [number, string][] = [
  [10, "Adept"],
  [20, "Master"],
];

/** Every title earned, ranks first (lowest first), then the rest. */
export function earnedTitles(p: Progress): Title[] {
  const titles = TITLES.filter((t) => isEarned(t, p));
  if (p.returned) titles.push(RETURNER);
  for (const skill of p.skills) {
    for (const [level, word] of SKILL_TITLES) {
      if (skill.level >= level) titles.push({ id: `${word.toLowerCase()}:${skill.key}`, name: `${word} of ${skill.name}`, rules: [] });
    }
  }
  return titles;
}

/** The highest rank earned: the title until the user picks another. */
export const defaultTitle = (p: Progress) => TITLES.filter((t) => t.rank && isEarned(t, p)).at(-1)!;

/** The title shown: the one picked, if it is earned, else the highest rank. */
export const shownTitle = (picked: string | undefined, p: Progress) => earnedTitles(p).find((t) => t.id === picked) ?? defaultTitle(p);

/** The next rank, said short: "Torchbearer at Lv 8"; null at the top. */
export function nextRank(p: Progress) {
  const next = TITLES.find((t) => t.rank && !isEarned(t, p));
  return next ? `${next.name} at ${ruleText(next.rules[0])}` : null;
}

/** Titles earned from the start, never announced. */
export const isStarter = (t: Title) => t.rules.length === 1 && "level" in t.rules[0] && t.rules[0].level <= 1;

/** What was earned but not yet announced on the character sheet; a level reached shows as "LEVEL UP!". */
export function unseenOf(p: Progress, seen: string[]): { rewards: Reward[]; titles: Title[]; levelUp: boolean } {
  const known = new Set(seen);
  const rewards = earnedRewards(p).filter((r) => !known.has(r.id));
  const titles = earnedTitles(p).filter((t) => !isStarter(t) && !known.has(t.id));
  const byLevel = (x: { rules: Rule[] }) => x.rules.some((rule) => "level" in rule);
  return { rewards, titles, levelUp: rewards.some(byLevel) || titles.some((t) => t.rank && byLevel(t)) };
}
