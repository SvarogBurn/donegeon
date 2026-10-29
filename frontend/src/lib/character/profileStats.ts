import { activeDays, countByDay, deadlineOutcomes, isOnTime, periodCounts, rangeStart, streaks, type Completion, type StatTask } from "../stats";
import { levelOf } from "./levels";
import type { CustomStat, Skill, StatKey } from "./profile";
import type { StatRow } from "../../types";
import { deedsOf } from "./deeds";
import { daysProgress, type Progress } from "./unlocks";

// The numbers on the character sheet, from what the Stats page already loads (collectStats): every tick, at any depth,
// and every press of a persistent task is one task done and one exp; for the character, so is every mail sent to the
// devs. Points play no part.

export interface StatValue {
  value: number;
  /** "of 30" beside the number, where it is out of something. */
  of?: number;
  label: string;
}

export interface SheetInput {
  tasks: StatTask[];
  completions: Completion[];
  today: string;
  /** The points balance; null while it loads. */
  balance: number | null;
  /** The days the streak freeze kept the streak across (shared/health.ts). */
  frozen?: string[];
}

export function builtInStats({ tasks, completions, today, balance, frozen }: SheetInput): Record<StatKey, StatValue> {
  const byDay = countByDay(completions);
  const { current, longest } = streaks(byDay, today, frozen);
  const counts = periodCounts(byDay, today);
  const outcomes = deadlineOutcomes(tasks, today);
  return {
    streak: { value: current, label: "day streak" },
    longest: { value: longest, label: "longest streak" },
    today: { value: counts.today, label: "done today" },
    week: { value: counts.last7, label: "done in 7 days" },
    month: { value: counts.last30, label: "done in 30 days" },
    year: { value: counts.year, label: `done in ${today.slice(0, 4)}` },
    ever: { value: counts.all, label: "done ever" },
    active30: { value: activeDays(byDay, today, 30), of: 30, label: "active days" },
    points: { value: balance ?? 0, label: "points" },
    onTime: { value: outcomes.filter(isOnTime).length, of: outcomes.length, label: "deadlines met" },
    open: { value: tasks.filter((task) => task.isOpen).length, label: "open tasks" },
  };
}

/** What each built-in stat is called in the editor. */
export const STAT_NAMES: Record<StatKey, string> = {
  streak: "Day streak",
  longest: "Longest streak",
  today: "Done today",
  week: "Done in 7 days",
  month: "Done in 30 days",
  year: "Done this year",
  ever: "Done ever",
  active30: "Active days of 30",
  points: "Points",
  onTime: "Deadlines met",
  open: "Open tasks",
};

/** Whether a task counts toward a stat or skill: it is in one of its lists, or carries one of its goals or tags (its own or from a task above it). */
const matches = (task: StatTask, lists: string[], goals: string[], tags: string[]) =>
  (task.listId !== null && lists.includes(task.listId)) || task.goalIds.some((id) => goals.includes(id)) || task.tagIds.some((id) => tags.includes(id));

/** Tasks done for a stat of the user's own within its period; a task in two of its sources counts once. */
export function customStatValue(stat: CustomStat, completions: Completion[], today: string) {
  const from = rangeStart(today, stat.range);
  return completions.filter(({ day, task }) => day <= today && (!from || day >= from) && matches(task, stat.lists, stat.goals, stat.tags)).length;
}

/** A skill's exp: everything ever done in it. */
export function skillExp(skill: Skill, completions: Completion[]) {
  const sources = { lists: [] as string[], goals: [] as string[], tags: [] as string[] };
  sources[`${skill.kind}s`].push(skill.id);
  return completions.filter(({ task }) => matches(task, sources.lists, sources.goals, sources.tags)).length;
}

/** The character's own level: every task done counts, and every mail sent to the devs, less the exp knockouts took (`lost`, shared/health.ts). */
export function characterLevel(completions: Completion[], mailSent = 0, lost = 0) {
  const exp = Math.max(0, completions.length + mailSent - lost);
  return { exp, ...levelOf(exp) };
}

/** What the unlocks and titles go by (unlocks.ts): the level, the streaks, deadlines met, mail sent, the deeds (deeds.ts), and each skill's level. */
export function characterProgress({ rows, tasks, completions, today, mailSent, lost = 0, frozen, skills }: { rows: StatRow[]; tasks: StatTask[]; completions: Completion[]; today: string; mailSent: number; lost?: number; frozen?: string[]; skills: { key: string; name: string; exp: number }[] }): Progress {
  return {
    ...deedsOf({ rows, tasks, completions, today }),
    level: characterLevel(completions, mailSent, lost).level,
    ...daysProgress([...countByDay(completions).keys()], today, frozen),
    onTime: deadlineOutcomes(tasks, today).filter(isOnTime).length,
    mail: mailSent,
    skills: skills.map(({ key, name, exp }) => ({ key, name, level: levelOf(exp).level })),
  };
}
