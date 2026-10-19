import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { TaskPlacement } from "../../api/tasks";
import { areaScroller, edgeScroller } from "../../lib/edgeScroll";
import { NO_FILTER, type LabelFilter } from "../../lib/labels";
import { isInRound, isShown } from "../../lib/recent";
import { useSortByDeadline, useTickedTasks } from "../../hooks/useAuth";
import { orderDay } from "../../lib/deadlines";
import { livesInToday, livesInWeek, weekColumn, weekDays } from "../../lib/week";
import { currentRound } from "../../lib/repeat";
import { localDate } from "../../api/client";
import {
  useDeleteList,
  useDeleteTask,
  useMoveTask,
  useMoveRound,
  usePlaceInWeek,
  usePressTask,
  useRestoreList,
  useRestoreTask,
  useSetToday,
  useToggleTask,
  useUndoPress,
} from "../../hooks/useTasks";
import type { List, TaskTreeNode, TickedTasks } from "../../types";
import { NotePanel } from "./NoteView";
import { focusTaskEditor } from "./TitleEditor";
import { newId } from "../../lib/offline/changes";

/** How long a ticked or pressed task's control waits before a second click counts. */
const DOUBLE_CLICK_MS = 600;

/** Once the change just shown is on the page: a moved row is put back in the DOM, which drops its focus. */
const afterRender = (then: () => void) => requestAnimationFrame(() => requestAnimationFrame(then));

/** The not-yet-saved task row opened by Enter / Ctrl+Enter. */
export interface Draft {
  parentId: string | null;
  /** Only meaningful for top-level drafts. */
  listId: string | null;
  /** The sibling it sits below; null = first in its list. */
  afterId: string | null;
  /** A main task written into this day of the Week box: `afterId` is its place there. */
  weekDay?: string;
}

export type DropTarget =
  | { kind: "task"; id: string; zone: "before" | "after" | "inside" }
  | { kind: "list"; listId: string }
  /** The Today box: marks the task for today; it stays where it is. */
  | { kind: "today" }
  /** The Week box, or its tab: the same for the week. Dropped there, a task goes last on today. */
  | { kind: "week" }
  /** A day of the Week box: last on that day. */
  | { kind: "weekDay"; day: string }
  /** Above or below a row of the Week box: that place on its day. */
  | { kind: "weekItem"; id: string; zone: "before" | "after" };

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
  /** Tasks are shown soonest date first, those without a date under them: the user's choice on their page. */
  byDeadline: boolean;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  /**
   * Call from the drag handle's onPointerDown. Works for mouse and touch. `round`: dragging one round of a task on a
   * schedule in the Week box (the day it was planned on), which moves only that round.
   */
  startDrag: (e: ReactPointerEvent<HTMLElement>, node: TaskTreeNode, round?: string) => void;
  /** Alt+Up / Alt+Down: swap with the previous / next sibling. */
  moveBy: (node: TaskTreeNode, direction: -1 | 1) => void;
  /** Deletes the task with its subtasks; undoable while it is in `undoable`. */
  deleteTask: (node: TaskTreeNode) => void;
  /** Deletes the list with all its tasks; undoable the same way. */
  deleteList: (list: List) => void;
  /**
   * Ticks a task, or unticks a ticked one. A tick that takes it out of sight (a main task, which goes to the Done
   * page, or any task when ticked ones are hidden) offers the undo, so a slip doesn't mean a trip there.
   */
  tick: (node: TaskTreeNode) => void;
  /** This task was just ticked or pressed: its checkbox or button waits a moment, so a double click counts once. */
  isBusy: (id: string) => boolean;
  /** One press of a persistent task's "done it" button; undoable. */
  pressTask: (node: TaskTreeNode) => void;
  /** Takes one press back: unticking a persistent task that shows as done. */
  takeBackPress: (node: TaskTreeNode, completionId: string) => void;
  /** What Ctrl+Z / the undo bar can still take back, oldest first. */
  undoable: Undoable[];
  undo: () => void;
  /** The task whose note is open at the side of the page; `edit`: opened to be written in. */
  openNote: { id: string; edit: boolean } | null;
  /** Shows a main task's note at the side of the page (the one before closes); `edit` for a task with no note yet. */
  showNote: (id: string, edit: boolean) => void;
  closeNote: () => void;
  error: Error | null;
}

/** `until`: when it stops being undoable (Date.now() time). */
export type Undoable = { title: string; id: string; until: number } & (
  | { kind: "task" | "list" | "finished" }
  | { kind: "press"; completionId: string }
);

/**
 * How long each action stays undoable from the page, counted from that action. The server keeps a delete
 * restorable a little longer (RESTORABLE_MS in backend/src/lib/deleted.ts), then removes it for good.
 */
const UNDO_WINDOW_MS = 10_000;

/** `Omit` of each member of a union, so a press keeps its completionId. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An Undoable before it is offered, without its `until`. */
type Offer = OmitEach<Undoable, "until">;

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
  // A row of the Week box itself (not one of the subtasks shown under it) stands for its place in the box.
  const weekItem = el.closest<HTMLElement>("[data-week-item]");
  if (weekItem && (!row || row.dataset.taskRow === weekItem.dataset.weekItem)) {
    const rect = (row ?? weekItem.querySelector("[data-week-row]") ?? weekItem).getBoundingClientRect();
    return { kind: "weekItem", id: weekItem.dataset.weekItem!, zone: y - rect.top < rect.height / 2 ? "before" : "after" };
  }
  if (row) {
    const rect = row.getBoundingClientRect();
    const fraction = (y - rect.top) / rect.height;
    const zone = fraction < 0.3 ? "before" : fraction > 0.7 ? "after" : "inside";
    return { kind: "task", id: row.dataset.taskRow!, zone };
  }
  const weekDay = el.closest<HTMLElement>("[data-week-day]");
  if (weekDay) return { kind: "weekDay", day: weekDay.dataset.weekDay! };
  // The Today box shows Today or Week; the tab of the other one takes drops too.
  const box = el.closest<HTMLElement>("[data-drop-today], [data-drop-week]");
  if (box) return { kind: box.dataset.dropWeek === undefined ? "today" : "week" };
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
  const [openNote, setOpenNote] = useState<{ id: string; edit: boolean } | null>(null);
  const showNote = useCallback((id: string, edit: boolean) => setOpenNote({ id, edit }), []);
  const closeNote = useCallback(() => setOpenNote(null), []);
  const ticked = useTickedTasks();
  const byDeadline = useSortByDeadline();
  const move = useMoveTask();
  const toggle = useToggleTask();
  const press = usePressTask();
  const undoPress = useUndoPress();
  const setToday = useSetToday();
  const placeInWeek = usePlaceInWeek();
  const moveRound = useMoveRound();
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

  const offer = useCallback((item: Offer) => setUndoable((stack) => [...stack, { ...item, until: Date.now() + UNDO_WINDOW_MS } as Undoable]), []);

  // The tasks just ticked or pressed. A ref, so a second click in the same instant already finds it; the re-render
  // shows the control waiting. Not until the server answers: offline, that may be hours (see lib/offline/changes).
  const busy = useRef(new Set<string>());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const once = useCallback((id: string, send: () => void) => {
    if (busy.current.has(id)) return;
    busy.current.add(id);
    rerender();
    send();
    setTimeout(() => {
      busy.current.delete(id);
      rerender();
    }, DOUBLE_CLICK_MS);
  }, []);

  const deleteTask = useCallback(
    (node: TaskTreeNode) => {
      // Gone from the page at once, offline too; an undo is sent after the delete, whenever that goes out.
      remove.mutate({ id: node.id });
      offer({ kind: "task", id: node.id, title: node.title });
    },
    [remove, offer],
  );

  const deleteList = useCallback(
    (list: List) => {
      removeList.mutateAsync(list.id).then(
        () => offer({ kind: "list", id: list.id, title: list.name }),
        () => {},
      );
    },
    [removeList, offer],
  );

  const tick = useCallback(
    (node: TaskTreeNode) => {
      const done = !node.isComplete;
      const leavesSight = done && (!node.parentId || ticked === "hide");
      // Shown at once, and it may wait to be sent while offline: the undo is offered now.
      once(node.id, () => {
        toggle.mutate({ id: node.id, done });
        if (leavesSight) offer({ kind: "finished", id: node.id, title: node.title });
      });
    },
    [toggle, ticked, once, offer],
  );

  const pressTask = useCallback(
    (node: TaskTreeNode) => {
      // The press gets its id here, so its undo can be offered (and sent) before the server has it.
      once(node.id, () => {
        const completionId = newId();
        press.mutate({ id: node.id, completionId });
        offer({ kind: "press", id: node.id, title: node.title, completionId });
      });
    },
    [press, once, offer],
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
      if (byId.get(last.id)?.isComplete) toggle.mutate({ id: last.id, done: false });
    } else {
      focusWhenShown.current = last.id;
      restore.mutate({ id: last.id });
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
    // Each action stops being undoable on its own time, not when the newest one does.
    const soonest = Math.min(...undoable.map((item) => item.until));
    const expire = setTimeout(
      () => setUndoable((stack) => stack.filter((item) => item.until > Date.now())),
      Math.max(0, soonest - Date.now()),
    );
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
    // Without a list: the tasks written into the same box, Today or Week.
    return node.parentId
      ? (byId.get(node.parentId)?.children ?? [])
      : tasks.filter((t) => t.listId === node.listId && (node.listId !== null || livesInWeek(t) === livesInWeek(node)));
  }, []);

  const placementFor = useCallback(
    (target: DropTarget, draggedId: string): TaskPlacement | null => {
      const { tasks, byId } = latest.current;
      const notDragged = (t: TaskTreeNode) => t.id !== draggedId;

      if (target.kind === "today" || target.kind === "week" || target.kind === "weekDay" || target.kind === "weekItem") return null;
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
      : tasks.filter((t) => t.listId === draft.listId && (draft.listId !== null || livesInWeek(t) === Boolean(draft.weekDay)));
    const after = siblings.findIndex((s) => s.id === draft.afterId);
    return { parentId: draft.parentId, listId: draft.listId, index: after + 1 };
  }, [draft]);

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, node: TaskTreeNode, round?: string) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      const own = handle.closest("li");
      let target: DropTarget | null = null;
      let pointer = { x: e.clientX, y: e.clientY };
      const retarget = () => {
        const next = hitTest(pointer.x, pointer.y, own);
        if (sameTarget(next, target)) return;
        target = next;
        setDropTarget(next);
      };
      const scroller = edgeScroller();
      // Near the top or bottom of the Week tab's days, or of a box's tasks capped on a phone, they scroll on, with the pointer held still too.
      const area = areaScroller(retarget);
      handle.setPointerCapture(e.pointerId);
      setDraggingId(node.id);

      const onMove = (ev: PointerEvent) => {
        pointer = { x: ev.clientX, y: ev.clientY };
        // The page scrolls at the window's edge, unless the week is scrolling there already.
        scroller.update(area.update(ev.clientX, ev.clientY) ? window.innerHeight / 2 : ev.clientY);
        retarget();
      };
      const finish = (drop: boolean) => {
        scroller.stop();
        area.stop();
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onCancel);
        setDraggingId(null);
        setDropTarget(null);
        // Today is a view: dropping a list's task on it (or among the tasks written there) marks it for today and leaves it in its list.
        const over = target?.kind === "task" ? latest.current.byId.get(target.id) : undefined;
        const amongTodays = target?.kind === "task" && target.zone !== "inside" && over !== undefined && livesInToday(over);
        if (drop && (target?.kind === "today" || (amongTodays && !livesInToday(node)))) {
          return setToday.mutate({ id: node.id, today: true });
        }
        // So is Week, with an order of its own on each day: a task dropped there takes that place, and stays in its list.
        if (drop && (target?.kind === "week" || target?.kind === "weekDay" || target?.kind === "weekItem")) {
          const column =
            target.kind === "week"
              ? null
              : target.kind === "weekDay"
                ? document.querySelector<HTMLElement>(`[data-week-day="${target.day}"]`)
                : document.querySelector(`[data-week-item="${target.id}"]`)?.closest<HTMLElement>("[data-week-day]");
          const day = column?.dataset.weekDay ?? localDate();
          // A task on a schedule isn't put on a day: its round is moved there (the one dragged; from a list, its current one).
          const isScheduled = !node.parentId && node.repeatEvery !== null && node.nextDue !== null && node.weekDay === null;
          if (isScheduled) return moveRound.mutate({ id: node.id, from: round ?? currentRound(node, localDate())!.planned, to: day });
          if (!column || target.kind === "week") return placeInWeek.mutate({ id: node.id, day });
          const shown = [...column.querySelectorAll<HTMLElement>("[data-week-item]")].map((el) => el.dataset.weekItem!).filter((id) => id !== node.id);
          const at = target.kind === "weekDay" ? shown.length : shown.indexOf(target.id) + (target.zone === "after" ? 1 : 0);
          return placeInWeek.mutate({ id: node.id, day, after: shown[at - 1] ?? null });
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
    [move, placementFor, setToday, placeInWeek, moveRound],
  );

  const moveBy = useCallback(
    (node: TaskTreeNode, direction: -1 | 1) => {
      // A task written into Week moves in the order of its day, among the rows shown, ticked or open like itself.
      if (livesInWeek(node) && rootId === null) {
        const today = localDate();
        const day = weekColumn(node, today);
        // Only what the user put there has an order to change: what came in by itself is left out.
        const order = (weekDays(latest.current.tasks, today, ticked, "never").find((d) => d.day === day)?.items ?? [])
          .filter((item) => !item.auto && (ticked !== "bottom" || item.node.isComplete === node.isComplete))
          .map((item) => item.node.id);
        const at = order.indexOf(node.id);
        if (at < 0 || !order[at + direction]) return;
        const after = direction === -1 ? (order[at - 2] ?? null) : order[at + 1];
        placeInWeek.mutate({ id: node.id, day, after });
        afterRender(() => focusTaskEditor(node.id));
        return;
      }
      const siblings = siblingsOf(node);
      // The swap is with the row next to it on screen. Ticked tasks shown under the open ones: step over siblings of
      // the other kind. Otherwise rows are in their own order, and a list leaves out the ticked ones it no longer shows.
      // Shown soonest date first: a task only changes places with those of its own day, or with the others that have none.
      const steppedOver = (sibling: TaskTreeNode) =>
        (byDeadline && orderDay(sibling) !== orderDay(node)) ||
        (ticked === "bottom" ? sibling.isComplete !== node.isComplete : rootId === null && !isShown(sibling, ticked, isInRound(node, latest.current.byId)));
      let index = siblings.findIndex((s) => s.id === node.id) + direction;
      while (siblings[index] && steppedOver(siblings[index])) index += direction;
      if (index < 0 || index >= siblings.length) return;
      const placement = { parentId: node.parentId, listId: node.parentId ? null : node.listId, index };
      // The row is re-inserted in the DOM, which drops focus; put it back.
      move.mutate({ id: node.id, placement });
      afterRender(() => focusTaskEditor(node.id));
    },
    [move, placeInWeek, siblingsOf, ticked, byDeadline, rootId],
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
    byDeadline,
    draggingId,
    dropTarget,
    startDrag,
    moveBy,
    deleteTask,
    deleteList,
    tick,
    isBusy: (id) => busy.current.has(id),
    pressTask,
    takeBackPress,
    undoable,
    undo,
    openNote,
    showNote,
    closeNote,
    error:
      move.error ??
      remove.error ??
      restore.error ??
      removeList.error ??
      restoreList.error ??
      // A refused tick or press shows in the popup next to the click instead.
      setToday.error ??
      placeInWeek.error ??
      moveRound.error,
  };
  // A deleted task takes its note along.
  const noteNode = openNote ? byId.get(openNote.id) : undefined;
  return (
    <TreeContext.Provider value={value}>
      {children}
      {openNote && noteNode && <NotePanel node={noteNode} edit={openNote.edit} onClose={closeNote} />}
    </TreeContext.Provider>
  );
}
