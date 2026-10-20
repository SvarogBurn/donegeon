import { currentRound } from "../../../shared/repeat";
import type { TaskTreeNode } from "../types";
import { isPutOff, livesInToday } from "./week";

/** What dropping a task on the Week box does. */
export type WeekDrop =
  /** A task on a schedule isn't put on a day: its round planned on `from` is moved to `to`; put off past this week, it also leaves Today. */
  | { kind: "round"; from: string; to: string; leaveToday: boolean }
  /** Any other task takes a place on `day`: after `after` there (null = first), or last when `after` is left out. */
  | { kind: "place"; day: string; after?: string | null };

/**
 * Where a task dropped on the Week box goes, on `today`. `day`: the day it was dropped on. `shown`: the rows of that day
 * as shown, the dropped one left out, and `at` the place among them it was let go at; both left out when it was
 * dropped on the box as a whole, which puts it last. `round`: the round dragged, when it was one of a schedule's rows
 * in the box; from a list, it is the task's current round.
 */
export function weekDropFor(
  node: TaskTreeNode,
  drop: { day: string; shown?: string[]; at?: number },
  today: string,
  round?: string,
): WeekDrop {
  const isScheduled = node.repeatEvery !== null && node.nextDue !== null && node.weekDay === null;
  if (isScheduled) {
    // Put off to next week, it leaves Today, as placeInWeek on the server has it for a task not on a schedule.
    const leaveToday = isPutOff({ ...node, weekDay: drop.day }, today) && node.todaySince !== null && !livesInToday(node);
    return { kind: "round", from: round ?? currentRound(node, today)!.planned, to: drop.day, leaveToday };
  }
  if (!drop.shown || drop.at === undefined) return { kind: "place", day: drop.day };
  return { kind: "place", day: drop.day, after: drop.shown[drop.at - 1] ?? null };
}
