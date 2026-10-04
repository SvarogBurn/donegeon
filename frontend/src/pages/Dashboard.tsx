import { useState } from "react";
import { CombinedTable } from "../components/Countdown/CombinedTable";
import { PressureSummary } from "../components/Countdown/PressureSummary";
import { DoneLog } from "../components/Done/DoneLog";
import { LabelsPanel } from "../components/Labels/LabelsPanel";
import { ListCard, ListForm, listCards } from "../components/Lists/ListBoard";
import { TileGrid, type Tile } from "../components/Tiles/TileGrid";
import { TreeProvider } from "../components/TaskTree/TreeContext";
import { TreeError, UndoBar } from "../components/TaskTree/TreeStatus";
import { TodayBox } from "../components/Today/TodayBox";
import {
  useCreateGoal,
  useCreateTag,
  useDeleteGoal,
  useDeleteTag,
  useCombinedCountdown,
  useGoals,
  useLayout,
  useLists,
  usePressure,
  useSaveLayout,
  useTags,
  useTaskTrees,
} from "../hooks/useTasks";
import { countLabels, isFiltering, NO_FILTER, toggleId, type LabelFilter } from "../lib/labels";
import { NEW_LIST_TILE, normalizeLayout } from "../lib/tileLayout";

export function Dashboard() {
  const goals = useGoals();
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
  const [picked, setPicked] = useState<LabelFilter>(NO_FILTER);

  const error = goals.error ?? tags.error ?? lists.error ?? tasks.error;
  if (error) return <p className="text-sm text-red-600">Couldn't load your tasks: {error.message}</p>;
  // The layout is waited for (not required), so the tiles don't jump once it arrives.
  if (!goals.data || !tags.data || !lists.data || !tasks.data || layout.isLoading) return <p className="text-sm text-stone-500">Loading…</p>;

  // Ignore picks whose goal or tag has since been deleted.
  const filter: LabelFilter = {
    goalIds: picked.goalIds.filter((id) => goals.data.some((g) => g.id === id)),
    tagIds: picked.tagIds.filter((id) => tags.data.some((t) => t.id === id)),
  };

  const filtering = isFiltering(filter);
  const cards = listCards(lists.data, tasks.data, filter);
  // The two deadline boxes only exist once there is a deadline.
  const tiles: (Tile | false)[] = [
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
    ...cards.map((card) => ({
      key: `list:${card.list.id}`,
      name: `list "${card.list.name}"`,
      node: <ListCard list={card.list} tasks={card.tasks} />,
    })),
    !filtering && { key: NEW_LIST_TILE, name: "the new-list field", node: <ListForm /> },
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

  return (
    <TreeProvider tasks={tasks.data} newTaskLabels={filter}>
      <div className="space-y-4">
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
        <TileGrid
          tiles={tiles.filter((tile): tile is Tile => tile !== false)}
          layout={normalizeLayout(layout.data)}
          onChange={(next) => saveLayout.mutate(next)}
        />
        {saveLayout.error && <p className="text-center text-sm text-red-600">Couldn't save the layout: {saveLayout.error.message}</p>}
        <UndoBar />
      </div>
    </TreeProvider>
  );
}
