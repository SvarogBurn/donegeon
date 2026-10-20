import { daysBetween } from "../../../../shared/dates";
import { currentRound } from "../../../../shared/repeat";
import { useDeadlineToday } from "../../hooks/useAuth";
import { localDate } from "../../lib/clock";
import { deadlineTodayFrom } from "../../lib/deadlines";
import { plainFirstLine } from "../../lib/markup";
import { isDue } from "../../lib/repeat";
import { isPutOff, livesInToday, weekDays } from "../../lib/week";
import type { DeadlineToday, TaskTreeNode, TickedTasks } from "../../types";
import { TaskForm } from "../TaskTree/TaskForm";
import { TaskTree } from "../TaskTree/TaskNode";
import { useTree } from "../TaskTree/TreeContext";
import { PickedRow } from "./PickedRow";
import { TodayPoints } from "./TodayPoints";
import { WeekDay } from "./WeekTab";

interface TodayItem {
  node: TaskTreeNode;
  /** The day it came into Today: marked for it, due (a task on a schedule), or its deadline near. */
  since: string;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
}

/**
 * Everything from the lists that is marked for Today, at any depth, plus the tasks (any depth) on a
 * schedule that are due and, if the user chose so, the tasks whose deadline is near (`deadlines`): those come in by
 * themselves and leave when done. Open items stay from day to day;
 * a ticked one stays for the rest of the day it was ticked on (or goes at once, if the user chose to hide
 * ticked tasks). Subtasks left open inside a finished main task went to the Done page with it. What was put off to
 * next week isn't for today, whatever would bring it in (its subtasks still can be).
 */
function todayItems(trees: TaskTreeNode[], today: string, ticked: TickedTasks, deadlines: DeadlineToday): TodayItem[] {
  const found: TodayItem[] = [];
  const visit = (nodes: TaskTreeNode[], path: string[], rootFinished: boolean) => {
    for (const node of nodes) {
      const shown = node.isComplete ? ticked !== "hide" && node.completedOn === today : !rootFinished;
      const fromDeadline = deadlineTodayFrom(node, deadlines);
      const since = node.todaySince ?? (isDue(node, today) ? currentRound(node, today)!.day : null) ?? (fromDeadline !== null && fromDeadline <= today ? fromDeadline : null);
      if (since !== null && shown && !livesInToday(node) && !isPutOff(node, today)) found.push({ node, since, path });
      visit(node.children, [...path, plainFirstLine(node.title)], rootFinished || (path.length === 0 && node.isComplete));
    }
  };
  visit(trees, [], false);
  // Longest-waiting first; ticked ones under the open ones, unless the user chose to leave them where they are.
  const tickedLast = (item: TodayItem) => Number(ticked === "bottom" && item.node.isComplete);
  return found.sort((a, b) => tickedLast(a) - tickedLast(b) || a.since.localeCompare(b.since));
}

export function TodayTab({ tasks }: { tasks: TaskTreeNode[] }) {
  const { ticked } = useTree();
  const today = localDate();
  const deadlines = useDeadlineToday();
  const items = todayItems(tasks, today, ticked, deadlines);
  const own = tasks.filter((task) => livesInToday(task) && (!task.isComplete || (ticked !== "hide" && task.completedOn === today)));
  const left = [...items.map((item) => item.node), ...own].filter((node) => !node.isComplete && !node.isPersistent).length;
  // Under the day's tasks, the bin of what was put off to next week, as at the bottom of the Week tab.
  const putOff = weekDays(tasks, today, ticked, deadlines).find((day) => day.nextWeek)!;

  return (
    <>
      <header className="flex flex-wrap items-center justify-end gap-2 text-xs text-stone-500">
        {items.length + own.length > 0 && <span className="tabular-nums">{left} left</span>}
        <TodayPoints />
      </header>
      {items.length + own.length === 0 && (
        <p className="px-1 text-sm text-stone-500">
          Nothing picked for today. Drag a task here by its ⠿ handle, or choose “Do today” in its ⋯ menu; it stays in its list.
        </p>
      )}
      {/* On a phone the tasks are capped in height and scroll inside the box (index.css .box-scroll). */}
      <div className="box-scroll space-y-3" data-box-scroll>
        {items.length > 0 && (
          <ul>
            {items.map((item) => (
              <PickedRow key={item.node.id} {...item} today={today} box="today" carried={daysBetween(item.since, today)} />
            ))}
          </ul>
        )}
        <div data-today-own>
          <TaskTree nodes={own} parentId={null} listId={null} />
        </div>
      </div>
      <TaskForm editorId="today-add" placeholder="Add a task just for today, then press Enter" />
      <WeekDay day={putOff.day} items={putOff.items} today={today} nextWeek />
    </>
  );
}
