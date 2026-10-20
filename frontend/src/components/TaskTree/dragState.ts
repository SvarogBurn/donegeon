/** Where a dragged task would land if let go now. */
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

export interface DragState {
  /** The task being dragged. */
  draggingId: string | null;
  dropTarget: DropTarget | null;
}

const IDLE: DragState = { draggingId: null, dropTarget: null };

/**
 * The drag under way, kept outside React's state: it changes on every move of the pointer, and each row only wants to
 * know whether it is the one dragged or the one under the pointer (useDrag). So a move re-renders the row or two
 * whose answer changes, not every row on the page.
 */
export class DragStore {
  private state = IDLE;
  private listeners = new Set<() => void>();

  get = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  set(changes: Partial<DragState>) {
    const next = { ...this.state, ...changes };
    if (next.draggingId === this.state.draggingId && sameTarget(next.dropTarget, this.state.dropTarget)) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  end() {
    this.set(IDLE);
  }
}

export function sameTarget(a: DropTarget | null, b: DropTarget | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Where on a task's row (`id`) the pointer is, if it is over that row: what the row shows as the place to drop. */
export const zoneOn = (target: DropTarget | null, id: string, kinds: DropTarget["kind"][] = ["task"]) =>
  target && (target.kind === "task" || target.kind === "weekItem") && kinds.includes(target.kind) && target.id === id ? target.zone : null;

/** What the pointer is over, ignoring the dragged task's own subtree (`own`). */
export function hitTest(x: number, y: number, own: Element | null): DropTarget | null {
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
