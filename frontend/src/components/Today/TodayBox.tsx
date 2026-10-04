import { localDate } from "../../api/client";
import { useSetToday, useToggleTask } from "../../hooks/useTasks";
import { daysBetween } from "../../lib/dates";
import type { TaskTreeNode } from "../../types";
import { ValueChip } from "../Points/ValueChip";
import { TaskForm } from "../TaskTree/TaskForm";
import { TaskTree } from "../TaskTree/TaskNode";
import { useTree } from "../TaskTree/TreeContext";

interface TodayItem {
  node: TaskTreeNode;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
}

const firstLine = (title: string) => title.split("\n")[0];

/** Written straight into Today: a main task with no list. It is shown here as a full, editable task. */
const livesInToday = (node: TaskTreeNode) => !node.parentId && !node.listId;

/**
 * Everything from the lists that is marked for Today, at any depth. Open items stay from day to day;
 * a ticked one stays for the rest of the day it was ticked on. Subtasks left
 * open inside a finished main task went to the Done tab with it.
 */
function todayItems(trees: TaskTreeNode[], today: string): TodayItem[] {
  const found: TodayItem[] = [];
  const visit = (nodes: TaskTreeNode[], path: string[], rootFinished: boolean) => {
    for (const node of nodes) {
      const shown = node.isComplete ? node.completedOn === today : !rootFinished;
      if (node.todaySince && shown && !livesInToday(node)) found.push({ node, path });
      visit(node.children, [...path, firstLine(node.title)], rootFinished || (path.length === 0 && node.isComplete));
    }
  };
  visit(trees, [], false);
  // Longest-waiting first.
  return found.sort((a, b) => a.node.todaySince!.localeCompare(b.node.todaySince!));
}

function TodayRow({ node, path, today }: TodayItem & { today: string }) {
  const tree = useTree();
  const toggle = useToggleTask();
  const setToday = useSetToday();
  const carried = daysBetween(node.todaySince!, today);
  const isPersistent = node.isPersistent && !node.parentId;
  const pressedToday = node.completions.filter((press) => press.day === today).length;
  const error = toggle.error ?? setToday.error;

  return (
    <li data-today-item={node.id}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded px-1 py-0.5 hover:bg-stone-50 dark:hover:bg-stone-800/50">
        {isPersistent ? (
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded-full border border-emerald-700 text-xs leading-none text-emerald-700 hover:bg-emerald-700 hover:text-white dark:border-emerald-400 dark:text-emerald-400"
            onClick={() => tree.pressTask(node)}
            aria-label={`Done "${node.title}" once more`}
          >
            ↻
          </button>
        ) : (
          <input
            type="checkbox"
            className="size-4 accent-emerald-700"
            checked={node.isComplete}
            disabled={toggle.isPending}
            onChange={() => (!node.parentId && !node.isComplete ? tree.finishTask(node) : toggle.mutate(node.id))}
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
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs whitespace-nowrap text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            >
              carried over {carried} {carried === 1 ? "day" : "days"}
            </span>
          )}
          <ValueChip node={node} />
          <button
            type="button"
            className="btn-quiet text-lg leading-none"
            aria-label={`Take "${firstLine(node.title)}" out of Today`}
            title="Take out of Today (the task itself stays where it is)"
            onClick={() => setToday.mutate({ id: node.id, today: false })}
          >
            ×
          </button>
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error.message}</p>}
    </li>
  );
}

/**
 * The day's working set. Tasks dragged here, or marked "Do today" in their ⋯
 * menu, are only shown here: they live in one of the lists below. Tasks typed
 * into the field at the bottom live here alone, until they are dragged to a list.
 */
export function TodayBox({ tasks }: { tasks: TaskTreeNode[] }) {
  const { dropTarget } = useTree();
  const today = localDate();
  const items = todayItems(tasks, today);
  const own = tasks.filter((task) => livesInToday(task) && (!task.isComplete || task.completedOn === today));
  const left = [...items.map((item) => item.node), ...own].filter((node) => !node.isComplete && !node.isPersistent).length;

  return (
    <section
      data-drop-today
      className={`card space-y-3 !border-emerald-600 dark:!border-emerald-500 ${dropTarget?.kind === "today" ? "ring-2 ring-emerald-600" : ""}`}
      aria-label="Today"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="px-1 font-semibold">Today</h2>
        {items.length + own.length > 0 && <span className="text-xs text-stone-500 tabular-nums">{left} left</span>}
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
    </section>
  );
}
