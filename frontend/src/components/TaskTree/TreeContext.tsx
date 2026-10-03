import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { TaskPlacement } from "../../api/tasks";
import { NO_FILTER, type LabelFilter } from "../../lib/labels";
import { useDeleteList, useDeleteTask, useMoveTask, useRestoreList, useRestoreTask } from "../../hooks/useTasks";
import type { List, TaskTreeNode } from "../../types";
import { focusTaskEditor } from "./TitleEditor";

/** The not-yet-saved task row opened by Enter / Ctrl+Enter. */
export interface Draft {
  parentId: string | null;
  /** Only meaningful for top-level drafts. */
  listId: string | null;
  /** The sibling it sits below; null = first in its list. */
  afterId: string | null;
}

export type DropTarget =
  | { kind: "task"; id: string; zone: "before" | "after" | "inside" }
  | { kind: "list"; listId: string };

interface TreeContextValue {
  draft: Draft | null;
  setDraft: (draft: Draft | null) => void;
  draftText: string;
  setDraftText: (text: string) => void;
  /** Where the draft row would be inserted, counted among all its siblings (not just the ones a filter shows). */
  draftPlacement: () => TaskPlacement;
  /** Goals and tags given to tasks created right now: the active filter's, so a new task doesn't vanish from a filtered view. */
  newTaskLabels: LabelFilter;
  /** On a task's own page: that task. Enter on it adds a subtask, since a new main task wouldn't show on the page. */
  rootId: string | null;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  /** Call from the drag handle's onPointerDown. Works for mouse and touch. */
  startDrag: (e: ReactPointerEvent<HTMLElement>, node: TaskTreeNode) => void;
  /** Alt+Up / Alt+Down: swap with the previous / next sibling. */
  moveBy: (node: TaskTreeNode, direction: -1 | 1) => void;
  /** Deletes the task with its subtasks; undoable while it is in `deleted`. */
  deleteTask: (node: TaskTreeNode) => void;
  /** Deletes the list with all its tasks; undoable the same way. */
  deleteList: (list: List) => void;
  /** Recently deleted tasks and lists that Ctrl+Z / the undo bar can still bring back, oldest first. */
  deleted: DeletedItem[];
  undoDelete: () => void;
  error: Error | null;
}

export interface DeletedItem {
  kind: "task" | "list";
  id: string;
  title: string;
}

/** How long a delete stays undoable from the page (the server keeps it longer). */
const UNDO_WINDOW_MS = 10_000;

const TreeContext = createContext<TreeContextValue | null>(null);

export function useTree() {
  const value = useContext(TreeContext);
  if (!value) throw new Error("useTree must be used inside <TreeProvider>");
  return value;
}

function sameTarget(a: DropTarget | null, b: DropTarget | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** What the pointer is over, ignoring the dragged task's own subtree (`own`). */
function hitTest(x: number, y: number, own: Element | null): DropTarget | null {
  const el = document.elementFromPoint(x, y);
  if (!el || own?.contains(el)) return null;

  const row = el.closest<HTMLElement>("[data-task-row]");
  if (row) {
    const rect = row.getBoundingClientRect();
    const fraction = (y - rect.top) / rect.height;
    const zone = fraction < 0.3 ? "before" : fraction > 0.7 ? "after" : "inside";
    return { kind: "task", id: row.dataset.taskRow!, zone };
  }
  const list = el.closest<HTMLElement>("[data-drop-list]");
  if (list) return { kind: "list", listId: list.dataset.dropList! };
  return null;
}

interface ProviderProps {
  /** All top-level trees, across every list, unfiltered. */
  tasks: TaskTreeNode[];
  newTaskLabels?: LabelFilter;
  rootId?: string | null;
  children: ReactNode;
}

export function TreeProvider({ tasks, newTaskLabels = NO_FILTER, rootId = null, children }: ProviderProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [deleted, setDeleted] = useState<DeletedItem[]>([]);
  const move = useMoveTask();
  const remove = useDeleteTask();
  const restore = useRestoreTask();
  const removeList = useDeleteList();
  const restoreList = useRestoreList();

  const byId = useMemo(() => {
    const map = new Map<string, TaskTreeNode>();
    const walk = (node: TaskTreeNode) => {
      map.set(node.id, node);
      node.children.forEach(walk);
    };
    tasks.forEach(walk);
    return map;
  }, [tasks]);

  // A restored task gets focus as soon as it is back on the page.
  const focusWhenShown = useRef<string | null>(null);
  useEffect(() => {
    const id = focusWhenShown.current;
    if (!id || !byId.has(id)) return;
    focusWhenShown.current = null;
    focusTaskEditor(id);
  }, [byId]);

  const deleteTask = useCallback(
    (node: TaskTreeNode) => {
      // Offered for undo only once the server has really deleted it.
      remove.mutateAsync(node.id).then(
        () => setDeleted((stack) => [...stack, { kind: "task", id: node.id, title: node.title }]),
        () => {},
      );
    },
    [remove],
  );

  const deleteList = useCallback(
    (list: List) => {
      removeList.mutateAsync(list.id).then(
        () => setDeleted((stack) => [...stack, { kind: "list", id: list.id, title: list.name }]),
        () => {},
      );
    },
    [removeList],
  );

  const undoDelete = useCallback(() => {
    const last = deleted.at(-1);
    if (!last) return;
    setDeleted((stack) => stack.slice(0, -1));
    if (last.kind === "list") {
      restoreList.mutate(last.id);
    } else {
      focusWhenShown.current = last.id;
      restore.mutate(last.id);
    }
  }, [deleted, restore, restoreList]);

  // While a delete is undoable, Ctrl+Z means "bring it back" rather than undoing typing.
  useEffect(() => {
    if (deleted.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      e.preventDefault();
      undoDelete();
    };
    const expire = setTimeout(() => setDeleted([]), UNDO_WINDOW_MS);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      clearTimeout(expire);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [deleted, undoDelete]);

  // Read by drag listeners that outlive the render they were created in.
  const latest = useRef({ tasks, byId });
  latest.current = { tasks, byId };

  const siblingsOf = useCallback((node: TaskTreeNode): TaskTreeNode[] => {
    const { tasks, byId } = latest.current;
    return node.parentId
      ? (byId.get(node.parentId)?.children ?? [])
      : tasks.filter((t) => t.listId === node.listId);
  }, []);

  const placementFor = useCallback(
    (target: DropTarget, draggedId: string): TaskPlacement | null => {
      const { tasks, byId } = latest.current;
      const notDragged = (t: TaskTreeNode) => t.id !== draggedId;

      if (target.kind === "list") {
        const inList = tasks.filter((t) => t.listId === target.listId).filter(notDragged);
        return { parentId: null, listId: target.listId, index: inList.length };
      }
      const over = byId.get(target.id);
      if (!over) return null;
      if (target.zone === "inside") {
        return { parentId: over.id, listId: null, index: over.children.filter(notDragged).length };
      }
      const siblings = siblingsOf(over).filter(notDragged);
      const at = siblings.findIndex((s) => s.id === over.id);
      return {
        parentId: over.parentId,
        listId: over.parentId ? null : over.listId,
        index: target.zone === "after" ? at + 1 : at,
      };
    },
    [siblingsOf],
  );

  const draftPlacement = useCallback((): TaskPlacement => {
    const { tasks, byId } = latest.current;
    if (!draft) return { parentId: null, listId: null, index: 0 };
    const siblings = draft.parentId
      ? (byId.get(draft.parentId)?.children ?? [])
      : tasks.filter((t) => t.listId === draft.listId);
    const after = siblings.findIndex((s) => s.id === draft.afterId);
    return { parentId: draft.parentId, listId: draft.listId, index: after + 1 };
  }, [draft]);

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, node: TaskTreeNode) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      const own = handle.closest("li");
      let target: DropTarget | null = null;
      handle.setPointerCapture(e.pointerId);
      setDraggingId(node.id);

      const onMove = (ev: PointerEvent) => {
        const next = hitTest(ev.clientX, ev.clientY, own);
        if (sameTarget(next, target)) return;
        target = next;
        setDropTarget(next);
      };
      const finish = (drop: boolean) => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onCancel);
        setDraggingId(null);
        setDropTarget(null);
        const placement = drop && target ? placementFor(target, node.id) : null;
        if (placement) move.mutate({ id: node.id, placement });
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onCancel);
    },
    [move, placementFor],
  );

  const moveBy = useCallback(
    (node: TaskTreeNode, direction: -1 | 1) => {
      const siblings = siblingsOf(node);
      const index = siblings.findIndex((s) => s.id === node.id) + direction;
      if (index < 0 || index >= siblings.length) return;
      const placement = { parentId: node.parentId, listId: node.parentId ? null : node.listId, index };
      // The row is re-inserted in the DOM, which drops focus; put it back.
      move.mutateAsync({ id: node.id, placement }).then(() => focusTaskEditor(node.id), () => {});
    },
    [move, siblingsOf],
  );

  const value: TreeContextValue = {
    draft,
    setDraft,
    draftText,
    setDraftText,
    draftPlacement,
    newTaskLabels,
    rootId,
    draggingId,
    dropTarget,
    startDrag,
    moveBy,
    deleteTask,
    deleteList,
    deleted,
    undoDelete,
    error: move.error ?? remove.error ?? restore.error ?? removeList.error ?? restoreList.error,
  };
  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
}
