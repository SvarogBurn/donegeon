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
import { edgeScroller } from "../../lib/edgeScroll";
import { NO_FILTER, type LabelFilter } from "../../lib/labels";
import { isShown } from "../../lib/recent";
import { useTickedTasks } from "../../hooks/useAuth";
import {
  useDeleteList,
  useDeleteTask,
  useMoveTask,
  usePressTask,
  useRestoreList,
  useRestoreTask,
  useSetToday,
  useToggleTask,
  useUndoPress,
} from "../../hooks/useTasks";
import type { List, TaskTreeNode, TickedTasks } from "../../types";
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
  | { kind: "list"; listId: string }
  /** The Today box: marks the task for today; it stays where it is. */
  | { kind: "today" };

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
  /** What the lists do with a ticked task: the user's choice on their page. */
  ticked: TickedTasks;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  /** Call from the drag handle's onPointerDown. Works for mouse and touch. */
  startDrag: (e: ReactPointerEvent<HTMLElement>, node: TaskTreeNode) => void;
  /** Alt+Up / Alt+Down: swap with the previous / next sibling. */
  moveBy: (node: TaskTreeNode, direction: -1 | 1) => void;
  /** Deletes the task with its subtasks; undoable while it is in `undoable`. */
  deleteTask: (node: TaskTreeNode) => void;
  /** Deletes the list with all its tasks; undoable the same way. */
  deleteList: (list: List) => void;
  /** Ticks a task and offers the undo: for a main task, which goes to the Done page, so a slip doesn't mean a trip there. */
  finishTask: (node: TaskTreeNode) => void;
  /** One press of a persistent task's "done it" button; undoable. */
  pressTask: (node: TaskTreeNode) => void;
  /** Takes one press back: unticking a persistent task that shows as done. */
  takeBackPress: (node: TaskTreeNode, completionId: string) => void;
  /** What Ctrl+Z / the undo bar can still take back, oldest first. */
  undoable: Undoable[];
  undo: () => void;
  error: Error | null;
}

export type Undoable =
  | { kind: "task" | "list" | "finished"; id: string; title: string }
  | { kind: "press"; id: string; title: string; completionId: string };

/** How long an action stays undoable from the page (the server keeps deletes longer). */
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
  if (el.closest("[data-drop-today]")) return { kind: "today" };
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
  const [undoable, setUndoable] = useState<Undoable[]>([]);
  const ticked = useTickedTasks();
  const move = useMoveTask();
  const toggle = useToggleTask();
  const press = usePressTask();
  const undoPress = useUndoPress();
  const setToday = useSetToday();
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
        () => setUndoable((stack) => [...stack, { kind: "task", id: node.id, title: node.title }]),
        () => {},
      );
    },
    [remove],
  );

  const deleteList = useCallback(
    (list: List) => {
      removeList.mutateAsync(list.id).then(
        () => setUndoable((stack) => [...stack, { kind: "list", id: list.id, title: list.name }]),
        () => {},
      );
    },
    [removeList],
  );

  const finishTask = useCallback(
    (node: TaskTreeNode) => {
      toggle.mutateAsync(node.id).then(
        () => setUndoable((stack) => [...stack, { kind: "finished", id: node.id, title: node.title }]),
        () => {},
      );
    },
    [toggle],
  );

  const pressTask = useCallback(
    (node: TaskTreeNode) => {
      press.mutateAsync(node.id).then(
        (completion) =>
          setUndoable((stack) => [...stack, { kind: "press", id: node.id, title: node.title, completionId: completion.id }]),
        () => {},
      );
    },
    [press],
  );

  const takeBackPress = useCallback(
    (node: TaskTreeNode, completionId: string) => {
      // It is no longer there for Ctrl+Z to take back a second time.
      setUndoable((stack) => stack.filter((item) => !(item.kind === "press" && item.completionId === completionId)));
      undoPress.mutate({ id: node.id, completionId });
    },
    [undoPress],
  );

  const undo = useCallback(() => {
    const last = undoable.at(-1);
    if (!last) return;
    setUndoable((stack) => stack.slice(0, -1));
    if (last.kind === "list") {
      restoreList.mutate(last.id);
    } else if (last.kind === "press") {
      undoPress.mutate({ id: last.id, completionId: last.completionId });
    } else if (last.kind === "finished") {
      // Still ticked? Then untick it, which puts it back in its list.
      if (byId.get(last.id)?.isComplete) toggle.mutate(last.id);
    } else {
      focusWhenShown.current = last.id;
      restore.mutate(last.id);
    }
  }, [undoable, restore, restoreList, undoPress, toggle, byId]);

  // While something is undoable, Ctrl+Z means "take it back" rather than undoing typing.
  useEffect(() => {
    if (undoable.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      e.preventDefault();
      undo();
    };
    const expire = setTimeout(() => setUndoable([]), UNDO_WINDOW_MS);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      clearTimeout(expire);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [undoable, undo]);

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

      if (target.kind === "today") return null;
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
      const scroller = edgeScroller();
      handle.setPointerCapture(e.pointerId);
      setDraggingId(node.id);

      const onMove = (ev: PointerEvent) => {
        scroller.update(ev.clientY);
        const next = hitTest(ev.clientX, ev.clientY, own);
        if (sameTarget(next, target)) return;
        target = next;
        setDropTarget(next);
      };
      const finish = (drop: boolean) => {
        scroller.stop();
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onCancel);
        setDraggingId(null);
        setDropTarget(null);
        // Today is a view: dropping a list's task on it (or among the tasks written there) marks it for today and leaves it in its list.
        const livesInToday = (t: TaskTreeNode | undefined) => Boolean(t) && !t!.parentId && !t!.listId;
        const amongTodays =
          target?.kind === "task" && target.zone !== "inside" && livesInToday(latest.current.byId.get(target.id));
        if (drop && (target?.kind === "today" || (amongTodays && !livesInToday(node)))) {
          return setToday.mutate({ id: node.id, today: true });
        }
        const placement = drop && target ? placementFor(target, node.id) : null;
        if (placement) move.mutate({ id: node.id, placement });
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onCancel);
    },
    [move, placementFor, setToday],
  );

  const moveBy = useCallback(
    (node: TaskTreeNode, direction: -1 | 1) => {
      const siblings = siblingsOf(node);
      // The swap is with the row next to it on screen. Ticked tasks shown under the open ones: step over siblings of
      // the other kind. Otherwise rows are in their own order, and a list leaves out the ticked ones it no longer shows.
      const steppedOver = (sibling: TaskTreeNode) =>
        ticked === "bottom" ? sibling.isComplete !== node.isComplete : rootId === null && !isShown(sibling, ticked);
      let index = siblings.findIndex((s) => s.id === node.id) + direction;
      while (siblings[index] && steppedOver(siblings[index])) index += direction;
      if (index < 0 || index >= siblings.length) return;
      const placement = { parentId: node.parentId, listId: node.parentId ? null : node.listId, index };
      // The row is re-inserted in the DOM, which drops focus; put it back.
      move.mutateAsync({ id: node.id, placement }).then(() => focusTaskEditor(node.id), () => {});
    },
    [move, siblingsOf, ticked, rootId],
  );

  const value: TreeContextValue = {
    draft,
    setDraft,
    draftText,
    setDraftText,
    draftPlacement,
    newTaskLabels,
    rootId,
    ticked,
    draggingId,
    dropTarget,
    startDrag,
    moveBy,
    deleteTask,
    deleteList,
    finishTask,
    pressTask,
    takeBackPress,
    undoable,
    undo,
    error:
      move.error ??
      remove.error ??
      restore.error ??
      removeList.error ??
      restoreList.error ??
      // A refused tick or press shows in the popup next to the click instead.
      setToday.error,
  };
  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
}
