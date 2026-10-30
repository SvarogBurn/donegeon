import { addDays, mondayOf } from "../../../shared/dates";
import { addInterval, currentRound, movedDay } from "../../../shared/repeat";
import type { DeadlineToday, TaskTreeNode, TickedTasks } from "../types";
import { deadlineTodayFrom } from "./deadlines";
import { isDue, roundsDue } from "./repeat";
import { plainFirstLine, plainTitle } from "./markup";

/** Monday to Sunday of the week `day` is in. */
export const daysOfWeek = (day: string) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(day), i));

/**
 * A main task with no list was written straight into the Today box, or into a day of the Week box, and lives
 * there alone until it is dragged into a list. One planned for a day of the week lives in Week (it may be in Today too).
 */
export const livesInWeek = (node: TaskTreeNode) => !node.parentId && !node.listId && node.weekDay !== null;
export const livesInToday = (node: TaskTreeNode) => !node.parentId && !node.listId && node.weekDay === null;

/**
 * Marked for Today on `day`. A task is marked for one day: a mark left from a day gone by is not carried on, the
 * bell asks about it (see leftUndone); one for a day to come brings it into Today then.
 */
export const isMarkedFor = (node: TaskTreeNode, day: string) => node.todaySince === day;

/**
 * Written straight into Today and to do on `day`: marked for it, or on a schedule with its round due. It has no list
 * to wait in, so a task done every day comes back here by itself, as one from a list comes into Today.
 */
export const isOwnToday = (node: TaskTreeNode, day: string) => livesInToday(node) && (isMarkedFor(node, day) || isDue(node, day));

/** Put off to next week (or later) in the Week box: it is not for today, whatever else would bring it into Today. */
export const isPutOff = (node: TaskTreeNode, today: string) => node.weekDay !== null && node.weekDay >= addDays(mondayOf(today), 7);

/** The day of this week (`today`'s) a task in Week is shown on: its own, or Monday for one still open from a week before. */
export const weekColumn = (node: TaskTreeNode, today: string) => {
  const monday = mondayOf(today);
  return node.weekDay! < monday ? monday : node.weekDay!;
};

/**
 * Why a task is on a day of the week by itself, not put there: its deadline is that day (or passed before the
 * week began: Monday); a task on a schedule is due (its oldest open round) or has a round that day still to come;
 * or, on Monday, a reminder that a round of it was missed in an earlier week and dropped (nothing to do about it).
 */
export type WeekAuto = "deadline" | "due" | "round" | "missed";

export interface WeekItem {
  node: TaskTreeNode;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
  /** Here by itself; absent = put here by the user, and in their order. */
  auto?: WeekAuto;
  /** A round of its schedule was missed in a week before this one: flagged with a red "!". */
  missed?: boolean;
  /** How many of its rounds are to be done, for a task that makes up missed rounds. */
  rounds?: number;
  /** A round of a task on a schedule: the day it was planned on (it may be shown on another, if it was moved). */
  round?: string;
}

/** A day of the Week box and what it shows; `nextWeek` = the bucket after Sunday, for the week after (its Monday is `day`). */
export interface WeekDayItems {
  day: string;
  items: WeekItem[];
  nextWeek?: boolean;
}

/**
 * What each day of this week shows in the Week box, Monday to Sunday, and then the bucket for next week. First what
 * comes in by itself, as tasks come into Today: tasks on a schedule, on the day of their round (see currentRound)
 * and greyed on the days of their later rounds, each round where it was moved to if it was (into the bucket too), and
 * flagged with a red "!" on Monday when a round was missed in an earlier week: one that makes up missed rounds is due
 * there, one that skips them has only the reminder there and is on its planned days as ever; and, if the user chose
 * that deadlines come into Today, tasks on the day of their deadline (Monday, if it passed before the week began).
 * Then everything the user planned for a day, in their order for it, and in the bucket what they put off to next
 * week. A ticked task stays on its day until the week is over (or goes at once, if the user chose to hide ticked
 * tasks); one still open stays on its day, and once the week is over it isn't carried on to the next: the bell asks
 * when to do it (see leftUndone). Subtasks left open inside a finished main task went to the Done page with it.
 */
export function weekDays(trees: TaskTreeNode[], today: string, ticked: TickedTasks, deadlines: DeadlineToday): WeekDayItems[] {
  const days = daysOfWeek(today);
  const [monday, sunday] = [days[0], days[6]];
  const nextMonday = addDays(monday, 7);
  const byDay = new Map([...days, nextMonday].map((day) => [day, [] as WeekItem[]]));
  // Before this week: on Monday. After it: in the bucket, which only gets what the user put there.
  const put = (day: string, item: WeekItem) => byDay.get(day < monday ? monday : day > sunday ? nextMonday : day)!.push(item);
  const visit = (nodes: TaskTreeNode[], path: string[], rootFinished: boolean) => {
    for (const node of nodes) {
      const item = { node, path };
      const shown = node.isComplete ? ticked !== "hide" && node.completedOn !== null && node.completedOn >= monday : !rootFinished;
      if (node.weekDay !== null) {
        if (shown && node.weekDay >= monday) put(node.weekDay, item);
      } else if (node.repeatEvery && node.nextDue) {
        const round = currentRound(node, today)!;
        const missed = round.missed || round.day < monday;
        const isMoved = (planned: string) => node.roundMoves?.[planned] !== undefined;
        // A dropped round that would have been Monday's anyway is flagged there, on the round itself.
        if (round.missed && round.day !== monday) put(monday, { ...item, auto: "missed", missed: true });
        if (round.day <= sunday || isMoved(round.planned)) {
          put(round.day, { ...item, auto: round.day <= today ? "due" : "round", missed: missed && round.day <= monday, rounds: roundsDue(node, today), round: round.planned });
        }
        for (let planned = addInterval(round.planned, node.repeatEvery, node.repeatUnit); planned <= sunday; planned = addInterval(planned, node.repeatEvery, node.repeatUnit)) {
          // Rounds on days gone by, or today, are in the due one's count (making up) or skipped.
          const at = movedDay(node, planned);
          if (at > today) put(at, { ...item, auto: "round", round: planned });
        }
      } else if (node.deadlineDate && node.deadlineDate <= sunday && deadlineTodayFrom(node, deadlines) !== null && shown && !(node.isComplete && node.deadlineDate < monday)) {
        put(node.deadlineDate, { ...item, auto: "deadline" });
      }
      visit(node.children, [...path, plainTitle(node.title.split("\n")[0])], rootFinished || (path.length === 0 && node.isComplete));
    }
  };
  visit(trees, [], false);
  // What came by itself first (the due ones, then deadlines, then rounds to come), then the user's order; ticked
  // ones under the open ones, unless the user chose to leave them where they are.
  const AUTO_RANK = { missed: 0, due: 0, deadline: 1, round: 2 };
  const rank = (item: WeekItem) => (item.auto ? AUTO_RANK[item.auto] : 3);
  const tickedLast = (item: WeekItem) => Number(ticked === "bottom" && item.node.isComplete);
  return [...days, nextMonday].map((day) => ({
    day,
    items: byDay.get(day)!.sort((a, b) => tickedLast(a) - tickedLast(b) || rank(a) - rank(b) || a.node.weekPosition - b.node.weekPosition),
    ...(day === nextMonday && { nextWeek: true }),
  }));
}

export interface TodayItem {
  node: TaskTreeNode;
  /** The day it came into Today: marked for it (today), due (a task on a schedule), or its deadline near. */
  since: string;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
  /** Here by itself, not marked for today: a round due, or its deadline near. Taken out for the day per device (see notToday). */
  auto?: "due" | "deadline";
}

/**
 * Everything from the lists that is marked for today, at any depth, plus the tasks (any depth) on a
 * schedule that are due and, if the user chose so, the tasks whose deadline is near (`deadlines`): those come in by
 * themselves and leave when done. A mark isn't carried on: what was marked for a day gone by and left open is in the
 * bell instead (see leftUndone), until the user says when to do it. A ticked one stays for the rest of the day it was ticked on (or goes at once, if the user chose to hide
 * ticked tasks). Subtasks left open inside a finished main task went to the Done page with it. What was put off to
 * next week isn't for today, whatever would bring it in (its subtasks still can be).
 */
export function todayItems(trees: TaskTreeNode[], today: string, ticked: TickedTasks, deadlines: DeadlineToday): TodayItem[] {
  const found: TodayItem[] = [];
  const visit = (nodes: TaskTreeNode[], path: string[], rootFinished: boolean) => {
    for (const node of nodes) {
      const shown = node.isComplete ? ticked !== "hide" && node.completedOn === today : !rootFinished;
      const fromDeadline = deadlineTodayFrom(node, deadlines);
      const due = isDue(node, today) ? currentRound(node, today)!.day : null;
      const near = fromDeadline !== null && fromDeadline <= today ? fromDeadline : null;
      const marked = isMarkedFor(node, today);
      const auto = marked ? undefined : due !== null ? "due" : near !== null ? "deadline" : undefined;
      const since = marked ? today : (due ?? near);
      if (since !== null && shown && !livesInToday(node) && !isPutOff(node, today)) found.push({ node, since, path, ...(auto && { auto }) });
      visit(node.children, [...path, plainFirstLine(node.title)], rootFinished || (path.length === 0 && node.isComplete));
    }
  };
  visit(trees, [], false);
  // Longest-waiting first; ticked ones under the open ones, unless the user chose to leave them where they are.
  const tickedLast = (item: TodayItem) => Number(ticked === "bottom" && item.node.isComplete);
  return found.sort((a, b) => tickedLast(a) - tickedLast(b) || a.since.localeCompare(b.since));
}
