import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { localDate } from "../../api/client";
import { useCreateTask, useToggleTask } from "../../hooks/useTasks";
import { firstLine, daysFrom, type DoneItem, type PlanItem } from "../../lib/calendar";
import { addDays, daysBetween, formatDay } from "../../lib/dates";
import { repeatLabel } from "../../lib/repeat";
import type { List } from "../../types";
import { PixelCheckbox } from "../PixelCheckbox";
import { DeadlineBadge } from "../TaskTree/DeadlineBadge";
import { useTree } from "../TaskTree/TreeContext";
import { TileFrame } from "../Tiles/TileFrame";
import { CAL_BOXES, isOpen, pickDay, useCalendar, useDayPicked, type Info } from "./calendarData";
import { TaskInfo } from "./TaskInfo";

/** How many days the row starts with before and after the day it opens on, and grows by at either end. */
const DAYS_BEFORE = 7;
const DAYS_AFTER = 27;
const MORE_DAYS = 14;
/** A day picked further than this from the days in the row starts the row afresh around it, instead of stretching to it. */
const MAX_STRETCH = 60;
/** The list the last task written into a day went to. */
const LIST_KEY = "donegeon.calendarList";
/** How far the pointer moves before a press on the row is a drag of it. */
const DRAG_PX = 5;

const CHIP = "pixel-chip px-1.5 py-0.5 text-[10px] whitespace-nowrap";

/** One thing to do on a day: ticked (or, a task on a schedule that is due, pressed) from here; its name opens more about it. */
function PlanRow({ item, today, listName, onInfo }: { item: PlanItem; today: string; listName: string | undefined; onInfo: () => void }) {
  const { node, kind, path } = item;
  const tree = useTree();
  const toggle = useToggleTask();
  const hasOpenSubtasks = !node.isComplete && node.descendantDoneCount < node.descendantCount;
  // A round that isn't due yet is only there to be seen.
  const isAhead = kind === "next" || kind === "round";
  const title = firstLine(node.title);

  return (
    <li data-plan-item={node.id} data-plan-kind={kind} className={`flex items-start gap-2 py-1.5 ${isAhead ? "opacity-60" : ""}`}>
      {kind === "due" ? (
        <button type="button" className="repeat-button" onClick={() => tree.pressTask(node)} aria-label={`Done "${title}" once more`} />
      ) : isAhead ? (
        <span className="glyph w-5 flex-none text-center text-stone-500" aria-hidden>
          ↻
        </span>
      ) : (
        <PixelCheckbox
          className={hasOpenSubtasks ? "opacity-40" : ""}
          checked={node.isComplete}
          disabled={toggle.isPending || hasOpenSubtasks}
          title={hasOpenSubtasks ? "Tick its subtasks first" : undefined}
          onChange={() => (!node.isComplete && (!node.parentId || tree.ticked === "hide") ? tree.finishTask(node) : toggle.mutate(node.id))}
          aria-label={`Mark "${title}" ${node.isComplete ? "not done" : "done"}`}
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <button
          type="button"
          data-task-name
          title="More about this task"
          onClick={onInfo}
          className={`block max-w-full cursor-pointer text-left text-sm break-words hover:underline ${node.isComplete ? "text-stone-400 line-through" : ""}`}
        >
          {title}
        </button>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
          {path.length > 0 && <span className="min-w-0 truncate">{path.join(" › ")}</span>}
          {listName && <span className="max-w-full truncate">{listName}</span>}
          {kind === "overdue" && <DeadlineBadge task={node} />}
          {kind === "overdue" && <span className="text-red-600">overdue</span>}
          {kind === "deadline" && node.deadlineType === "hard" && (
            <span className={`${CHIP} bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300`}>hard deadline</span>
          )}
          {kind === "due" && node.nextDue! < today && <span className="text-amber-700 dark:text-amber-400">due since {formatDay(node.nextDue!)}</span>}
          {(kind === "due" || isAhead) && <span>{repeatLabel(node)}</span>}
          {kind === "today" && <span className={`${CHIP} bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200`}>Today</span>}
        </p>
      </div>
    </li>
  );
}

/** The field a day's "+ Add" opens: Enter adds a task to the picked list, with that day as its soft deadline. */
function AddOnDay({ day, lists, onClose }: { day: string; lists: List[]; onClose: () => void }) {
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [listId, setListId] = useState(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LIST_KEY);
    } catch {
      // No storage: the first list it is.
    }
    return lists.some((list) => list.id === last) ? last! : lists[0].id;
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || createTask.isPending) return;
    const submitted = title;
    setTitle("");
    try {
      localStorage.setItem(LIST_KEY, listId);
    } catch {
      // Not remembered, then.
    }
    createTask.mutate({ title: submitted, listId, deadlineDate: day }, { onError: () => setTitle(submitted) });
  }

  return (
    <form onSubmit={submit} className="space-y-1.5" data-add-on={day} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <input
        autoFocus
        className="nes-input input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New task, then Enter"
        aria-label={`New task for ${formatDay(day, true)}`}
        enterKeyHint="done"
        maxLength={500}
      />
      <div className="flex items-center gap-1.5">
        <select
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          aria-label="The list it goes in"
          className="min-w-0 flex-1 border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn-quiet glyph" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {createTask.error && <p className="text-xs text-red-600">{createTask.error.message}</p>}
    </form>
  );
}

interface DayProps {
  day: string;
  today: string;
  isSelected: boolean;
  plan: PlanItem[];
  done: DoneItem[];
  lists: List[];
  onInfo: (info: Info) => void;
}

/** One day of the row: what there is to do on it (today and after), or what was done on it (before today). */
function DayColumn({ day, today, isSelected, plan, done, lists, onInfo }: DayProps) {
  const [isAdding, setIsAdding] = useState(false);
  const isPast = day < today;
  const open = plan.filter(isOpen).length;
  const taskLists = lists.filter((list) => list.kind === "task");
  const away = daysBetween(today, day);
  const listName = (id: string | null) => lists.find((list) => list.id === id)?.name;

  return (
    <section
      data-day={day}
      aria-label={formatDay(day, true)}
      className={`w-60 flex-none border-l-2 border-stone-200 px-3 pb-2 sm:w-64 dark:border-stone-800 ${isSelected ? "bg-stone-100/70 dark:bg-stone-800/40" : ""}`}
    >
      <header className="space-y-1 py-2 text-center">
        <h3 className={`text-sm ${day === today ? "text-[#3544a1] dark:text-[#cbdbfc]" : ""}`}>
          {formatDay(day, true)}
          {day.slice(0, 4) !== today.slice(0, 4) && `/${day.slice(0, 4)}`}
        </h3>
        <p className="text-xs text-stone-500" data-day-summary>
          {away === 0 ? "Today · " : away === 1 ? "Tomorrow · " : away === -1 ? "Yesterday · " : ""}
          {isPast ? `${done.length} done` : `${open} to do`}
        </p>
      </header>
      {isPast ? (
        done.length === 0 ? (
          <p className="py-2 text-center text-xs text-stone-500">Nothing ticked off</p>
        ) : (
          <ul className="border-t border-stone-200 dark:border-stone-800">
            {done.map((item) => (
              <li key={item.id} data-done-item={item.id} className="space-y-0.5 py-1.5 text-sm text-stone-500">
                <button type="button" data-task-name title="More about this task" className="block max-w-full cursor-pointer text-left break-words hover:underline" onClick={() => onInfo({ done: item, day })}>
                  <span className="glyph !text-xs">✓</span> {item.title}
                  {item.times && item.times > 1 && <span className="tabular-nums"> ×{item.times}</span>}
                </button>
                {item.path.length > 0 && <p className="truncate text-xs">{item.path.join(" › ")}</p>}
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {plan.length === 0 ? (
            <p className="py-2 text-center text-xs text-stone-500">No tasks</p>
          ) : (
            <ul className="divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              {plan.map((item) => (
                <PlanRow key={item.node.id} item={item} today={today} listName={listName(item.listId)} onInfo={() => onInfo({ plan: item, day })} />
              ))}
            </ul>
          )}
          {taskLists.length > 0 &&
            (isAdding ? (
              <div className="pt-2">
                <AddOnDay day={day} lists={taskLists} onClose={() => setIsAdding(false)} />
              </div>
            ) : (
              <button type="button" className="btn-quiet mx-auto mt-1 block" aria-label={`Add a task on ${formatDay(day, true)}`} onClick={() => setIsAdding(true)}>
                + Add
              </button>
            ))}
        </>
      )}
    </section>
  );
}

/**
 * A row of days, one column a day, that goes on without end both ways: more days come as either end is neared.
 * It has no scroll bar: it is moved with the arrows above it, by dragging it, or as any sideways scroll
 * (a swipe, a trackpad). It opens on today; a day picked in the Calendar box comes to its front.
 * A day from today on shows what there is to do on it, a day gone by what was ticked off on it.
 */
export function DaysBox() {
  const [range, setRange] = useState(() => {
    const now = localDate();
    return { from: addDays(now, -DAYS_BEFORE), to: addDays(now, DAYS_AFTER), anchor: now };
  });
  const { today, lists, isLoaded, error, doneError, planOn, doneOn } = useCalendar(range.to);
  const [selected, setSelected] = useState<string | null>(null);
  // Counts the picks, so picking the day that is already picked brings the row back to it.
  const [picks, setPicks] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const earlier = useRef<HTMLSpanElement>(null);
  const later = useRef<HTMLSpanElement>(null);
  // Set while days are being put in front of the row: how far its end was from what is on screen.
  const fromEnd = useRef<number | null>(null);
  const front = selected ?? today;

  // The clock's date can be set by hand, to a day the row doesn't hold: then it starts afresh around that day.
  useEffect(() => {
    if (range.anchor === today) return;
    setRange({ from: addDays(today, -DAYS_BEFORE), to: addDays(today, DAYS_AFTER), anchor: today });
    setPicks((n) => n + 1);
  }, [today, range.anchor]);

  useDayPicked((day) => {
    setSelected(day);
    setPicks((n) => n + 1);
    setRange((shown) => {
      if (day >= addDays(shown.from, 1) && day <= addDays(shown.to, -DAYS_BEFORE)) return shown;
      if (daysBetween(day, shown.from) > MAX_STRETCH || daysBetween(shown.to, day) > MAX_STRETCH) {
        return { ...shown, from: addDays(day, -DAYS_BEFORE), to: addDays(day, DAYS_AFTER) };
      }
      const from = addDays(day, -DAYS_BEFORE);
      const to = addDays(day, MORE_DAYS);
      return { ...shown, from: from < shown.from ? from : shown.from, to: to > shown.to ? to : shown.to };
    });
  });

  // The picked day goes to the left edge of the row: at once when the box opens, with a slide after that.
  useLayoutEffect(() => {
    const row = strip.current;
    const column = row?.querySelector<HTMLElement>(`[data-day="${front}"]`);
    if (row && column) row.scrollTo({ left: column.offsetLeft, behavior: picks === 0 ? "instant" : "smooth" });
    // Only a pick moves the row; `front` changes with it.
  }, [picks, isLoaded]);

  // Days put in front of the row would push what is on screen aside: the row is held where it was.
  useLayoutEffect(() => {
    const row = strip.current;
    if (row && fromEnd.current !== null) row.scrollLeft = row.scrollWidth - fromEnd.current;
    fromEnd.current = null;
  }, [range.from]);

  // Nearing either end of the row brings more days there.
  useEffect(() => {
    const row = strip.current;
    if (!row || !earlier.current || !later.current) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === later.current) setRange((shown) => ({ ...shown, to: addDays(shown.to, MORE_DAYS) }));
          else {
            fromEnd.current = row.scrollWidth - row.scrollLeft;
            setRange((shown) => ({ ...shown, from: addDays(shown.from, -MORE_DAYS) }));
          }
        }
      },
      { root: row, rootMargin: "0px 600px" },
    );
    seen.observe(earlier.current);
    seen.observe(later.current);
    return () => seen.disconnect();
  }, [range.from, range.to, isLoaded]);

  /** As many whole days on as the row shows at once, less one, so the eye keeps a day to hold on to. */
  function step(direction: -1 | 1) {
    const row = strip.current;
    const width = row?.querySelector<HTMLElement>("[data-day]")?.offsetWidth;
    if (!row || !width) return;
    const at = Math.round(row.scrollLeft / width);
    row.scrollTo({ left: (at + direction * Math.max(1, Math.floor(row.clientWidth / width) - 1)) * width, behavior: "smooth" });
  }

  // A mouse has nothing to swipe with: the row is dragged by any part of it that isn't a button or a field.
  function startPan(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as Element).closest("button, input, select, a, label")) return;
    const row = e.currentTarget;
    const startX = e.clientX;
    const startLeft = row.scrollLeft;
    let isPanning = false;
    const onMove = (ev: PointerEvent) => {
      if (!isPanning && Math.abs(ev.clientX - startX) < DRAG_PX) return;
      if (!isPanning) {
        isPanning = true;
        row.setPointerCapture(e.pointerId);
        row.dataset.panning = "";
      }
      row.scrollLeft = startLeft - (ev.clientX - startX);
    };
    const onEnd = () => {
      delete row.dataset.panning;
      row.removeEventListener("pointermove", onMove);
      row.removeEventListener("pointerup", onEnd);
      row.removeEventListener("pointercancel", onEnd);
    };
    row.addEventListener("pointermove", onMove);
    row.addEventListener("pointerup", onEnd);
    row.addEventListener("pointercancel", onEnd);
  }

  if (error || !isLoaded || !lists) {
    return (
      <TileFrame title={CAL_BOXES.days} aria-label="Days">
        {error ? <p className="text-sm text-red-600">Couldn't load your tasks: {error.message}</p> : <p className="text-sm text-stone-500">Loading…</p>}
      </TileFrame>
    );
  }

  return (
    <TileFrame title={CAL_BOXES.days} aria-label="Days">
      <div className="flex items-center justify-center gap-1">
        <button type="button" className="btn-quiet glyph px-3 py-1 text-2xl" aria-label="Earlier days" onClick={() => step(-1)}>
          ‹
        </button>
        <button type="button" className="btn-quiet w-24 text-center" data-days-today onClick={() => pickDay(today)}>
          Today
        </button>
        <button type="button" className="btn-quiet glyph px-3 py-1 text-2xl" aria-label="Later days" onClick={() => step(1)}>
          ›
        </button>
      </div>
      {/* Positioned, so a day's offsetLeft is its place in the row. The two ends are what the row watches to grow. */}
      <div
        ref={strip}
        data-day-strip
        onPointerDown={startPan}
        className="relative flex cursor-grab items-stretch overflow-x-auto [scrollbar-width:none] data-panning:cursor-grabbing data-panning:select-none [&::-webkit-scrollbar]:hidden"
      >
        <span ref={earlier} className="-mr-px w-px flex-none" aria-hidden />
        {daysFrom(range.from, range.to).map((day) => (
          <DayColumn key={day} day={day} today={today} isSelected={day === front} plan={planOn(day)} done={doneOn(day)} lists={lists} onInfo={setInfo} />
        ))}
        <span ref={later} className="w-px flex-none" aria-hidden />
      </div>
      {doneError && <p className="text-xs text-red-600">Couldn't load the days gone by: {doneError.message}</p>}
      {info && <TaskInfo info={info} onClose={() => setInfo(null)} />}
    </TileFrame>
  );
}
