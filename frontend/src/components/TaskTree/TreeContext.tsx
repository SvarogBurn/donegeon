import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { TaskPlacement } from "../../api/tasks";
import { useSortByDeadline, useTickedTasks } from "../../hooks/useAuth";
import { useDeleteList } from "../../hooks/lists";
import { useDeleteTask, usePressTask, useToggleTask, useUndoPress } from "../../hooks/tasks";
import { NO_FILTER, type LabelFilter } from "../../lib/labels";
import { newId } from "../../lib/offline/changes";
import type { List, TaskTreeNode, TickedTasks } from "../../types";
import { DragStore, type DragState } from "./dragState";
import { NotePanel } from "./NoteView";
import { siblingsIn, useTaskMoves } from "./useTaskMoves";
import { useBusyGuard, useUndoStack, type Undoable } from "./useUndoStack";

/** The not-yet-saved task row opened by Enter / Ctrl+Enter. */
export interface Draft {
  parentId: string | null;
  /** Only meaningful for top-level drafts. */
  listId: string | null;
  /** The sibling it sits below; null = first in its list. */
  afterId: string | null;
  /** A main task written into this day of the Week box: `afterId` is its place there. */
  weekDay?: string;
  /** Opened in a calendar day's popup (`DraftScope`): shown there only, not in the lists behind it. */
  scope?: string;
  /** Opened below a task with a deadline in that popup: the new task gets the same one, so it shows there too. */
  deadline?: { date: string; type: "hard" | "soft" };
}

/**
 * Rows shown somewhere other than the lists: a calendar day's popup (Deadlines tab). A row opened from them carries
 * `scope` and shows only there; one opened below a task in `deadlines` gets that deadline; subtasks show from the start.
 */
export const DraftScope = createContext<{ scope: string; deadlines: Map<string, NonNullable<Draft["deadline"]>> } | null>(null);
export const useDraftScope = () => useContext(DraftScope);

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
  /** The drag under way; rows and boxes read it through useDrag. */
  drag: DragStore;
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

const TreeContext = createContext<TreeContextValue | null>(null);

export function useTree() {
  const value = useContext(TreeContext);
  if (!value) throw new Error("useTree must be used inside <TreeProvider>");
  return value;
}

/**
 * What the drag under way means for one row or box, picked by `select` (a yes / no, a zone): it re-renders only
 * when that answer changes, not on every move of the pointer.
 */
export function useDrag<T>(select: (state: DragState) => T): T {
  const { drag } = useTree();
  return useSyncExternalStore(drag.subscribe, () => select(drag.get()));
}

interface ProviderProps {
  /** All top-level trees, across every list, unfiltered. */
  tasks: TaskTreeNode[];
  newTaskLabels?: LabelFilter;
  rootId?: string | null;
  children: ReactNode;
}

/**
 * What the task rows of a page share: the draft row, dragging and Alt+arrow moves (useTaskMoves), ticks and presses
 * sent once per click (useBusyGuard), the undo stack (useUndoStack), and the note open at the side.
 */
export function TreeProvider({ tasks, newTaskLabels = NO_FILTER, rootId = null, children }: ProviderProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [openNote, setOpenNote] = useState<{ id: string; edit: boolean } | null>(null);
  const showNote = useCallback((id: string, edit: boolean) => setOpenNote({ id, edit }), []);
  const closeNote = useCallback(() => setOpenNote(null), []);
  const ticked = useTickedTasks();
  const byDeadline = useSortByDeadline();
  // Only their `mutate` is the same from one render to the next, so the callbacks below are built on that.
  const { mutate: toggle } = useToggleTask();
  const { mutate: press } = usePressTask();
  const { mutate: undoPress } = useUndoPress();
  const { mutate: remove, error: removeError } = useDeleteTask();
  const { mutateAsync: removeList, error: removeListError } = useDeleteList();

  const byId = useMemo(() => {
    const map = new Map<string, TaskTreeNode>();
    const walk = (node: TaskTreeNode) => {
      map.set(node.id, node);
      node.children.forEach(walk);
    };
    tasks.forEach(walk);
    return map;
  }, [tasks]);

  const [drag] = useState(() => new DragStore());
  const { undoable, offer, forgetPress, undo, error: undoError } = useUndoStack(byId);
  const { once, isBusy } = useBusyGuard();
  const { startDrag, moveBy, error: moveError } = useTaskMoves({ tasks, byId, drag, rootId, ticked, byDeadline });

  const deleteTask = useCallback(
    (node: TaskTreeNode) => {
      // Gone from the page at once, offline too; an undo is sent after the delete, whenever that goes out.
      remove({ id: node.id });
      offer({ kind: "task", id: node.id, title: node.title });
    },
    [remove, offer],
  );

  const deleteList = useCallback(
    (list: List) => {
      removeList(list.id).then(
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
        toggle({ id: node.id, done });
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
        press({ id: node.id, completionId });
        offer({ kind: "press", id: node.id, title: node.title, completionId });
      });
    },
    [press, once, offer],
  );

  const takeBackPress = useCallback(
    (node: TaskTreeNode, completionId: string) => {
      forgetPress(completionId);
      undoPress({ id: node.id, completionId });
    },
    [forgetPress, undoPress],
  );

  const draftPlacement = useCallback((): TaskPlacement => {
    if (!draft) return { parentId: null, listId: null, index: 0 };
    const siblings = siblingsIn(tasks, byId, { parentId: draft.parentId, listId: draft.listId, inWeek: Boolean(draft.weekDay) });
    const after = siblings.findIndex((s) => s.id === draft.afterId);
    return { parentId: draft.parentId, listId: draft.listId, index: after + 1 };
  }, [draft, tasks, byId]);

  // A refused tick or press shows in the popup next to the click instead.
  const error = moveError ?? removeError ?? undoError ?? removeListError;
  const value = useMemo<TreeContextValue>(
    () => ({
      draft,
      setDraft,
      draftText,
      setDraftText,
      draftPlacement,
      newTaskLabels,
      rootId,
      ticked,
      byDeadline,
      drag,
      startDrag,
      moveBy,
      deleteTask,
      deleteList,
      tick,
      isBusy,
      pressTask,
      takeBackPress,
      undoable,
      undo,
      openNote,
      showNote,
      closeNote,
      error,
    }),
    [draft, draftText, draftPlacement, newTaskLabels, rootId, ticked, byDeadline, drag, startDrag, moveBy, deleteTask, deleteList, tick, isBusy, pressTask, takeBackPress, undoable, undo, openNote, showNote, closeNote, error],
  );
  // A deleted task takes its note along.
  const noteNode = openNote ? byId.get(openNote.id) : undefined;
  return (
    <TreeContext.Provider value={value}>
      {children}
      {openNote && noteNode && <NotePanel node={noteNode} edit={openNote.edit} onClose={closeNote} />}
    </TreeContext.Provider>
  );
}
