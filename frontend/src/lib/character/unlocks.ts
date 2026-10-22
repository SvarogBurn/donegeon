import { daysBetween } from "../../../../shared/dates";
import { BODIES, BODY_BY_ID, bodyOf, choiceOf, type Look } from "./bodies";
import type { Deeds } from "./deeds";

// What the character earns. Hair, fringe, eyes, nose, beard, every colour, the human and each animal's own outfit
// are free from the start, and so is the first choice of every row (what is drawn until the user picks: the hoodie,
// the shorts, socks, shoes, None). The rest of the clothes come one a level (to Lv 19), in a fixed order, and the
// things held (and a few more) one a level of any skill (to Lv 12); each body by a deed of its own (deeds.ts), shown
// until then as a grey silhouette with no name; the human's ears, tails and horns with streaks and deadlines met.
// Nothing is stored but what has been announced (Profile.seen): it is all worked out from what was done, so a changed
// table recalculates everyone. Nothing is ever taken back: streaks count the longest one, whatever the saved look
// wears stays allowed, and so does whatever the sheet has announced (a skill taken off, tasks deleted).

/** What earns something: a level, the longest streak, deadlines met, mails to the devs, or a deed (deeds.ts). */
export type Rule =
  | { level: number }
  | { streak: number }
  | { onTime: number }
  | { mail: number }
  | { skill: number }
  | { presses: number }
  | { frogs: number }
  | { earlyDays: number }
  | { onTimeRun: number }
  | { busiestDay: number }
  | { steady: true };

/** What the character has done, as the unlocks and titles see it. */
export interface Progress extends Deeds {
  level: number;
  /** The longest streak ever, which is what counts, and the one going on now, which is how close the next is. */
  longest: number;
  current: number;
  onTime: number;
  mail: number;
  /** A task was done after 7 days or more with none. */
  returned: boolean;
  /** Each skill's key ("list:<id>"), shown name and level. */
  skills: { key: string; name: string; level: number }[];
}

export interface Reward {
  /** "body:wolf", "top:shirt", "human:tail:bushy". */
  id: string;
  name: string;
  /** Any one of them earns it. */
  rules: Rule[];
  /** A body; else a choice of an option (on every body that has it, or only on `on`). */
  body?: string;
  option?: string;
  choice?: string;
  on?: string;
}

/** One piece of the shared wardrobe a level, from Lv 2 to Lv 19: [option, choice]. */
const BY_LEVEL: [string, string][] = [
  ["cane", "metal"],
  ["top", "shirt"],
  ["bottoms", "trousers"],
  ["glasses", "glasses2"],
  ["top", "dress"],
  ["top", "coat"],
  ["shoes", "boots"],
  ["bottoms", "skirt"],
  ["hat", "fedora"],
  ["socks", "striped"],
  ["top", "blouse"],
  ["shoes", "flats"],
  ["bottoms", "overalls"],
  ["jewellery", "choker"],
  ["hat", "fancy"],
  ["jewellery", "nosering"],
  ["glasses", "sunglasses"],
  ["hat", "tophat"],
];

/** The things held, and a few more, one a level of any skill (the highest), from Lv 2 to Lv 12: [option, choice]. */
const BY_SKILL: [string, string][] = [
  ["held", "pencil"],
  ["held", "laptop"],
  ["held", "dagger"],
  ["glasses", "glasses1"],
  ["held", "bow"],
  ["held", "staff"],
  ["top", "robe"],
  ["held", "sword"],
  ["scarf", "ruffle"],
  ["held", "gun"],
  ["cane", "fancy"],
];

/** Each body's deed. */
const BODY_RULES: [string, Rule[]][] = [
  // An early first friend.
  ["sheep", [{ level: 5 }]],
  // They sneak in through the post.
  ["mice", [{ mail: 10 }]],
  // A creature of habit.
  ["wolf", [{ presses: 50 }]],
  // A busy bunny.
  ["bunny", [{ busiestDay: 25 }]],
  // Eat the frog: the thing put off the longest, done.
  ["frog", [{ frogs: 5 }]],
  // Out at dawn.
  ["deer", [{ earlyDays: 10 }]],
  // Lands on its feet.
  ["whitecat", [{ onTimeRun: 20 }]],
  // Stubborn: the hard deadlines' pace kept for a month.
  ["boar", [{ steady: true }]],
  ["dragon", [{ level: 30 }, { streak: 100 }]],
];

/** The human's ears, tails and horns: [option, choice, rule]. */
const HUMAN_EXTRAS: [string, string, Rule][] = [
  ["ears", "cat", { streak: 3 }],
  ["ears", "bunny", { streak: 7 }],
  ["tail", "bunny", { streak: 7 }],
  ["ears", "puppy", { streak: 14 }],
  ["tail", "puppy", { streak: 14 }],
  ["tail", "bushy", { streak: 21 }],
  ["tail", "cat", { streak: 30 }],
  ["horns", "curly", { streak: 60 }],
  ["tail", "dragon", { streak: 60 }],
  ["tail", "cow", { onTime: 10 }],
];

/** A choice's name, from the first body that has it (the human, for the shared wardrobe). */
function choiceName(option: string, choice: string, on?: string) {
  for (const body of on ? [BODY_BY_ID.get(on)!] : BODIES) {
    const found = body.options?.find((o) => o.id === option)?.choices.find((c) => c.id === choice);
    if (found) return found.name;
  }
  return choice;
}

export const REWARDS: Reward[] = [
  ...BY_LEVEL.map(([option, choice], i): Reward => ({ id: `${option}:${choice}`, name: choiceName(option, choice), rules: [{ level: i + 2 }], option, choice })),
  ...BY_SKILL.map(([option, choice], i): Reward => ({ id: `${option}:${choice}`, name: choiceName(option, choice), rules: [{ skill: i + 2 }], option, choice })),
  ...BODY_RULES.map(([body, rules]): Reward => ({ id: `body:${body}`, name: BODY_BY_ID.get(body)?.name ?? body, rules, body })),
  ...HUMAN_EXTRAS.map(([option, choice, rule]): Reward => ({ id: `human:${option}:${choice}`, name: choiceName(option, choice, "human"), rules: [rule], option, choice, on: "human" })),
];

const BODY_REWARDS = new Map(REWARDS.filter((r) => r.body).map((r) => [r.body!, r]));
const PIECE_REWARDS = new Map(REWARDS.filter((r) => r.option).map((r) => [`${r.on ?? "*"}:${r.option}:${r.choice}`, r]));

/** Whether a rule is met. */
export function meets(rule: Rule, p: Progress) {
  if ("level" in rule) return p.level >= rule.level;
  if ("streak" in rule) return p.longest >= rule.streak;
  if ("onTime" in rule) return p.onTime >= rule.onTime;
  if ("mail" in rule) return p.mail >= rule.mail;
  if ("skill" in rule) return p.skills.some((s) => s.level >= rule.skill);
  if ("presses" in rule) return p.presses >= rule.presses;
  if ("frogs" in rule) return p.frogs >= rule.frogs;
  if ("earlyDays" in rule) return p.earlyDays >= rule.earlyDays;
  if ("onTimeRun" in rule) return p.onTimeRun >= rule.onTimeRun;
  if ("busiestDay" in rule) return p.busiestDay >= rule.busiestDay;
  return p.steady;
}

export const isEarned = (reward: { rules: Rule[] }, p: Progress) => reward.rules.some((rule) => meets(rule, p));

/** What a rule asks for, said short: "Lv 8", "a 14-day streak". */
export function ruleText(rule: Rule) {
  if ("level" in rule) return `Lv ${rule.level}`;
  if ("streak" in rule) return `a ${rule.streak}-day streak`;
  if ("onTime" in rule) return `${rule.onTime} deadlines met`;
  if ("mail" in rule) return rule.mail === 1 ? "a mail to the devs" : `${rule.mail} mails to the devs`;
  if ("skill" in rule) return `Lv ${rule.skill} in a skill`;
  if ("presses" in rule) return `${rule.presses} presses of persistent tasks`;
  if ("frogs" in rule) return `${rule.frogs} tasks done that waited 30 days`;
  if ("earlyDays" in rule) return `tasks done before 8 in the morning on ${rule.earlyDays} days`;
  if ("onTimeRun" in rule) return `${rule.onTimeRun} deadlines met in a row`;
  if ("busiestDay" in rule) return `${rule.busiestDay} tasks done in one day`;
  return "30 days in a row at half the pace of the hard deadlines or more";
}

export const requirementOf = (reward: { rules: Rule[] }) => reward.rules.map(ruleText).join(" or ");

/** The days from the progress the task bar's face gets from the server: the longest and the current streak, and whether there was a comeback. */
export function daysProgress(days: string[], today: string) {
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let returned = false;
  for (let i = 0; i < sorted.length; i++) {
    const gap = i === 0 ? null : daysBetween(sorted[i - 1], sorted[i]);
    run = gap === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    if (gap !== null && gap > 7) returned = true;
  }
  const last = sorted.at(-1);
  const current = last && daysBetween(last, today) <= 1 ? run : 0;
  return { longest, current, returned };
}

/** What a look may wear: what was earned, and on a developer's account everything. */
export interface Unlocks {
  progress: Progress;
  isDev: boolean;
  /** The look as saved: whatever it wears stays allowed, earned or not. */
  saved: Look;
  /** What the sheet has announced (Profile.seen): it stays unlocked, whatever happens to the tasks and skills since. */
  seen: string[];
}

/** The reward a body still waits for; null when it may be worn. */
export function bodyLock(u: Unlocks, body: string): Reward | null {
  const reward = BODY_REWARDS.get(body);
  if (!reward || u.isDev || u.saved.body === body || u.seen.includes(reward.id) || isEarned(reward, u.progress)) return null;
  return reward;
}

/** The reward a choice still waits for; null when it may be worn. The first choice of a row is always free. */
export function choiceLock(u: Unlocks, body: string, option: string, choice: string): Reward | null {
  const reward = PIECE_REWARDS.get(`${body}:${option}:${choice}`) ?? PIECE_REWARDS.get(`*:${option}:${choice}`);
  if (!reward || u.isDev || u.saved.options[option] === choice || u.seen.includes(reward.id) || isEarned(reward, u.progress)) return null;
  const first = BODY_BY_ID.get(body)?.options?.find((o) => o.id === option)?.choices[0];
  return first?.id === choice ? null : reward;
}

/** The locked things a look has on: its body, and the choices it shows. */
export function lockedIn(look: Look, u: Unlocks): Reward[] {
  const body = bodyOf(look);
  const locked: Reward[] = [];
  const own = bodyLock(u, body.id);
  if (own) locked.push(own);
  for (const option of body.options ?? []) {
    const lock = choiceLock(u, body.id, option.id, choiceOf(look, option).id);
    if (lock) locked.push(lock);
  }
  return locked;
}

/**
 * The look as it may be saved: a locked body goes back to the saved one, and a locked choice to the saved one (or the
 * row's first), so whatever was tried on is kept only where it was earned.
 */
export function withoutLocked(look: Look, u: Unlocks): Look {
  const body = bodyLock(u, look.body) ? u.saved.body : look.body;
  const options = { ...look.options };
  for (const option of BODY_BY_ID.get(body)?.options ?? []) {
    const choice = choiceOf({ ...look, body, options }, option).id;
    if (!choiceLock(u, body, option.id, choice)) continue;
    if (u.saved.options[option.id] !== undefined) options[option.id] = u.saved.options[option.id];
    else delete options[option.id];
  }
  return { ...look, body, options };
}

/** Every reward earned. */
export const earnedRewards = (p: Progress) => REWARDS.filter((r) => isEarned(r, p));

/**
 * The next things to aim for, said short: what the next level with something brings, the next skill level's and the
 * next streak's. "Skirt at Lv 9", "Bow at Lv 6 in a skill (Cooking is Lv 4)", "Cat ears at a 3-day streak (2 / 3)".
 * Never a body: they stay unknown until earned.
 */
export function nextGoals(p: Progress): string[] {
  const open = REWARDS.filter((r) => !r.body && !isEarned(r, p));
  const goals: string[] = [];
  const levels = open.flatMap((r) => r.rules.flatMap((rule) => ("level" in rule ? [{ r, at: rule.level }] : [])));
  const level = Math.min(...levels.map((x) => x.at));
  if (Number.isFinite(level)) goals.push(`${levels.filter((x) => x.at === level).map((x) => x.r.name).join(", ")} at Lv ${level}`);
  const skills = open.flatMap((r) => r.rules.flatMap((rule) => ("skill" in rule ? [{ r, at: rule.skill }] : [])));
  const skill = Math.min(...skills.map((x) => x.at));
  if (Number.isFinite(skill)) {
    const best = [...p.skills].sort((a, b) => b.level - a.level)[0];
    const names = skills.filter((x) => x.at === skill).map((x) => x.r.name).join(", ");
    goals.push(`${names} at Lv ${skill} in a skill (${best ? `${best.name} is Lv ${best.level}` : "pick one under Edit"})`);
  }
  const streaks = open.flatMap((r) => r.rules.flatMap((rule) => ("streak" in rule ? [{ r, at: rule.streak }] : [])));
  const streak = Math.min(...streaks.map((x) => x.at));
  if (Number.isFinite(streak)) goals.push(`${streaks.filter((x) => x.at === streak).map((x) => x.r.name).join(", ")} at a ${streak}-day streak (${p.current} / ${streak})`);
  return goals;
}

/** The look with a reward on, to try it: its body, or its piece (on the human where the look's body hasn't got it). */
export function tryOn(look: Look, reward: Reward): Look {
  if (reward.body) return { ...look, body: reward.body };
  const has = (id: string) => BODY_BY_ID.get(id)?.options?.some((o) => o.id === reward.option && o.choices.some((c) => c.id === reward.choice));
  const body = reward.on ?? (has(look.body) ? look.body : "human");
  return { ...look, body, options: { ...look.options, [reward.option!]: reward.choice! } };
}
