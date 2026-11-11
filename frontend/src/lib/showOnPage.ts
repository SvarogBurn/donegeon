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
    // Distraction free (data-calm, AppShell) jumps straight there too, as with reduced motion.
    const still = "calm" in document.documentElement.dataset || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A whole box is shown from its top; a single row in the middle of the screen.
    el.scrollIntoView({ block: el.offsetHeight > window.innerHeight / 2 ? "start" : "center", behavior: still ? "auto" : "smooth" });
    el.dataset.found = "";
    window.setTimeout(() => delete el.dataset.found, FOUND_MS);
  };
  requestAnimationFrame(look);
}

/** Where a task's row is looked for: anywhere on the page, or only in the lists (not, say, under a row of the Today box). */
export type RowScope = "page" | "lists";

export const taskRow = (id: string, scope: RowScope = "page") =>
  document.querySelector<HTMLElement>(`${scope === "lists" ? "[data-drop-list] " : ""}[data-task-row="${id}"]`);

/** A tab of the Today box. */
export type BoxTab = "today" | "week";

/**
 * Where a main task with no list has its row: in the Today box, on the Week tab if it was planned for a day there,
 * else on the Today tab. Its row is only on the page while that tab is open. None for a task in a list.
 */
export const boxTabOf = (main: TaskTreeNode | null): BoxTab | undefined => (!main || main.listId ? undefined : main.weekDay !== null ? "week" : "today");

/** Opens that tab of the Today box if another is open; false if it had to be opened (its rows come a frame later). */
function openBoxTab(tab: BoxTab) {
  const button = document.querySelector<HTMLButtonElement>(`[role="tab"][data-drop-${tab}]`);
  if (button?.getAttribute("aria-selected") !== "false") return true;
  button.click();
  return false;
}

/**
 * A task's row on the Tasks page, for showOnPage. `pathIds` are the tasks above it, outermost first: a subtask's row
 * is only there while every one of them is unfolded, so those are unfolded first, from the main task down, one a frame.
 * A task with no list is in the Today box: `tab` is opened first if its row isn't there (see boxTabOf).
 * If it still can't be shown (the lists can be set to take ticked tasks out of sight), the closest task above it is settled for.
 */
export function findTaskRow(id: string, pathIds: string[], isLast: boolean, scope: RowScope = "page", tab?: BoxTab): HTMLElement | null {
  if (tab && !taskRow(pathIds[0] ?? id, scope) && !openBoxTab(tab)) return null;
  let closest: HTMLElement | null = null;
  for (const above of pathIds) {
    const row = taskRow(above, scope);
    if (!row) return isLast ? closest : null;
    closest = row;
    const arrow = row.querySelector<HTMLElement>('.task-arrow[aria-expanded="false"]');
    if (arrow) {
      arrow.click();
      return null;
    }
  }
  return taskRow(id, scope) ?? (isLast ? closest : null);
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
