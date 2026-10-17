import { Fragment, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { localDate } from "../../api/client";
import { PixelCheckbox } from "../PixelCheckbox";
import { useDeadlineToday } from "../../hooks/useAuth";
import { usePoints, useSetToday, useSetTodayPoints, useSetWeek } from "../../hooks/useTasks";
import { daysBetween, formatDay } from "../../lib/dates";
import { deadlineTodayFrom } from "../../lib/deadlines";
import { pointsFieldWidth, typedPoints } from "../../lib/points";
import { currentRound, isDue } from "../../lib/repeat";
import { hasTaskPage } from "../../lib/taskPage";
import { livesInToday, livesInWeek, weekDays, weeksBetween, type WeekAuto, type WeekItem } from "../../lib/week";
import { repeatLabel } from "../../lib/repeat";
import { DeadlineBadge } from "../TaskTree/DeadlineBadge";
import type { DeadlineToday, TaskTreeNode, TickedTasks } from "../../types";
import { ValueChip } from "../Points/ValueChip";
import { PressCopies } from "../TaskTree/PressCopies";
import { TaskForm } from "../TaskTree/TaskForm";
import { DraftRow, DROP_STYLES, TaskNode, TaskTree } from "../TaskTree/TaskNode";
import { useTree } from "../TaskTree/TreeContext";
import { TileFrame } from "../Tiles/TileFrame";
import { ScrollArea } from "../Calendar/dayStrip";
import { RichText } from "../RichText";
import { plainTitle } from "../../lib/markup";

interface TodayItem {
  node: TaskTreeNode;
  /** The day it came into Today: marked for it, due (a task on a schedule), or its deadline near. */
  since: string;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
  /** The big task whose page a click on the row opens: the item itself, or else the nearest one it sits under. Null = none. */
  pageId: string | null;
}

const firstLine = (title: string) => title.split("\n")[0];

/**
 * Everything from the lists that is marked for Today, at any depth, plus the main tasks on a
 * schedule that are due and, if the user chose so, the tasks whose deadline is near (`deadlines`): those come in by
 * themselves and leave when done. Open items stay from day to day;
 * a ticked one stays for the rest of the day it was ticked on (or goes at once, if the user chose to hide
 * ticked tasks). Subtasks left open inside a finished main task went to the Done page with it.
 */
function todayItems(trees: TaskTreeNode[], today: string, ticked: TickedTasks, deadlines: DeadlineToday): TodayItem[] {
  const found: TodayItem[] = [];
  const visit = (nodes: TaskTreeNode[], path: string[], rootFinished: boolean, abovePageId: string | null) => {
    for (const node of nodes) {
      const pageId = hasTaskPage(node) ? node.id : abovePageId;
      const shown = node.isComplete ? ticked !== "hide" && node.completedOn === today : !rootFinished;
      const fromDeadline = deadlineTodayFrom(node, deadlines);
      const since = node.todaySince ?? (path.length === 0 && isDue(node, today) ? currentRound(node, today)!.day : null) ?? (fromDeadline !== null && fromDeadline <= today ? fromDeadline : null);
      if (since !== null && shown && !livesInToday(node)) found.push({ node, since, path, pageId });
      visit(node.children, [...path, plainTitle(firstLine(node.title))], rootFinished || (path.length === 0 && node.isComplete), pageId);
    }
  };
  visit(trees, [], false, null);
  // Longest-waiting first; ticked ones under the open ones, unless the user chose to leave them where they are.
  const tickedLast = (item: TodayItem) => Number(ticked === "bottom" && item.node.isComplete);
  return found.sort((a, b) => tickedLast(a) - tickedLast(b) || a.since.localeCompare(b.since));
}

interface PickedRowProps {
  node: TaskTreeNode;
  path: string[];
  pageId: string | null;
  today: string;
  /** Which tab it is shown in: Today rows keep their order (longest-waiting first), Week rows are dragged into theirs, and to other days. */
  box: "today" | "week";
  /** Days in Today, or weeks in Week, it has been waiting. */
  carried: number;
  /** In Week: here by itself (see WeekItem), so it has no × or handle; it leaves by being done. */
  auto?: WeekAuto;
  missed?: boolean;
  rounds?: number;
  /** One round of a task on a schedule: the day it was planned on. Dragging the row moves only that round. */
  round?: string;
}

/** A task from a list shown in Today or Week: it is only shown here, and taken out with ×, the task itself staying where it is. */
function PickedRow({ node, path, pageId, today, box, carried, auto, missed = false, rounds = 0, round }: PickedRowProps) {
  const tree = useTree();
  const navigate = useNavigate();
  const setToday = useSetToday();
  const setWeek = useSetWeek();
  const isPersistent = node.isPersistent && !node.parentId;
  const pressedToday = node.completions.filter((press) => press.day === today).length;
  const error = setToday.error ?? setWeek.error;
  const hasOpenSubtasks = !node.isComplete && node.descendantDoneCount < node.descendantCount;
  const hasChildren = node.children.length > 0;
  const inWeek = box === "week";
  // A round of a schedule still to come: only there to be seen, nothing to press yet.
  const isAhead = auto === "round";
  // A reminder on Monday that a round was missed in an earlier week and dropped: nothing to do about it.
  const isReminder = auto === "missed";
  const target = tree.dropTarget;
  const drop = inWeek && target?.kind === "weekItem" && target.id === node.id ? target.zone : null;
  // Subtasks start hidden behind the row's arrow, as in a list.
  const [isOpen, setIsOpen] = useState(false);

  // As in a list, a click on the row (not on one of its buttons) opens the big task's page. A task that is not
  // part of a big one has no page: the click shows or hides its subtasks instead.
  function onRowClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("button, input, a, label")) return;
    if (pageId) navigate(`/tasks/${pageId}`);
    else if (hasChildren) setIsOpen(!isOpen);
  }

  const name = plainTitle(firstLine(node.title));
  return (
    <li
      data-today-item={inWeek ? undefined : node.id}
      // What came into Week by itself has no place in the user's order to drop next to.
      data-week-item={inWeek && !auto ? node.id : undefined}
      data-week-auto={auto}
      data-auto-id={auto ? node.id : undefined}
      className={tree.draggingId === node.id ? "opacity-40" : isAhead ? "opacity-60" : ""}
    >
      <div
        onClick={onRowClick}
        data-opens={pageId ?? undefined}
        data-week-row={inWeek ? "" : undefined}
        className={`flex ${pageId || hasChildren ? "cursor-pointer" : ""} flex-wrap items-center gap-x-2 gap-y-1 rounded px-1 py-0.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 ${drop ? DROP_STYLES[drop] : ""}`}
      >
        <button
          type="button"
          className="task-arrow"
          onClick={() => setIsOpen(!isOpen)}
          disabled={!hasChildren}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Collapse subtasks" : "Expand subtasks"}
        />
        {isAhead ? (
          <span className="glyph w-5 flex-none text-center text-stone-500" title={`Repeats ${repeatLabel(node)}`} aria-hidden>
            ↻
          </span>
        ) : isReminder ? (
          <span className="w-5 flex-none" aria-hidden />
        ) : isPersistent ? (
          <button
            type="button"
            className="repeat-button"
            onClick={() => tree.pressTask(node)}
            disabled={tree.isBusy(node.id)}
            aria-label={`Done "${plainTitle(node.title)}" once more`}
          />
        ) : (
          <PixelCheckbox
            className={hasOpenSubtasks ? "opacity-40" : ""}
            checked={node.isComplete}
            disabled={tree.isBusy(node.id) || hasOpenSubtasks}
            title={hasOpenSubtasks ? "Tick its subtasks first" : undefined}
            onChange={() => tree.tick(node)}
            aria-label={`Mark "${plainTitle(node.title)}" ${node.isComplete ? "not done" : "done"}`}
          />
        )}
        {missed && (
          <span className="flex-none font-bold text-red-600" data-missed title="A round of this was missed in an earlier week">
            !
          </span>
        )}
        {/* A day of the week is narrow: the title wraps there rather than being cut short, and the buttons go under it. */}
        <span className={`min-w-0 ${inWeek ? "min-w-32 flex-1 break-words" : "truncate"} ${node.isComplete ? "text-stone-400 line-through" : ""}`}><RichText text={firstLine(node.title)} /></span>
        {path.length > 0 && <span className="min-w-0 shrink-[2] truncate text-stone-500">{path.join(" › ")}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {isPersistent && pressedToday > 0 && !isAhead && <span className="text-xs text-stone-500 tabular-nums">×{pressedToday} today</span>}
          {rounds > 1 && (
            <span
              data-rounds={rounds}
              title="Rounds missed are made up: each press does the oldest"
              className="pixel-chip bg-red-100 px-2 py-0.5 text-xs whitespace-nowrap text-red-800 dark:bg-red-950 dark:text-red-300"
            >
              ×{rounds} to do
            </span>
          )}
          {auto === "deadline" && <DeadlineBadge task={node} />}
          {isReminder && (
            <span
              title="It doesn't have to be made up: it is on its planned days this week as ever"
              className="pixel-chip bg-red-100 px-2 py-0.5 text-xs whitespace-nowrap text-red-800 dark:bg-red-950 dark:text-red-300"
            >
              not done since {formatDay(node.nextDue!)}
            </span>
          )}
          {carried > 0 && !node.isComplete && (
            <span
              data-carried={carried}
              className="pixel-chip bg-amber-100 px-2 py-0.5 text-xs whitespace-nowrap text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            >
              carried over {carried} {inWeek ? (carried === 1 ? "week" : "weeks") : carried === 1 ? "day" : "days"}
            </span>
          )}
          <ValueChip node={node} />
          {/* The reminder of a dropped round has nothing to move. */}
          {inWeek && isReminder ? null : inWeek ? (
            <>
              {/* What came in by itself leaves by being done; only what the user put here is taken out by hand. */}
              {!auto && (
                <button
                  type="button"
                  className="btn-quiet glyph"
                  aria-label={`Take "${name}" out of Week`}
                  title="Take out of Week (the task itself stays where it is)"
                  onClick={() => setWeek.mutate({ id: node.id, week: false })}
                >
                  ×
                </button>
              )}
              <button
                type="button"
                className="btn-quiet cursor-grab touch-none glyph select-none active:cursor-grabbing"
                onPointerDown={(e) => tree.startDrag(e, node, round)}
                aria-label={round ? "Drag this round to another day" : "Drag to reorder the week"}
                title={
                  round
                    ? "Drag this round to another day of the week, or to next week; the rounds after it keep their days"
                    : "Drag to another place or day of the week, to next week, or onto the Today tab to do it today too"
                }
              >
                ⠿
              </button>
            </>
          ) : (
            // A task that is here because it is due, or its deadline near, leaves by being done, not by hand.
            <button
              type="button"
              className="btn-quiet glyph disabled:invisible"
              disabled={node.todaySince === null}
              aria-label={`Take "${name}" out of Today`}
              title="Take out of Today (the task itself stays where it is)"
              onClick={() => setToday.mutate({ id: node.id, today: false })}
            >
              ×
            </button>
          )}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error.message}</p>}
      {!isAhead && !isReminder && <PressCopies node={node} />}
      {/* The subtasks as they are in the task's list: ticked, renamed and added to from here. */}
      {hasChildren && isOpen && (
        <div className="ml-3 border-l border-stone-200 pl-3 dark:border-stone-800" data-today-subtasks>
          <TaskTree nodes={node.children} parentId={node.id} listId={null} depth={path.length + 1} />
        </div>
      )}
    </li>
  );
}

/** What a task typed into Today or Week is worth unless it has its own amount: the same field as a list's "N each". */
function TodayPoints() {
  const { data } = usePoints();
  const save = useSetTodayPoints();
  const current = data?.todayPoints;
  const [text, setText] = useState("");
  useEffect(() => setText(current === undefined ? "" : String(current)), [current]);
  if (current === undefined) return null;

  function done() {
    const next = text.trim() === "" ? null : Number(text);
    if (next === null) setText(String(current));
    else if (next !== current) save.mutate(next);
  }

  return (
    <label className="flex items-center gap-1">
      <input
        className="points-field tabular-nums"
        style={pointsFieldWidth(text)}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(typedPoints(e.target.value))}
        onBlur={done}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
        aria-label="Points per task added in Today"
        title="What a task typed into Today or Week is worth unless it has its own amount"
      />
      each
      {save.error && <span className="text-red-600">{save.error.message}</span>}
    </label>
  );
}

type Tab = "today" | "week";
/** The tab last opened, kept on this device. */
const TAB_KEY = "donegeon.todayTab";

function savedTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === "week" ? "week" : "today";
  } catch {
    return "today";
  }
}

/** Today and Week on the box's band. Each also takes a dragged task while the other is open. */
function Tabs({ tab, onPick }: { tab: Tab; onPick: (tab: Tab) => void }) {
  const { dropTarget } = useTree();
  const tabs: [Tab, string][] = [
    ["today", "Today"],
    ["week", "Week"],
  ];
  return (
    <span role="tablist" className="band-tabs">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          className="band-tab"
          aria-selected={tab === key}
          onClick={() => onPick(key)}
          {...{ [key === "today" ? "data-drop-today" : "data-drop-week"]: "" }}
          data-drop={tab !== key && dropTarget?.kind === key ? "" : undefined}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function TodayTab({ tasks }: { tasks: TaskTreeNode[] }) {
  const { ticked } = useTree();
  const today = localDate();
  const deadlines = useDeadlineToday();
  const items = todayItems(tasks, today, ticked, deadlines);
  const own = tasks.filter((task) => livesInToday(task) && (!task.isComplete || (ticked !== "hide" && task.completedOn === today)));
  const left = [...items.map((item) => item.node), ...own].filter((node) => !node.isComplete && !node.isPersistent).length;

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
      <TaskForm editorId="today-add" placeholder="Add a task just for today, then press Enter" />
    </>
  );
}

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
function WeekDay({ day, items, today, nextWeek = false }: { day: string; items: WeekItem[]; today: string; nextWeek?: boolean }) {
  const { draft, dropTarget } = useTree();
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
      className={`space-y-1 pb-3 ${nextWeek ? "mt-2 border-2 border-dashed border-stone-300 px-2 dark:border-stone-700" : ""} ${dropTarget?.kind === "weekDay" && dropTarget.day === day ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}
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
function WeekTab({ tasks }: { tasks: TaskTreeNode[] }) {
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

/**
 * The day's and the week's working sets, as two tabs of one box. Tasks dragged here, or marked "Do today" /
 * "Do this week" in their ⋯ menu, are only shown here: they live in one of the lists below. Tasks typed
 * into the field at the bottom live here alone, until they are dragged to a list.
 */
export function TodayBox({ tasks }: { tasks: TaskTreeNode[] }) {
  const { dropTarget } = useTree();
  const [tab, setTab] = useState<Tab>(savedTab);

  function pick(next: Tab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Not kept: it opens on Today next time.
    }
  }

  const dropProps = tab === "today" ? { "data-drop-today": "" } : { "data-drop-week": "" };
  return (
    <TileFrame
      title={<Tabs tab={tab} onPick={pick} />}
      {...dropProps}
      data-tab={tab}
      className={dropTarget?.kind === tab ? "ring-2 ring-emerald-600" : ""}
      aria-label="Today"
    >
      {tab === "today" ? <TodayTab tasks={tasks} /> : <WeekTab tasks={tasks} />}
    </TileFrame>
  );
}
