import { Fragment, useState, type CSSProperties, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { mondayOf } from "../../../../shared/dates";
import { useDismissed } from "../../hooks/notifications";
import { useCombinedCountdown, useTaskTrees } from "../../hooks/tasks";
import { useDeadlineTable } from "../../hooks/useAuth";
import { formatPace } from "../../lib/dates";
import { deadlineColor, perDayOf, rangeEnd, rangeLabel, type PerDayMode } from "../../lib/deadlineTable";
import { firstLine } from "../../lib/markup";
import { passedDeadlines, type PassedDeadline } from "../../lib/notifications";
import { findNode } from "../../lib/optimisticToggle";
import { pathIdsTo } from "../../lib/showOnPage";
import { readStored, writeStored } from "../../lib/storage";
import { isBigTask } from "../../lib/taskPage";
import type { CombinedCountdown, CombinedItem, TaskTreeNode } from "../../types";
import { PostponeDeadline } from "../Notifications/PostponeDeadline";
import { RichText } from "../RichText";
import { DeadlineBadge } from "../TaskTree/DeadlineBadge";
import { TaskTree } from "../TaskTree/TaskNode";
import { TickOrPress } from "../TaskTree/TickOrPress";
import { TileFrame } from "../Tiles/TileFrame";
import { pressureColor } from "./pressureColor";
import { CELL, DayCells, dayRow, PaceCell, SheetTable, SummaryCells } from "./sheet";

type Tab = "range" | "all" | "list";
/** The tab last opened, kept on this device. */
const TAB_KEY = "donegeon.deadlineTab";

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
          ["Tasks", countdown.totalTasks],
          ["Done", countdown.totalTasks - left],
          ["Left", left],
          ["Deadlines", countdown.items.length],
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
        />
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
}

/**
 * The day-by-day table. Per day adds every deadline up, takes only the soonest one with work left, or (columns) gives
 * each deadline a column of its own, headed in its colour.
 */
function DeadlineSheet({ countdown, mode, colorOf, onOpen, to, lookBack }: SheetProps) {
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
          <span key={item.taskId} className="block max-w-28 truncate border-b-4 pb-0.5" style={{ borderColor: colorOf(item) }} title={firstLine(item.title)}>
            <RichText text={firstLine(item.title)} />
          </span>
        ))
      : [mode === "soonest" ? "Soonest" : "Per day"]),
  ];

  const marker = (item: CombinedItem) => (
    <tr key={item.taskId} data-deadline-marker data-deadline-type={item.deadlineType}>
      <td colSpan={headers.length} className={`${CELL} !p-0 text-center font-semibold`} style={markerStyle(colorOf(item))}>
        <button
          type="button"
          className="block w-full cursor-pointer px-1 py-0.5 hover:bg-black/10 focus-visible:bg-black/10 sm:px-2 dark:hover:bg-white/10 dark:focus-visible:bg-white/10"
          title={`${item.deadlineType === "soft" ? "Soft" : "Hard"} deadline${item.deadlineDate < today ? ", already past. Click to pick a new day for it, or dismiss it" : ". Click to go to the task"}`}
          onClick={() => onOpen(item)}
        >
          <RichText text={item.title.split("\n")[0]} /> deadline
        </button>
      </td>
    </tr>
  );

  const rows = isRange ? countdown.rows.filter((row) => row.date >= from && row.date <= to) : countdown.rows;
  return (
    <SheetTable headers={headers} wide={columns}>
      {/* In the range, deadlines already past (still open, so overdue) and dismissed come first. */}
      {isRange && items.filter((item) => item.deadlineDate < from).map(marker)}
      {rows.map((row) => {
        const style = dayRow(row.date, today);
        const deadlines = items.filter((item) => item.deadlineDate === row.date);
        // A day with nothing to do and nothing done is left out, and so is every day of a week already over unless a
        // passed deadline looks back to it (their deadline markers stay: those deadlines are still open); today always shows.
        // A deadline's marker comes under its day: that day is the last one to do the work in.
        const isHidden = row.date < from || (row.perDay === 0 && row.doneThatDay === 0 && !style.isToday);
        const pace = perDayOf(row, mode);
        return (
          <Fragment key={row.date}>
            {!isHidden && (
              <tr data-today={style.isToday || undefined} className={style.row}>
                <DayCells date={row.date} cell={style.cell} />
                {/* A day that has gone by with nothing done reads 0; today and later stay blank until something is. */}
                <td className={style.number}>{row.doneThatDay || (style.isPast ? 0 : "")}</td>
                <td className={style.number}>{row.remaining}</td>
                {columns ? (
                  row.paces.map((own, i) =>
                    own ? (
                      <PaceCell key={items[i].taskId} className={style.number} fill={pressureColor(own)} title={own.perDay === null ? "Overdue, counted in full" : undefined}>
                        {formatPace(own.perDay ?? own.remaining)}
                      </PaceCell>
                    ) : (
                      // Not running that day: before its task was written down, or after its deadline.
                      <td key={items[i].taskId} className={`${style.number} bg-stone-50 dark:bg-stone-800/50`} />
                    ),
                  )
                ) : (
                  <PaceCell
                    className={style.number}
                    fill={pressureColor({ remaining: pace.remaining, perDay: pace.overdue ? null : pace.perDay })}
                    title={pace.overdue ? "Includes overdue work, counted in full" : undefined}
                  >
                    {formatPace(pace.perDay)}
                  </PaceCell>
                )}
              </tr>
            )}
            {(!isRange || row.date >= from) && deadlines.map(marker)}
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
