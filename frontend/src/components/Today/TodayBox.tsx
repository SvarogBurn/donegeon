import { useEffect, useState } from "react";
import { localDate } from "../../api/client";
import { PixelCheckbox } from "../PixelCheckbox";
import { usePoints, useSetToday, useSetTodayPoints, useToggleTask } from "../../hooks/useTasks";
import { daysBetween } from "../../lib/dates";
import { isDue } from "../../lib/repeat";
import type { TaskTreeNode, TickedTasks } from "../../types";
import { ValueChip } from "../Points/ValueChip";
import { PressCopies } from "../TaskTree/PressCopies";
import { TaskForm } from "../TaskTree/TaskForm";
import { TaskTree } from "../TaskTree/TaskNode";
import { useTree } from "../TaskTree/TreeContext";
import { TileFrame } from "../Tiles/TileFrame";

interface TodayItem {
  node: TaskTreeNode;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
}

const firstLine = (title: string) => title.split("\n")[0];

/** Written straight into Today: a main task with no list. It is shown here as a full, editable task. */
const livesInToday = (node: TaskTreeNode) => !node.parentId && !node.listId;

/** The day an item came into Today: marked for it, or (a task on a schedule) due. */
const since = (node: TaskTreeNode) => node.todaySince ?? node.nextDue!;

/**
 * Everything from the lists that is marked for Today, at any depth, plus the main tasks on a
 * schedule that are due: those come in by themselves and leave when done. Open items stay from day to day;
 * a ticked one stays for the rest of the day it was ticked on (or goes at once, if the user chose to hide
 * ticked tasks). Subtasks left open inside a finished main task went to the Done page with it.
 */
function todayItems(trees: TaskTreeNode[], today: string, ticked: TickedTasks): TodayItem[] {
  const found: TodayItem[] = [];
  const visit = (nodes: TaskTreeNode[], path: string[], rootFinished: boolean) => {
    for (const node of nodes) {
      const shown = node.isComplete ? ticked !== "hide" && node.completedOn === today : !rootFinished;
      const isIn = node.todaySince !== null || (path.length === 0 && isDue(node, today));
      if (isIn && shown && !livesInToday(node)) found.push({ node, path });
      visit(node.children, [...path, firstLine(node.title)], rootFinished || (path.length === 0 && node.isComplete));
    }
  };
  visit(trees, [], false);
  // Longest-waiting first; ticked ones under the open ones, unless the user chose to leave them where they are.
  const tickedLast = (item: TodayItem) => Number(ticked === "bottom" && item.node.isComplete);
  return found.sort((a, b) => tickedLast(a) - tickedLast(b) || since(a.node).localeCompare(since(b.node)));
}

function TodayRow({ node, path, today }: TodayItem & { today: string }) {
  const tree = useTree();
  const toggle = useToggleTask();
  const setToday = useSetToday();
  const carried = daysBetween(since(node), today);
  const isPersistent = node.isPersistent && !node.parentId;
  const pressedToday = node.completions.filter((press) => press.day === today).length;
  const error = toggle.error ?? setToday.error;
  const hasOpenSubtasks = !node.isComplete && node.descendantDoneCount < node.descendantCount;

  return (
    <li data-today-item={node.id}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded px-1 py-0.5 hover:bg-stone-50 dark:hover:bg-stone-800/50">
        {isPersistent ? (
          <button
            type="button"
            className="repeat-button"
            onClick={() => tree.pressTask(node)}
            aria-label={`Done "${node.title}" once more`}
          />
        ) : (
          <PixelCheckbox
            className={hasOpenSubtasks ? "opacity-40" : ""}
            checked={node.isComplete}
            disabled={toggle.isPending || hasOpenSubtasks}
            title={hasOpenSubtasks ? "Tick its subtasks first" : undefined}
            onChange={() => (!node.isComplete && (!node.parentId || tree.ticked === "hide") ? tree.finishTask(node) : toggle.mutate(node.id))}
            aria-label={`Mark "${node.title}" ${node.isComplete ? "not done" : "done"}`}
          />
        )}
        <span className={`min-w-0 truncate ${node.isComplete ? "text-stone-400 line-through" : ""}`}>{firstLine(node.title)}</span>
        {path.length > 0 && <span className="min-w-0 shrink-[2] truncate text-stone-500">{path.join(" › ")}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {isPersistent && pressedToday > 0 && <span className="text-xs text-stone-500 tabular-nums">×{pressedToday} today</span>}
          {carried > 0 && !node.isComplete && (
            <span
              data-carried={carried}
              className="pixel-chip bg-amber-100 px-2 py-0.5 text-xs whitespace-nowrap text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            >
              carried over {carried} {carried === 1 ? "day" : "days"}
            </span>
          )}
          <ValueChip node={node} />
          {/* A task that is here because it is due leaves by being done, not by hand. */}
          <button
            type="button"
            className="btn-quiet glyph disabled:invisible"
            disabled={node.todaySince === null}
            aria-label={`Take "${firstLine(node.title)}" out of Today`}
            title="Take out of Today (the task itself stays where it is)"
            onClick={() => setToday.mutate({ id: node.id, today: false })}
          >
            ×
          </button>
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error.message}</p>}
      <PressCopies node={node} />
    </li>
  );
}

/** What a task typed into Today is worth unless it has its own amount: the same field as a list's "N each". */
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
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
        onBlur={done}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
        aria-label="Points per task added in Today"
        title="What a task typed into Today is worth unless it has its own amount"
      />
      each
      {save.error && <span className="text-red-600">{save.error.message}</span>}
    </label>
  );
}

/**
 * The day's working set. Tasks dragged here, or marked "Do today" in their ⋯
 * menu, are only shown here: they live in one of the lists below. Tasks typed
 * into the field at the bottom live here alone, until they are dragged to a list.
 */
export function TodayBox({ tasks }: { tasks: TaskTreeNode[] }) {
  const { dropTarget, ticked } = useTree();
  const today = localDate();
  const items = todayItems(tasks, today, ticked);
  const own = tasks.filter((task) => livesInToday(task) && (!task.isComplete || (ticked !== "hide" && task.completedOn === today)));
  const left = [...items.map((item) => item.node), ...own].filter((node) => !node.isComplete && !node.isPersistent).length;

  return (
    <TileFrame
      title="Today"
      data-drop-today
      className={dropTarget?.kind === "today" ? "ring-2 ring-emerald-600" : ""}
      aria-label="Today"
    >
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
            <TodayRow key={item.node.id} {...item} today={today} />
          ))}
        </ul>
      )}
      <div data-today-own>
        <TaskTree nodes={own} parentId={null} listId={null} />
      </div>
      <TaskForm editorId="today-add" placeholder="Add a task just for today, then press Enter" />
    </TileFrame>
  );
}
