import { useEffect, useState, type FormEvent } from "react";
import { localDate } from "../../api/client";
import { useCreateList, useUpdateList } from "../../hooks/useTasks";
import { daysBetween } from "../../lib/dates";
import { filterTree, isFiltering, type LabelFilter } from "../../lib/labels";
import type { List, ListKind, TaskTreeNode } from "../../types";
import { TaskForm } from "../TaskTree/TaskForm";
import { TaskTree } from "../TaskTree/TaskNode";
import { useTree } from "../TaskTree/TreeContext";

const SMALL_FIELD =
  "rounded-md border border-stone-300 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-600 dark:border-stone-700 dark:bg-stone-900";

interface KindFieldsProps {
  kind: ListKind;
  points: string;
  onKind: (kind: ListKind) => void;
  onPoints: (points: string) => void;
  /** Called when the points field is left or Enter is pressed in it. */
  onPointsDone?: () => void;
}

/** Task list or reward list, and what each item in it is worth. */
function KindFields({ kind, points, onKind, onPoints, onPointsDone }: KindFieldsProps) {
  return (
    <>
      <select
        className={SMALL_FIELD}
        value={kind}
        onChange={(e) => onKind(e.target.value as ListKind)}
        aria-label="Kind of list"
        title="A task list adds points when an item is done; a reward list takes them."
      >
        <option value="task">Tasks: add points</option>
        <option value="reward">Rewards: cost points</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-stone-500">
        <input
          className={`${SMALL_FIELD} w-16 text-stone-900 tabular-nums dark:text-stone-100`}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={points}
          onChange={(e) => onPoints(e.target.value)}
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

/**
 * One of the user's lists: a renameable folder of main tasks, and a drop zone
 * for dragged tasks. Its kind (tasks or rewards) and points per item can be
 * changed at any time. Deleting it (× or the Delete key in its name) takes its
 * tasks along; Ctrl+Z brings everything back. Must sit inside a TreeProvider
 * (the dashboard's), which holds the drag, draft and undo state.
 */
export function ListCard({ list, tasks }: { list: List; tasks: TaskTreeNode[] }) {
  const update = useUpdateList();
  const { dropTarget, deleteList } = useTree();
  const [name, setName] = useState(list.name);
  useEffect(() => setName(list.name), [list.name]);
  const [points, setPoints] = useState(String(list.defaultPoints));
  useEffect(() => setPoints(String(list.defaultPoints)), [list.defaultPoints]);
  const isDropTarget = dropTarget?.kind === "list" && dropTarget.listId === list.id;
  const isReward = list.kind === "reward";

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
    <section
      data-drop-list={list.id}
      data-list-kind={list.kind}
      className={`card space-y-3 ${isReward ? "!border-amber-400 dark:!border-amber-600" : ""} ${isDropTarget ? "ring-2 ring-emerald-600" : ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">

        <input
          className="min-w-32 flex-1 rounded bg-transparent px-1 font-semibold outline-none focus:ring-2 focus:ring-emerald-600/30"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(list.name);
            // Same rule as tasks: with the caret at the end, Delete removes the whole thing.
            const el = e.currentTarget;
            const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
            if (e.key === "Delete" && atEnd && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
              e.preventDefault();
              deleteList(list);
            }
          }}
          aria-label="List name"
          maxLength={200}
        />
        <KindFields
          kind={list.kind}
          points={points}
          onKind={(kind) => update.mutate({ id: list.id, changes: { kind } })}
          onPoints={setPoints}
          onPointsDone={savePoints}
        />
        <button
          type="button"
          className="btn-quiet shrink-0 text-lg leading-none"
          aria-label={`Delete list "${list.name}"`}
          title="Delete this list and its tasks (Ctrl+Z to undo)"
          onClick={() => deleteList(list)}
        >
          ×
        </button>
      </header>
      {update.error && <p className="text-xs text-red-600">{update.error.message}</p>}
      <TaskTree nodes={tasks} parentId={null} listId={list.id} />
      <TaskForm listId={list.id} placeholder={isReward ? "Add a reward, then press Enter" : "Add a task, then press Enter"} />
    </section>
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
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        className="input min-w-40 flex-1 border-dashed"
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
    .map((list) => ({ list, tasks: filterTree(tasks.filter((t) => t.listId === list.id && inList(t)), filter) }))
    .filter((card) => !filtering || card.tasks.length > 0);
}
