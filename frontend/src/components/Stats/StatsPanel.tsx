import { createContext, useContext, useMemo, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { localDate } from "../../api/client";
import { useDropOnTab, useFolders, useGoals, useLayout, useLists, usePoints, useSaveLayout, useStatRows, useTags } from "../../hooks/useTasks";
import { listOfView, statView } from "../../lib/folders";
import { frameIn, isLight } from "../../lib/frameTones";
import {
  DAY_PARTS,
  NO_GROUP,
  NO_STAT_FILTER,
  balanceSeries,
  calendarWeeks,
  collectStats,
  countByDay,
  createdGrid,
  daysEarly,
  durationBuckets,
  earlyLateBuckets,
  groupStats,
  matchesFilter,
  median,
  periodCounts,
  rangeStart,
  shareOverTime,
  streaks,
  turnaround,
  type GroupKey,
  type StatFilter,
} from "../../lib/stats";
import { daysBetween } from "../../lib/dates";
import { SummaryCells } from "../Countdown/sheet";
import { normalizeLayout, withHidden, type DashboardLayout } from "../../lib/tileLayout";
import { HiddenRow } from "../Tiles/HiddenRow";
import { TileFrame } from "../Tiles/TileFrame";
import { TileGrid } from "../Tiles/TileGrid";
import { BalanceChart, Bars, CalendarDots, Empty, HourGrid, Note, ShareBars, type ShareSegment } from "./charts";

const RANGES: [StatFilter["range"], string][] = [
  ["all", "All time"],
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["365", "Last year"],
];
const GROUPS: [GroupKey, string, none: string][] = [
  ["list", "Lists", "Today only"],
  ["goal", "Goals", "No goal"],
  ["tag", "Tags", "No tag"],
];
// A year of weeks in the calendar of dots.
const CALENDAR_WEEKS = 53;
// How many lists, goals or tags get a colour of their own (--series-1 to 7); the rest share one as "Other".
const SERIES = 7;

const days = (n: number | null) => (n === null ? "-" : n === 0 ? "same day" : `${Math.round(n * 10) / 10} ${n === 1 ? "day" : "days"}`);
const percent = (share: number | null) => (share === null ? "-" : `${Math.round(share * 100)}%`);

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

/** A box of the user's page: a tile of its grid. */
export interface PageBox {
  key: string;
  /** Its name on the buttons, and in the Hidden row. */
  label: string;
  node: ReactNode;
  /** A small box: half a column wide where there is room (see Tile). */
  half?: boolean;
  /** What it is called as a folder's view, if it can be copied into a folder (see Tile). */
  view?: string;
}

const FILTER_BOX = "filter";

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
 * A stats box in a colour of its own, so the boxes can be told apart at a glance: its frame's band takes it,
 * and so do its bars and dots (--chart; the dots' steps are mixed from it in index.css). Without `color` the frame
 * keeps its tone's colour, and `chart` alone colours the bars and dots to go with it.
 */
function StatFrame({ color, chart = color, style: more, ...frame }: ComponentProps<typeof TileFrame> & { color?: string; chart?: string }) {
  const style = {
    ...more,
    "--chart": chart,
    ...(color ? { "--frame": frameIn(color), "--band-text": isLight(color) ? "#222034" : "#fff" } : {}),
  } as CSSProperties;
  return <TileFrame {...frame} data-chart="" style={style} />;
}

/** The colour of the Done tile's band (the "record" tone in frameTones). */
const DONE_COLOR = "#ad61cb";

/** The boxes of the stats, by name, with what each is called on its buttons. The filter is one of them. */
export const STAT_BOXES: Record<string, string> = {
  [FILTER_BOX]: "Stats filter",
  done: "Done",
  written: "Written down",
  deadlines: "Deadlines",
  time: "Time to finish",
  groups: "By list, goal or tag",
  points: "Points",
  unorganized: "Unorganized",
};

/**
 * The stats as boxes: what got done and when, how deadlines went, how long tasks take, and the point
 * balance, plus the filter box that narrows the others. Tasks only: reward lists are left out.
 * `boxes` is null until everything they need has loaded. Each use has a filter of its own.
 */
export function useStatBoxes(): { boxes: PageBox[] | null; error: Error | null } {
  const rows = useStatRows();
  const lists = useLists();
  const goals = useGoals();
  const tags = useTags();
  const points = usePoints();
  const { data: folders = [] } = useFolders();
  const [filter, setFilter] = useState(NO_STAT_FILTER);
  const [groupKey, setGroupKey] = useState<GroupKey>("list");
  const all = useMemo(() => collectStats(rows.data ?? [], lists.data ?? []), [rows.data, lists.data]);

  const error = rows.error ?? lists.error ?? goals.error ?? tags.error ?? points.error;
  if (error) return { boxes: null, error };
  if (!rows.data || !lists.data || !goals.data || !tags.data || !points.data) return { boxes: null, error: null };

  const today = localDate();
  const from = rangeStart(today, filter.range);
  const inRange = (day: string) => (!from || day >= from) && day <= today;
  const set = (changes: Partial<StatFilter>) => setFilter({ ...filter, ...changes });
  const taskLists = lists.data.filter((list) => list.kind === "task");

  // A folder narrows the stats to the lists it shows. One that has since been removed narrows nothing.
  const folder = folders.find((f) => f.id === filter.folderId);
  const folderLists = folder ? new Set(folder.views.flatMap((view) => listOfView(view) ?? [])) : null;
  const tasks = all.tasks.filter((task) => matchesFilter(task, filter, folderLists));
  const done = all.completions.filter(({ task }) => matchesFilter(task, filter, folderLists));
  const doneInRange = done.filter(({ day }) => inRange(day));
  /** One-off tasks ticked off in the range: the ones with a time to finish. */
  const finished = tasks.filter((task) => task.completedOn && !task.isPersistent && inRange(task.completedOn));
  const written = tasks.filter((task) => inRange(task.createdOn));

  const byDay = countByDay(done);
  const counts = periodCounts(byDay, today);
  const streak = streaks(byDay, today);

  const created = createdGrid(written);

  const due = finished.filter((task) => task.deadlineDate);
  const outcome = (["hard", "soft"] as const).map((type) => {
    const ofType = due.filter((task) => task.deadlineKind === type);
    return { type, total: ofType.length, onTime: ofType.filter((task) => daysEarly(task) >= 0).length };
  });

  const loose = tasks.filter((task) => task.isRoot && task.isOpen && task.isLoose);

  const [, groupTitle, noneName] = GROUPS.find(([key]) => key === groupKey)!;
  const groupItems = groupKey === "list" ? taskLists : groupKey === "goal" ? goals.data : tags.data;
  const groups = groupStats(groupKey, doneInRange, finished);
  const groupRows = [...groupItems, ...(groups.has(NO_GROUP) ? [{ id: NO_GROUP, name: noneName }] : [])]
    .map((item) => ({ name: item.name, ...(groups.get(item.id) ?? { id: item.id, done: 0, onTime: null, median: null }) }))
    .sort((a, b) => b.done - a.done);
  const maxDone = Math.max(1, ...groupRows.map((row) => row.done));

  // A colour belongs to the list, goal or tag itself (its place among all of them), so filtering never repaints it.
  const segmentOf = (id: string): Omit<ShareSegment, "count"> => {
    if (id === NO_GROUP) return { id, name: noneName, color: "var(--series-none)" };
    const index = groupItems.findIndex((item) => item.id === id);
    if (index === -1 || index >= SERIES) return { id: "other", name: "Other", color: "var(--series-other)" };
    return { id, name: groupItems[index].name, color: `var(--series-${index + 1})` };
  };
  const share = shareOverTime(groupKey, doneInRange, from, today);
  const order = [...groupItems.map((item) => item.id), NO_GROUP];
  const sharePeriods = share.periods.map((period) => {
    const segments = new Map<string, ShareSegment>();
    for (const id of order) {
      const count = period.parts.get(id);
      if (!count) continue;
      const segment = segmentOf(id);
      segments.set(segment.id, { ...segment, count: (segments.get(segment.id)?.count ?? 0) + count });
    }
    // "Other" and the group without a label go last.
    const last = (segment: ShareSegment) => (segment.id === NO_GROUP ? 2 : segment.id === "other" ? 1 : 0);
    return { ...period, segments: [...segments.values()].sort((a, b) => last(a) - last(b)) };
  });
  const shareLegend = [...new Map(sharePeriods.flatMap((period) => period.segments).map((s) => [s.id, s])).values()];

  const balance = balanceSeries(points.data, from, today);

  const filterBox: PageBox = {
    key: FILTER_BOX,
    label: STAT_BOXES[FILTER_BOX],
    node: (
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
            <option value="">All lists</option>
            {taskLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </Pick>
          {folders.length > 0 && (
            <Pick label="Folder" value={folder ? filter.folderId : ""} onChange={(folderId) => set({ folderId })}>
              <option value="">Any folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Pick>
          )}
          <Pick label="Goal" value={filter.goalId} onChange={(goalId) => set({ goalId })}>
            <option value="">Any goal</option>
            {goals.data.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
          </Pick>
          <Pick label="Tag" value={filter.tagId} onChange={(tagId) => set({ tagId })}>
            <option value="">Any tag</option>
            {tags.data.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
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
          Tasks and subtasks, not rewards. A subtask counts under its main task's list, goals and tags. Dates narrow everything except
          the counts, streaks and dots in Done and the Unorganized box.
        </Note>
      </TileFrame>
    ),
  };

  const boxes: PageBox[] = [
    filterBox,
    {
      key: "done",
      label: "Done",
      node: (
        <StatFrame title="Done" tone="record" chart={DONE_COLOR} aria-label="Done stats">
          <SummaryCells
            cells={[
              ["Today", counts.today],
              ["This week", counts.week],
              ["This month", counts.month],
              ["All time", counts.all],
            ]}
          />
          <SummaryCells
            cells={[
              ["Streak", `${streak.current} ${streak.current === 1 ? "day" : "days"}`],
              ["Longest", `${streak.longest} ${streak.longest === 1 ? "day" : "days"}`],
            ]}
          />
          <CalendarDots weeks={calendarWeeks(byDay, today, CALENDAR_WEEKS)} />
          <Note>A streak is days in a row with at least one task done. Each press of a persistent task counts as one.</Note>
        </StatFrame>
      ),
    },
    {
      key: "written",
      label: "Written down",
      node: (
        <StatFrame title="Written down" color="#2a9ba8" aria-label="Written down">
          {created.total === 0 ? (
            <Empty>No tasks written down in these dates.</Empty>
          ) : (
            <>
              <SummaryCells cells={DAY_PARTS.map(({ name }, i) => [name, percent(created.parts[i] / created.total)] as const)} />
              <HourGrid grid={created.grid} max={created.max} />
              <Note>
                When tasks were written down, by this device's clock. {DAY_PARTS.map(({ name, from: start, to }) => `${name} ${start}-${to}h`).join(", ")}.
              </Note>
            </>
          )}
        </StatFrame>
      ),
    },
    {
      key: "deadlines",
      label: "Deadlines",
      node: (
        <TileFrame title="Deadlines" aria-label="Deadlines">
          {due.length === 0 ? (
            <Empty>No finished tasks with a deadline in these dates.</Empty>
          ) : (
            <>
              <SummaryCells cells={outcome.map(({ type, total, onTime }) => [`${type === "hard" ? "Hard" : "Soft"} on time`, total ? `${onTime}/${total} · ${percent(onTime / total)}` : "-"] as const)} />
              <Bars
                aria-label="Finished early or late"
                rows={earlyLateBuckets(due).map(({ label, count, late }) => ({ label, value: count, color: late ? "var(--chart-late)" : undefined }))}
              />
              <Note>Finished tasks with a deadline of their own, by how far from it they were ticked off.</Note>
            </>
          )}
        </TileFrame>
      ),
    },
    {
      key: "time",
      label: "Time to finish",
      node: (
        <StatFrame title="Time to finish" color="#df7126" aria-label="Time to finish">
          {finished.length === 0 ? (
            <Empty>No finished tasks in these dates.</Empty>
          ) : (
            <>
              <SummaryCells
                cells={[
                  ["Written to done", days(median(finished.map(turnaround)))],
                  ["Written to deadline", days(median(written.filter((task) => task.deadlineDate).map((task) => daysBetween(task.createdOn, task.deadlineDate!))))],
                  ["With deadline: to done", days(median(due.map(turnaround)))],
                ]}
              />
              <Bars aria-label="Days from written down to done" rows={durationBuckets(finished.map(turnaround)).map(({ label, count }) => ({ label, value: count }))} />
              <Note>
                Medians: half the tasks took this long or less. "Written to deadline" is how far ahead deadlines are set; compare it
                with how long those tasks then took.
              </Note>
            </>
          )}
        </StatFrame>
      ),
    },
    {
      key: "groups",
      label: "By list, goal or tag",
      node: (
        <StatFrame title={`By ${groupTitle.toLowerCase().replace(/s$/, "")}`} color="#d95f8c"
          // The first list, goal or tag in the share bars takes the box's colour; the pink further down the row of colours becomes the blue it replaced.
          style={{ "--series-1": "var(--chart)", "--series-5": "#2a78d6" } as CSSProperties}
          aria-label="By list, goal or tag"
        >
          <div className="flex flex-wrap gap-1">
            {GROUPS.map(([key, label]) => (
              <button key={key} type="button" className={`nes-btn btn-small ${key === groupKey ? "is-primary" : ""}`} aria-pressed={key === groupKey} onClick={() => setGroupKey(key)}>
                {label}
              </button>
            ))}
          </div>
          {groupRows.length === 0 ? (
            <Empty>No {groupTitle.toLowerCase()} yet.</Empty>
          ) : (
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-stone-500">
                  <th className="pr-2 text-left font-normal" />
                  <th className="w-full pr-2 text-left font-normal">Done</th>
                  <th className="pr-2 text-right font-normal whitespace-nowrap">On time</th>
                  <th className="text-right font-normal whitespace-nowrap">To done</th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row) => (
                  <tr key={row.id} data-group={row.name}>
                    <td className="max-w-32 truncate py-0.5 pr-2 sm:max-w-48">{row.name}</td>
                    <td className="py-0.5 pr-2">
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 min-w-0 flex-1" style={{ backgroundColor: "var(--chart-track)" }}>
                          <span className="block h-full" style={{ width: `${(row.done / maxDone) * 100}%`, backgroundColor: "var(--chart)" }} />
                        </span>
                        <span data-group-done>{row.done}</span>
                      </span>
                    </td>
                    <td className="py-0.5 pr-2 text-right">{percent(row.onTime)}</td>
                    <td className="py-0.5 text-right whitespace-nowrap">{days(row.median)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {doneInRange.length > 0 && (
            <>
              <p className="text-xs text-stone-500">Share of what was done, per {share.unit}</p>
              <ShareBars periods={sharePeriods} legend={shareLegend} />
            </>
          )}
          <Note>
            On time: finished tasks with a deadline that made it. To done: median from written down to done. A low on-time share or a
            long time to done shows where things get put off.
          </Note>
        </StatFrame>
      ),
    },
    {
      key: "points",
      label: "Points",
      node: (
        <StatFrame title="Points" color="#e0b000" chart="#c98500" aria-label="Points over time">
          {balance.length === 0 ? <Empty>No points booked yet.</Empty> : <BalanceChart series={balance} />}
          <Note>The balance at the end of each day. Only the Dates filter applies here.</Note>
        </StatFrame>
      ),
    },
    {
      key: "unorganized",
      label: "Unorganized",
      node: (
        <TileFrame title="Unorganized" tone="setup" aria-label="Unorganized">
          <SummaryCells cells={[["Open tasks", loose.length]]} />
          <Note>Open main tasks with no deadline, goal or tag.</Note>
          {loose.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-stone-500">Show them</summary>
              <ul className="mt-1 space-y-0.5">
                {loose.map((task) => (
                  <li key={task.id} className="truncate">
                    {task.title.split("\n")[0]}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </TileFrame>
      ),
    },
  ];
  return { boxes, error: null };
}

const StatBoxesContext = createContext<ReturnType<typeof useStatBoxes> | null>(null);

/** Around a folder's page that shows boxes of the stats: works them out once, for every StatBoxView inside. */
export function StatBoxesProvider({ children }: { children: ReactNode }) {
  return <StatBoxesContext.Provider value={useStatBoxes()}>{children}</StatBoxesContext.Provider>;
}

/** One box of the stats, by its name in STAT_BOXES: a folder's copy of it. */
export function StatBoxView({ name }: { name: string }) {
  const stats = useContext(StatBoxesContext);
  const box = stats?.boxes?.find((other) => other.key === name);
  if (box) return box.node;
  return (
    <TileFrame title={STAT_BOXES[name] ?? "Stats"}>
      {stats?.error ? <p className="text-sm text-red-600">Couldn't load your stats: {stats.error.message}</p> : <p className="text-sm text-stone-500">Loading…</p>}
    </TileFrame>
  );
}

/**
 * The user's page: the boxes it is given (`before`: the account's), then the stats. All of them, the
 * filter too, are tiles of one grid: moved, pinned and hidden like the dashboard's, over as many columns
 * as fit, with an arrangement of their own. A stats box dropped on a folder's tab is shown in that folder too.
 */
export function StatsPanel({ before = [] }: { before?: PageBox[] }) {
  const stats = useStatBoxes();
  const layout = useLayout("stats");
  const saveLayout = useSaveLayout("stats");
  const drop = useDropOnTab();

  // Without the stats, the account's boxes are still there (logging out, above all).
  const alone = (message: ReactNode) => (
    <div className="mx-auto max-w-3xl space-y-4">
      {before.map((box) => (
        <div key={box.key}>{box.node}</div>
      ))}
      {message}
    </div>
  );
  if (stats.error) return alone(<p className="text-sm text-red-600">Couldn't load your stats: {stats.error.message}</p>);
  // The layout is waited for (not required), so the boxes don't jump once it arrives.
  if (!stats.boxes || layout.isLoading) return alone(<p className="text-sm text-stone-500">Loading…</p>);

  // Every box is a tile of a grid like the dashboard's: dragged by its tab button, pinned, or minimized away.
  const boxes = [...before, ...stats.boxes.map((box) => ({ ...box, view: statView(box.key) }))];
  const saved = withTopBoxes(normalizeLayout(layout.data), [...before.map((box) => box.key), FILTER_BOX]);
  const isHidden = (key: string) => (saved.hidden ?? []).includes(key);
  const tiles = boxes.filter((box) => !isHidden(box.key)).map((box) => ({ key: box.key, name: box.label, node: box.node, half: box.half, view: box.view, canHide: true }));

  return (
    <>
      <TileGrid tiles={tiles} order={boxes.map((box) => box.key)} layout={saved} onChange={(next) => saveLayout.mutate(next)} onDropOnTab={drop.dropOnTab} />
      <HiddenRow tiles={boxes.filter((box) => isHidden(box.key))} onShow={(key) => saveLayout.mutate(withHidden(saved, key, false))} />
      {saveLayout.error && <p className="text-center text-sm text-red-600">Couldn't save the layout: {saveLayout.error.message}</p>}
      {drop.error && <p className="text-center text-sm text-red-600">Couldn't change the folder: {drop.error.message}</p>}
    </>
  );
}
