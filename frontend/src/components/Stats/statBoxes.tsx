import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useFolders } from "../../hooks/folders";
import { useGoals, useTags } from "../../hooks/labels";
import { useLists } from "../../hooks/lists";
import { useStatRows } from "../../hooks/tasks";
import { localDate } from "../../lib/clock";
import { collectStats, NO_STAT_FILTER } from "../../lib/stats";
import { statsView } from "../../lib/statsView";
import { TileFrame } from "../Tiles/TileFrame";
import { DeadlinesBox } from "./boxes/DeadlinesBox";
import { DoneBox } from "./boxes/DoneBox";
import { FilterBox } from "./boxes/FilterBox";
import { FlowBox } from "./boxes/FlowBox";
import { HabitsBox } from "./boxes/HabitsBox";
import { TimeBox } from "./boxes/TimeBox";
import type { StatBox, StatsData } from "./boxes/common";

export const FILTER_BOX = "filter";

/** Every box of the stats, in their first order: its key (in layouts and folders), its name on the buttons, and the box. */
export const STAT_BOX_LIST: { key: string; label: string; Box: StatBox }[] = [
  { key: FILTER_BOX, label: "Stats filter", Box: FilterBox },
  { key: "done", label: "Done", Box: DoneBox },
  { key: "habits", label: "Habits", Box: HabitsBox },
  { key: "flow", label: "Keeping up", Box: FlowBox },
  { key: "deadlines", label: "Deadlines", Box: DeadlinesBox },
  { key: "time", label: "Time to finish", Box: TimeBox },
];

/** The boxes of the stats by key, with what each is called on its buttons (the search finds them by it). */
export const STAT_BOXES: Record<string, string> = Object.fromEntries(STAT_BOX_LIST.map(({ key, label }) => [key, label]));

/**
 * What the boxes of the stats are drawn from: tasks only (reward lists are left out), narrowed by a filter of
 * this use's own. `data` is null until everything they need has loaded.
 */
export function useStatsData(): { data: StatsData | null; error: Error | null; retry: () => void } {
  const rows = useStatRows();
  const lists = useLists();
  const goals = useGoals();
  const tags = useTags();
  const needed = [rows, lists, goals, tags];
  const retry = () => needed.forEach((query) => query.data === undefined && void query.refetch());
  // One with nothing yet and nothing on its way (its first fetch cancelled, say) would wait for good: it asks again.
  const stuck = needed.some((query) => query.data === undefined && !query.error && query.fetchStatus === "idle");
  useEffect(() => {
    if (stuck) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked once each time one gets stuck
  }, [stuck]);
  const { data: folders = [] } = useFolders();
  const [filter, setFilter] = useState(NO_STAT_FILTER);
  const all = useMemo(() => collectStats(rows.data ?? [], lists.data ?? []), [rows.data, lists.data]);
  const today = localDate();
  const view = useMemo(() => statsView(all, folders, filter, today), [all, folders, filter, today]);

  const error = rows.error ?? lists.error ?? goals.error ?? tags.error;
  if (error) return { data: null, error, retry };
  if (!rows.data || !lists.data || !goals.data || !tags.data) return { data: null, error: null, retry };
  return {
    retry,
    data: {
      view,
      filter,
      setFilter,
      taskLists: lists.data.filter((list) => list.kind === "task"),
      goals: goals.data,
      tags: tags.data,
      folders,
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
      {stats?.error ? <p className="text-sm text-red-600">Couldn't load your stats: {stats.error.message}</p> : <StatsLoading retry={stats?.retry} />}
    </TileFrame>
  );
}

/** How long the stats load before the page offers to ask again. */
const STILL_LOADING_MS = 10_000;

/** "Loading…", and after a while a way to ask again, rather than waiting for good. */
export function StatsLoading({ retry }: { retry?: () => void }) {
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    const slow = setTimeout(() => setIsSlow(true), STILL_LOADING_MS);
    return () => clearTimeout(slow);
  }, []);
  if (!isSlow || !retry) return <p className="text-sm text-stone-500" data-loading="stats">Loading…</p>;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-stone-500" data-loading="stats">
      Still loading your stats…
      <button type="button" className="btn-quiet underline" onClick={() => (setIsSlow(false), retry())}>
        Try again
      </button>
    </p>
  );
}
