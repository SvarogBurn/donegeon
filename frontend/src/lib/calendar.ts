import { addDays } from "./dates";
import { addInterval, isDue } from "./repeat";
import { hasTaskPage } from "./taskPage";
import type { StatRow, TaskTreeNode } from "../types";
import { plainTitle } from "./markup";

/**
 * Why a task is on a day: its deadline is that day; its deadline has passed (shown on today);
 * a task on a schedule is due (today) or due next (that day); a later round of a schedule, worked out
 * ahead; or it is marked for Today.
 */
export type PlanKind = "deadline" | "overdue" | "due" | "next" | "round" | "today";

export interface PlanItem {
  node: TaskTreeNode;
  kind: PlanKind;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
  /** The list its main task is in; null for one that lives only in Today. */
  listId: string | null;
  /** The big task whose page the row opens: the item itself, or the nearest one it sits under. Null = none. */
  pageId: string | null;
}

/** Something ticked or pressed on a day gone by. */
export interface DoneItem {
  id: string;
  title: string;
  path: string[];
  /** A persistent task: how often it was pressed that day. */
  times?: number;
}

export const firstLine = (title: string) => title.split("\n")[0];

/** "2026-10-09" -> "2026-10". */
export const monthOf = (day: string) => day.slice(0, 7);

/** "2026-10", 1 -> "2026-11". */
export function addMonths(month: string, months: number) {
  return monthOf(addInterval(`${month}-01`, months, "month"));
}

/** The weeks a month's page shows, Monday first, filled out with the days of the months either side. */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weeks: string[][] = [];
  for (let start = addDays(first, -weekday); weeks.length === 0 || monthOf(start) === month; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

/** Every day from `from` to `to`, both included. */
export function daysFrom(from: string, to: string) {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * What there is to do, by day, from today to `until`: tasks on the day of their deadline (those whose
 * deadline has passed, on today), tasks on a schedule on the day they are due and on the rounds after it,
 * and on today whatever is marked for Today. A task is on a day once, for the first of these that holds.
 * A ticked task stays on its day as long as the lists still show it; nothing is on a day before today.
 */
export function planByDay(trees: TaskTreeNode[], today: string, until: string): Map<string, PlanItem[]> {
  const days = new Map<string, PlanItem[]>();
  const put = (day: string, item: PlanItem) => {
    if (day < today || day > until) return;
    days.set(day, [...(days.get(day) ?? []), item]);
  };
  const visit = (nodes: TaskTreeNode[], path: string[], listId: string | null, abovePageId: string | null) => {
    for (const node of nodes) {
      const isMain = path.length === 0;
      const inList = isMain ? node.listId : listId;
      const pageId = hasTaskPage(node) ? node.id : abovePageId;
      const item = { node, path, listId: inList, pageId };
      if (node.deadlineDate) {
        const isOverdue = node.deadlineDate < today && !node.isComplete;
        put(isOverdue ? today : node.deadlineDate, { ...item, kind: isOverdue ? "overdue" : "deadline" });
      } else if (isMain && node.nextDue && node.repeatEvery) {
        const first = isDue(node, today) ? today : node.nextDue;
        put(first, { ...item, kind: first === today ? "due" : "next" });
        for (let day = addInterval(first, node.repeatEvery, node.repeatUnit); day <= until; day = addInterval(day, node.repeatEvery, node.repeatUnit)) {
          put(day, { ...item, kind: "round" });
        }
      } else if (node.todaySince !== null && (!node.isComplete || node.completedOn === today)) {
        put(today, { ...item, kind: "today" });
      }
      // Subtasks left open inside a finished main task went to the Done page with it.
      if (!(isMain && node.isComplete)) visit(node.children, [...path, plainTitle(firstLine(node.title))], inList, pageId);
    }
  };
  visit(trees, [], null, null);
  // Open ones first, the rounds worked out ahead last.
  const rank = (item: PlanItem) => (item.kind === "round" ? 2 : Number(item.node.isComplete));
  for (const items of days.values()) items.sort((a, b) => rank(a) - rank(b));
  return days;
}

/** What was ticked or pressed, by day, over every task there is. */
export function doneByDay(rows: StatRow[]): Map<string, DoneItem[]> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathOf = (row: StatRow) => {
    const path: string[] = [];
    for (let above = row.parentId && byId.get(row.parentId); above; above = above.parentId && byId.get(above.parentId)) {
      path.unshift(plainTitle(firstLine(above.title)));
    }
    return path;
  };
  const days = new Map<string, DoneItem[]>();
  const put = (day: string, item: DoneItem) => days.set(day, [...(days.get(day) ?? []), item]);
  for (const row of rows) {
    const title = firstLine(row.title);
    if (row.isComplete && row.completedOn) put(row.completedOn, { id: row.id, title, path: pathOf(row) });
    const presses = new Map<string, number>();
    for (const day of row.pressDays) presses.set(day, (presses.get(day) ?? 0) + 1);
    for (const [day, times] of presses) put(day, { id: row.id, title, path: [], times });
  }
  return days;
}
