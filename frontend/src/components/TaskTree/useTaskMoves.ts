import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { TaskPlacement } from "../../api/tasks";
import { useMoveRound, useMoveTask, usePlaceInWeek, useSetToday } from "../../hooks/tasks";
import { localDate } from "../../lib/clock";
import { orderDay } from "../../lib/deadlines";
import { areaScroller, edgeScroller } from "../../lib/edgeScroll";
import { isInRound, isShown } from "../../lib/recent";
import { isPutOff, livesInToday, livesInWeek, weekColumn, weekDays } from "../../lib/week";
import { weekDropFor } from "../../lib/weekDrop";
import type { TaskTreeNode, TickedTasks } from "../../types";
import { hitTest, type DragStore, type DropTarget } from "./dragState";
import { focusTaskEditor } from "./TitleEditor";

/** Once the change just shown is on the page: a moved row is put back in the DOM, which drops its focus. */
const afterRender = (then: () => void) => requestAnimationFrame(() => requestAnimationFrame(then));

/**
 * The tasks sharing a place in the trees: the children of `parentId`, or the main tasks of `listId`. Without a list:
 * the tasks written into the same box, Today or Week (`inWeek`).
 */
export function siblingsIn(tasks: TaskTreeNode[], byId: Map<string, TaskTreeNode>, place: { parentId: string | null; listId: string | null; inWeek: boolean }) {
  return place.parentId
    ? (byId.get(place.parentId)?.children ?? [])
    : tasks.filter((t) => t.listId === place.listId && (place.listId !== null || livesInWeek(t) === place.inWeek));
}

const siblingsOf = (tasks: TaskTreeNode[], byId: Map<string, TaskTreeNode>, node: TaskTreeNode) =>
  siblingsIn(tasks, byId, { parentId: node.parentId, listId: node.listId, inWeek: livesInWeek(node) });

/** Where a task dropped on `target` goes in the trees; null for a drop on Today or Week, which are views. */
function placementFor(tasks: TaskTreeNode[], byId: Map<string, TaskTreeNode>, target: DropTarget, draggedId: string): TaskPlacement | null {
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
  const siblings = siblingsOf(tasks, byId, over).filter(notDragged);
  const at = siblings.findIndex((s) => s.id === over.id);
  return {
    parentId: over.parentId,
    listId: over.parentId ? null : over.listId,
    index: target.zone === "after" ? at + 1 : at,
  };
}

interface Options {
  tasks: TaskTreeNode[];
  byId: Map<string, TaskTreeNode>;
  drag: DragStore;
  /** On a task's own page: that task. */
  rootId: string | null;
  ticked: TickedTasks;
  byDeadline: boolean;
}

/** Moving tasks: by dragging (mouse or touch, onto rows, lists, Today and the days of Week) and by Alt+Up / Alt+Down. */
export function useTaskMoves({ tasks, byId, drag, rootId, ticked, byDeadline }: Options) {
  // Only their `mutate` is the same from one render to the next, so the callbacks below are built on that.
  const { mutate: move, error: moveError } = useMoveTask();
  const { mutate: setToday, error: todayError } = useSetToday();
  const { mutate: placeInWeek, error: weekError } = usePlaceInWeek();
  const { mutate: moveRound, error: roundError } = useMoveRound();

  // Read by drag listeners that outlive the render they were created in.
  const latest = useRef({ tasks, byId });
  latest.current = { tasks, byId };

  /** Lets a dragged task go on `target`. */
  const drop = useCallback(
    (node: TaskTreeNode, target: DropTarget | null, round: string | undefined) => {
      const { tasks: all, byId: nodes } = latest.current;
      // Today is a view: dropping a list's task on it (or among the tasks written there) marks it for today and leaves it in its list.
      const over = target?.kind === "task" ? nodes.get(target.id) : undefined;
      const amongTodays = target?.kind === "task" && target.zone !== "inside" && over !== undefined && livesInToday(over);
      // What was put off to next week comes out of it (see taskPatchData); so does a round of a schedule moved there, back to its own day.
      if (target?.kind === "today" || (amongTodays && !livesInToday(node))) {
        const movedTo = round === undefined ? undefined : node.roundMoves?.[round];
        if (round !== undefined && movedTo !== undefined && isPutOff({ ...node, weekDay: movedTo }, localDate())) moveRound({ id: node.id, from: round, to: round });
        return setToday({ id: node.id, today: true });
      }
      // So is Week, with an order of its own on each day: a task dropped there takes that place, and stays in its list.
      if (target?.kind === "week" || target?.kind === "weekDay" || target?.kind === "weekItem") {
        const column =
          target.kind === "week"
            ? null
            : target.kind === "weekDay"
              ? document.querySelector<HTMLElement>(`[data-week-day="${target.day}"]`)
              : document.querySelector(`[data-week-item="${target.id}"]`)?.closest<HTMLElement>("[data-week-day]");
        const day = column?.dataset.weekDay ?? localDate();
        const shown = column && target.kind !== "week" ? [...column.querySelectorAll<HTMLElement>("[data-week-item]")].map((el) => el.dataset.weekItem!).filter((id) => id !== node.id) : undefined;
        const at = !shown ? undefined : target.kind === "weekDay" ? shown.length : target.kind === "weekItem" ? shown.indexOf(target.id) + (target.zone === "after" ? 1 : 0) : undefined;
        const result = weekDropFor(node, { day, shown, at }, localDate(), round);
        if (result.kind === "round") {
          moveRound({ id: node.id, from: result.from, to: result.to });
          if (result.leaveToday) setToday({ id: node.id, today: false });
        } else {
          placeInWeek(result.after === undefined ? { id: node.id, day: result.day } : { id: node.id, day: result.day, after: result.after });
        }
        return;
      }
      const placement = target ? placementFor(all, nodes, target, node.id) : null;
      if (placement) move({ id: node.id, placement });
    },
    [move, setToday, placeInWeek, moveRound],
  );

  /**
   * Call from the drag handle's onPointerDown. Works for mouse and touch. `round`: dragging one round of a task on a
   * schedule in the Week box (the day it was planned on), which moves only that round.
   */
  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, node: TaskTreeNode, round?: string) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      const own = handle.closest("li");
      let pointer = { x: e.clientX, y: e.clientY };
      const retarget = () => drag.set({ dropTarget: hitTest(pointer.x, pointer.y, own) });
      const scroller = edgeScroller();
      // Near the top or bottom of the Week tab's days, or of a box's tasks capped on a phone, they scroll on, with the pointer held still too.
      const area = areaScroller(retarget);
      handle.setPointerCapture(e.pointerId);
      drag.set({ draggingId: node.id });

      const onMove = (ev: PointerEvent) => {
        pointer = { x: ev.clientX, y: ev.clientY };
        // The page scrolls at the window's edge, unless the week is scrolling there already.
        scroller.update(area.update(ev.clientX, ev.clientY) ? window.innerHeight / 2 : ev.clientY);
        retarget();
      };
      const finish = (letGo: boolean) => {
        scroller.stop();
        area.stop();
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onCancel);
        const target = drag.get().dropTarget;
        drag.end();
        if (letGo) drop(node, target, round);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onCancel);
    },
    [drag, drop],
  );

  /** Alt+Up / Alt+Down: swap with the previous / next row on screen. */
  const moveBy = useCallback(
    (node: TaskTreeNode, direction: -1 | 1) => {
      const { tasks: all, byId: nodes } = latest.current;
      // A task written into Week moves in the order of its day, among the rows shown, ticked or open like itself.
      if (livesInWeek(node) && rootId === null) {
        const today = localDate();
        const day = weekColumn(node, today);
        // Only what the user put there has an order to change: what came in by itself is left out.
        const order = (weekDays(all, today, ticked, "never").find((d) => d.day === day)?.items ?? [])
          .filter((item) => !item.auto && (ticked !== "bottom" || item.node.isComplete === node.isComplete))
          .map((item) => item.node.id);
        const at = order.indexOf(node.id);
        if (at < 0 || !order[at + direction]) return;
        const after = direction === -1 ? (order[at - 2] ?? null) : order[at + 1];
        placeInWeek({ id: node.id, day, after });
        afterRender(() => focusTaskEditor(node.id));
        return;
      }
      const siblings = siblingsOf(all, nodes, node);
      // The swap is with the row next to it on screen. Ticked tasks shown under the open ones: step over siblings of
      // the other kind. Otherwise rows are in their own order, and a list leaves out the ticked ones it no longer shows.
      // Shown soonest date first: a task only changes places with those of its own day, or with the others that have none.
      const steppedOver = (sibling: TaskTreeNode) =>
        (byDeadline && orderDay(sibling) !== orderDay(node)) ||
        (ticked === "bottom" ? sibling.isComplete !== node.isComplete : rootId === null && !isShown(sibling, ticked, isInRound(node, nodes)));
      let index = siblings.findIndex((s) => s.id === node.id) + direction;
      while (siblings[index] && steppedOver(siblings[index])) index += direction;
      if (index < 0 || index >= siblings.length) return;
      // The row is re-inserted in the DOM, which drops focus; put it back.
      move({ id: node.id, placement: { parentId: node.parentId, listId: node.parentId ? null : node.listId, index } });
      afterRender(() => focusTaskEditor(node.id));
    },
    [move, placeInWeek, ticked, byDeadline, rootId],
  );

  return { startDrag, moveBy, error: moveError ?? todayError ?? weekError ?? roundError };
}
