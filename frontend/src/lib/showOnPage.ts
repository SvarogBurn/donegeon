import type { TaskTreeNode } from "../types";

/** How long the thing that was gone to stays marked. */
const FOUND_MS = 2000;
/** How many frames it is looked for before giving up. */
const LOOK_FRAMES = 120;

/**
 * Scrolls to what `find` finds on the page and marks it for a moment (data-found). The page may still be on its way,
 * so it is asked again over the next frames; on the last of them (`isLast`) it may settle for less. A hidden box is not there to be found.
 */
export function showOnPage(find: (isLast: boolean) => HTMLElement | null) {
  let frames = 0;
  const look = () => {
    const el = find(++frames === LOOK_FRAMES);
    if (!el) {
      if (frames < LOOK_FRAMES) requestAnimationFrame(look);
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A whole box is shown from its top; a single row in the middle of the screen.
    el.scrollIntoView({ block: el.offsetHeight > window.innerHeight / 2 ? "start" : "center", behavior: still ? "auto" : "smooth" });
    el.dataset.found = "";
    window.setTimeout(() => delete el.dataset.found, FOUND_MS);
  };
  requestAnimationFrame(look);
}

const taskRow = (id: string) => document.querySelector<HTMLElement>(`[data-task-row="${id}"]`);

/**
 * A task's row on the Tasks page, for showOnPage. `pathIds` are the tasks above it, outermost first: a subtask's row
 * is only there while every one of them is unfolded, so those are unfolded first, from the main task down, one a frame.
 * If it still can't be shown (the lists can be set to take ticked tasks out of sight), the closest task above it is settled for.
 */
export function findTaskRow(id: string, pathIds: string[], isLast: boolean): HTMLElement | null {
  let closest: HTMLElement | null = null;
  for (const above of pathIds) {
    const row = taskRow(above);
    if (!row) return isLast ? closest : null;
    closest = row;
    const arrow = row.querySelector<HTMLElement>('.task-arrow[aria-expanded="false"]');
    if (arrow) {
      arrow.click();
      return null;
    }
  }
  return taskRow(id) ?? (isLast ? closest : null);
}

/** The ids of the tasks a task sits under, outermost first; null when it is not in `trees`. */
export function pathIdsTo(trees: TaskTreeNode[], id: string, above: string[] = []): string[] | null {
  for (const node of trees) {
    if (node.id === id) return above;
    const found = pathIdsTo(node.children, id, [...above, node.id]);
    if (found) return found;
  }
  return null;
}
