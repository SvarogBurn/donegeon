import { useDropOnTab } from "../../hooks/folders";
import { useLayout, useSaveLayout } from "../../hooks/layout";
import { usePointsOff } from "../../hooks/useAuth";
import { statView } from "../../lib/folders";
import { normalizeLayout, withHidden, type DashboardLayout } from "../../lib/tileLayout";
import { HiddenRow } from "../Tiles/HiddenRow";
import { TileGrid } from "../Tiles/TileGrid";
import { FILTER_BOX, STAT_BOX_LIST, useStatsData } from "./statBoxes";

/** An arrangement saved before `top` were tiles of the grid: they go where they were, above everything else. */
function withTopBoxes(layout: DashboardLayout, top: string[]): DashboardLayout {
  const placed = new Set([...layout.pinned, ...Object.values(layout.byColumns).flat(2)]);
  const missing = top.filter((key) => !placed.has(key));
  if (missing.length === 0) return layout;
  const byColumns = Object.fromEntries(
    Object.entries(layout.byColumns).map(([n, columns]) => [n, columns.map((column, i) => (i === 0 ? [...missing, ...column] : column))]),
  );
  return { ...layout, byColumns };
}

/**
 * The Stats page: every box of the stats, the filter too, as tiles of one grid: moved, pinned and hidden
 * like the dashboard's, over as many columns as fit, with an arrangement of their own. A stats box dropped
 * on a folder's tab is shown in that folder too.
 */
export function StatsPanel() {
  const stats = useStatsData();
  const layout = useLayout("stats");
  const saveLayout = useSaveLayout("stats");
  const drop = useDropOnTab();
  const pointsOff = usePointsOff();

  if (stats.error) return <p className="text-sm text-red-600">Couldn't load your stats: {stats.error.message}</p>;
  // The layout is waited for (not required), so the boxes don't jump once it arrives.
  if (!stats.data || layout.isLoading) return <p className="text-sm text-stone-500">Loading…</p>;
  const data = stats.data;

  // Every box is a tile of a grid like the dashboard's: dragged by its tab button, pinned, or minimized away. No Points box
  // while the points system is off; it keeps its place for when they are back.
  const boxes = STAT_BOX_LIST.filter(({ key }) => !(pointsOff && key === "points")).map(({ key, label, Box }) => ({ key, label, name: label, node: <Box stats={data} />, view: statView(key) }));
  const saved = withTopBoxes(normalizeLayout(layout.data), [FILTER_BOX]);
  const isHidden = (key: string) => (saved.hidden ?? []).includes(key);
  const tiles = boxes.filter((box) => !isHidden(box.key)).map((box) => ({ ...box, canHide: true }));

  return (
    <>
      <TileGrid tiles={tiles} order={boxes.map((box) => box.key)} layout={saved} onChange={(next) => saveLayout.mutate(next)} onDropOnTab={drop.dropOnTab} />
      <HiddenRow tiles={boxes.filter((box) => isHidden(box.key))} onShow={(key) => saveLayout.mutate(withHidden(saved, key, false))} />
      {saveLayout.error && <p className="text-center text-sm text-red-600">Couldn't save the layout: {saveLayout.error.message}</p>}
      {drop.error && <p className="text-center text-sm text-red-600">Couldn't change the folder: {drop.error.message}</p>}
    </>
  );
}
