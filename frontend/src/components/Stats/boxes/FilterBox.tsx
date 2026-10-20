import type { ReactNode } from "react";
import { NO_STAT_FILTER, type StatFilter } from "../../../lib/stats";
import { TileFrame } from "../../Tiles/TileFrame";
import { Note } from "../charts";
import type { StatBox } from "./common";

const RANGES: [StatFilter["range"], string][] = [
  ["all", "All time"],
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["365", "Last year"],
];

function Pick({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-stone-500">
      {label}
      <select
        className="max-w-44 border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

/** The options of a Pick: "" first, named `none`, then each thing by its name. */
const options = (none: string, items: { id: string; name: string }[]) => [
  <option key="" value="">
    {none}
  </option>,
  ...items.map((item) => (
    <option key={item.id} value={item.id}>
      {item.name}
    </option>
  )),
];

/** The filter that narrows the other boxes: dates, list, folder, goal, tag, kind of deadline, repeating or not. */
export const FilterBox: StatBox = ({ stats: { filter, setFilter, taskLists, folders, goals, tags } }) => {
  const set = (changes: Partial<StatFilter>) => setFilter({ ...filter, ...changes });
  const folder = folders.find((f) => f.id === filter.folderId);
  return (
    <TileFrame title="Stats" aria-label="Stats">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Pick label="Dates" value={filter.range} onChange={(range) => set({ range: range as StatFilter["range"] })}>
          {RANGES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Pick>
        <Pick label="List" value={filter.listId} onChange={(listId) => set({ listId })}>
          {options("All lists", taskLists)}
        </Pick>
        {folders.length > 0 && (
          <Pick label="Folder" value={folder ? filter.folderId : ""} onChange={(folderId) => set({ folderId })}>
            {options("Any folder", folders)}
          </Pick>
        )}
        <Pick label="Goal" value={filter.goalId} onChange={(goalId) => set({ goalId })}>
          {options("Any goal", goals)}
        </Pick>
        <Pick label="Tag" value={filter.tagId} onChange={(tagId) => set({ tagId })}>
          {options("Any tag", tags)}
        </Pick>
        <Pick label="Deadline" value={filter.deadline} onChange={(deadline) => set({ deadline: deadline as StatFilter["deadline"] })}>
          <option value="">Any</option>
          <option value="hard">Hard</option>
          <option value="soft">Soft</option>
          <option value="none">None</option>
        </Pick>
        <Pick label="Repeating" value={filter.repeating} onChange={(repeating) => set({ repeating: repeating as StatFilter["repeating"] })}>
          <option value="">Any</option>
          <option value="no">One-off</option>
          <option value="yes">Persistent</option>
        </Pick>
        {filter !== NO_STAT_FILTER && (
          <button type="button" className="btn-quiet" onClick={() => setFilter(NO_STAT_FILTER)}>
            Clear
          </button>
        )}
      </div>
      <Note>
        Tasks and subtasks, not rewards. A subtask counts under its main task's list, goals and tags. Dates narrow the boxes about
        a stretch of time. Done and Keeping up have windows of their own; Open work and Unorganized are about now.
      </Note>
    </TileFrame>
  );
};
