import { Fragment, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { PixelCheckbox } from "../PixelCheckbox";
import { useNavigate } from "react-router";
import { useCreateTask, useGoals, useTags, useToggleTask, useUpdateTask } from "../../hooks/useTasks";
import { localDate } from "../../api/client";
import { formatDay } from "../../lib/dates";
import { isFiltering } from "../../lib/labels";
import { isDue, isWaiting, repeatLabel } from "../../lib/repeat";
import { hasTaskPage } from "../../lib/taskPage";
import type { TaskTreeNode } from "../../types";
import { ValueChip } from "../Points/ValueChip";
import { DeadlineBadge } from "./DeadlineBadge";
import { PressCopies } from "./PressCopies";
import { TaskMenu } from "./TaskMenu";
import { focusNeighbor, TitleEditor } from "./TitleEditor";
import { useTree } from "./TreeContext";

/** The task's goals (filled pills) and tags (#outlined), by name. */
function LabelChips({ node }: { node: TaskTreeNode }) {
  const { data: goals = [] } = useGoals();
  const { data: tags = [] } = useTags();
  if (node.goalIds.length + node.tagIds.length === 0) return null;

  return (
    <>
      {goals
        .filter((goal) => node.goalIds.includes(goal.id))
        .map((goal) => (
          <span
            key={goal.id}
            className="pixel-chip max-w-32 truncate bg-stone-200 px-2 py-0.5 text-xs text-stone-700 dark:bg-stone-700 dark:text-stone-200"
            title={`Goal: ${goal.name}`}
          >
            {goal.name}
          </span>
        ))}
      {tags
        .filter((tag) => node.tagIds.includes(tag.id))
        .map((tag) => (
          <span
            key={tag.id}
            className="pixel-chip max-w-32 truncate bg-white px-2 py-0.5 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-300"
            title={`Tag: ${tag.name}`}
          >
            #{tag.name}
          </span>
        ))}
    </>
  );
}

const DROP_STYLES = {
  before: "shadow-[inset_0_2px_0_var(--color-emerald-600)]",
  after: "shadow-[inset_0_-2px_0_var(--color-emerald-600)]",
  inside: "bg-emerald-100 dark:bg-emerald-950",
};

/** Parts of a row that do their own thing; a click anywhere else opens the task's page (if it has one). */
const ROW_CONTROLS = "button, input, textarea, a, label, [role=dialog]";

function TaskNode({ node, depth }: { node: TaskTreeNode; depth: number }) {
  const tree = useTree();
  const navigate = useNavigate();
  // A drag starts on the handle but can end on the row's empty space, which the browser reports as a click there.
  const pressedControl = useRef(false);
  // Subtasks start hidden behind the row's arrow, so a list reads as its main tasks. They show from the start on a
  // task's own page, and while a filter is on (a matching subtask must not hide in its parent), until the arrow says otherwise.
  const [opened, setOpened] = useState<boolean | null>(null);
  const isOpen = opened ?? (tree.rootId !== null || isFiltering(tree.newTaskLabels));
  const [title, setTitle] = useState(node.title);
  useEffect(() => setTitle(node.title), [node.title]);

  const toggle = useToggleTask();
  const rename = useUpdateTask();
  const error = toggle.error ?? rename.error;

  const isPersistent = node.isPersistent && !node.parentId;
  const today = localDate();
  const pressedToday = node.completions.filter((press) => press.day === today).length;
  const hasChildren = node.children.length > 0;
  // A task is ticked last: everything beneath it first.
  const hasOpenSubtasks = !node.isComplete && node.descendantDoneCount < node.descendantCount;
  const hasDraftChild = tree.draft?.parentId === node.id;
  const drop = tree.dropTarget?.kind === "task" && tree.dropTarget.id === node.id ? tree.dropTarget.zone : null;

  function saveTitle() {
    const next = title.trim();
    if (!next) setTitle(node.title);
    else if (next !== node.title) rename.mutate({ id: node.id, changes: { title: next } });
  }

  function addSubtask() {
    setOpened(true);
    tree.setDraft({ parentId: node.id, listId: null, afterId: node.children.at(-1)?.id ?? null });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      saveTitle();
      if (e.ctrlKey || e.metaKey) addSubtask();
      else if (node.id === tree.rootId) {
        setOpened(true);
        tree.setDraft({ parentId: node.id, listId: null, afterId: null });
      } else tree.setDraft({ parentId: node.parentId, listId: node.parentId ? null : node.listId, afterId: node.id });
    } else if (e.key === "Escape") {
      setTitle(node.title);
    } else if (e.key === "Delete" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // With the caret at the end there is no text left to delete, so the key
      // deletes the task (and its subtasks); Ctrl+Z undoes it. Mid-title it still edits text.
      const el = e.currentTarget;
      if (el.selectionStart !== el.value.length || el.selectionEnd !== el.value.length) return;
      // Not while the title is being edited, nor from a held-down key: shortening a title with
      // Delete ends with the caret at the end, and the next press must not take the task with it.
      if (e.repeat || el.value !== node.title) return;
      e.preventDefault();
      // Focus stays in the same box (list, Today or task page) rather than jumping to the one above.
      const box = el.closest("section");
      if (!focusNeighbor(el, -1, box)) focusNeighbor(el, 1, box);
      tree.deleteTask(node);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      tree.moveBy(node, e.key === "ArrowUp" ? -1 : 1);
    }
  }

  const opens = hasTaskPage(node);
  function openTask(e: MouseEvent<HTMLDivElement>) {
    if (!opens || pressedControl.current || (e.target as Element).closest(ROW_CONTROLS)) return;
    navigate(`/tasks/${node.id}`);
  }

  return (
    <li className={tree.draggingId === node.id ? "opacity-40" : ""}>
      <div
        data-task-row={node.id}
        onPointerDown={(e) => (pressedControl.current = Boolean((e.target as Element).closest(ROW_CONTROLS)))}
        onClick={openTask}
        data-today={node.todaySince ? "" : undefined}
        title={node.todaySince ? "In Today" : undefined}
        // Tasks marked for Today are tinted green in their list.
        className={`flex ${opens ? "cursor-pointer" : ""} flex-wrap items-start gap-x-1.5 gap-y-1 rounded px-1 py-0.5 ${node.todaySince ? "bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-stone-50 dark:hover:bg-stone-800/50"} ${drop ? DROP_STYLES[drop] : ""}`}
      >
        <button
          type="button"
          className="task-arrow mt-1.5"
          onClick={() => setOpened(!isOpen)}
          disabled={!hasChildren}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Collapse subtasks" : "Expand subtasks"}
        />

        {isPersistent ? (
          <button
            type="button"
            className="repeat-button mt-1.5"
            onClick={() => tree.pressTask(node)}
            aria-label={`Done "${node.title}" once more`}
            title="Done it. Stays here for next time; a ticked copy underneath can be unticked to take it back"
          />
        ) : (
          <PixelCheckbox
            className={`mt-1.5 ${hasOpenSubtasks ? "opacity-40" : ""}`}
            checked={node.isComplete}
            disabled={toggle.isPending || hasOpenSubtasks}
            title={hasOpenSubtasks ? "Tick its subtasks first" : undefined}
            // Ticking a main task finishes it: it is in the Done page, and leaves its list 24 hours later. With an undo,
            // as for any task that leaves its list the moment it is ticked.
            onChange={() => (!node.isComplete && (!node.parentId || tree.ticked === "hide") ? tree.finishTask(node) : toggle.mutate(node.id))}
            aria-label={`Mark "${node.title}" ${node.isComplete ? "not done" : "done"}`}
          />
        )}

        <div className="min-w-32 flex-1">
          <TitleEditor
            editorId={node.id}
            fitText
            value={title}
            onChange={setTitle}
            onKeyDown={onKeyDown}
            onBlur={saveTitle}
            aria-label="Task title"
            // A scheduled task that is done for now is greyed until its next day.
            className={node.isComplete ? "text-stone-400 line-through" : isWaiting(node, today) ? "text-stone-400" : ""}
          />
        </div>

        <span className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
          <LabelChips node={node} />
          {isPersistent && pressedToday > 0 && (
            <span className="text-xs text-stone-500 tabular-nums" data-pressed-today={pressedToday}>
              ×{pressedToday} today
            </span>
          )}
          {node.nextDue && (
            <span
              data-next-due={node.nextDue}
              data-due={isDue(node, today) ? "" : undefined}
              title={`Repeats ${repeatLabel(node)}`}
              className={`pixel-chip px-2 py-0.5 text-xs whitespace-nowrap ${isDue(node, today) ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"}`}
            >
              {node.nextDue === today ? "due today" : `${isDue(node, today) ? "due since" : "next"} ${formatDay(node.nextDue)}`}
            </span>
          )}
          <DeadlineBadge task={node} />
          {hasChildren && (
            <span className="text-xs text-stone-500 tabular-nums">
              {node.descendantDoneCount}/{node.descendantCount} done
            </span>
          )}
          <ValueChip node={node} />
          <TaskMenu node={node} depth={depth} onAddSubtask={addSubtask} />
          <button
            type="button"
            className="btn-quiet cursor-grab touch-none glyph select-none active:cursor-grabbing"
            onPointerDown={(e) => tree.startDrag(e, node)}
            aria-label="Drag to move this task"
            title="Drag to move, or onto the Today box to do it today. Keyboard: Alt+↑ / Alt+↓ in the task"
          >
            ⠿
          </button>
        </span>
      </div>

      {error && <p className="ml-7 text-xs text-red-600">{error.message}</p>}

      {/* Each time a persistent task was done lately, as a ticked copy in line with it (past the arrow's place). */}
      <PressCopies node={node} className="ml-[22px]" />

      {((hasChildren && isOpen) || hasDraftChild) && (
        <div className="ml-3 border-l border-stone-200 pl-3 dark:border-stone-800">
          <TaskTree nodes={isOpen ? node.children : []} parentId={node.id} listId={null} depth={depth + 1} />
        </div>
      )}
    </li>
  );
}

/** The unsaved row opened by Enter / Ctrl+Enter. */
function DraftRow() {
  const tree = useTree();
  const createTask = useCreateTask();
  const ref = useRef<HTMLTextAreaElement>(null);
  const draft = tree.draft!;
  useEffect(() => ref.current?.focus(), []);

  const placement = () => ({ ...tree.draftPlacement(), ...tree.newTaskLabels });

  function close() {
    tree.setDraft(null);
    tree.setDraftText("");
  }

  /** Saves the row, then opens the next one: below it, or beneath it as its first subtask. */
  async function submit(next: "sibling" | "subtask") {
    const title = tree.draftText.trim();
    if (!title || createTask.isPending) return;
    tree.setDraftText("");
    try {
      const created = await createTask.mutateAsync({ title, ...placement() });
      tree.setDraft(
        next === "subtask"
          ? { parentId: created.id, listId: null, afterId: null }
          : { ...draft, afterId: created.id },
      );
    } catch {
      tree.setDraftText(title);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey && !tree.draftText.trim())) {
      focusNeighbor(e.currentTarget, -1);
      close();
    } else if (e.key === "Enter" && !e.shiftKey) {
      submit(e.ctrlKey || e.metaKey ? "subtask" : "sibling");
    }
  }

  // Leaving the row keeps what was typed. Checked a tick later, because the row
  // also loses focus for a moment when it is re-inserted further down the list.
  const finishRef = useRef(() => {});
  finishRef.current = () => {
    const title = tree.draftText.trim();
    if (title) createTask.mutate({ title, ...placement() });
    close();
  };
  function onBlur(e: FocusEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    setTimeout(() => {
      if (el.isConnected && document.activeElement !== el) finishRef.current();
    });
  }

  return (
    <li>
      <div className="flex items-start gap-x-1.5 px-1 py-0.5">
        <span className="w-4" />
        <span className="mt-2 size-4 rounded-sm border border-dashed border-stone-400" />
        <div className="min-w-32 flex-1">
          <TitleEditor
            ref={ref}
            editorId="draft"
            value={tree.draftText}
            onChange={tree.setDraftText}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            placeholder="New task"
            aria-label="New task title"
          />
        </div>
      </div>
      {createTask.error && <p className="ml-7 text-xs text-red-600">{createTask.error.message}</p>}
    </li>
  );
}

interface TaskTreeProps {
  nodes: TaskTreeNode[];
  parentId: string | null;
  /** For top-level tasks: the list they are in. Null below the top level. */
  listId: string | null;
  /** Depth of `nodes`: 0 for main tasks. Decides which options a row offers. */
  depth?: number;
}

/** Ticked tasks sit under the open ones; each group keeps the user's own order. Shown that way only: nothing is moved. */
const tickedLast = (nodes: TaskTreeNode[]) => [...nodes.filter((n) => !n.isComplete), ...nodes.filter((n) => n.isComplete)];

export function TaskTree({ nodes, parentId, listId, depth = 0 }: TaskTreeProps) {
  const { draft, ticked } = useTree();
  const draftIsHere = draft !== null && draft.parentId === parentId && (parentId !== null || draft.listId === listId);

  return (
    <ul>
      {draftIsHere && draft.afterId === null && <DraftRow />}
      {/* Unless the user chose otherwise: then every task keeps its place, ticked or not. */}
      {(ticked === "bottom" ? tickedLast(nodes) : nodes).map((node) => (
        <Fragment key={node.id}>
          <TaskNode node={node} depth={depth} />
          {draftIsHere && draft.afterId === node.id && <DraftRow />}
        </Fragment>
      ))}
    </ul>
  );
}
