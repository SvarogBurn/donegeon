/**
 * The browser task bar's items in the user's own order, each side of the logo (`User.taskBar`). Every item can be
 * dragged to another place, to either side: the pages, the folders, the points, the account and the clock.
 * Keys are the names below, and `folder:<id>` for a folder's tab.
 */
export interface TaskBarLayout {
  left: string[];
  right: string[];
}

export type BarSide = keyof TaskBarLayout;

/** Where a dragged item is let go: beside another item, or at the end of a side (one with nothing on it). */
export type BarDrop = { beside: string; after: boolean } | { side: BarSide };

const FOLDER = "folder:";
export const folderKey = (id: string) => `${FOLDER}${id}`;
export const folderOfKey = (key: string) => (key.startsWith(FOLDER) ? key.slice(FOLDER.length) : null);

/** The bar as it always was: the pages at the left (the folders after them), the points, account and clock at the right. */
const DEFAULT: TaskBarLayout = { left: ["tasks", "stats", "calendar", "notes"], right: ["points", "user", "clock"] };
const BUILT_IN = new Set([...DEFAULT.left, ...DEFAULT.right]);

const isKeys = (value: unknown): value is string[] => Array.isArray(value) && value.every((key) => typeof key === "string");

/**
 * What the bar shows, from what was saved (anything, or null) and the folders in their own order. Items it doesn't
 * know and folders that are gone are left out; a page missing from it goes back to its usual side, and a folder not
 * yet placed goes at the end of the left, where a new one appears. The folders fill the places the layout has for
 * folders in their own order (Folder.position), the order the installed app's strip shows them in too. Notes is
 * kept even while its tab is off, so it comes back where it was.
 */
export function resolveTaskBar(saved: unknown, folderIds: string[]): TaskBarLayout {
  const raw = saved as Partial<TaskBarLayout> | null;
  const from = raw && isKeys(raw.left) && isKeys(raw.right) ? { left: raw.left, right: raw.right } : DEFAULT;
  const folders = new Set(folderIds);
  const seen = new Set<string>();
  const keep = (key: string) => {
    const folder = folderOfKey(key);
    if (seen.has(key) || (folder === null ? !BUILT_IN.has(key) : !folders.has(folder))) return false;
    seen.add(key);
    return true;
  };
  const layout = { left: from.left.filter(keep), right: from.right.filter(keep) };

  // The folders already placed, in their own order, one to each folder's place.
  const placed = folderIds.filter((id) => seen.has(folderKey(id)));
  let next = 0;
  const refill = (key: string) => (folderOfKey(key) === null ? key : folderKey(placed[next++]));
  layout.left = layout.left.map(refill);
  layout.right = layout.right.map(refill);

  for (const side of ["left", "right"] as const) {
    for (const key of DEFAULT[side]) if (!seen.has(key)) layout[side].push(key);
  }
  for (const id of folderIds) if (!seen.has(folderKey(id))) layout.left.push(folderKey(id));
  return layout;
}

/** The layout with `key` taken from where it was and put where it was dropped. Dropped beside an item that isn't there, nothing changes. */
export function moveItem(layout: TaskBarLayout, key: string, drop: BarDrop): TaskBarLayout {
  if ("beside" in drop && drop.beside === key) return layout;
  const without = { left: layout.left.filter((other) => other !== key), right: layout.right.filter((other) => other !== key) };
  if ("side" in drop) {
    without[drop.side].push(key);
    return without;
  }
  const side = without.left.includes(drop.beside) ? "left" : without.right.includes(drop.beside) ? "right" : null;
  if (!side) return layout;
  without[side].splice(without[side].indexOf(drop.beside) + (drop.after ? 1 : 0), 0, key);
  return without;
}

/** The folders' ids in the order the bar shows them, left to right across both sides. */
export const folderOrder = (layout: TaskBarLayout) =>
  [...layout.left, ...layout.right].map(folderOfKey).filter((id): id is string => id !== null);
