import { ValueChip } from "../components/Points/ValueChip";
import { localDate } from "../api/client";
import { useLists, useTaskTrees, useToggleTask } from "../hooks/useTasks";
import { addDays, formatDay } from "../lib/dates";
import type { TaskTreeNode } from "../types";

/** A finished task's subtasks, as they were left: read-only. */
function Subtasks({ nodes }: { nodes: TaskTreeNode[] }) {
  return (
    <ul className="ml-3 border-l border-stone-200 pl-3 dark:border-stone-800">
      {nodes.map((node) => (
        <li key={node.id}>
          <span className={node.isComplete ? "" : "text-stone-500"}>
            {node.isComplete ? "✓" : "○"} {node.title}
          </span>
          {node.children.length > 0 && <Subtasks nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

function FinishedTask({ node, listName }: { node: TaskTreeNode; listName: string | undefined }) {
  const toggle = useToggleTask();

  return (
    <li data-finished={node.id}>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-emerald-700"
          checked
          disabled={toggle.isPending}
          onChange={() => toggle.mutate(node.id)}
          aria-label={`Mark "${node.title}" not done`}
          title="Untick to make it open again"
        />
        <span className="min-w-0 flex-1 break-words whitespace-pre-line">{node.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-stone-500">
          {node.children.length > 0 && (
            <span className="tabular-nums">
              {node.descendantDoneCount}/{node.descendantCount} done
            </span>
          )}
          {listName && <span className="max-w-40 truncate">{listName}</span>}
          <ValueChip node={node} />
        </span>
      </div>
      {toggle.error && <p className="text-xs text-red-600">{toggle.error.message}</p>}
      {node.children.length > 0 && (
        <details className="ml-6 text-sm">
          <summary className="cursor-pointer text-xs text-stone-500">Subtasks</summary>
          <Subtasks nodes={node.children} />
        </details>
      )}
    </li>
  );
}

/**
 * Finished main tasks (and bought one-off rewards), newest day first. They
 * also stay in their lists for a few days. Unticking one makes it open again.
 */
export function DonePage() {
  const tasks = useTaskTrees();
  const lists = useLists();
  const error = tasks.error ?? lists.error;
  if (error) return <p className="text-sm text-red-600">Couldn't load your tasks: {error.message}</p>;
  if (!tasks.data || !lists.data) return <p className="text-sm text-stone-500">Loading…</p>;

  const today = localDate();
  const finished = tasks.data
    .filter((task) => task.isComplete && task.completedOn)
    // A task ticked a moment ago has no server time yet; it goes first.
    .sort((a, b) => (b.completedAt ?? "9").localeCompare(a.completedAt ?? "9"));
  const days = [...new Set(finished.map((task) => task.completedOn!))].sort().reverse();
  const listName = (id: string | null) => lists.data.find((list) => list.id === id)?.name;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Done</h1>
      {days.length === 0 && (
        <p className="card text-sm text-stone-500">Nothing finished yet. Tick a main task and it shows up here.</p>
      )}
      {days.map((day) => (
        <section key={day} className="card space-y-2" data-done-on={day}>
          <h2 className="text-sm font-semibold tabular-nums">
            {formatDay(day, true)}/{day.slice(0, 4)}
            {day === today && <span className="font-normal text-stone-500"> · Today</span>}
            {day === addDays(today, -1) && <span className="font-normal text-stone-500"> · Yesterday</span>}
          </h2>
          <ul className="space-y-1.5">
            {finished
              .filter((task) => task.completedOn === day)
              .map((task) => (
                <FinishedTask key={task.id} node={task} listName={listName(task.listId)} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
