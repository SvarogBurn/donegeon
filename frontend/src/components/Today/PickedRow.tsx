import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { useDismissed } from "../../hooks/notifications";
import { useSetToday, useSetWeek, useTaskTrees } from "../../hooks/tasks";
import { formatDay } from "../../lib/dates";
import { firstLine, plainFirstLine } from "../../lib/markup";
import { isOverdue, passedItem, passedKey } from "../../lib/notifications";
import { repeatLabel } from "../../lib/repeat";
import { findTaskRow, pathIdsTo, showOnPage, taskRow } from "../../lib/showOnPage";
import { hasTaskPage } from "../../lib/taskPage";
import type { WeekAuto } from "../../lib/week";
import type { TaskTreeNode } from "../../types";
import { PostponeDeadline } from "../Notifications/PostponeDeadline";
import { ValueChip } from "../Points/ValueChip";
import { RichText } from "../RichText";
import { DeadlineBadge } from "../TaskTree/DeadlineBadge";
import { zoneOn } from "../TaskTree/dragState";
import { PressCopies } from "../TaskTree/PressCopies";
import { DROP_STYLES, TaskTree } from "../TaskTree/TaskNode";
import { TickOrPress } from "../TaskTree/TickOrPress";
import { useDrag, useTree } from "../TaskTree/TreeContext";

interface PickedRowProps {
  node: TaskTreeNode;
  path: string[];
  today: string;
  /** Which tab it is shown in: Today rows keep their order (longest-waiting first), Week rows are dragged into theirs, and to other days. */
  box: "today" | "week";
  /** In Today: a round due since a day gone by (its schedule keeps it due until it is done or skipped). */
  dueSince?: string;
  /**
   * Here by itself (see WeekItem, TodayItem). In Week it has no × or handle: it leaves by being done. In Today its ×
   * (`onNotToday`) takes it out for the rest of the day.
   */
  auto?: WeekAuto;
  onNotToday?: () => void;
  missed?: boolean;
  rounds?: number;
  /** One round of a task on a schedule: the day it was planned on. Dragging the row moves only that round. */
  round?: string;
}

/** A task from a list shown in Today or Week: it is only shown here, and taken out with ×, the task itself staying where it is. */
export function PickedRow({ node, path, today, box, dueSince, auto, onNotToday, missed = false, rounds = 0, round }: PickedRowProps) {
  const tree = useTree();
  const navigate = useNavigate();
  const setToday = useSetToday();
  const setWeek = useSetWeek();
  const isPersistent = node.isPersistent;
  const pressedToday = node.completions.filter((press) => press.day === today).length;
  const error = setToday.error ?? setWeek.error;
  const hasChildren = node.children.length > 0;
  const inWeek = box === "week";
  // A round of a schedule still to come: only there to be seen, nothing to press yet.
  const isAhead = auto === "round";
  // A reminder on Monday that a round was missed in an earlier week and dropped. Doing it now counts for this week's round.
  const isReminder = auto === "missed";
  const drop = useDrag((state) => (inWeek ? zoneOn(state.dropTarget, node.id, ["weekItem"]) : null));
  const isDragged = useDrag((state) => state.draggingId === node.id);
  // Subtasks start hidden behind the row's arrow, as in a list.
  const [isOpen, setIsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [, dismiss] = useDismissed();
  const overdue = !inWeek && isOverdue(node, today);
  const takeOut = () => (auto ? onNotToday?.() : setToday.mutate({ id: node.id, today: false }));

  const { data: trees = [] } = useTaskTrees();
  // A click on the row (not on one of its buttons) goes to the task itself, to be edited there: its own page if it has
  // one, else its row in its list (on the Tasks page, if this page doesn't show that list), marked for a moment. The
  // arrow shows its subtasks here.
  const hasPage = hasTaskPage(node);
  // Its deadline is today: that is what it says, not since when its round is due.
  const dueToday = node.deadlineDate === today && !node.isComplete;
  function onRowClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("button, input, a, label")) return;
    if (hasPage) navigate(`/tasks/${node.id}`);
    else showInList();
  }

  function showInList() {
    const pathIds = pathIdsTo(trees, node.id) ?? [];
    const main = pathIds[0] ?? node.id;
    if (!taskRow(main, "lists")) navigate("/");
    showOnPage((isLast) => findTaskRow(node.id, pathIds, isLast, "lists"));
  }

  const name = plainFirstLine(node.title);
  return (
    <li
      data-today-item={inWeek ? undefined : node.id}
      // What came into Week by itself has no place in the user's order to drop next to.
      data-week-item={inWeek && !auto ? node.id : undefined}
      data-week-auto={auto}
      data-auto-id={auto ? node.id : undefined}
      className={isDragged ? "opacity-40" : isAhead ? "opacity-60" : ""}
    >
      <div
        onClick={onRowClick}
        data-opens={hasPage ? node.id : undefined}
        data-week-row={inWeek ? "" : undefined}
        className={`flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded px-1 py-0.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 ${drop ? DROP_STYLES[drop] : ""}`}
      >
        <button
          type="button"
          className="task-arrow"
          onClick={() => setIsOpen(!isOpen)}
          disabled={!hasChildren}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Collapse subtasks" : "Expand subtasks"}
        />
        <TickOrPress
          node={node}
          control={isAhead ? "ahead" : undefined}
          title={isAhead ? `Repeats ${repeatLabel(node)}` : isReminder ? "Done it now: counts as this week's round" : undefined}
        />
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
          {auto === "deadline" && !dueToday && <DeadlineBadge task={node} />}
          {dueToday && (
            <span data-deadline-today>
              <DeadlineBadge task={node} label="deadline today" />
            </span>
          )}
          {isReminder && (
            <span
              title="It doesn't have to be made up: it is on its planned days this week as ever"
              className="pixel-chip bg-red-100 px-2 py-0.5 text-xs whitespace-nowrap text-red-800 dark:bg-red-950 dark:text-red-300"
            >
              not done since {formatDay(node.nextDue!)}
            </span>
          )}
          {dueSince && !node.isComplete && !dueToday && (
            <span
              data-due-since={dueSince}
              className="pixel-chip bg-amber-100 px-2 py-0.5 text-xs whitespace-nowrap text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            >
              due since {formatDay(dueSince)}
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
            // A task here because it is due, or its deadline near, comes back tomorrow if it is taken out.
            <>
              <button
                type="button"
                className="btn-quiet glyph"
                aria-label={overdue ? `"${name}" is overdue: what now?` : auto ? `Not "${name}" today` : `Take "${name}" out of Today`}
                title={overdue ? "It's overdue: what now?" : auto ? "Not today: it is back tomorrow, as long as it is still due (on this device)" : "Take out of Today (the task itself stays where it is)"}
                onClick={() => (overdue ? setIsAsking(true) : takeOut())}
              >
                ×
              </button>
              {/* Dropped on the Next week bin under the day's tasks, it is put off: out of Today, its days waiting forgotten.
                  What came in by itself can be put off too, and comes back after that. */}
              <button
                type="button"
                className="btn-quiet cursor-grab touch-none glyph select-none active:cursor-grabbing"
                onPointerDown={(e) => tree.startDrag(e, node)}
                aria-label={`Drag "${name}"`}
                title={
                  !auto
                    ? "Drag to the Next week bin to put it off (it leaves Today), or to a list or the Week tab"
                    : "Drag to the Next week bin to put it off (it leaves Today until then)"
                }
              >
                ⠿
              </button>
            </>
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
      {/* Beside the row, not in it: a click in the popup mustn't reach the row's own. */}
      {isAsking && (
        <PostponeDeadline
          item={passedItem(node, path, today)}
          onDismiss={() => {
            dismiss([passedKey(node)]);
            // Marked by hand, its deadline would bring it straight back by itself: out for the day either way.
            onNotToday?.();
            if (!auto) setToday.mutate({ id: node.id, today: false });
          }}
          onClose={() => setIsAsking(false)}
        />
      )}
    </li>
  );
}
