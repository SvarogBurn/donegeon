import type { RangeKey } from "../stats";
import { BIG_KINDS, LEVEL_KINDS, type BigKind, type LevelKind } from "../bigMoment";
import { isBackground, isBarFill, type BackgroundId, type BarFillId } from "../backgrounds";
import { BODY_BY_ID, DEFAULT_LOOK, type Look } from "./bodies";

// The character at the top of the user's page, as saved in User.profile. normalizeProfile reads whatever was saved
// (or nothing) into a whole one: defaults filled in, and anything that no longer exists dropped, so old saves keep
// working as stats, parts, lists, goals and tags come and go.

/** The built-in stats, in the order the editor first lists them. */
export const STAT_KEYS = ["streak", "longest", "today", "week", "month", "year", "ever", "active30", "consistency", "points", "onTime", "open"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** What the sheet shows until the user picks: what the Account box showed before there was a character. */
export const DEFAULT_STATS: StatKey[] = ["streak", "longest", "year"];

export const RANGES: [RangeKey, string][] = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
  ["365", "365 days"],
  ["all", "all time"],
];

/** A stat of the user's own: tasks done in any of its lists, goals and tags, over a period, against an optional target. */
export interface CustomStat {
  id: string;
  name: string;
  lists: string[];
  goals: string[];
  tags: string[];
  range: RangeKey;
  /** With a target the stat is a bar of cells that fills up to it. */
  target?: number | null;
}

/** A list, goal or tag the character levels up in. */
export interface Skill {
  kind: "list" | "goal" | "tag";
  id: string;
  /** Its own name ("Cooking" for the list "Kitchen"); else the list's, goal's or tag's. */
  name?: string;
  /** Its bar's colour, "#rrggbb"; else its list's colour, else the exp bar's yellow. */
  color?: string;
}

/** The character's name is always the username: a name saved before is dropped. */
export interface Profile {
  /** The id of the title picked among the earned ones (titles.ts); one typed before is no id and shows the highest rank. */
  title?: string;
  /** The unlocks and titles already announced on the sheet (unlocks.ts, titles.ts). */
  seen?: string[];
  stats: StatKey[];
  custom: CustomStat[];
  skills: Skill[];
  look?: Look;
  /** No red dot on the task bar's face when something new is earned (the user page's Settings). */
  hideDot?: boolean;
  /** No Unlocked box (LEVEL UP!) on the sheet and no Next up box in the editor; the dot goes with them, as nothing would clear it. */
  hideNews?: boolean;
  /** Settings › Gamification: no tick sounds. */
  soundOff?: boolean;
  /**
   * Learn Donegeon: the chapters of the tutorial finished, and the hints of them already offered ("hint:<chapter>", and
   * "hint:pill" for the pill after the core). Set (empty) when the core ends: an account that had the whole tutorial
   * before gets no hints.
   */
  learned?: string[];
  /** Settings › Gamification: a big moment after every so many tasks of a day (null = none, left out = BIG_EVERY, lib/bigMoment.ts). */
  bigEvery?: number | null;
  /** Settings › Gamification: the kinds of big moment unticked (BIG_KINDS, lib/bigMoment.ts); left out = all ticked. */
  bigOff?: BigKind[];
  /** Settings › Gamification: no streak moment, the character cheering the first task of a day (lib/bigMoment.ts). */
  streakOff?: boolean;
  /** Settings › Gamification: no milestone moments, a level up or a streak milestone at the tick (lib/bigMoment.ts). */
  milestoneOff?: boolean;
  /** Settings › Gamification: the level-up looks unticked (LEVEL_KINDS, lib/bigMoment.ts); left out = all ticked. */
  levelOff?: LevelKind[];
  /** Settings › Theme and design: the page's background (lib/backgrounds.ts); left out = the theme's. */
  background?: Exclude<BackgroundId, "default">;
  /** Settings › Theme and design: the task bars' background (lib/backgrounds.ts); left out = the theme's. */
  bars?: Exclude<BarFillId, "default">;
  /** Settings › Theme and design: the boxes' background, inside their frames (lib/backgrounds.ts); left out = the theme's. */
  boxes?: Exclude<BarFillId, "default">;
  /** Settings › Theme and design: Distraction free, the pixel look taken off, no shows at the tick, and none of the game in sight; the settings it covers are kept as they are (lib/bigMoment.ts). */
  calm?: boolean;
}

export const STAT_NAME_MAX = 12;
export const SKILL_NAME_MAX = 20;

/** The ids that exist now; left out while they load, and then nothing is dropped. */
export interface Known {
  lists: Set<string>;
  goals: Set<string>;
  tags: Set<string>;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);
const ids = (value: unknown, known?: Set<string>) =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && (!known || known.has(id))))] : [];
const RANGE_KEYS = new Set(RANGES.map(([key]) => key));
const HEX = /^#[0-9a-fA-F]{6}$/;

/** A saved look made whole: a body that exists, choices it has, colours that are colours. Anything older is the default. */
export function normalizeLook(raw: unknown): Look {
  if (!isObject(raw) || raw.v !== 2) return DEFAULT_LOOK;
  const body = typeof raw.body === "string" ? BODY_BY_ID.get(raw.body) : undefined;
  if (!body) return DEFAULT_LOOK;
  const options: Look["options"] = {};
  const rawOptions = isObject(raw.options) ? raw.options : {};
  for (const option of body.options ?? []) {
    const id = rawOptions[option.id];
    if (typeof id === "string" && option.choices.some((c) => c.id === id)) options[option.id] = id;
  }
  const colors: Look["colors"] = {};
  for (const [material, hex] of Object.entries(isObject(raw.colors) ? raw.colors : {})) {
    if (typeof hex === "string" && HEX.test(hex)) colors[material] = hex.toUpperCase();
  }
  return { v: 2, body: body.id, options, colors };
}

export function normalizeProfile(raw: unknown, known?: Known): Profile {
  const p = isObject(raw) ? raw : {};
  const statKeys = new Set<string>(STAT_KEYS);
  const stats = Array.isArray(p.stats) ? [...new Set(p.stats.filter((key): key is StatKey => typeof key === "string" && statKeys.has(key)))] : DEFAULT_STATS;
  const custom: CustomStat[] = (Array.isArray(p.custom) ? p.custom : []).filter(isObject).flatMap((c) => {
    const name = text(c.name, STAT_NAME_MAX);
    if (typeof c.id !== "string" || !name) return [];
    const target = typeof c.target === "number" && c.target >= 1 ? Math.floor(c.target) : null;
    const range = typeof c.range === "string" && RANGE_KEYS.has(c.range as RangeKey) ? (c.range as RangeKey) : "30";
    return [{ id: c.id, name, lists: ids(c.lists, known?.lists), goals: ids(c.goals, known?.goals), tags: ids(c.tags, known?.tags), range, target }];
  });
  const seen = new Set<string>();
  const skills: Skill[] = (Array.isArray(p.skills) ? p.skills : []).filter(isObject).flatMap((s) => {
    const kind = s.kind === "list" || s.kind === "goal" || s.kind === "tag" ? s.kind : null;
    if (!kind || typeof s.id !== "string" || seen.has(kind + s.id)) return [];
    const pool = known && { list: known.lists, goal: known.goals, tag: known.tags }[kind];
    if (pool && !pool.has(s.id)) return [];
    seen.add(kind + s.id);
    const name = text(s.name, SKILL_NAME_MAX);
    const color = typeof s.color === "string" && HEX.test(s.color) ? s.color.toLowerCase() : undefined;
    return [{ kind, id: s.id, ...(name && { name }), ...(color && { color }) }];
  });
  const title = text(p.title, 80);
  const bigOff = BIG_KINDS.filter((kind) => Array.isArray(p.bigOff) && p.bigOff.includes(kind));
  const levelOff = LEVEL_KINDS.filter((kind) => Array.isArray(p.levelOff) && p.levelOff.includes(kind));
  const seenIds = Array.isArray(p.seen) ? [...new Set(p.seen.filter((id): id is string => typeof id === "string"))] : null;
  return { ...(title && { title }), stats, custom, skills, ...(p.look !== undefined && { look: normalizeLook(p.look) }), ...(seenIds && { seen: seenIds }), ...(p.hideDot === true && { hideDot: true }), ...(p.hideNews === true && { hideNews: true }), ...(p.soundOff === true && { soundOff: true }), ...(Array.isArray(p.learned) && { learned: [...new Set(p.learned.filter((id): id is string => typeof id === "string"))] }), ...(p.bigEvery === null && { bigEvery: null }), ...(typeof p.bigEvery === "number" && p.bigEvery >= 1 && { bigEvery: Math.floor(p.bigEvery) }), ...(bigOff.length && { bigOff }), ...(p.streakOff === true && { streakOff: true }), ...(p.milestoneOff === true && { milestoneOff: true }), ...(levelOff.length && { levelOff }), ...(isBackground(p.background) && p.background !== "default" && { background: p.background }), ...(isBarFill(p.bars) && p.bars !== "default" && { bars: p.bars }), ...(isBarFill(p.boxes) && p.boxes !== "default" && { boxes: p.boxes }), ...(p.calm === true && { calm: true }) };
}

/** A fresh id for a custom stat. */
export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
