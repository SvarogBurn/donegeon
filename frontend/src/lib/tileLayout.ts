/**
 * How the dashboard's tiles are arranged. Tiles are named by key ("today",
 * "goals", "list:<id>", ...). Pinned tiles sit in a band at the top; the rest
 * are stacked in columns.
 *
 * Two arrangements are kept: "wide" for any screen that fits two or more
 * columns, and "phone" for a single column. A wide screen that fits fewer
 * columns than "wide" has stacks the extra ones under the first, so the same
 * arrangement is recognisable at every window size. (Earlier versions kept a
 * separate arrangement per column count, which made the tiles jump to a
 * different arrangement whenever the window width crossed a threshold.)
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

/**
 * A layout as stored by an earlier version (one arrangement per column count,
 * "2" / "3" / "4") brought to today's shape: the one with the most columns in
 * use becomes "wide", and "1" becomes "phone".
 */
export function normalizeLayout(layout: DashboardLayout | null | undefined): DashboardLayout {
  if (!layout) return EMPTY_LAYOUT;
  const { phone, wide, ...legacy } = layout.byColumns;
  const used = (columns: string[][]) => columns.filter((column) => column.length > 0).length;
  const legacyWide: string[][] | undefined = ["4", "3", "2"]
    .flatMap((n) => (legacy[n] ? [legacy[n]] : []))
    .sort((a, b) => used(b) - used(a))[0];
  const byColumns: Record<string, string[][]> = {};
  if (wide ?? legacyWide) byColumns.wide = (wide ?? legacyWide)!;
  if (phone ?? legacy["1"]) byColumns.phone = (phone ?? legacy["1"])!;
  return { pinned: layout.pinned, byColumns };
}

/** The saved arrangement for a screen that fits `n` columns, if there is one to go by. */
function savedFor(layout: DashboardLayout, n: number): string[][] | null {
  const { phone, wide } = layout.byColumns;
  if (n === 1) return phone ? fold(phone, 1) : wide ? fold(wide, 1) : null;
  return wide ? fold(wide, n) : phone ? phone.map((column) => [...column]) : null;
}

/**
 * Every tile's place on a screen that fits `n` columns. `keys` are the tiles
 * that exist right now, in their default order; one the layout doesn't know
 * yet is added: a new list just above the "New list" field, anything else at
 * the end of the first column. Tiles not in `keys` (a list hidden by a filter,
 * the deadline boxes while there is no deadline) keep their place for when
 * they come back — except that a column holding nothing but such tiles is
 * merged into its neighbour: it isn't on screen, yet it would still count as a
 * column, and a tile dragged out to "a new column" would then be one too many
 * and get stacked back under the first.
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

  const shown = new Set(keys);
  const merged: string[][] = [];
  let orphans: string[] = [];
  for (const column of columns) {
    if (column.some((key) => shown.has(key))) merged.push([...orphans, ...column]), (orphans = []);
    else if (merged.length > 0) merged[merged.length - 1].push(...column);
    else orphans.push(...column);
  }
  if (merged.length === 0) merged.push(orphans);
  return { pinned, columns: merged };
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

/** The layout with this arrangement saved: as the phone order on a one-column screen, as the wide arrangement otherwise. */
export function withArrangement(layout: DashboardLayout, n: number, arrangement: Arrangement): DashboardLayout {
  const columns = fold(arrangement.columns, Math.min(Math.max(n, 1), MAX_COLUMNS));
  return {
    pinned: arrangement.pinned,
    byColumns: { ...layout.byColumns, [n === 1 ? "phone" : "wide"]: columns },
  };
}
