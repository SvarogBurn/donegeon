import { useEffect, useRef, useState } from "react";
import { PixelCheckbox } from "../PixelCheckbox";
import { useGoals, useLists, useSetToday, useTags, useUpdateTask } from "../../hooks/useTasks";
import { toggleId } from "../../lib/labels";
import type { TaskTreeNode } from "../../types";
import { DeadlineFields } from "./DeadlineFields";
import { useTree } from "./TreeContext";

interface Props {
  node: TaskTreeNode;
  /** 0 = main task, 1 = its direct subtask, ... */
  depth: number;
  onAddSubtask: () => void;
}

interface LabelPickerProps {
  title: string;
  items: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyHint: string;
}

/** Tick any number of goals (or tags) for one task. Nothing is ticked by default. */
function LabelPicker({ title, items, selected, onChange, emptyHint }: LabelPickerProps) {
  return (
    <fieldset className="space-y-1 text-xs">
      <legend className="font-medium">{title}</legend>
      {items.length === 0 ? (
        <p className="text-stone-500">{emptyHint}</p>
      ) : (
        <div className="max-h-32 space-y-0.5 overflow-y-auto">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-800">
              <PixelCheckbox
                small
                checked={selected.includes(item.id)}
                onChange={() => onChange(toggleId(selected, item.id))}
              />
              <span className="truncate">{item.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function Labels({ node }: { node: TaskTreeNode }) {
  const { data: goals = [] } = useGoals();
  const { data: tags = [] } = useTags();
  const update = useUpdateTask();

  return (
    <>
      <LabelPicker
        title="Goals"
        items={goals}
        selected={node.goalIds}
        onChange={(goalIds) => update.mutate({ id: node.id, changes: { goalIds } })}
        emptyHint="Add a goal in the Goals box first."
      />
      <LabelPicker
        title="Tags"
        items={tags}
        selected={node.tagIds}
        onChange={(tagIds) => update.mutate({ id: node.id, changes: { tagIds } })}
        emptyHint="Add a tag in the Tags box first."
      />
      {update.error && <p className="text-xs text-red-600">{update.error.message}</p>}
    </>
  );
}

const CHECK_ROW = "flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-stone-100 dark:hover:bg-stone-800";

/** Today (any task), and for main tasks: its own point amount and whether it is persistent. */
function Doing({ node }: { node: TaskTreeNode }) {
  const { data: lists = [] } = useLists();
  const update = useUpdateTask();
  const setToday = useSetToday();
  const list = lists.find((l) => l.id === node.listId);
  const isReward = list?.kind === "reward";
  const [points, setPoints] = useState(node.points === null ? "" : String(node.points));
  useEffect(() => setPoints(node.points === null ? "" : String(node.points)), [node.points]);
  const save = (changes: { points?: number | null; isPersistent?: boolean }) =>
    update.mutate({ id: node.id, changes });

  function savePoints() {
    const text = points.trim();
    const next = text === "" ? null : Math.max(0, Math.round(Number(text)));
    if (next !== null && Number.isNaN(next)) return setPoints(node.points === null ? "" : String(node.points));
    if (next !== node.points) save({ points: next });
  }

  return (
    <div className="space-y-1">
      {/* A task written straight into Today has no list to go back to, so it can't be taken out. */}
      {(node.parentId || node.listId) && (
        <label className={CHECK_ROW}>
          <PixelCheckbox
            small
            checked={node.todaySince !== null}
            onChange={(e) => setToday.mutate({ id: node.id, today: e.target.checked })}
          />
          Do today
        </label>
      )}
      {!node.parentId && (
        <>
          <label className={CHECK_ROW} title="Stays in its list and can be done again and again; each time counts its points.">
            <PixelCheckbox
              small
              checked={node.isPersistent}
              onChange={(e) => save({ isPersistent: e.target.checked })}
            />
            {isReward ? "Persistent (can be bought again)" : "Persistent (can be done again)"}
          </label>
          <label className="flex items-center gap-2 px-1 text-xs">
            <span className="shrink-0">{isReward ? "Costs" : "Points"}</span>
            <input
              className="nes-input input !w-20 !px-2 !py-1 tabular-nums"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              onBlur={savePoints}
              onKeyDown={(e) => e.key === "Enter" && savePoints()}
              placeholder={String(list?.defaultPoints ?? (node.points === null ? (node.value ?? "") : ""))}
              aria-label={`Points for this task (empty = ${list ? "the list's" : "Today's"} amount)`}
            />
            <span className="text-stone-500">{node.points !== null ? "its own amount" : list ? "the list's amount" : "Today's amount"}</span>
          </label>
        </>
      )}
      {(update.error ?? setToday.error) && (
        <p className="text-xs text-red-600">{(update.error ?? setToday.error)!.message}</p>
      )}
    </div>
  );
}

/**
 * The "⋯" on each row: today / persistent / points, goals and tags (any task,
 * none by default), deadline (main tasks and their direct subtasks), and the
 * touch-friendly equivalents of Ctrl+Enter and Delete.
 */
export function TaskMenu({ node, depth, onAddSubtask }: Props) {
  const tree = useTree();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

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
    <span ref={ref} className="relative">
      <button
        type="button"
        className="btn-quiet glyph"
        aria-label="Task options"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        ⋯
      </button>
      {isOpen && (
        // On a phone it is a sheet along the bottom of the screen: beside its button it would hang off the edge.
        <div
          className="card absolute top-full right-0 z-20 mt-1 w-64 space-y-3 !p-3 shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:top-auto max-sm:bottom-2 max-sm:z-50 max-sm:mt-0 max-sm:max-h-[75dvh] max-sm:w-auto max-sm:overflow-y-auto"
          role="dialog"
          aria-label="Task options"
        >
          <Doing node={node} />
          <Labels node={node} />
          {depth <= 1 && !node.isPersistent && (
            <div className="space-y-1 text-xs">
              <span className="font-medium">Deadline</span>
              <DeadlineFields task={node} />
            </div>
          )}
          <div className="flex justify-between border-t border-stone-200 pt-2 dark:border-stone-800">
            <button type="button" className="btn-quiet" onClick={() => (setIsOpen(false), onAddSubtask())}>
              Add subtask
            </button>
            <button type="button" className="btn-quiet !text-red-600" onClick={() => (setIsOpen(false), tree.deleteTask(node))}>
              Delete task
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
