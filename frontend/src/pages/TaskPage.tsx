import { useRef } from "react";
import { Link, Navigate, useParams } from "react-router";
import { CountdownTable } from "../components/Countdown/CountdownTable";
import { DeadlineFields } from "../components/TaskTree/DeadlineFields";
import { TaskForm } from "../components/TaskTree/TaskForm";
import { TaskTree } from "../components/TaskTree/TaskNode";
import { TreeProvider } from "../components/TaskTree/TreeContext";
import { TileFrame } from "../components/Tiles/TileFrame";
import { TreeError, UndoBar } from "../components/TaskTree/TreeStatus";
import { useCountdown, useTaskTrees } from "../hooks/useTasks";
import { hasTaskPage } from "../lib/taskPage";
import type { TaskTreeNode } from "../types";

function findNode(nodes: TaskTreeNode[], id: string, depth = 0): { node: TaskTreeNode; depth: number } | null {
  for (const node of nodes) {
    if (node.id === id) return { node, depth };
    const found = findNode(node.children, id, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Old links went to /tasks/:id/countdown. */
export function CountdownRedirect() {
  const { taskId = "" } = useParams();
  return <Navigate to={`/tasks/${taskId}`} replace />;
}

/** A big task's own page (see hasTaskPage): its countdown table beside its tree. */
export function TaskPage() {
  const { taskId = "" } = useParams();
  const tasks = useTaskTrees();
  const found = tasks.data ? findNode(tasks.data, taskId) : null;
  // A failed refetch leaves the old table cached, so trust the task itself for whether a countdown exists.
  const hasHardDeadline = found?.node.deadlineType === "hard" && Boolean(found.node.deadlineDate);
  const countdown = useCountdown(taskId, hasHardDeadline);
  const canHaveDeadline = (found?.depth ?? 0) <= 1;
  const table = hasHardDeadline ? countdown.data : undefined;
  // Decided once, on arrival: switching to soft or deleting a subtask here shouldn't throw you off the page mid-edit.
  const allowed = useRef<{ taskId: string; ok: boolean } | null>(null);
  if (found && allowed.current?.taskId !== taskId) allowed.current = { taskId, ok: hasTaskPage(found.node) };

  if (tasks.error) return <p className="text-sm text-red-600">Couldn't load your tasks: {tasks.error.message}</p>;
  if (!tasks.data) return <p className="text-sm text-stone-500">Loading…</p>;
  if (found && !allowed.current?.ok) return <Navigate to="/" replace />;

  return (
    <TreeProvider tasks={tasks.data} rootId={taskId}>
      <div className="mx-auto max-w-5xl space-y-4">
        <Link to="/" className="text-sm text-emerald-700 underline dark:text-emerald-400">
          ← All tasks
        </Link>
        {!found ? (
          <p className="text-sm text-stone-500">This task no longer exists.</p>
        ) : (
          <>
            <header className="card flex flex-wrap items-start justify-between gap-4">
              <h1 className="min-w-0 text-xl font-bold break-words whitespace-pre-line">{found.node.title}</h1>
              {canHaveDeadline && (
                <div className="w-56 shrink-0">
                  <DeadlineFields task={found.node} />
                </div>
              )}
            </header>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <section aria-label="Countdown" className="min-w-0">
                {table ? (
                  <CountdownTable countdown={table} />
                ) : !hasHardDeadline ? (
                  <p className="card text-sm text-stone-500">
                    {canHaveDeadline
                      ? "No countdown yet. Give this task a hard deadline above to get its day-by-day table."
                      : "No countdown: deadlines go on main tasks and their direct subtasks."}
                  </p>
                ) : countdown.error ? (
                  <p className="card text-sm text-red-600">Couldn't load the countdown: {countdown.error.message}</p>
                ) : (
                  <p className="text-sm text-stone-500">Loading…</p>
                )}
              </section>
              <TileFrame title="Tasks" aria-label="Tasks" className="min-w-0">
                <TreeError />
                <TaskTree nodes={[found.node]} parentId={found.node.parentId} listId={found.node.listId} depth={found.depth} />
                <TaskForm parentId={found.node.id} placeholder="Add a subtask, then press Enter" />
              </TileFrame>
            </div>
          </>
        )}
        <UndoBar />
      </div>
    </TreeProvider>
  );
}
