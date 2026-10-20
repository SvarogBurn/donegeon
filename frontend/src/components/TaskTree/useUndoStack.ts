import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_WINDOW_MS } from "../../../../shared/constants";
import { useRestoreList } from "../../hooks/lists";
import { useRestoreTask, useToggleTask, useUndoPress } from "../../hooks/tasks";
import type { TaskTreeNode } from "../../types";
import { focusTaskEditor } from "./TitleEditor";

/** `until`: when it stops being undoable (Date.now() time). */
export type Undoable = { title: string; id: string; until: number } & (
  | { kind: "task" | "list" | "finished" }
  | { kind: "press"; completionId: string }
);

/** `Omit` of each member of a union, so a press keeps its completionId. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An Undoable before it is offered, without its `until`. */
export type Offer = OmitEach<Undoable, "until">;

/**
 * What the page can still take back, newest last: deletes, ticks that took a task out of sight, presses. Each stays
 * undoable for UNDO_WINDOW_MS from its own action (the server keeps a delete restorable a little longer); Ctrl+Z takes
 * back the newest while there is one. `byId`: the tasks on the page, to find what an undo is about.
 */
export function useUndoStack(byId: Map<string, TaskTreeNode>) {
  const [undoable, setUndoable] = useState<Undoable[]>([]);
  const { mutate: restore, error: restoreError } = useRestoreTask();
  const { mutate: restoreList, error: restoreListError } = useRestoreList();
  const { mutate: undoPress } = useUndoPress();
  const { mutate: toggle } = useToggleTask();

  // A restored task gets focus as soon as it is back on the page.
  const focusWhenShown = useRef<string | null>(null);
  useEffect(() => {
    const id = focusWhenShown.current;
    if (!id || !byId.has(id)) return;
    focusWhenShown.current = null;
    focusTaskEditor(id);
  }, [byId]);

  const offer = useCallback((item: Offer) => setUndoable((stack) => [...stack, { ...item, until: Date.now() + UNDO_WINDOW_MS } as Undoable]), []);

  /** A press taken back by hand is no longer there for Ctrl+Z to take back a second time. */
  const forgetPress = useCallback(
    (completionId: string) => setUndoable((stack) => stack.filter((item) => !(item.kind === "press" && item.completionId === completionId))),
    [],
  );

  const undo = useCallback(() => {
    const last = undoable.at(-1);
    if (!last) return;
    setUndoable((stack) => stack.slice(0, -1));
    if (last.kind === "list") {
      restoreList(last.id);
    } else if (last.kind === "press") {
      undoPress({ id: last.id, completionId: last.completionId });
    } else if (last.kind === "finished") {
      // Still ticked? Then untick it, which puts it back in its list.
      if (byId.get(last.id)?.isComplete) toggle({ id: last.id, done: false });
    } else {
      focusWhenShown.current = last.id;
      restore({ id: last.id });
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

  return { undoable, offer, forgetPress, undo, error: restoreError ?? restoreListError };
}

/** How long a ticked or pressed task's control waits before a second click counts. */
const DOUBLE_CLICK_MS = 600;

/**
 * The tasks just ticked or pressed, each sent once however fast the clicks come. Kept in a ref, so a second click in
 * the same instant already finds it, and as state, for the controls to show they are waiting. Not until the server
 * answers: offline, that may be hours (see lib/offline/changes).
 */
export function useBusyGuard() {
  const busy = useRef(new Set<string>());
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const once = useCallback((id: string, send: () => void) => {
    if (busy.current.has(id)) return;
    busy.current.add(id);
    setShown(new Set(busy.current));
    send();
    setTimeout(() => {
      busy.current.delete(id);
      setShown(new Set(busy.current));
    }, DOUBLE_CLICK_MS);
  }, []);
  const isBusy = useCallback((id: string) => shown.has(id), [shown]);
  return { once, isBusy };
}
