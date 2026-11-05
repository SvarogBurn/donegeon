import { Fragment, useState, type CSSProperties, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { mondayOf } from "../../../../shared/dates";
import { useDismissed } from "../../hooks/notifications";
import { useCombinedCountdown, useTaskTrees } from "../../hooks/tasks";
import { useDeadlineTable, useTutorialRunning } from "../../hooks/useAuth";
import { formatPace, formatShortDay } from "../../lib/dates";
import { deadlineColor, foldedDays, perDayOf, rangeEnd, rangeLabel, type PerDayMode } from "../../lib/deadlineTable";
import { firstLine } from "../../lib/markup";
import { passedDeadlines, type PassedDeadline } from "../../lib/notifications";
import { findNode } from "../../lib/optimisticToggle";
import { pathIdsTo } from "../../lib/showOnPage";
import { readStored, writeStored } from "../../lib/storage";
import { isBigTask } from "../../lib/taskPage";
import type { CombinedCountdown, CombinedItem, CombinedRow, TaskTreeNode } from "../../types";
import { PostponeDeadline } from "../Notifications/PostponeDeadline";
import { RichText } from "../RichText";
import { DeadlineBadge } from "../TaskTree/DeadlineBadge";
import { TaskTree } from "../TaskTree/TaskNode";
import { TickOrPress } from "../TaskTree/TickOrPress";
import { TileFrame } from "../Tiles/TileFrame";
import { pressureColor } from "./pressureColor";
import { CELL, DayCells, dayRow, PaceCell, SheetTable, SummaryCells } from "./sheet";
import { InfoTip } from "../InfoTip";

type Tab = "range" | "all" | "list";
/** The tab last opened, kept on this device. */
const TAB_KEY = "donegeon.deadlineTab";
/** Whether the whole table is shown, or the next few days (the summary), kept on this device. */
const OPEN_KEY = "donegeon.deadlineOpen";
/** The days with work the summary shows, from today. */
const SUMMARY_DAYS = 3;

function savedTab(): Tab {
  const tab = readStored(TAB_KEY);
  return tab === "all" || tab === "list" ? tab : "range";
}

/** The range set on the user's page ("2 weeks"), All and List on the box's band. */
function Tabs({ tab, onPick, range }: { tab: Tab; onPick: (tab: Tab) => void; range: string }) {
  const tabs: [Tab, string, string][] = [
    ["range", range, `The next ${range}, today first (set on your page); from a passed deadline's day while it is still open`],
    ["all", "All", "Every deadline, day by day"],
    ["list", "List", "The tasks with a deadline, soonest first"],
  ];
  return (
    <span role="tablist" className="band-tabs">
      {tabs.map(([key, label, title]) => (
        <button key={key} type="button" role="tab" className="band-tab" aria-selected={tab === key} title={title} onClick={() => onPick(key)} data-deadline-tab={key}>
          {label}
        </button>
      ))}
    </span>
  );
}

/** A deadline's colour, light behind its marker row's text, full in a bar down its left. */
const markerStyle = (color: string): CSSProperties => ({
  backgroundColor: `color-mix(in srgb, ${color} 30%, transparent)`,
  boxShadow: `inset 4px 0 0 ${color}`,
});

/**
 * Every deadline still open, hard and soft (unless soft ones are left out on the user's page), as three tabs: the
 * next days or weeks set on the user's page, all of them, and a list of their tasks. A merged row in the tables marks
 * where each deadline falls (just under its day), in its colour; a click on it opens the task's page, to be edited
 * there. Hidden until there is a deadline.
 * A deadline gone by with its task still open shows the table back to its day, until the task is done, the deadline
 * moved, or it is dismissed (with the bell: one dismissal for both). Its marker asks for a new day, as the bell does.
 */
export function DeadlinesBox() {
  const navigate = useNavigate();
  const { data: countdown } = useCombinedCountdown();
  const { data: trees = [] } = useTaskTrees();
  const [table] = useDeadlineTable();
  const [tab, setTab] = useState<Tab>(savedTab);
  // A summary by default, the whole table a click away (2026-11-04, playtest 1: the table stood over everything else).
  const [isOpen, setIsOpen] = useState(() => readStored(OPEN_KEY) === "1");
  // While the tutorial shows it, the whole table.
  const tutorialRuns = useTutorialRunning();
  const [dismissed, dismiss] = useDismissed();
  const [asking, setAsking] = useState<PassedDeadline | null>(null);
  if (!countdown || countdown.items.length === 0) return null;

  function pick(next: Tab) {
    setTab(next);
    writeStored(TAB_KEY, next);
  }

  const colorOf = (item: CombinedItem) => {
    const node = findNode(trees, item.taskId);
    return deadlineColor(item, node ? isBigTask(node) : false, table);
  };
  const open = (taskId: string) => navigate(`/tasks/${taskId}`);
  const passed = passedDeadlines(trees, countdown.today).filter((late) => countdown.items.some((item) => item.taskId === late.node.id));
  // The oldest passed deadline not dismissed: the table starts on its day.
  const lookBack = passed
    .filter((late) => !dismissed.has(late.key))
    .map((late) => late.node.deadlineDate!)
    .sort()[0];
  const openMarker = (item: CombinedItem) => {
    const late = passed.find((p) => p.node.id === item.taskId);
    if (late) setAsking(late);
    else open(item.taskId);
  };

  const today = countdown.rows.find((row) => row.date === countdown.today);
  const left = today?.remaining ?? countdown.totalTasks;

  return (
    <TileFrame title={<Tabs tab={tab} onPick={pick} range={rangeLabel(table.range)} />} aria-label="All deadlines" data-tab={tab}>
      <SummaryCells
        cells={[
          ["Tasks", countdown.totalTasks, undefined, "Every task the table counts: those with a deadline and the subtasks under them."],
          ["Done", countdown.totalTasks - left, undefined, "How many of those are ticked."],
          ["Left", left, undefined, "How many are still to do before their deadlines."],
          ["Deadlines", countdown.items.length, undefined, "The deadlines the table counts: the hard ones, and the soft ones too if it is set to."],
        ]}
      />
      {tab === "list" ? (
        <DeadlineList items={countdown.items} trees={trees} colorOf={colorOf} onOpen={open} />
      ) : (
        <DeadlineSheet
          countdown={countdown}
          mode={table.perDay}
          colorOf={colorOf}
          onOpen={openMarker}
          to={tab === "range" ? rangeEnd(countdown.today, table.range) : undefined}
          lookBack={lookBack}
          days={isOpen || tutorialRuns ? undefined : SUMMARY_DAYS}
        />
      )}
      {tab !== "list" && (
        <button
          type="button"
          className="btn-quiet mt-1 w-full text-xs"
          aria-expanded={isOpen}
          onClick={() => (setIsOpen(!isOpen), writeStored(OPEN_KEY, isOpen ? "" : "1"))}
          data-deadline-toggle
          data-deadline-open={isOpen || undefined}
        >
          {isOpen ? "Show the next days only ▴" : "Show the whole table ▾"}
        </button>
      )}
      {asking && (
        <PostponeDeadline
          item={asking}
          onDismiss={() => dismiss([asking.key])}
          onClose={() => setAsking(null)}
          onOpenTask={() => {
            setAsking(null);
            open(asking.node.id);
          }}
        />
      )}
    </TileFrame>
  );
}

interface SheetProps {
  countdown: CombinedCountdown;
  mode: PerDayMode;
  colorOf: (item: CombinedItem) => string;
  /** A marker's click: the task's page, or for a deadline gone by, the popup asking for a new day. */
  onOpen: (item: CombinedItem) => void;
  /** The range tab: today to this day, deadlines already past above today. Left out: every day, weeks over hidden. */
  to?: string;
  /** The day of the oldest passed deadline still open and not dismissed: both tabs show the days from it. */
  lookBack?: string;
  /** The summary: only this many days with work from today (and what is overdue before them). Left out: every day. */
  days?: number;
}

/**
 * The day-by-day table. Per day adds every deadline up, takes only the soonest one with work left, or (columns) gives
 * each deadline a column of its own, headed in its colour.
 */
function DeadlineSheet({ countdown, mode, colorOf, onOpen, to, lookBack, days }: SheetProps) {
  const { today, items } = countdown;
  const isRange = to !== undefined;
  // The first day shown: today (range) or this Monday (All), or a passed deadline's day before it.
  const from = [isRange ? today : mondayOf(today), lookBack ?? today].sort()[0];
  const columns = mode === "columns";
  const headers = [
    "Day",
    "Date",
    "Done",
    "Left",
    ...(columns
      ? items.map((item) => (
          <span key={item.taskId} className="block max-w-28 truncate border-b-4 pb-0.5" style={{ borderColor: colorOf(item) }} data-tip title={firstLine(item.title)}>
            <RichText text={firstLine(item.title)} />
          </span>
        ))
      : [
          // Its meaning on a hover, or a tap on a touch screen: an ⓘ would make the column too wide for the box.
          <span
            key="pace"
            className="cursor-help underline decoration-dotted underline-offset-2"
            data-tip
            title={mode === "soonest" ? "What to do that day for the soonest deadline with work left: its tasks left, spread over its days left." : "What to do that day to finish everything in time: each deadline's tasks left, spread over its days left, added up."}
          >
            {mode === "soonest" ? "Soonest" : "Per day"}
          </span>,
        ]),
  ];

  const marker = (item: CombinedItem) => (
    <tr key={item.taskId} data-deadline-marker data-deadline-type={item.deadlineType}>
      <td colSpan={headers.length} className={`${CELL} !p-0 text-center font-semibold`} style={markerStyle(colorOf(item))}>
        <button
          type="button"
          className="block w-full cursor-pointer px-1 py-0.5 hover:bg-black/10 focus-visible:bg-black/10 sm:px-2 dark:hover:bg-white/10 dark:focus-visible:bg-white/10"
          data-tip title={`${item.deadlineType === "soft" ? "Soft" : "Hard"} deadline${item.deadlineDate < today ? ", already past. Click to pick a new day for it, or dismiss it" : ". Click to go to the task"}`}
          onClick={() => onOpen(item)}
        >
          <RichText text={item.title.split("\n")[0]} /> deadline
        </button>
      </td>
    </tr>
  );

  // A row's Per day: one cell, or (columns) one for each deadline.
  const paceCells = (row: CombinedRow, number: string) => {
    if (!columns) {
      const pace = perDayOf(row, mode);
      return (
        <PaceCell
          className={number}
          fill={pressureColor({ remaining: pace.remaining, perDay: pace.overdue ? null : pace.perDay })}
          data-tip title={pace.overdue ? "Includes overdue work, counted in full" : undefined}
        >
          {formatPace(pace.perDay)}
        </PaceCell>
      );
    }
    return row.paces.map((own, i) =>
      own ? (
        <PaceCell key={items[i].taskId} className={number} fill={pressureColor(own)} title={own.perDay === null ? "Overdue, counted in full" : undefined}>
          {formatPace(own.perDay ?? own.remaining)}
        </PaceCell>
      ) : (
        // Not running that day: before its task was written down, or after its deadline.
        <td key={items[i].taskId} className={`${number} bg-stone-50 dark:bg-stone-800/50`} />
      ),
    );
  };

  // The days before this week that a passed deadline takes the table back to are one row, its markers under it.
  const foldBefore = mondayOf(today);
  const fold = lookBack && lookBack < foldBefore ? foldedDays(countdown.rows, from, foldBefore) : null;
  const isFolded = (date: string) => fold !== null && date < foldBefore;
  const inRange = isRange ? countdown.rows.filter((row) => row.date >= from && row.date <= to) : countdown.rows;
  // The summary stops after its last day with work from today (the days before today are what is overdue).
  const worked = inRange.filter((row) => row.date >= today && (row.perDay > 0 || row.doneThatDay > 0 || row.date === today));
  const last = days === undefined ? undefined : worked[days - 1]?.date;
  const rows = last === undefined ? inRange : inRange.filter((row) => row.date <= last);
  return (
    <SheetTable headers={headers} wide={columns}>
      {/* In the range, deadlines already past (still open, so overdue) and dismissed come first. */}
      {isRange && items.filter((item) => item.deadlineDate < from).map(marker)}
      {fold && (
        <tr data-folded-days={fold.since} className={dayRow(fold.last.date, today).row}>
          <td colSpan={2} className={`${CELL} whitespace-nowrap font-semibold text-red-700 dark:text-red-400`} data-tip title={`Every day from ${formatShortDay(fold.since)} to last week in one row`}>
            Overdue since {formatShortDay(fold.since)}
          </td>
          <td className={dayRow(fold.last.date, today).number}>{fold.done}</td>
          <td className={dayRow(fold.last.date, today).number}>{fold.last.remaining}</td>
          {paceCells(fold.last, dayRow(fold.last.date, today).number)}
        </tr>
      )}
      {fold && items.filter((item) => isFolded(item.deadlineDate) && (!isRange || item.deadlineDate >= from)).map(marker)}
      {rows.map((row) => {
        const style = dayRow(row.date, today);
        const deadlines = items.filter((item) => item.deadlineDate === row.date);
        // A day with nothing to do and nothing done is left out, and so is every day of a week already over unless a
        // passed deadline looks back to it (their deadline markers stay: those deadlines are still open); today always shows.
        // A deadline's marker comes under its day: that day is the last one to do the work in.
        const isHidden = row.date < from || isFolded(row.date) || (row.perDay === 0 && row.doneThatDay === 0 && !style.isToday);
        return (
          <Fragment key={row.date}>
            {!isHidden && (
              <tr data-today={style.isToday || undefined} className={style.row}>
                <DayCells date={row.date} cell={style.cell} />
                {/* A day that has gone by with nothing done reads 0; today and later stay blank until something is. */}
                <td className={style.number}>{row.doneThatDay || (style.isPast ? 0 : "")}</td>
                <td className={style.number}>{row.remaining}</td>
                {paceCells(row, style.number)}
              </tr>
            )}
            {(!isRange || row.date >= from) && !isFolded(row.date) && deadlines.map(marker)}
          </Fragment>
        );
      })}
    </SheetTable>
  );
}

interface ListProps {
  items: CombinedItem[];
  trees: TaskTreeNode[];
  colorOf: (item: CombinedItem) => string;
  onOpen: (taskId: string) => void;
}

/** The tasks the table counts, soonest deadline first, each as in its list: ticked here, its subtasks under its arrow. */
export function DeadlineList({ items, trees, colorOf, onOpen }: ListProps) {
  return (
    <ul className="space-y-1 text-sm" data-deadline-list>
      {items.map((item) => {
        const node = findNode(trees, item.taskId);
        return node ? <DeadlineRow key={item.taskId} node={node} trees={trees} color={colorOf(item)} onOpen={onOpen} /> : null;
      })}
    </ul>
  );
}

function DeadlineRow({ node, trees, color, onOpen }: { node: TaskTreeNode; trees: TaskTreeNode[]; color: string; onOpen: (taskId: string) => void }) {
  // Subtasks start hidden behind the row's arrow, as in a list.
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  // A subtask's deadline: the tasks above it, as the Today box shows them.
  const path = (pathIdsTo(trees, node.id) ?? []).slice(0, -1).map((id) => firstLine(findNode(trees, id)?.title ?? ""));

  // A click on the row (not on one of its buttons) opens the task's page, to be edited there.
  function onRowClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("button, input, a, label")) return;
    onOpen(node.id);
  }

  return (
    <li data-deadline-item={node.id} className="pl-1.5" style={{ boxShadow: `inset 4px 0 0 ${color}` }}>
      <div
        onClick={onRowClick}
        title="Click to go to the task"
        className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded px-1 py-0.5 hover:bg-stone-50 dark:hover:bg-stone-800/50"
      >
        <button
          type="button"
          className="task-arrow"
          onClick={() => setIsOpen(!isOpen)}
          disabled={!hasChildren}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Collapse subtasks" : "Expand subtasks"}
        />
        <TickOrPress node={node} />
        <span className={`min-w-0 truncate ${node.isComplete ? "text-stone-400 line-through" : ""}`}>
          <RichText text={firstLine(node.title)} />
        </span>
        {path.length > 0 && <span className="min-w-0 shrink-[2] truncate text-stone-500">{path.join(" › ")}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {node.descendantCount > 0 && (
            <span className="text-xs text-stone-500 tabular-nums">
              {node.descendantDoneCount}/{node.descendantCount} done
            </span>
          )}
          <DeadlineBadge task={node} />
        </span>
      </div>
      {/* The subtasks as they are in the task's list: ticked, renamed and added to from here. */}
      {hasChildren && isOpen && (
        <div className="ml-3 border-l border-stone-200 pl-3 dark:border-stone-800" data-deadline-subtasks>
          <TaskTree nodes={node.children} parentId={node.id} listId={null} depth={path.length + 1} />
        </div>
      )}
    </li>
  );
}
