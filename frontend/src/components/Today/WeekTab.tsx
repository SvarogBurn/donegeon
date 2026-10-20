import { Fragment, useLayoutEffect, useRef } from "react";
import { useDeadlineToday } from "../../hooks/useAuth";
import { localDate } from "../../lib/clock";
import { formatDay } from "../../lib/dates";
import { livesInWeek, weekDays, weeksBetween, type WeekItem } from "../../lib/week";
import type { TaskTreeNode } from "../../types";
import { ScrollArea } from "../Calendar/dayStrip";
import { TaskForm } from "../TaskTree/TaskForm";
import { DraftRow, TaskNode } from "../TaskTree/TaskNode";
import { useDrag, useTree } from "../TaskTree/TreeContext";
import { PickedRow } from "./PickedRow";
import { TodayPoints } from "./TodayPoints";

/** How much there is to do among a day's items: what is open and not just a round still to come; a task making up rounds counts each. */
const toDo = (items: WeekItem[]) =>
  items
    .filter(({ node, auto }) => !node.isComplete && auto !== "round" && auto !== "missed" && (!node.isPersistent || auto === "due"))
    .reduce((sum, { rounds }) => sum + Math.max(1, rounds ?? 0), 0);

/** "2026-10-13" -> "Tuesday 13/10". */
const dayHeading = (day: string) => `${new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" })} ${formatDay(day)}`;

/**
 * One day of the Week tab: what is planned for it, in the user's order, and a field to add to it (today and after).
 * With `nextWeek`: the bucket after Sunday, what was put off to next week (`day` is its Monday, where it all lands).
 */
export function WeekDay({ day, items, today, nextWeek = false }: { day: string; items: WeekItem[]; today: string; nextWeek?: boolean }) {
  const { draft } = useTree();
  const isDropTarget = useDrag((state) => state.dropTarget?.kind === "weekDay" && state.dropTarget.day === day);
  const isPast = day < today;
  const heading = nextWeek ? "Next week" : dayHeading(day);
  const open = toDo(items);
  const hasDraft = draft?.weekDay === day;
  const draftAfter = (id: string | null) => hasDraft && draft.afterId === id && <DraftRow />;

  return (
    <section
      data-day={day}
      data-week-day={day}
      data-next-week={nextWeek ? "" : undefined}
      aria-label={heading}
      className={`space-y-1 pb-3 ${nextWeek ? "mt-2 border-2 border-dashed border-stone-300 px-2 dark:border-stone-700" : ""} ${isDropTarget ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}
    >
      {/* The day's name in the middle of the row, its count at the right: two equal sides keep the name centred. */}
      <header className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-2 pb-1 ${isPast ? "opacity-60" : ""}`}>
        <span className="h-0.5 bg-stone-200 dark:bg-stone-700" aria-hidden />
        <h3 className={`text-center text-sm ${day === today ? "text-[#3544a1] dark:text-[#cbdbfc]" : ""}`}>{heading}</h3>
        <span className="flex items-center gap-2">
          <span className="h-0.5 flex-1 bg-stone-200 dark:bg-stone-700" aria-hidden />
          <span className="text-xs whitespace-nowrap text-stone-500" data-day-summary>
            {day === today && "Today · "}
            {open} to do
          </span>
        </span>
      </header>
      {items.length === 0 && !hasDraft ? (
        <p className="px-1 text-xs text-stone-500">
          {nextWeek ? "Nothing put off yet. Drag a task here, or choose “Do next week” in its ⋯ menu; on Monday it is on Monday." : "No tasks"}
        </p>
      ) : (
        <ul>
          {draftAfter(null)}
          {items.map((item) => (
            <Fragment key={`${item.node.id}:${item.auto ?? ""}`}>
              {livesInWeek(item.node) && !item.auto ? (
                <TaskNode node={item.node} depth={0} inWeek />
              ) : (
                <PickedRow {...item} today={today} box="week" carried={item.auto ? 0 : weeksBetween(item.node.weekDay!, today)} />
              )}
              {draftAfter(item.node.id)}
            </Fragment>
          ))}
        </ul>
      )}
      {/* A day gone by is only there to see what is left on it; tasks are dragged on from there. */}
      {!isPast && <TaskForm editorId={`week-add:${day}`} weekDay={day} placeholder={nextWeek ? "+ Add a task for next week" : "+ Add a task"} />}
    </section>
  );
}

/**
 * The week's working set, Monday to Sunday from top to bottom, each day in the user's own order. Tasks dragged onto
 * a day or marked "Do this week" in their ⋯ menu (today, then) stay in their lists; tasks typed into a day live
 * there alone, until they are dragged to a list. What is ticked stays until the week is over; what is still open
 * then is on the new week's Monday. The week scrolls within the box, with no scroll bar, and opens on today.
 */
export function WeekTab({ tasks }: { tasks: TaskTreeNode[] }) {
  const { ticked } = useTree();
  const today = localDate();
  const deadlines = useDeadlineToday();
  const days = weekDays(tasks, today, ticked, deadlines);
  // This week's: what was put off to next week isn't left for this one.
  const left = toDo(days.filter((d) => !d.nextWeek).flatMap((d) => d.items));
  const scroll = useRef<HTMLDivElement>(null);

  // Today at the top as the tab opens (and when the clock is set to another day); the days before it are above.
  useLayoutEffect(() => {
    const area = scroll.current;
    const section = area?.querySelector<HTMLElement>(`[data-week-day="${today}"]`);
    if (area && section) area.scrollTop = section.offsetTop;
  }, [today]);

  return (
    <>
      <header className="flex flex-wrap items-center justify-end gap-2 text-xs text-stone-500">
        <span className="mr-auto tabular-nums" data-week-range>
          {formatDay(days[0].day, true)} – {formatDay(days[6].day, true)}
        </span>
        {left > 0 && <span className="tabular-nums">{left} left</span>}
        <TodayPoints />
      </header>
      <ScrollArea ref={scroll} data-week-scroll className="relative max-h-[min(70dvh,36rem)]">
        {days.map(({ day, items, nextWeek }) => (
          <WeekDay key={day} day={day} items={items} today={today} nextWeek={nextWeek} />
        ))}
      </ScrollArea>
    </>
  );
}
