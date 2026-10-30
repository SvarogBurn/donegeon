import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useFolders } from "../../hooks/folders";
import { useGoals, useTags } from "../../hooks/labels";
import { useLists } from "../../hooks/lists";
import { usePoints } from "../../hooks/points";
import { useStatRows } from "../../hooks/tasks";
import { localDate } from "../../lib/clock";
import { collectStats, NO_STAT_FILTER } from "../../lib/stats";
import { statsView } from "../../lib/statsView";
import { TileFrame } from "../Tiles/TileFrame";
import { DeadlinesBox } from "./boxes/DeadlinesBox";
import { DoneBox } from "./boxes/DoneBox";
import { FilterBox } from "./boxes/FilterBox";
import { FlowBox } from "./boxes/FlowBox";
import { GroupsBox } from "./boxes/GroupsBox";
import { HabitsBox } from "./boxes/HabitsBox";
import { OpenBox } from "./boxes/OpenBox";
import { PointsBox } from "./boxes/PointsBox";
import { TimeBox } from "./boxes/TimeBox";
import { UnorganizedBox } from "./boxes/UnorganizedBox";
import { WrittenBox } from "./boxes/WrittenBox";
import type { StatBox, StatsData } from "./boxes/common";

export const FILTER_BOX = "filter";

/** Every box of the stats, in their first order: its key (in layouts and folders), its name on the buttons, and the box. */
export const STAT_BOX_LIST: { key: string; label: string; Box: StatBox }[] = [
  { key: FILTER_BOX, label: "Stats filter", Box: FilterBox },
  { key: "done", label: "Done", Box: DoneBox },
  { key: "habits", label: "Habits", Box: HabitsBox },
  { key: "flow", label: "Keeping up", Box: FlowBox },
  { key: "open", label: "Open work", Box: OpenBox },
  { key: "deadlines", label: "Deadlines", Box: DeadlinesBox },
  { key: "time", label: "Time to finish", Box: TimeBox },
  { key: "groups", label: "By list, goal or tag", Box: GroupsBox },
  { key: "written", label: "Time of day", Box: WrittenBox },
  { key: "points", label: "Points", Box: PointsBox },
  { key: "unorganized", label: "Unorganized", Box: UnorganizedBox },
];

/** The boxes of the stats by key, with what each is called on its buttons (the search finds them by it). */
export const STAT_BOXES: Record<string, string> = Object.fromEntries(STAT_BOX_LIST.map(({ key, label }) => [key, label]));

/**
 * What the boxes of the stats are drawn from: tasks only (reward lists are left out), narrowed by a filter of
 * this use's own. `data` is null until everything they need has loaded.
 */
export function useStatsData(): { data: StatsData | null; error: Error | null } {
  const rows = useStatRows();
  const lists = useLists();
  const goals = useGoals();
  const tags = useTags();
  const points = usePoints();
  const { data: folders = [] } = useFolders();
  const [filter, setFilter] = useState(NO_STAT_FILTER);
  const all = useMemo(() => collectStats(rows.data ?? [], lists.data ?? []), [rows.data, lists.data]);
  const today = localDate();
  const view = useMemo(() => statsView(all, folders, filter, today), [all, folders, filter, today]);

  const error = rows.error ?? lists.error ?? goals.error ?? tags.error ?? points.error;
  if (error) return { data: null, error };
  if (!rows.data || !lists.data || !goals.data || !tags.data || !points.data) return { data: null, error: null };
  return {
    data: {
      view,
      filter,
      setFilter,
      taskLists: lists.data.filter((list) => list.kind === "task"),
      lists: lists.data,
      goals: goals.data,
      tags: tags.data,
      folders,
      points: points.data,
    },
    error: null,
  };
}

const StatsDataContext = createContext<ReturnType<typeof useStatsData> | null>(null);

/** Around a folder's page that shows boxes of the stats: loads and filters once, for every StatBoxView inside. */
export function StatBoxesProvider({ children }: { children: ReactNode }) {
  return <StatsDataContext.Provider value={useStatsData()}>{children}</StatsDataContext.Provider>;
}

/** One box of the stats, by its key in STAT_BOXES: a folder's copy of it. Only that box's numbers are worked out. */
export function StatBoxView({ name }: { name: string }) {
  const stats = useContext(StatsDataContext);
  const box = STAT_BOX_LIST.find((other) => other.key === name);
  if (box && stats?.data) return <box.Box stats={stats.data} />;
  return (
    <TileFrame title={STAT_BOXES[name] ?? "Stats"}>
      {stats?.error ? <p className="text-sm text-red-600">Couldn't load your stats: {stats.error.message}</p> : <p className="text-sm text-stone-500">Loading…</p>}
    </TileFrame>
  );
}
