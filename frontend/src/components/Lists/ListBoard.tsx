import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { localDate } from "../../api/client";
import { useCreateList, useUpdateList } from "../../hooks/useTasks";
import { daysBetween } from "../../lib/dates";
import { filterTree, isFiltering, type LabelFilter } from "../../lib/labels";
import type { List, ListKind, TaskTreeNode } from "../../types";
import { TaskForm } from "../TaskTree/TaskForm";
import { TaskTree } from "../TaskTree/TaskNode";
import { useTree } from "../TaskTree/TreeContext";
import { TileFrame } from "../Tiles/TileFrame";

interface KindFieldsProps {
  kind: ListKind;
  points: string;
  onKind: (kind: ListKind) => void;
  onPoints: (points: string) => void;
  /** Called when the points field is left or Enter is pressed in it. */
  onPointsDone?: () => void;
}

/** Task list or reward list (a switch: off = tasks, on = rewards), and what each item in it is worth. */
function KindFields({ kind, points, onKind, onPoints, onPointsDone }: KindFieldsProps) {
  const isReward = kind === "reward";
  return (
    <>
      <button
        type="button"
        role="switch"
        className="kind-switch"
        aria-checked={isReward}
        aria-label="Reward list"
        data-kind={kind}
        title={
          isReward
            ? "Reward list: its items cost points. Click to make it a task list."
            : "Task list: its items add points. Click to make it a reward list."
        }
        onClick={() => onKind(isReward ? "task" : "reward")}
      >
        <span />
      </button>
      <label className="flex items-center gap-1 text-xs text-stone-500">
        <input
          className="points-field tabular-nums"
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={points}
          onChange={(e) => onPoints(e.target.value.replace(/\D/g, ""))}
          onBlur={onPointsDone}
          onKeyDown={(e) => e.key === "Enter" && onPointsDone && (e.preventDefault(), e.currentTarget.blur())}
          aria-label="Points per item"
          title="What each item is worth unless it has its own amount"
        />
        each
      </label>
    </>
  );
}

/** A typed amount as a whole number of points, or null if it isn't one. */
function parsePoints(text: string): number | null {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** Asks before a list that still holds tasks is deleted. Enter (the focused button) deletes, Esc cancels. */
function ConfirmDelete({ list, count, onConfirm, onCancel }: { list: List; count: number; onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <div className="card w-80 max-w-full space-y-3" role="alertdialog" aria-modal="true" aria-label="Delete list">
        <p>
          “{list.name}” has {count} {count === 1 ? "task" : "tasks"}. Are you sure you want to delete it?
        </p>
        <div className="flex justify-end">
          <button type="button" className="nes-btn btn-small" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="nes-btn is-error btn-small" onClick={onConfirm} autoFocus>
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * One of the user's lists: a renameable folder of main tasks, and a drop zone
 * for dragged tasks. Its kind (tasks or rewards) and points per item can be
 * changed at any time. Deleting it (× or the Delete key in its name) takes its
 * tasks along, after asking if it has any; Ctrl+Z brings everything back. Must sit inside a TreeProvider
 * (the dashboard's), which holds the drag, draft and undo state.
 */
interface ListCardProps {
  list: List;
  tasks: TaskTreeNode[];
  /** Every main task in the list, shown or not: what a delete would take along. */
  taskCount: number;
}

export function ListCard({ list, tasks, taskCount }: ListCardProps) {
  const update = useUpdateList();
  const { dropTarget, deleteList } = useTree();
  const [name, setName] = useState(list.name);
  useEffect(() => setName(list.name), [list.name]);
  const [points, setPoints] = useState(String(list.defaultPoints));
  useEffect(() => setPoints(String(list.defaultPoints)), [list.defaultPoints]);
  const isDropTarget = dropTarget?.kind === "list" && dropTarget.listId === list.id;
  const isReward = list.kind === "reward";
  const [confirming, setConfirming] = useState(false);

  function askDelete() {
    if (taskCount > 0) setConfirming(true);
    else deleteList(list);
  }

  function saveName() {
    const next = name.trim();
    if (!next) setName(list.name);
    else if (next !== list.name) update.mutate({ id: list.id, changes: { name: next } });
  }

  function savePoints() {
    const next = parsePoints(points);
    if (next === null) setPoints(String(list.defaultPoints));
    else if (next !== list.defaultPoints) update.mutate({ id: list.id, changes: { defaultPoints: next } });
  }

  return (
    <TileFrame
      data-drop-list={list.id}
      data-list-kind={list.kind}
      className={isDropTarget ? "ring-2 ring-emerald-600" : ""}
      actions={
        <button
          type="button"
          className="tile-button tile-button-x"
          aria-label={`Delete list "${list.name}"`}
          title="Delete this list and its tasks (Ctrl+Z to undo)"
          onClick={askDelete}
        />
      }
      tone={isReward ? "reward" : "blue"}
      title={
        <input
          className="w-full bg-transparent outline-none focus:ring-2 focus:ring-white/50"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(list.name);
            // Same rule as tasks: with the caret at the end, Delete removes the whole thing. Not while the
            // name is being edited, though, nor from a held-down key: shortening a name with Delete ends
            // with the caret at the end, and the next press must not take the list with it.
            const el = e.currentTarget;
            const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
            const untouched = el.value === list.name && !e.repeat;
            if (e.key === "Delete" && atEnd && untouched && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
              e.preventDefault();
              askDelete();
            }
          }}
          aria-label="List name"
          maxLength={200}
        />
      }
    >
      <header className="flex flex-wrap items-center justify-end gap-2">
        <KindFields
          kind={list.kind}
          points={points}
          onKind={(kind) => update.mutate({ id: list.id, changes: { kind } })}
          onPoints={setPoints}
          onPointsDone={savePoints}
        />
      </header>
      {update.error && <p className="text-xs text-red-600">{update.error.message}</p>}
      <TaskTree nodes={tasks} parentId={null} listId={list.id} />
      <TaskForm listId={list.id} placeholder={isReward ? "Add a reward, then press Enter" : "Add a task, then press Enter"} />
      {confirming && (
        <ConfirmDelete
          list={list}
          count={taskCount}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            deleteList(list);
          }}
        />
      )}
    </TileFrame>
  );
}

/** A new list: its name, whether its items add or cost points, and how many. Enter in the name creates it. */
export function ListForm() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ListKind>("task");
  const [points, setPoints] = useState("1");
  const createList = useCreateList();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || createList.isPending) return;
    createList.mutate(
      { name, kind, defaultPoints: parsePoints(points) ?? 1 },
      {
        onSuccess: () => {
          setName("");
          setKind("task");
          setPoints("1");
        },
      },
    );
  }

  return (
    <TileFrame title="New list" tone="setup">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          className="nes-input input min-w-40 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New list, then press Enter"
          aria-label="New list name"
          enterKeyHint="done"
          maxLength={200}
        />
        <KindFields kind={kind} points={points} onKind={setKind} onPoints={setPoints} />
        {/* With several fields, Enter only submits a form that has a submit button. */}
        <button type="submit" className="sr-only">
          Add list
        </button>
        {createList.error && <p className="w-full text-xs text-red-600">{createList.error.message}</p>}
      </form>
    </TileFrame>
  );
}

/** How long a ticked main task stays in its list: ticked on Monday, gone on Thursday. */
const DAYS_KEPT_WHEN_DONE = 3;

/**
 * Each list with the top-level tasks shown in it. A finished task stays in its
 * list, ticked, for DAYS_KEPT_WHEN_DONE days (and is in the Done tab from the
 * start). While a goal/tag filter is on, only matching tasks and the lists
 * holding them are kept.
 */
export function listCards(lists: List[], tasks: TaskTreeNode[], filter: LabelFilter) {
  const filtering = isFiltering(filter);
  const today = localDate();
  const inList = (task: TaskTreeNode) =>
    !task.isComplete || !task.completedOn || daysBetween(task.completedOn, today) < DAYS_KEPT_WHEN_DONE;
  return lists
    .map((list) => {
      const own = tasks.filter((t) => t.listId === list.id);
      return { list, taskCount: own.length, tasks: filterTree(own.filter(inList), filter) };
    })
    .filter((card) => !filtering || card.tasks.length > 0);
}
