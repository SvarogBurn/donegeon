import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { edgeScroller } from "../../lib/edgeScroll";
import {
  arrange,
  MAX_COLUMNS,
  moveTile,
  togglePin,
  withArrangement,
  withHidden,
  type DashboardLayout,
  type Zone,
} from "../../lib/tileLayout";
import { TileControlsContext } from "./TileFrame";

export interface Tile {
  key: string;
  /** For the handle's and pin's labels: "Today", "list Chores". */
  name: string;
  node: ReactNode;
  /** Whether its frame gets a minimize button. */
  canHide?: boolean;
}

interface Props {
  /** The tiles that exist right now, in their default order. */
  tiles: Tile[];
  /** Keys of `tiles` and of the minimized ones among them, in their default order, so those keep a place too. */
  order?: string[];
  layout: DashboardLayout;
  onChange: (layout: DashboardLayout) => void;
  /**
   * A list's tile was dropped on a tab of the task bar (an element with data-tab-drop):
   * `tab` is that attribute's value. Other tiles can't be dropped there.
   */
  onDropOnTab?: (key: string, tab: string) => void;
}

/** A column is never narrower than this; fewer fit on a narrower screen. */
const MIN_COLUMN_PX = 352;
const GAP_PX = 16;
/** ...and never wider than this, so one or two columns on a big screen stay readable. */
const MAX_COLUMN_REM = 48;

interface DropAt {
  zone: Zone;
  /** The tile it lands next to; null = at the end of the zone. */
  key: string | null;
  after: boolean;
}

const DROP_STYLES = {
  above: "shadow-[0_-4px_0_var(--color-emerald-600)]",
  below: "shadow-[0_4px_0_var(--color-emerald-600)]",
  left: "shadow-[-4px_0_0_var(--color-emerald-600)]",
  right: "shadow-[4px_0_0_var(--color-emerald-600)]",
};

function zoneOf(el: Element): Zone | null {
  const zone = el.closest<HTMLElement>("[data-zone]")?.dataset.zone;
  if (zone === undefined) return null;
  return zone === "pinned" || zone === "new" ? zone : Number(zone);
}

/** Where the pointer would drop the dragged tile. Pinned tiles sit side by side, so there left/right decides. */
function dropAt(x: number, y: number, draggedKey: string): DropAt | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const zone = zoneOf(el);
  if (zone === null) return null;
  const tile = el.closest<HTMLElement>("[data-tile]");
  if (!tile || tile.dataset.tile === draggedKey) return tile ? null : { zone, key: null, after: true };
  const rect = tile.getBoundingClientRect();
  const after = zone === "pinned" ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2;
  return { zone, key: tile.dataset.tile!, after };
}

/**
 * The dashboard as a responsive grid of tiles. Each tile's frame has a tab
 * button to drag it above or below another, into another column, or into a new
 * column at the right; and a pin that keeps it in a band across the top. As many columns as
 * fit the screen are offered, down to one on a phone.
 */
/** The tab of the task bar under the pointer, if it takes dropped lists. */
function tabAt(x: number, y: number) {
  return document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-tab-drop]") ?? null;
}

export function TileGrid({ tiles, order, layout, onChange, onDropOnTab }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(1);
  useLayoutEffect(() => {
    const el = wrapper.current!;
    const measure = () =>
      setFits(Math.max(1, Math.min(MAX_COLUMNS, Math.floor((el.clientWidth + GAP_PX) / (MIN_COLUMN_PX + GAP_PX)))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropAt | null>(null);

  const byKey = new Map(tiles.map((tile) => [tile.key, tile]));
  const arrangement = arrange(layout, fits, tiles.map((tile) => tile.key), order);
  const shown = (keys: string[]) => keys.flatMap((key) => byKey.get(key) ?? []);
  const pinned = shown(arrangement.pinned);
  // Columns keep their index in the full arrangement, which also holds tiles that aren't shown right now.
  const columns = arrangement.columns.map((keys, index) => ({ index, tiles: shown(keys) })).filter((c) => c.tiles.length > 0);
  const save = (next: typeof arrangement) => onChange(withArrangement(layout, fits, next));

  // Read by drag listeners that outlive the render they were created in.
  const latest = useRef({ arrangement, save, onDropOnTab });
  latest.current = { arrangement, save, onDropOnTab };

  function startDrag(e: ReactPointerEvent<HTMLElement>, key: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    let target: DropAt | null = null;
    // Lists can also be dropped on a tab of the task bar: into a folder, a new folder, or back to Tasks.
    const takesTabs = key.startsWith("list:") && Boolean(onDropOnTab);
    let tab: HTMLElement | null = null;
    const hoverTab = (next: HTMLElement | null) => {
      if (next === tab) return;
      tab?.removeAttribute("data-drop-hover");
      next?.setAttribute("data-drop-hover", "");
      tab = next;
    };
    const scroller = edgeScroller();
    handle.setPointerCapture(e.pointerId);
    setDraggingKey(key);

    const onMove = (ev: PointerEvent) => {
      hoverTab(takesTabs ? tabAt(ev.clientX, ev.clientY) : null);
      // The task bar lies along the bottom edge: over a tab, the page must not scroll away underneath.
      scroller.update(tab ? window.innerHeight / 2 : ev.clientY);
      const next = tab ? null : dropAt(ev.clientX, ev.clientY, key);
      if (JSON.stringify(next) === JSON.stringify(target)) return;
      target = next;
      setDrop(next);
    };
    const finish = (dropped: boolean) => {
      scroller.stop();
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      setDraggingKey(null);
      setDrop(null);
      const droppedOn = tab?.dataset.tabDrop;
      hoverTab(null);
      if (dropped && droppedOn !== undefined) return latest.current.onDropOnTab?.(key, droppedOn);
      if (!dropped || !target) return;
      const { arrangement, save } = latest.current;
      let beforeKey = target.key;
      if (target.key && target.after) {
        const zoneKeys = (target.zone === "pinned" ? arrangement.pinned : (arrangement.columns[target.zone as number] ?? [])).filter(
          (other) => other !== key,
        );
        beforeKey = zoneKeys[zoneKeys.indexOf(target.key) + 1] ?? null;
      }
      save(moveTile(arrangement, key, target.zone, beforeKey));
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
  }

  function renderTile(tile: Tile, isPinned: boolean) {
    const mark =
      drop?.key === tile.key ? DROP_STYLES[isPinned ? (drop.after ? "right" : "left") : drop.after ? "below" : "above"] : "";
    return (
      <div
        key={tile.key}
        data-tile={tile.key}
        data-pinned={isPinned || undefined}
        className={`min-w-0 ${draggingKey === tile.key ? "opacity-40" : ""} ${mark}`}
      >
        {/* The tile's own TileFrame draws the pin and tab buttons on its border. */}
        <TileControlsContext.Provider
          value={{
            name: tile.name,
            isPinned,
            onTogglePin: () => save(togglePin(arrangement, tile.key)),
            onDragStart: (e) => startDrag(e, tile.key),
            onHide: tile.canHide ? () => onChange(withHidden(layout, tile.key, true)) : undefined,
          }}
        >
          {tile.node}
        </TileControlsContext.Provider>
      </div>
    );
  }

  const offersNewColumn = draggingKey !== null && columns.length < fits;
  const columnCount = columns.length;
  const maxWidth = `calc(${Math.max(columnCount, 1) * MAX_COLUMN_REM}rem + ${(Math.max(columnCount, 1) - 1) * GAP_PX}px)`;

  return (
    <div ref={wrapper} data-tile-grid data-fits={fits} className="relative">
      {pinned.length > 0 && (
        <div
          data-zone="pinned"
          aria-label="Pinned"
          className="mx-auto mb-4 grid items-start gap-4 border-b border-stone-300 pb-4 dark:border-stone-700"
          style={{ maxWidth, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${MIN_COLUMN_PX - 32}px), 1fr))` }}
        >
          {pinned.map((tile) => renderTile(tile, true))}
        </div>
      )}
      <div
        className="mx-auto grid items-start gap-4"
        style={{ maxWidth, gridTemplateColumns: `repeat(${Math.max(columnCount, 1)}, minmax(0, 1fr))` }}
      >
        {columns.map((column) => (
          <div
            key={column.index}
            data-zone={column.index}
            className={`min-w-0 space-y-4 rounded-lg pb-8 ${drop?.zone === column.index && drop.key === null ? "ring-2 ring-emerald-600" : ""}`}
          >
            {column.tiles.map((tile) => renderTile(tile, false))}
          </div>
        ))}
      </div>
      {/* Laid over the right edge rather than added to the grid, so nothing shifts when a drag starts. */}
      {offersNewColumn && (
        <div
          data-zone="new"
          className={`absolute inset-y-0 right-0 z-10 flex w-28 items-start justify-center rounded-lg border-2 border-dashed p-3 pt-10 text-center text-sm ${drop?.zone === "new" ? "border-emerald-600 bg-emerald-100/90 text-emerald-900 dark:bg-emerald-950/90 dark:text-emerald-200" : "border-stone-400 bg-stone-100/80 text-stone-600 dark:border-stone-600 dark:bg-stone-900/80 dark:text-stone-300"}`}
        >
          Drop here for a new column
        </div>
      )}
    </div>
  );
}
