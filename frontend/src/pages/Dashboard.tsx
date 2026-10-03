import { useState } from "react";
import { CombinedTable } from "../components/Countdown/CombinedTable";
import { PressureSummary } from "../components/Countdown/PressureSummary";
import { DoneLog } from "../components/Done/DoneLog";
import { LabelsPanel } from "../components/Labels/LabelsPanel";
import { ListBoard } from "../components/Lists/ListBoard";
import {
  useCreateGoal,
  useCreateTag,
  useDeleteGoal,
  useDeleteTag,
  useGoals,
  useLists,
  useTags,
  useTaskTrees,
} from "../hooks/useTasks";
import { countLabels, isFiltering, NO_FILTER, toggleId, type LabelFilter } from "../lib/labels";

export function Dashboard() {
  const goals = useGoals();
  const tags = useTags();
  const lists = useLists();
  const tasks = useTaskTrees();
  const createGoal = useCreateGoal();
  const deleteGoal = useDeleteGoal();
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();
  const [picked, setPicked] = useState<LabelFilter>(NO_FILTER);

  const error = goals.error ?? tags.error ?? lists.error ?? tasks.error;
  if (error) return <p className="text-sm text-red-600">Couldn't load your tasks: {error.message}</p>;
  if (!goals.data || !tags.data || !lists.data || !tasks.data) return <p className="text-sm text-stone-500">Loading…</p>;

  // Ignore picks whose goal or tag has since been deleted.
  const filter: LabelFilter = {
    goalIds: picked.goalIds.filter((id) => goals.data.some((g) => g.id === id)),
    tagIds: picked.tagIds.filter((id) => tags.data.some((t) => t.id === id)),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PressureSummary />
      <CombinedTable />
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
      {isFiltering(filter) && (
        <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
          <span>
            Showing only tasks with{" "}
            {[...goals.data.filter((g) => filter.goalIds.includes(g.id)), ...tags.data.filter((t) => filter.tagIds.includes(t.id))]
              .map((label) => `“${label.name}”`)
              .join(" and ")}
            . New tasks added now get the same.
          </span>
          <button type="button" className="btn-quiet underline" onClick={() => setPicked(NO_FILTER)}>
            Clear filter
          </button>
        </p>
      )}
      <ListBoard lists={lists.data} tasks={tasks.data} filter={filter} />
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
      <DoneLog tasks={tasks.data} />
    </div>
  );
}
