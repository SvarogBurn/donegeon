import type { HitKind, Task } from "@prisma/client";
import { HEALTH_SINCE } from "../../../shared/constants.js";
import { addDays, mondayOf } from "../../../shared/dates.js";
import { HIT_DAMAGE, healthOf, restDays, restRanges } from "../../../shared/health.js";
import { addInterval, movedDay } from "../../../shared/repeat.js";
import { prisma } from "../lib/prisma.js";
import { ancestorsOf } from "./taskTree.service.js";

/** How far back missed rounds of a schedule, and days with nothing done, are looked for: older ones were written when they were missed, or never will be. */
const ROUNDS_BACK_DAYS = 60;
/** The most rounds of one task stepped through, from its oldest still open. */
const MAX_ROUND_STEPS = 1000;

/** A row of the trees as asTrees values it: what a miss needs to know. */
export type ValuedRow = Pick<
  Task,
  "id" | "parentId" | "title" | "isComplete" | "completedOn" | "isPersistent" | "deadlineDate" | "repeatEvery" | "repeatUnit" | "nextDue" | "roundMoves"
> & { value: number; valueKind: "task" | "reward" };

export interface Miss {
  key: string;
  kind: HitKind;
  taskId: string;
  title: string;
  day: string;
  damage: number;
}

/**
 * What was missed by `today` in these trees, hitting from `since` on: deadlines gone by (hard or soft) with their task
 * still open or ticked after the day, and rounds of a schedule whose day went by without a press. Each costs half a
 * heart (HIT_DAMAGE), whatever it was worth. Reward lists cost nothing, nor a deadline under a persistent task: a press
 * unticks it, so it would look missed however it was done; nor anything missed on a rest day (`rest`).
 */
export function missesOf(rows: ValuedRow[], today: string, since: string, rest: ReadonlySet<string> = new Set()): Miss[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const misses: Miss[] = [];
  for (const task of rows) {
    if (task.valueKind === "reward") continue;
    const deadline = task.deadlineDate;
    const inRound = () => ancestorsOf(byId, task).some((above) => above.isPersistent);
    if (deadline && deadline < today && addDays(deadline, 1) >= since && (!task.isComplete || (task.completedOn ?? "") > deadline) && !rest.has(deadline) && !inRound()) {
      misses.push({ key: `deadline:${task.id}:${deadline}`, kind: "deadline", taskId: task.id, title: task.title, day: addDays(deadline, 1), damage: HIT_DAMAGE });
    }
    if (task.isPersistent && task.repeatEvery && task.nextDue) {
      const from = [since, addDays(today, -ROUNDS_BACK_DAYS)].sort()[1];
      let planned = task.nextDue;
      for (let step = 0; step < MAX_ROUND_STEPS; step++, planned = addInterval(planned, task.repeatEvery, task.repeatUnit)) {
        const day = movedDay(task, planned);
        // Rounds keep to their planned days, so once those pass today none after can have been missed (a moved one aside).
        if (planned >= today && day >= today) break;
        if (day >= today || addDays(day, 1) < from || rest.has(day)) continue;
        misses.push({ key: `round:${task.id}:${planned}`, kind: "round", taskId: task.id, title: task.title, day: addDays(day, 1), damage: HIT_DAMAGE });
      }
    }
  }
  return misses;
}

/**
 * Writes what was missed as hits, each once (a key already written is skipped): when the trees are read, so a hit
 * comes the first time the app opens after the day it was missed, and stays whatever happens to the task after.
 * Nothing while health is off, nor for days before it came in or was last switched back on, nor for rest days.
 */
export async function recordHits(owner: string, rows: ValuedRow[], today: string, user: { healthOff: boolean; healthSince: string | null; restDays: unknown }) {
  if (user.healthOff) return;
  const since = [HEALTH_SINCE, user.healthSince ?? ""].sort()[1];
  const misses = missesOf(rows, today, since, restDays(restRanges(user.restDays), addDays(today, -ROUNDS_BACK_DAYS - 1), today));
  if (misses.length === 0) return;
  await prisma.hit.createMany({ data: misses.map((miss) => ({ ...miss, userId: owner })), skipDuplicates: true });
}

/**
 * The days with nothing done from `since` (and the first day anything was done) to yesterday, 60 days back at most,
 * not yet written down, rest days left out: the streak freeze's (shared/health.ts decides which of them keep a streak, for a level).
 */
export function missedDays(done: { day: string; count: number }[], written: Set<string>, today: string, since: string, rest: ReadonlySet<string> = new Set()): string[] {
  const doneOn = new Set(done.filter(({ count }) => count > 0).map(({ day }) => day));
  const first = [...doneOn].sort()[0];
  if (!first) return [];
  const missed: string[] = [];
  for (let day = [since, addDays(first, 1), addDays(today, -ROUNDS_BACK_DAYS)].sort()[2]; day < today; day = addDays(day, 1)) {
    if (!doneOn.has(day) && !written.has(day) && !rest.has(day)) missed.push(day);
  }
  return missed;
}

/**
 * The character's health (shared/health.ts) from every hit and the exp of each day: the tasks done (`doneDays`, as
 * progressDays counts them) and the mails sent to the devs (on the day they were sent, UTC). While health and the
 * streak freeze are both on, the days with nothing done are written down first (missedDays), so the freeze can keep
 * the streak across them. Rest days cost nothing (shared/health.ts drops what was missed on them). With it the last few
 * hits, to say what cost the health, and the week before this one summed up. Hits written before 2026-11-04 cost what
 * the task was worth; they count as half a heart now, like every hit since.
 */
export async function healthFor(owner: string, doneDays: Promise<{ day: string; count: number }[]>, today: string) {
  const [stored, mails, done, user] = await Promise.all([
    prisma.hit.findMany({ where: { userId: owner }, select: { day: true, damage: true, title: true, kind: true }, orderBy: [{ day: "asc" }, { createdAt: "asc" }] }),
    prisma.feedback.findMany({ where: { userId: owner }, select: { createdAt: true } }),
    doneDays,
    prisma.user.findUniqueOrThrow({ where: { id: owner }, select: { healthOff: true, healthSince: true, freezeOff: true, freezeSince: true, restDays: true } }),
  ]);
  const rest = restDays(restRanges(user.restDays));
  const hits = stored.filter(({ kind }) => kind !== "day").map((hit) => ({ ...hit, damage: Math.min(HIT_DAMAGE, hit.damage) }));
  const missed = stored.filter(({ kind }) => kind === "day").map(({ day }) => day);
  if (!user.healthOff && !user.freezeOff) {
    const since = [HEALTH_SINCE, user.healthSince ?? "", user.freezeSince ?? ""].sort()[2];
    const fresh = missedDays(done, new Set(missed), today, since, rest);
    if (fresh.length > 0) {
      await prisma.hit.createMany({ data: fresh.map((day) => ({ userId: owner, key: `day:${day}`, kind: "day" as const, title: "", day, damage: 0 })), skipDuplicates: true });
      missed.push(...fresh);
    }
  }
  const mail = mails.map(({ createdAt }) => ({ day: createdAt.toISOString().slice(0, 10), count: 1 }));
  const week = addDays(mondayOf(today), -7);
  return { off: user.healthOff, freezeOff: user.freezeOff, rest: restRanges(user.restDays), ...healthOf({ hits, done, mail, missed, rest, week, today }), recent: hits.filter(({ day }) => !rest.has(addDays(day, -1))).slice(-5).reverse() };
}
