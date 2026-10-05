import { useMemo, useState, type ReactNode } from "react";
import { localDate } from "../../api/client";
import { useGoals, useLayout, useLists, usePoints, useSaveLayout, useTags, useTaskTrees } from "../../hooks/useTasks";
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
import { normalizeLayout, withHidden } from "../../lib/tileLayout";
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

/**
 * The stats on the user's page: what got done and when, how deadlines went,
 * how long tasks take, and the point balance. One filter at the top narrows
 * every box below it; the boxes can be moved, pinned and hidden like the
 * dashboard's, with an arrangement of their own. Tasks only: reward lists are left out.
 */
export function StatsPanel() {
  const trees = useTaskTrees();
  const lists = useLists();
  const goals = useGoals();
  const tags = useTags();
  const points = usePoints();
  const layout = useLayout("stats");
  const saveLayout = useSaveLayout("stats");
  const [filter, setFilter] = useState(NO_STAT_FILTER);
  const [groupKey, setGroupKey] = useState<GroupKey>("list");
  const all = useMemo(() => collectStats(trees.data ?? [], lists.data ?? []), [trees.data, lists.data]);

  const error = trees.error ?? lists.error ?? goals.error ?? tags.error ?? points.error;
  if (error) return <p className="text-sm text-red-600">Couldn't load your stats: {error.message}</p>;
  // The layout is waited for (not required), so the boxes don't jump once it arrives.
  if (!trees.data || !lists.data || !goals.data || !tags.data || !points.data || layout.isLoading) return <p className="text-sm text-stone-500">Loading…</p>;

  const today = localDate();
  const from = rangeStart(today, filter.range);
  const inRange = (day: string) => (!from || day >= from) && day <= today;
  const set = (changes: Partial<StatFilter>) => setFilter({ ...filter, ...changes });
  const taskLists = lists.data.filter((list) => list.kind === "task");

  const tasks = all.tasks.filter((task) => matchesFilter(task, filter));
  const done = all.completions.filter(({ task }) => matchesFilter(task, filter));
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

  // Every stats box is a tile of a grid like the dashboard's: dragged by its tab button, pinned, or minimized away.
  const boxes = [
    {
      key: "done",
      label: "Done",
      node: (
        <TileFrame title="Done" tone="record" aria-label="Done stats">
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
        </TileFrame>
      ),
    },
    {
      key: "written",
      label: "Written down",
      node: (
        <TileFrame title="Written down" aria-label="Written down">
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
        </TileFrame>
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
        <TileFrame title="Time to finish" aria-label="Time to finish">
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
        </TileFrame>
      ),
    },
    {
      key: "groups",
      label: "By list, goal or tag",
      node: (
        <TileFrame title={`By ${groupTitle.toLowerCase().replace(/s$/, "")}`} aria-label="By list, goal or tag">
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
        </TileFrame>
      ),
    },
    {
      key: "points",
      label: "Points",
      node: (
        <TileFrame title="Points" aria-label="Points over time">
          {balance.length === 0 ? <Empty>No points booked yet.</Empty> : <BalanceChart series={balance} />}
          <Note>The balance at the end of each day. Only the Dates filter applies here.</Note>
        </TileFrame>
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
  const saved = normalizeLayout(layout.data);
  const isHidden = (key: string) => (saved.hidden ?? []).includes(key);
  const tiles = boxes.filter((box) => !isHidden(box.key)).map((box) => ({ key: box.key, name: box.label, node: box.node, canHide: true }));

  return (
    <>
      <div className="mx-auto max-w-3xl">
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
      </div>
      <TileGrid tiles={tiles} order={boxes.map((box) => box.key)} layout={saved} onChange={(next) => saveLayout.mutate(next)} />
      <HiddenRow tiles={boxes.filter((box) => isHidden(box.key))} onShow={(key) => saveLayout.mutate(withHidden(saved, key, false))} />
      {saveLayout.error && <p className="text-center text-sm text-red-600">Couldn't save the layout: {saveLayout.error.message}</p>}
    </>
  );
}
