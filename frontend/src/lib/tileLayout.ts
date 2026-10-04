/**
 * How the dashboard's tiles are arranged. Tiles are named by key ("today",
 * "goals", "list:<id>", ...). Pinned tiles sit in a band at the top; the rest
 * are stacked in columns. One arrangement is kept per number of columns that
 * fit the screen, so rearranging on a phone doesn't undo the desktop layout.
 */
export interface DashboardLayout {
  pinned: string[];
  byColumns: Record<string, string[][]>;
}

export const EMPTY_LAYOUT: DashboardLayout = { pinned: [], byColumns: {} };
export const MAX_COLUMNS = 4;
/** The "New list" field's tile: new lists appear just above it. */
export const NEW_LIST_TILE = "newList";

export interface Arrangement {
  pinned: string[];
  columns: string[][];
}

/** Where a dragged tile is dropped: the pinned band, a column, or a new column at the right. */
export type Zone = "pinned" | "new" | number;

/** At most `n` columns: the ones that don't fit are stacked under the first ones in turn. */
function fold(columns: string[][], n: number): string[][] {
  const folded = columns.slice(0, n).map((column) => [...column]);
  columns.slice(n).forEach((column, i) => folded[i % n].push(...column));
  return folded;
}

/** The arrangement saved for `n` columns, else the nearest wider one folded down, else the nearest narrower one. */
function savedFor(layout: DashboardLayout, n: number): string[][] | null {
  for (let wider = n; wider <= MAX_COLUMNS; wider++) {
    const columns = layout.byColumns[wider];
    if (columns) return fold(columns, n);
  }
  for (let narrower = n - 1; narrower >= 1; narrower--) {
    const columns = layout.byColumns[narrower];
    if (columns) return columns.map((column) => [...column]);
  }
  return null;
}

/**
 * Every tile's place on a screen that fits `n` columns. `keys` are the tiles
 * that exist right now, in their default order; one the layout doesn't know
 * yet is added: a new list just above the "New list" field, anything else at
 * the end of the first column. Tiles not in `keys` (a list hidden by a filter)
 * keep their place for when they come back.
 */
export function arrange(layout: DashboardLayout, n: number, keys: string[]): Arrangement {
  const pinned = [...new Set(layout.pinned)];
  const seen = new Set(pinned);
  const columns = (savedFor(layout, n) ?? [[]]).map((column) =>
    column.filter((key) => !seen.has(key) && Boolean(seen.add(key))),
  );
  if (columns.length === 0) columns.push([]);

  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const formColumn = key.startsWith("list:") ? columns.find((column) => column.includes(NEW_LIST_TILE)) : undefined;
    if (formColumn) formColumn.splice(formColumn.indexOf(NEW_LIST_TILE), 0, key);
    else columns[0].push(key);
  }
  return { pinned, columns };
}

/** `key` taken from where it is and put in `zone`, before `beforeKey` (null = at the end). */
export function moveTile(arrangement: Arrangement, key: string, zone: Zone, beforeKey: string | null): Arrangement {
  const pinned = arrangement.pinned.filter((other) => other !== key);
  const columns = arrangement.columns.map((column) => column.filter((other) => other !== key));
  const target = zone === "pinned" ? pinned : zone === "new" ? (columns[columns.push([]) - 1] ?? pinned) : (columns[zone] ?? pinned);
  const at = beforeKey === null ? -1 : target.indexOf(beforeKey);
  target.splice(at < 0 ? target.length : at, 0, key);
  return { pinned, columns: columns.filter((column) => column.length > 0) };
}

/** Pins a tile to the top band, or puts a pinned one back at the top of the first column. */
export function togglePin(arrangement: Arrangement, key: string): Arrangement {
  return arrangement.pinned.includes(key)
    ? moveTile(arrangement, key, 0, arrangement.columns[0]?.[0] ?? null)
    : moveTile(arrangement, key, "pinned", null);
}

/** The layout with this arrangement saved for screens that fit `n` columns. */
export function withArrangement(layout: DashboardLayout, n: number, arrangement: Arrangement): DashboardLayout {
  return {
    pinned: arrangement.pinned,
    byColumns: { ...layout.byColumns, [n]: fold(arrangement.columns, Math.max(n, 1)) },
  };
}
