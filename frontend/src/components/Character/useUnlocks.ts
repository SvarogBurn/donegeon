import { useMemo } from "react";
import { useFeedbackSent } from "../../hooks/feedback";
import { useGoals, useTags } from "../../hooks/labels";
import { useLists } from "../../hooks/lists";
import { useHealth, useProgressDays, useStatRows } from "../../hooks/tasks";
import { localDate } from "../../lib/clock";
import { readDevMode } from "../../lib/devMode";
import { listColor } from "../../lib/frameTones";
import { levelOf } from "../../lib/character/levels";
import { characterLevel, characterProgress, skillExp } from "../../lib/character/profileStats";
import type { Look } from "../../lib/character/bodies";
import { normalizeProfile, type Skill } from "../../lib/character/profile";
import { unseenOf } from "../../lib/character/titles";
import { daysProgress, shownLook, type Progress, type Unlocks } from "../../lib/character/unlocks";
import { collectStats } from "../../lib/stats";
import type { User } from "../../types";
import { useProfile } from "./useProfile";

/** A skill's name and bar colour: its own if given, else its list's, goal's or tag's name and its list's colour (none: the exp bar's yellow). */
export function useSkillNames() {
  const { data: lists = [] } = useLists();
  const { data: goals = [] } = useGoals();
  const { data: tags = [] } = useTags();
  return (skill: Skill): { name: string; color?: string } => {
    if (skill.kind === "list") {
      const list = lists.find((l) => l.id === skill.id);
      return { name: skill.name ?? list?.name ?? "", color: skill.color ?? (list ? listColor(list) : undefined) };
    }
    const pool = skill.kind === "goal" ? goals : tags;
    return { name: skill.name ?? pool.find((x) => x.id === skill.id)?.name ?? "", color: skill.color };
  };
}

/** Before anything has loaded: a new character. */
const NOTHING_YET: Progress = { level: 1, longest: 0, current: 0, onTime: 0, mail: 0, returned: false, skills: [], presses: 0, frogs: 0, earlyDays: 0, onTimeRun: 0, busiestDay: 0, steady: false };

/**
 * The character's numbers and what they unlock, from what the Stats page loads (every task there is): the sheet and
 * the editor both use it. `unlocks` goes by nothing done until the tasks are in. The level is less what knockouts took
 * (`health`, shared/health.ts).
 */
export function useCharacterProgress() {
  const { profile, look } = useProfile();
  const rows = useStatRows();
  const lists = useLists();
  const mailSent = useFeedbackSent();
  const health = useHealth();
  const skillName = useSkillNames();
  const today = localDate();
  const collected = useMemo(() => (rows.data && lists.data ? collectStats(rows.data, lists.data) : null), [rows.data, lists.data]);
  const mail = mailSent.data ?? 0;
  const lost = health.data?.lost ?? 0;
  const skills = profile.skills.map((skill) => ({ key: `${skill.kind}:${skill.id}`, name: skillName(skill).name, exp: skillExp(skill, collected?.completions ?? []) }));
  const progress = collected && rows.data ? characterProgress({ ...collected, rows: rows.data, today, mailSent: mail, lost, frozen: health.data?.frozen, skills }) : null;
  const unlocks: Unlocks = { progress: progress ?? NOTHING_YET, devMode: readDevMode(), saved: look, seen: profile.seen ?? [], knockedOut: Boolean(progress && lost > 0) };
  return { collected, level: characterLevel(collected?.completions ?? [], mail, lost), progress, unlocks, today, health: health.data };
}

/**
 * The level, streaks and mail for the task bar's face, from the small count of tasks done per day rather than the
 * heavy stat rows (the deeds and the rest are the sheet's), and the exp knockouts took. Null until it is in.
 */
function useBarProgress(): { progress: Progress; lost: number } | null {
  const days = useProgressDays();
  const mailSent = useFeedbackSent();
  const health = useHealth();
  if (!days.data || mailSent.data === undefined) return null;
  const mail = mailSent.data;
  const lost = health.data?.lost ?? 0;
  const exp = days.data.reduce((sum, { count }) => sum + count, 0) + mail - lost;
  const { longest, current } = daysProgress(days.data.map(({ day }) => day), localDate(), health.data?.frozen);
  return { progress: { ...NOTHING_YET, level: levelOf(exp).level, longest, current, mail }, lost };
}

/**
 * Whether something earned waits to be announced on the sheet, for the dot on the task bar's face: only what levels,
 * streaks and mail bring counts here (useBarProgress). None with the dot or the sheet's boxes switched off in Settings
 * (Profile.hideDot / hideNews).
 */
export function useSomethingNew(user: User) {
  const bar = useBarProgress();
  const profile = useMemo(() => normalizeProfile(user.profile), [user.profile]);
  if (!bar || profile.hideDot || profile.hideNews) return false;
  const { rewards, titles } = unseenOf(bar.progress, profile.seen ?? []);
  return rewards.length + titles.length > 0;
}

/** The look the task bar's face shows: as saved, less what a knockout took back (shownLook). */
export function useFaceLook(user: User, look: Look): Look {
  const bar = useBarProgress();
  const seen = useMemo(() => normalizeProfile(user.profile).seen ?? [], [user.profile]);
  const level = bar?.progress.level;
  const longest = bar?.progress.longest;
  const knockedOut = Boolean(bar && bar.lost > 0);
  return useMemo(
    () => (knockedOut && level !== undefined ? shownLook(look, { progress: { ...NOTHING_YET, level, longest: longest ?? 0 }, devMode: readDevMode(), seen, knockedOut }) : look),
    [look, level, longest, knockedOut, seen],
  );
}
