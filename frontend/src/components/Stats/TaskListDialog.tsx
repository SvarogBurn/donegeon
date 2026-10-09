import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { useLists, useTaskTrees } from "../../hooks/useTasks";
import { findTaskRow, pathIdsTo, showOnPage } from "../../lib/showOnPage";
import type { StatTask } from "../../lib/stats";
import { SummaryCells } from "../Countdown/sheet";
import { RichText } from "../RichText";

/** A task behind one of the stats' numbers, with what that number knows about it ("07/10", "2 days late"). */
export interface ListedTask {
  task: StatTask;
  note?: string;
  /** Counted more than once: a persistent task pressed several times on a day. */
  times?: number;
}

/** How many tasks are listed before the rest are only counted. */
const LISTED = 200;

/**
 * The tasks behind a number of the stats. A click on one goes to its row on the Tasks page, or, for a task
 * finished long enough ago to be off the lists, to the Done page.
 */
function TaskListDialog({ title, items, onClose }: { title: string; items: ListedTask[]; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: lists = [] } = useLists();
  const { data: trees = [] } = useTaskTrees();

  function goTo(task: StatTask) {
    const pathIds = pathIdsTo(trees, task.id);
    if (!pathIds) return navigate("/done");
    navigate("/");
    showOnPage((isLast) => findTaskRow(task.id, pathIds, isLast));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="card flex max-h-full w-[28rem] max-w-full flex-col gap-3" role="dialog" aria-modal="true" aria-label={title} data-stat-tasks>
        <h3 className="text-sm">
          {title} <span className="text-stone-500 tabular-nums">· {items.reduce((sum, item) => sum + (item.times ?? 1), 0)}</span>
        </h3>
        {items.length === 0 ? (
          <p className="text-xs text-stone-500">No tasks.</p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-stone-200 overflow-y-auto text-xs dark:divide-stone-800">
            {items.slice(0, LISTED).map(({ task, note, times }, i) => (
              <li key={`${task.id}:${i}`}>
                <button
                  type="button"
                  data-stat-task={task.id}
                  title="Go to this task"
                  className="flex w-full cursor-pointer items-baseline gap-2 px-1 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
                  onClick={() => goTo(task)}
                >
                  <span className="min-w-0 flex-1 break-words">
                    <RichText text={task.title.split("\n")[0]} />
                    {times && times > 1 && <span className="text-stone-500 tabular-nums"> ×{times}</span>}
                  </span>
                  <span className="max-w-28 shrink-0 truncate text-stone-500">{lists.find((list) => list.id === task.listId)?.name}</span>
                  {note && <span className="shrink-0 text-stone-500 tabular-nums">{note}</span>}
                </button>
              </li>
            ))}
            {items.length > LISTED && <li className="px-1 py-1.5 text-stone-500">and {items.length - LISTED} more</li>}
          </ul>
        )}
        <div className="flex justify-end">
          <button type="button" className="nes-btn btn-small" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Summary cells whose numbers count tasks: a click on one lists the tasks it counts. `title` names the list. */
export function TaskCells({ cells }: { cells: readonly (readonly [label: string, value: number | string, title: string, items: ListedTask[]])[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <SummaryCells cells={cells.map(([label, value], i) => [label, value, () => setOpen(i)] as const)} />
      {open !== null && cells[open] && <TaskListDialog title={cells[open][2]} items={cells[open][3]} onClose={() => setOpen(null)} />}
    </>
  );
}
