import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCreateList, useUpdateList } from "../../hooks/useTasks";
import { frameIn, isLight, KIND_COLORS, listColor, sliderIn } from "../../lib/frameTones";
import { filterTree, isFiltering, type LabelFilter } from "../../lib/labels";
import { isShown } from "../../lib/recent";
import type { List, ListKind, TaskTreeNode, TickedTasks } from "../../types";
import { ColorChoices } from "../ColorChoices";
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
  /** In a list's header: the plate sits in the box's top left corner, against its border. */
  inCorner?: boolean;
  /** The list's own colour, if one was picked: the switch's track takes it. */
  color?: string | null;
  /** More for the plate, after the points: a list's colour swatch. */
  children?: ReactNode;
}

/**
 * Task list or reward list, and what each item in it is worth, all on one
 * little plate. The kind is a switch, "Task" at its left and "Reward" at its
 * right; the chosen word is bigger and darker, and either word can be clicked too.
 */
function KindFields({ kind, points, onKind, onPoints, onPointsDone, inCorner = false, color = null, children }: KindFieldsProps) {
  const isReward = kind === "reward";
  return (
    <div className={`kind-plate mr-auto ${inCorner ? "kind-plate-corner" : ""}`} role="group" aria-label="Kind of list">
      <button type="button" className="kind-label w-10" data-active={!isReward} tabIndex={-1} onClick={() => isReward && onKind("task")}>
        Task
      </button>
      <button
        type="button"
        role="switch"
        className="kind-switch"
        aria-checked={isReward}
        aria-label="Reward list"
        data-kind={kind}
        style={color ? { backgroundImage: sliderIn(color) } : undefined}
        title={
          isReward
            ? "Reward list: its items cost points. Click to make it a task list."
            : "Task list: its items add points. Click to make it a reward list."
        }
        onClick={() => onKind(isReward ? "task" : "reward")}
      >
        <span />
      </button>
      <button type="button" className="kind-label w-[60px]" data-active={isReward} tabIndex={-1} onClick={() => !isReward && onKind("reward")}>
        Reward
      </button>
      <label className="kind-points">
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
      {children}
    </div>
  );
}

/**
 * The colour of a list's box: a swatch on its plate that opens a few colours
 * to pick from, the browser's own picker for any other, and the way back to
 * the kind's own colour (blue for tasks, orange for rewards).
 */
function ColorPicker({ list, onPick }: { list: List; onPick: (color: string | null) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const current = listColor(list);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <span ref={ref} className="relative flex">
      <button
        type="button"
        className="size-4 cursor-pointer border-2 border-[#222034]"
        style={{ backgroundColor: current }}
        aria-label="List colour"
        aria-expanded={isOpen}
        title="Pick this list's colour"
        onClick={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <div className="card absolute top-full left-0 z-40 mt-2 w-44 !p-2 shadow-lg max-sm:right-0 max-sm:left-auto" role="dialog" aria-label="List colour">
          <ColorChoices
            current={current}
            // The kind's own colour is "no colour picked", so the list follows its kind again.
            onPick={(hex) => onPick(hex === KIND_COLORS[list.kind] ? null : hex)}
            reset={list.color ? { label: `Back to ${list.kind === "reward" ? "orange" : "blue"}`, onReset: () => onPick(null) } : undefined}
          />
        </div>
      )}
    </span>
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
      data-list-color={listColor(list)}
      className={isDropTarget ? "ring-2 ring-emerald-600" : ""}
      // A picked colour recolours the frame's band; the title on it turns dark when the colour is a light one.
      style={list.color ? ({ "--frame": frameIn(list.color), "--band-text": isLight(list.color) ? "#222034" : "#fff" } as CSSProperties) : undefined}
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
      <header className="flex flex-wrap items-center gap-2">
        <KindFields
          kind={list.kind}
          points={points}
          onKind={(kind) => update.mutate({ id: list.id, changes: { kind } })}
          onPoints={setPoints}
          onPointsDone={savePoints}
          inCorner
          color={list.color}
        >
          <ColorPicker list={list} onPick={(color) => update.mutate({ id: list.id, changes: { color } })} />
        </KindFields>
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

/**
 * A new list: its name, whether its items add or cost points, and how many. Enter in the name creates it,
 * in the folder whose page this is (null = the Tasks page).
 */
export function ListForm({ folderId = null }: { folderId?: string | null }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ListKind>("task");
  const [points, setPoints] = useState("1");
  const createList = useCreateList();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || createList.isPending) return;
    createList.mutate(
      { name, kind, defaultPoints: parsePoints(points) ?? 1, folderId },
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
          className="nes-input input min-w-40 flex-1 max-sm:basis-full"
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

/**
 * Each list with the tasks shown in it. A ticked task (a finished main task, or
 * a subtask) stays in its list, ticked, for 24 hours and is in the Done tab
 * from the start; with `ticked` "hide" it leaves its list the moment it is ticked.
 * While a goal/tag filter is on, only matching tasks and the lists holding them are kept.
 */
export function listCards(lists: List[], tasks: TaskTreeNode[], filter: LabelFilter, ticked: TickedTasks) {
  const filtering = isFiltering(filter);
  const shown = (nodes: TaskTreeNode[]): TaskTreeNode[] =>
    nodes.filter((task) => isShown(task, ticked)).map((task) => ({ ...task, children: shown(task.children) }));
  return lists
    .map((list) => {
      const own = tasks.filter((t) => t.listId === list.id);
      return { list, taskCount: own.length, tasks: filterTree(shown(own), filter) };
    })
    .filter((card) => !filtering || card.tasks.length > 0);
}
