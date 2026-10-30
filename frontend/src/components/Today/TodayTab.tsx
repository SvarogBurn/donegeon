import { useEffect, useState } from "react";
import { useDeadlineToday } from "../../hooks/useAuth";
import { localDate } from "../../lib/clock";
import { readNotToday, saveNotToday } from "../../lib/notifications";
import { isOwnToday, livesInToday, todayItems, weekDays } from "../../lib/week";
import type { TaskTreeNode } from "../../types";
import { TaskForm } from "../TaskTree/TaskForm";
import { TaskTree } from "../TaskTree/TaskNode";
import { useTree } from "../TaskTree/TreeContext";
import { PickedRow } from "./PickedRow";
import { TodayPoints } from "./TodayPoints";
import { WeekDay } from "./WeekTab";

export function TodayTab({ tasks }: { tasks: TaskTreeNode[] }) {
  const { ticked } = useTree();
  const today = localDate();
  const deadlines = useDeadlineToday();
  // What came in by itself and was taken out for the day, on this device.
  const [notToday, setNotToday] = useState(() => readNotToday(today));
  useEffect(() => setNotToday(readNotToday(today)), [today]);
  const items = todayItems(tasks, today, ticked, deadlines).filter((item) => !(item.auto && notToday.has(item.node.id)));
  const takeOut = (id: string) => {
    const next = new Set([...notToday, id]);
    setNotToday(next);
    saveNotToday(today, next);
  };
  // Written straight into Today: there on the day it is marked for, or its round is due, and for the rest of a day it
  // was done on; left open, the bell asks about it after (not a round: that stays here until it is done).
  const doneToday = (task: TaskTreeNode) => ticked !== "hide" && (task.isComplete ? task.completedOn === today : task.completions.some((press) => press.day === today));
  const own = tasks.filter((task) => livesInToday(task) && (doneToday(task) || (!task.isComplete && isOwnToday(task, today))));
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
              <PickedRow
                key={item.node.id}
                {...item}
                today={today}
                box="today"
                dueSince={item.auto === "due" && item.since < today ? item.since : undefined}
                onNotToday={() => takeOut(item.node.id)}
              />
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
