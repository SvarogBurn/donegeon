import { useState } from "react";
import { localDate } from "../../api/client";
import { addMonths, firstLine, monthOf, monthWeeks, type PlanItem } from "../../lib/calendar";
import { formatDay } from "../../lib/dates";
import { TileFrame } from "../Tiles/TileFrame";
import { CAL_BOXES, isOpen, pickDay, useCalendar, useDayPicked, type Info } from "./calendarData";
import { TaskInfo } from "./TaskInfo";
import { RichText } from "../RichText";
import { plainTitle } from "../../lib/markup";

/** How many tasks a day of the month names before it says how many more there are. */
const NAMED = 3;

// 2024-01-01 was a Monday.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "short" }));
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

const NAME = "block w-full cursor-pointer truncate px-1 py-0.5 text-left text-[10px] leading-tight hover:brightness-95";
/** A task's name in a day of the month, coloured by why it is there. */
function nameTone({ node, kind }: PlanItem) {
  if (node.isComplete) return "bg-stone-100 text-stone-400 line-through dark:bg-stone-800";
  if (kind === "overdue" || (kind === "deadline" && node.deadlineType === "hard")) return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  if (kind === "round" || kind === "next") return "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
  return "bg-[#cbdbfc] text-[#3544a1] dark:bg-[#3f3f74] dark:text-[#cbdbfc]";
}

/**
 * One month, Monday first. Each day names what is on it: what there is to do (today and after) or what was done
 * (before today); a box too narrow for names shows how many instead, filled for to do and outlined for done.
 * A click on a name opens more about that task; a click anywhere else on a day brings that day to the front of the Days box.
 */
export function MonthBox() {
  const [picked, setPicked] = useState<{ month: string; selected: string } | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [shownMonth, setShownMonth] = useState<string | null>(null);
  const today = localDate();
  // Until a month is asked for, it is the one today is in, so the box rolls over with the day.
  const month = shownMonth ?? picked?.month ?? monthOf(today);
  // The month's page reaches a week into the months either side.
  const { isLoaded, error, planOn, doneOn } = useCalendar(monthWeeks(month).at(-1)!.at(-1)!);
  const selected = picked?.selected ?? today;

  useDayPicked((day) => {
    setPicked({ month: monthOf(day), selected: day });
    setShownMonth(null);
  });

  return (
    <TileFrame title={CAL_BOXES.month} aria-label="Calendar" className="@container">
      <div className="relative flex items-center justify-center gap-1">
        <button type="button" className="btn-quiet glyph px-2 py-2 text-2xl sm:px-3" aria-label="Previous month" onClick={() => setShownMonth(addMonths(month, -1))}>
          ‹
        </button>
        <p className="w-32 text-center text-sm @xl:w-48" data-month={month} aria-live="polite">
          {monthName(month)}
        </p>
        <button type="button" className="btn-quiet glyph px-2 py-2 text-2xl sm:px-3" aria-label="Next month" onClick={() => setShownMonth(addMonths(month, 1))}>
          ›
        </button>
        <button type="button" className="btn-quiet absolute right-0" onClick={() => pickDay(today)}>
          Today
        </button>
      </div>
      {error && <p className="text-sm text-red-600">Couldn't load your tasks: {error.message}</p>}
      <div className={`grid grid-cols-7 gap-1 ${isLoaded ? "" : "opacity-50"}`} role="grid" aria-label={monthName(month)}>
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="pb-1 text-center text-xs text-stone-500" role="columnheader">
            {weekday}
          </span>
        ))}
        {monthWeeks(month)
          .flat()
          .map((day) => {
            const plan = planOn(day);
            const done = doneOn(day);
            const open = plan.filter(isOpen).length;
            const more = Math.max(plan.length + done.length - NAMED, 0);
            return (
              <div
                key={day}
                role="gridcell"
                data-cal-day={day}
                data-selected={day === selected || undefined}
                // Anywhere on the day but on a task's name.
                onClick={(e) => !(e.target as Element).closest("[data-cal-task]") && pickDay(day)}
                className={`flex min-h-12 min-w-0 cursor-pointer flex-col gap-1 border-2 p-1 text-xs hover:bg-stone-100 @xl:min-h-24 dark:hover:bg-stone-800 ${
                  day === selected ? "border-[#3544a1] dark:border-[#cbdbfc]" : "border-stone-200 dark:border-stone-800"
                } ${monthOf(day) === month ? "" : "opacity-40"}`}
              >
                <button
                  type="button"
                  aria-pressed={day === selected}
                  aria-label={`${formatDay(day, true)}${open ? `, ${open} to do` : ""}${done.length ? `, ${done.length} done` : ""}`}
                  className={`cursor-pointer self-center px-1 tabular-nums @xl:self-start ${day === today ? "bg-[#3544a1] text-white" : ""}`}
                >
                  {Number(day.slice(8))}
                </button>
                <span className="flex min-h-3 flex-wrap items-center justify-center gap-1 text-[8px] leading-none @xl:hidden">
                  {open > 0 && (
                    <span data-cal-open={open} className="bg-[#3544a1] px-1 py-0.5 text-white" title={`${open} to do`}>
                      {open}
                    </span>
                  )}
                  {done.length > 0 && (
                    <span data-cal-done={done.length} className="border border-stone-400 px-1 py-0.5 text-stone-500" title={`${done.length} done`}>
                      {done.length}
                    </span>
                  )}
                </span>
                <ul className="hidden min-w-0 space-y-0.5 @xl:block">
                  {plan.slice(0, NAMED).map((item) => (
                    <li key={item.node.id}>
                      <button type="button" data-cal-task={item.node.id} title={plainTitle(firstLine(item.node.title))} className={`${NAME} ${nameTone(item)}`} onClick={() => setInfo({ plan: item, day })}>
                        <RichText text={firstLine(item.node.title)} />
                      </button>
                    </li>
                  ))}
                  {done.slice(0, Math.max(NAMED - plan.length, 0)).map((item) => (
                    <li key={item.id}>
                      <button type="button" data-cal-task={item.id} title={plainTitle(item.title)} className={`${NAME} text-stone-500`} onClick={() => setInfo({ done: item, day })}>
                        <span className="glyph !text-[10px]">✓</span> <RichText text={item.title} />
                      </button>
                    </li>
                  ))}
                  {more > 0 && <li className="px-1 text-[10px] text-stone-500">+{more} more</li>}
                </ul>
              </div>
            );
          })}
      </div>
      {info && <TaskInfo info={info} onClose={() => setInfo(null)} />}
    </TileFrame>
  );
}
