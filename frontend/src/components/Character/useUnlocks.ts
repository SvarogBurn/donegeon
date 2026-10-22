import { useMemo } from "react";
import { useFeedbackSent } from "../../hooks/feedback";
import { useGoals, useTags } from "../../hooks/labels";
import { useLists } from "../../hooks/lists";
import { useProgressDays, useStatRows } from "../../hooks/tasks";
import { useMe } from "../../hooks/useAuth";
import { localDate } from "../../lib/clock";
import { listColor } from "../../lib/frameTones";
import { levelOf } from "../../lib/character/levels";
import { characterLevel, characterProgress, skillExp } from "../../lib/character/profileStats";
import { normalizeProfile, type Skill } from "../../lib/character/profile";
import { unseenOf } from "../../lib/character/titles";
import { daysProgress, type Progress, type Unlocks } from "../../lib/character/unlocks";
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
 * the editor both use it. `unlocks` goes by nothing done until the tasks are in.
 */
export function useCharacterProgress() {
  const { profile, look } = useProfile();
  const { user } = useMe();
  const rows = useStatRows();
  const lists = useLists();
  const mailSent = useFeedbackSent();
  const skillName = useSkillNames();
  const today = localDate();
  const collected = useMemo(() => (rows.data && lists.data ? collectStats(rows.data, lists.data) : null), [rows.data, lists.data]);
  const mail = mailSent.data ?? 0;
  const skills = profile.skills.map((skill) => ({ key: `${skill.kind}:${skill.id}`, name: skillName(skill).name, exp: skillExp(skill, collected?.completions ?? []) }));
  const progress = collected && rows.data ? characterProgress({ ...collected, rows: rows.data, today, mailSent: mail, skills }) : null;
  const unlocks: Unlocks = { progress: progress ?? NOTHING_YET, isDev: user?.isDev ?? false, saved: look, seen: profile.seen ?? [] };
  return { collected, level: characterLevel(collected?.completions ?? [], mail), progress, unlocks, today };
}

/**
 * Whether something earned waits to be announced on the sheet, for the dot on the task bar's face. It goes by the
 * small count of tasks done per day, so only what levels, streaks and mail bring counts here; the deeds and the rest
 * show on the sheet.
 */
export function useSomethingNew(user: User) {
  const days = useProgressDays();
  const mailSent = useFeedbackSent();
  const seen = useMemo(() => normalizeProfile(user.profile).seen ?? [], [user.profile]);
  if (!days.data || mailSent.data === undefined) return false;
  const mail = mailSent.data;
  const exp = days.data.reduce((sum, { count }) => sum + count, 0) + mail;
  const { longest, current } = daysProgress(days.data.map(({ day }) => day), localDate());
  const progress: Progress = { ...NOTHING_YET, level: levelOf(exp).level, longest, current, mail };
  const { rewards, titles } = unseenOf(progress, seen);
  return rewards.length + titles.length > 0;
}
