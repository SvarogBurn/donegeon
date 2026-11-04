import { useRef } from "react";
import { Link, Navigate, useParams } from "react-router";
import { CountdownTable } from "../components/Countdown/CountdownTable";
import { DeadlineColors } from "../components/Countdown/DeadlineColors";
import { DeadlineFields } from "../components/TaskTree/DeadlineFields";
import { Repeat } from "../components/TaskTree/TaskMenu";
import { RoundsBox } from "../components/TaskTree/RoundsBox";
import { TaskForm } from "../components/TaskTree/TaskForm";
import { NoteFrame, NoteView } from "../components/TaskTree/NoteView";
import { TaskTree } from "../components/TaskTree/TaskNode";
import { TreeProvider } from "../components/TaskTree/TreeContext";
import { TileFrame } from "../components/Tiles/TileFrame";
import { TreeError, UndoBar } from "../components/TaskTree/TreeStatus";
import { useCountdown, useTaskTrees } from "../hooks/tasks";
import { hasDeadlinePage } from "../lib/taskPage";
import type { TaskTreeNode } from "../types";
import { RichText } from "../components/RichText";

/** `inRound`: it sits under a persistent task. */
function findNode(nodes: TaskTreeNode[], id: string, depth = 0, inRound = false): { node: TaskTreeNode; depth: number; inRound: boolean } | null {
  for (const node of nodes) {
    if (node.id === id) return { node, depth, inRound };
    const found = findNode(node.children, id, depth + 1, inRound || node.isPersistent);
    if (found) return found;
  }
  return null;
}

/** Old links went to /tasks/:id/countdown. */
export function CountdownRedirect() {
  const { taskId = "" } = useParams();
  return <Navigate to={`/tasks/${taskId}`} replace />;
}

/** A task's own page (see hasTaskPage, and hasDeadlinePage from the deadline boxes): its note and countdown table, or a persistent task's rounds, beside its tree. */
export function TaskPage() {
  const { taskId = "" } = useParams();
  const tasks = useTaskTrees();
  const found = tasks.data ? findNode(tasks.data, taskId) : null;
  // A failed refetch leaves the old table cached, so trust the task itself for whether a countdown exists.
  const hasHardDeadline = found?.node.deadlineType === "hard" && Boolean(found.node.deadlineDate);
  const countdown = useCountdown(taskId, hasHardDeadline);
  const isHabit = found?.node.isPersistent ?? false;
  // Under a persistent task a deadline it has from before can still be taken off.
  const canHaveDeadline = (found?.depth ?? 0) <= 1 && !isHabit && (!found?.inRound || Boolean(found.node.deadlineDate));
  const table = hasHardDeadline ? countdown.data : undefined;
  // Decided once, on arrival: switching to soft or deleting a subtask here shouldn't throw you off the page mid-edit.
  const allowed = useRef<{ taskId: string; ok: boolean } | null>(null);
  if (found && allowed.current?.taskId !== taskId) allowed.current = { taskId, ok: hasDeadlinePage(found.node) };

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
              <h1 className="min-w-0 text-xl font-bold break-words whitespace-pre-line"><RichText text={found.node.title} /></h1>
              {canHaveDeadline && (
                <div className="w-72 max-w-full shrink-0">
                  <DeadlineFields task={found.node} />
                  <DeadlineColors node={found.node} />
                </div>
              )}
            </header>

            {/* On a wide screen the countdown is on the left with the note under it, the tasks on the right; narrow, the note comes last. */}
            <div className="grid items-start gap-4 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
              <section aria-label={isHabit ? "Rounds" : "Countdown"} className="min-w-0 space-y-4">
                {isHabit ? (
                  <>
                    <RoundsBox node={found.node} />
                    <div className="card" data-task-page-repeat>
                      <Repeat node={found.node} />
                    </div>
                  </>
                ) : table ? (
                  <CountdownTable countdown={table} />
                ) : !hasHardDeadline ? (
                  <p className="card text-sm text-stone-500">
                    {found.node.deadlineType === "soft" && found.node.deadlineDate
                      ? "Soft deadlines have no countdown table. Make it hard above to get its day-by-day table."
                      : canHaveDeadline
                      ? "No countdown yet. Give this task a hard deadline above to get its day-by-day table."
                      : found.inRound
                      ? "No countdown: a subtask of a persistent task repeats with it, so it has no deadline."
                      : "No countdown: deadlines go on main tasks and their direct subtasks."}
                  </p>
                ) : countdown.error ? (
                  <p className="card text-sm text-red-600">Couldn't load the countdown: {countdown.error.message}</p>
                ) : (
                  <p className="text-sm text-stone-500">Loading…</p>
                )}
              </section>
              <TileFrame title="Tasks" aria-label="Tasks" className="min-w-0 lg:row-span-2">
                <TreeError />
                <TaskTree nodes={[found.node]} parentId={found.node.parentId} listId={found.node.listId} depth={found.depth} />
                <TaskForm parentId={found.node.id} placeholder="Add a subtask, then press Enter" />
              </TileFrame>
              {/* The box is there once the task has a note (its icon or ⋯ menu adds one). */}
              {found.node.notes && (
                <NoteFrame node={found.node} title="Note" aria-label="Note" className="min-w-0 lg:col-start-1 lg:row-start-2">
                  <NoteView key={found.node.id} node={found.node} />
                </NoteFrame>
              )}
            </div>
          </>
        )}
        <UndoBar />
      </div>
    </TreeProvider>
  );
}
