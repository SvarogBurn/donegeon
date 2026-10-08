import { useState } from "react";
import { Navigate } from "react-router";
import { CombinedTable } from "../components/Countdown/CombinedTable";
import { PressureSummary } from "../components/Countdown/PressureSummary";
import { DoneLog } from "../components/Done/DoneLog";
import { LabelsPanel } from "../components/Labels/LabelsPanel";
import { ListCard, ListForm, listCards } from "../components/Lists/ListBoard";
import { SiteSearch } from "../components/Search/SiteSearch";
import { HiddenRow } from "../components/Tiles/HiddenRow";
import { TileGrid, type Tile } from "../components/Tiles/TileGrid";
import { TreeProvider } from "../components/TaskTree/TreeContext";
import { TreeError, UndoBar } from "../components/TaskTree/TreeStatus";
import { TodayBox } from "../components/Today/TodayBox";
import { useTickedTasks } from "../hooks/useAuth";
import {
  useCreateGoal,
  useCreateTag,
  useDeleteGoal,
  useDeleteTag,
  useCombinedCountdown,
  useDropOnTab,
  useFolders,
  useGoals,
  useLayout,
  useLists,
  usePressure,
  useSaveLayout,
  useTags,
  useTaskTrees,
  useUpdateFolder,
} from "../hooks/useTasks";
import { countLabels, isFiltering, NO_FILTER, toggleId, type LabelFilter } from "../lib/labels";
import { listView, statOfView } from "../lib/folders";
import { STAT_BOXES, StatBoxView, StatBoxesProvider } from "../components/Stats/StatsPanel";
import { NEW_LIST_TILE, normalizeLayout, withHidden, type DashboardLayout } from "../lib/tileLayout";

/** What a hidden box is called on its button in the "Hidden" row. */
const LABELS: Record<string, string> = {
  pressure: "Deadline pressure",
  deadlines: "All deadlines",
  [NEW_LIST_TILE]: "New list",
};

/**
 * The Tasks page: every box and every list. With `folderId`
 * it is that folder's page instead: the boxes the folder shows (copies of lists, and of boxes of the stats)
 * and the new-list field, arranged on their own. A list's tile dragged onto a folder's tab is shown there too;
 * dragged from a folder's page onto the Tasks tab, it is no longer shown in that folder.
 */
export function Dashboard({ folderId = null }: { folderId?: string | null }) {
  const goals = useGoals();
  const folders = useFolders();
  const drop = useDropOnTab(folderId);
  const updateFolder = useUpdateFolder();
  const tags = useTags();
  const lists = useLists();
  const tasks = useTaskTrees();
  const createGoal = useCreateGoal();
  const deleteGoal = useDeleteGoal();
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();
  const pressure = usePressure();
  const combined = useCombinedCountdown();
  const layout = useLayout();
  const saveLayout = useSaveLayout();
  const ticked = useTickedTasks();
  const [picked, setPicked] = useState<LabelFilter>(NO_FILTER);

  const error = goals.error ?? tags.error ?? lists.error ?? tasks.error ?? folders.error;
  if (error) return <p className="text-sm text-red-600">Couldn't load your tasks: {error.message}</p>;
  // The layout is waited for (not required), so the tiles don't jump once it arrives.
  if (!goals.data || !tags.data || !lists.data || !tasks.data || !folders.data || layout.isLoading) return <p className="text-sm text-stone-500">Loading…</p>;
  const folder = folderId ? folders.data.find((f) => f.id === folderId) : null;
  // A folder that was removed (or never was): back to the Tasks page.
  if (folderId && !folder) return <Navigate to="/" replace />;

  // Ignore picks whose goal or tag has since been deleted.
  const filter: LabelFilter = {
    goalIds: picked.goalIds.filter((id) => goals.data.some((g) => g.id === id)),
    tagIds: picked.tagIds.filter((id) => tags.data.some((t) => t.id === id)),
  };

  const filtering = isFiltering(filter);
  const cards = listCards(lists.data, tasks.data, filter, ticked);
  const listTiles = cards.map((card) => ({
    key: listView(card.list.id),
    view: listView(card.list.id),
    name: `list "${card.list.name}"`,
    label: card.list.name,
    node: <ListCard list={card.list} tasks={card.tasks} taskCount={card.taskCount} />,
  }));
  const newListTile = !filtering && { key: NEW_LIST_TILE, name: "the new-list field", node: <ListForm folderId={folderId} /> };
  // The two deadline boxes only exist once there is a deadline.
  const mainTiles: ((Tile & { label?: string }) | false)[] = [
    Boolean(pressure.data?.items.length) && { key: "pressure", name: "deadline pressure", node: <PressureSummary /> },
    Boolean(combined.data?.items.length) && { key: "deadlines", name: "All deadlines", node: <CombinedTable /> },
    {
      key: "goals",
      name: "Goals",
      node: (
        <LabelsPanel
          title="Goals"
          noun="goal"
          items={goals.data}
          counts={countLabels(tasks.data, "goalIds")}
          selected={filter.goalIds}
          onToggle={(id) => setPicked({ ...filter, goalIds: toggleId(filter.goalIds, id) })}
          onCreate={(name) => createGoal.mutate({ name })}
          onDelete={(id) => deleteGoal.mutate(id)}
          isBusy={createGoal.isPending || deleteGoal.isPending}
          error={createGoal.error ?? deleteGoal.error}
        />
      ),
    },
    { key: "today", name: "Today", node: <TodayBox tasks={tasks.data} /> },
    ...listTiles,
    newListTile,
    {
      key: "tags",
      name: "Tags",
      node: (
        <LabelsPanel
          title="Tags"
          noun="tag"
          items={tags.data}
          counts={countLabels(tasks.data, "tagIds")}
          selected={filter.tagIds}
          onToggle={(id) => setPicked({ ...filter, tagIds: toggleId(filter.tagIds, id) })}
          onCreate={(name) => createTag.mutate(name)}
          onDelete={(id) => deleteTag.mutate(id)}
          isBusy={createTag.isPending || deleteTag.isPending}
          error={createTag.error ?? deleteTag.error}
        />
      ),
    },
    { key: "done", name: "Done", node: <DoneLog tasks={tasks.data} /> },
  ];
  // A folder's page: its views, in the order they were added. Each is a copy: the list is on the Tasks page too,
  // the stats box on the Stats page. A view whose list is gone (or filtered out) shows nothing.
  const viewTiles = (folder?.views ?? []).flatMap((view): (Tile & { label?: string })[] => {
    const stat = statOfView(view);
    if (stat === null) return listTiles.filter((tile) => tile.key === view);
    if (!(stat in STAT_BOXES)) return [];
    return [{ key: view, view, name: STAT_BOXES[stat], label: STAT_BOXES[stat], node: <StatBoxView name={stat} /> }];
  });
  const showsStats = viewTiles.some((tile) => statOfView(tile.key) !== null);
  const tiles: ((Tile & { label?: string }) | false)[] = folder ? [...viewTiles, newListTile] : mainTiles;

  // Every box, the lists too, can be minimized away; the hidden ones are offered again in a row under the grid.
  // A folder's page has an arrangement of its own, kept with the folder.
  const saved = normalizeLayout(folder ? folder.layout : layout.data);
  const save = (next: DashboardLayout) => (folder ? updateFolder.mutate({ id: folder.id, changes: { layout: next } }) : saveLayout.mutate(next));
  const layoutError = saveLayout.error ?? updateFolder.error;

  const isHidden = (tile: Tile) => (saved.hidden ?? []).includes(tile.key);
  const allTiles = tiles.flatMap((tile) => (tile ? [{ ...tile, canHide: true }] : []));
  const shownTiles = allTiles.filter((tile) => !isHidden(tile));
  const hiddenTiles = allTiles.filter(isHidden).map((tile) => ({ key: tile.key, label: tile.label ?? LABELS[tile.key] ?? tile.name }));

  const grid = <TileGrid tiles={shownTiles} order={allTiles.map((tile) => tile.key)} layout={saved} onChange={save} onDropOnTab={drop.dropOnTab} />;

  return (
    <TreeProvider tasks={tasks.data} newTaskLabels={filter}>
      <div className="space-y-4">
        <SiteSearch onPickLabel={(key, id) => !filter[key].includes(id) && setPicked({ ...filter, [key]: [...filter[key], id] })} />
        <TreeError />
        {filtering && (
          <p className="flex flex-wrap items-center justify-center gap-2 text-sm" role="status">
            <span>
              Showing only tasks with{" "}
              {[...goals.data.filter((g) => filter.goalIds.includes(g.id)), ...tags.data.filter((t) => filter.tagIds.includes(t.id))]
                .map((label) => `“${label.name}”`)
                .join(" and ")}
              . New tasks added now get the same.{cards.length === 0 && " No tasks match."}
            </span>
            <button type="button" className="btn-quiet underline" onClick={() => setPicked(NO_FILTER)}>
              Clear filter
            </button>
          </p>
        )}
        {folder && (
          <h1 className="text-center text-sm" data-folder-title>
            {folder.name}
          </h1>
        )}
        {showsStats ? <StatBoxesProvider>{grid}</StatBoxesProvider> : grid}
        <HiddenRow tiles={hiddenTiles} onShow={(key) => save(withHidden(saved, key, false))} />
        {layoutError && <p className="text-center text-sm text-red-600">Couldn't save the layout: {layoutError.message}</p>}
        {drop.error && <p className="text-center text-sm text-red-600">Couldn't change the folder: {drop.error.message}</p>}
        <UndoBar />
      </div>
    </TreeProvider>
  );
}
