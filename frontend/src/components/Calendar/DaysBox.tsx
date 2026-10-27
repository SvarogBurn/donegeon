import { addDays, daysBetween } from "../../../../shared/dates";
import { currentRound } from "../../../../shared/repeat";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { localDate } from "../../lib/clock";
import { useAddTask, useSyntaxContext } from "../../hooks/tasks";
import { daysFrom, type DoneItem, type PlanItem } from "../../lib/calendar";
import { formatDay } from "../../lib/dates";
import { repeatLabel } from "../../lib/repeat";
import { parseShortSyntax } from "../../lib/shortSyntax";
import type { List } from "../../types";
import { TickOrPress } from "../TaskTree/TickOrPress";
import { DeadlineBadge } from "../TaskTree/DeadlineBadge";
import { ShortSyntaxEditor, SyntaxChips } from "../TaskTree/ShortSyntaxEditor";
import { TileFrame } from "../Tiles/TileFrame";
import { CAL_BOXES, isOpen, LIST_KEY, pickDay, useCalendar, useDayPicked, type Info } from "./calendarData";
import { TaskInfo } from "./TaskInfo";
import { DayList, panStrip, stepStrip, STRIP } from "./dayStrip";
import { RichText } from "../RichText";
import { firstLine } from "../../lib/markup";
import { readStored, writeStored } from "../../lib/storage";

/** How many days the row starts with before and after the day it opens on, and grows by at either end. */
const DAYS_BEFORE = 7;
const DAYS_AFTER = 27;
const MORE_DAYS = 14;
/** A day picked further than this from the days in the row starts the row afresh around it, instead of stretching to it. */
const MAX_STRETCH = 60;

const CHIP = "pixel-chip px-1.5 py-0.5 text-[10px] whitespace-nowrap";

/** One thing to do on a day: ticked (or, a task on a schedule that is due, pressed) from here; its name opens more about it. */
function PlanRow({ item, today, listName, onInfo }: { item: PlanItem; today: string; listName: string | undefined; onInfo: () => void }) {
  const { node, kind, path } = item;
  // A round that isn't due yet is only there to be seen.
  const isAhead = kind === "next" || kind === "round";
  const title = firstLine(node.title);

  return (
    <li data-plan-item={node.id} data-plan-kind={kind} className={`flex items-start gap-2 py-1.5 ${isAhead ? "opacity-60" : ""}`}>
      <TickOrPress node={node} control={kind === "due" ? "press" : isAhead ? "ahead" : "tick"} />
      <div className="min-w-0 flex-1 space-y-1">
        <button
          type="button"
          data-task-name
          title="More about this task"
          onClick={onInfo}
          className={`block max-w-full cursor-pointer text-left text-sm break-words hover:underline ${node.isComplete ? "text-stone-400 line-through" : ""}`}
        >
          <RichText text={title} />
        </button>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
          {path.length > 0 && <span className="min-w-0 truncate">{path.join(" › ")}</span>}
          {listName && <span className="max-w-full truncate">{listName}</span>}
          {kind === "overdue" && <DeadlineBadge task={node} />}
          {kind === "overdue" && <span className="text-red-600">overdue</span>}
          {kind === "deadline" && node.deadlineType === "hard" && (
            <span className={`${CHIP} bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300`}>hard deadline</span>
          )}
          {kind === "due" && currentRound(node, today)!.day < today && (
            <span className="text-amber-700 dark:text-amber-400">due since {formatDay(currentRound(node, today)!.day)}</span>
          )}
          {(kind === "due" || isAhead) && <span>{repeatLabel(node)}</span>}
          {kind === "today" && <span className={`${CHIP} bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200`}>Today</span>}
        </p>
      </div>
    </li>
  );
}

/**
 * The field a day's "+ Add" opens, written in like a list's new row: Enter adds a task to the picked list, with that
 * day as its soft deadline, and leaves the field open for the next one; Enter on an empty field, or Esc, closes it.
 * Shortcuts typed into it are set on the task; a typed deadline or list is the one it gets.
 */
function AddOnDay({ day, lists, onClose }: { day: string; lists: List[]; onClose: () => void }) {
  const createTask = useAddTask();
  const ctx = useSyntaxContext();
  const [title, setTitle] = useState("");
  const [listId, setListId] = useState(() => {
    const last = readStored(LIST_KEY);
    return last && lists.some((list) => list.id === last) ? last : lists[0].id;
  });

  function submit() {
    const submitted = title.trim();
    setTitle("");
    writeStored(LIST_KEY, listId);
    createTask.mutate({ text: submitted, listId, deadlineDate: day }, { onError: () => setTitle(submitted) });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey && !title.trim())) {
      // Only the field closes, not a popup it is in.
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      submit();
    }
  }

  return (
    <div className="space-y-1.5" data-add-on={day}>
      <ShortSyntaxEditor
        autoFocus
        editorId={`add-${day}`}
        value={title}
        onChange={setTitle}
        onKeyDown={onKeyDown}
        placeholder="New task, then Enter"
        aria-label={`New task for ${formatDay(day, true)}`}
        enterKeyHint="done"
        maxLength={300}
        className="border border-dashed border-stone-300 dark:border-stone-700"
      />
      <SyntaxChips tokens={parseShortSyntax(title, ctx).tokens} />
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
    </div>
  );
}

/** What was ticked off on a day gone by; a name opens more about it. */
export function DoneList({ day, done, isWhole, onInfo, className = "" }: { day: string; done: DoneItem[]; isWhole: boolean; onInfo: (info: Info) => void; className?: string }) {
  return (
    <DayList isWhole={isWhole} className={className}>
      {done.map((item) => (
        <li key={item.id} data-done-item={item.id} className="space-y-0.5 py-1.5 text-sm text-stone-500">
          <button type="button" data-task-name title="More about this task" className="block max-w-full cursor-pointer text-left break-words hover:underline" onClick={() => onInfo({ done: item, day })}>
            <span className="glyph !text-xs">✓</span> <RichText text={item.title} />
            {item.times && item.times > 1 && <span className="tabular-nums"> ×{item.times}</span>}
          </button>
          {item.path.length > 0 && <p className="truncate text-xs">{item.path.join(" › ")}</p>}
        </li>
      ))}
    </DayList>
  );
}

interface DayProps {
  day: string;
  today: string;
  plan: PlanItem[];
  done: DoneItem[];
  lists: List[];
  onInfo: (info: Info) => void;
}

/**
 * What is on one day: what there is to do on it (today and after), or what was done on it (before today).
 * In the row it scrolls within its own height; `isWhole` shows all of it, for the Calendar box's day popup.
 * "+ Add" gives the new task a soft deadline on the day.
 */
export function DayTasks({ day, today, plan, done, lists, onInfo, isWhole = false }: DayProps & { isWhole?: boolean }) {
  const [isAdding, setIsAdding] = useState(false);
  const isPast = day < today;
  const open = plan.filter(isOpen).length;
  const taskLists = lists.filter((list) => list.kind === "task");
  const away = daysBetween(today, day);
  const listName = (id: string | null) => lists.find((list) => list.id === id)?.name;

  return (
    <>
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
          <DoneList day={day} done={done} isWhole={isWhole} onInfo={onInfo} className="border-t border-stone-200 dark:border-stone-800" />
        )
      ) : (
        <>
          {plan.length === 0 ? (
            <p className="py-2 text-center text-xs text-stone-500">No tasks</p>
          ) : (
            <DayList isWhole={isWhole} className="divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              {plan.map((item) => (
                <PlanRow key={item.node.id} item={item} today={today} listName={listName(item.listId)} onInfo={() => onInfo({ plan: item, day })} />
              ))}
            </DayList>
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
    </>
  );
}

/** One day of the row. */
function DayColumn({ isSelected, ...props }: DayProps & { isSelected: boolean }) {
  return (
    <section
      data-day={props.day}
      aria-label={formatDay(props.day, true)}
      className={`w-60 flex-none border-l-2 border-stone-200 px-3 pb-2 sm:w-64 dark:border-stone-800 ${isSelected ? "bg-stone-100/70 dark:bg-stone-800/40" : ""}`}
    >
      <DayTasks {...props} />
    </section>
  );
}

/**
 * A row of days, one column a day, that goes on without end both ways: more days come as either end is neared.
 * It has no scroll bar: it is moved with the arrows above it, by dragging it, or as any sideways scroll
 * (a swipe, a trackpad). It opens on today; a day picked in the Calendar box comes to its front.
 * A day from today on shows what there is to do on it, a day gone by what was ticked off on it;
 * a day with more than fits its height is scrolled on its own, up and down.
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
        <button type="button" className="btn-quiet glyph px-3 py-1 text-2xl" aria-label="Earlier days" onClick={() => stepStrip(strip.current, -1)}>
          ‹
        </button>
        <button type="button" className="btn-quiet w-24 text-center" data-days-today onClick={() => pickDay(today)}>
          Today
        </button>
        <button type="button" className="btn-quiet glyph px-3 py-1 text-2xl" aria-label="Later days" onClick={() => stepStrip(strip.current, 1)}>
          ›
        </button>
      </div>
      {/* Positioned, so a day's offsetLeft is its place in the row. The two ends are what the row watches to grow. */}
      <div
        ref={strip}
        data-day-strip
        onPointerDown={panStrip}
        className={STRIP}
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
