import { createContext, useContext, useMemo, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { localDate } from "../../api/client";
import { useDropOnTab, useFolders, useGoals, useLayout, useLists, usePoints, useSaveLayout, useStatRows, useTags } from "../../hooks/useTasks";
import { listOfView, statView } from "../../lib/folders";
import { frameIn, isLight } from "../../lib/frameTones";
import {
  DAY_PARTS,
  NO_GROUP,
  NO_GROUP_ROW,
  NO_STAT_FILTER,
  activeDays,
  balanceSeries,
  calendarWeeks,
  collectStats,
  countByDay,
  dayPartOf,
  deadlineOutcomes,
  durationBuckets,
  earlyLateBuckets,
  firstDay,
  flowOver,
  flowWeeks,
  groupStats,
  hourGrid,
  isOnTime,
  matchesFilter,
  median,
  periodCounts,
  pointsFlow,
  rangeStart,
  shareOverTime,
  streaks,
  turnaround,
  typicalWeek,
  type Completion,
  type GroupKey,
  type Outcome,
  type StatFilter,
  type StatTask,
} from "../../lib/stats";
import { addDays, daysBetween, formatDay } from "../../lib/dates";
import { SummaryCells } from "../Countdown/sheet";
import { normalizeLayout, withHidden, type DashboardLayout } from "../../lib/tileLayout";
import { HiddenRow } from "../Tiles/HiddenRow";
import { TileFrame } from "../Tiles/TileFrame";
import { TileGrid } from "../Tiles/TileGrid";
import { TaskCells, type ListedTask } from "./TaskListDialog";
import { BalanceChart, Bars, CalendarDots, Empty, HourGrid, Note, PairColumns, ShareBars, type ShareSegment } from "./charts";

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
// The weeks of written down against done, and the days its numbers and the active days look back over.
const FLOW_WEEKS = 12;
const RECENT_DAYS = 28;
// An open task this old has sat for a while.
const OLD_DAYS = 30;
const MOMENTS: ["written" | "done", string][] = [
  ["written", "Written"],
  ["done", "Done"],
];
// How many lists, goals or tags get a colour of their own (--series-1 to 7); the rest share one as "Other".
const SERIES = 7;

const days = (n: number | null) => (n === null ? "-" : n === 0 ? "same day" : `${Math.round(n * 10) / 10} ${n === 1 ? "day" : "days"}`);
const percent = (share: number | null) => (share === null ? "-" : `${Math.round(share * 100)}%`);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "+3", "-2", "0": how a number moved. */
/** Bars of buckets, each with its count and its share of them all, so the spread reads without adding up. */
const bucketRows = (buckets: { label: string; count: number }[]) => {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return buckets.map(({ label, count: value }) => ({ label, value, text: value ? `${value} · ${Math.round((value / total) * 100)}%` : "0" }));
};
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
/** What a deadline's outcome says in a list of tasks. */
const outcomeNote = ({ early, isOpen }: Outcome) => (isOpen ? `${count(-early, "day")} overdue` : early >= 0 ? "on time" : `${count(-early, "day")} late`);

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

/** A box of the Stats page: a tile of its grid. */
interface PageBox {
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
  flow: "Keeping up",
  open: "Open work",
  deadlines: "Deadlines",
  time: "Time to finish",
  groups: "By list, goal or tag",
  written: "Time of day",
  points: "Points",
  unorganized: "Unorganized",
};

/**
 * The stats as boxes: what got done and when, whether that keeps up with what is written down, what is
 * still open, how deadlines went, how long tasks take, and the point balance, plus the filter box that narrows the others. Tasks only: reward lists are left out.
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
  const [moment, setMoment] = useState<"written" | "done">("written");
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
  const typical = typicalWeek(byDay, today);
  const since = firstDay(byDay);
  // The 30 days before the last 30 are only something to go by once the history reaches back over them.
  const hasPrev30 = since !== null && since <= addDays(today, 1 - 60);
  const last30 = done.filter(({ day }) => day >= addDays(today, 1 - 30) && day <= today);
  const kinds = {
    tasks: last30.filter((c) => !c.isPress && c.task.isRoot).length,
    subtasks: last30.filter((c) => !c.isPress && !c.task.isRoot).length,
    repeats: last30.filter((c) => c.isPress).length,
  };

  // What the numbers count, for the list a click on one opens. Newest first; presses of one task on one day are one row.
  const listDone = (isIn: (day: string) => boolean): ListedTask[] => {
    const rows = new Map<string, ListedTask & { day: string }>();
    for (const { day, task } of done as Completion[]) {
      if (!isIn(day)) continue;
      const row = rows.get(`${task.id}:${day}`);
      if (row) row.times = (row.times ?? 1) + 1;
      else rows.set(`${task.id}:${day}`, { task, day, note: formatDay(day) });
    }
    return [...rows.values()].sort((a, b) => b.day.localeCompare(a.day));
  };
  const listed = (tasks: StatTask[], note: (task: StatTask) => string | undefined): ListedTask[] => tasks.map((task) => ({ task, note: note(task) }));
  const newestFirst = (tasks: StatTask[], dayOf: (task: StatTask) => string) => [...tasks].sort((a, b) => dayOf(b).localeCompare(dayOf(a)));

  const weeks = flowWeeks(tasks, today, FLOW_WEEKS);
  const recent = flowOver(tasks, today, RECENT_DAYS);

  // What is still to do, the longest waiting first; and of it, what is past a deadline of its own, the furthest behind first.
  const age = (task: StatTask) => Math.max(0, daysBetween(task.createdOn, today));
  const open = tasks.filter((task) => task.isOpen).sort((a, b) => age(b) - age(a));
  const old = open.filter((task) => age(task) > OLD_DAYS);

  // The time of day, of writing tasks down or of ticking them off.
  const moments: { at: Date; task: StatTask; day: string }[] =
    moment === "written"
      ? written.map((task) => ({ at: task.createdAt, task, day: task.createdOn }))
      : doneInRange.flatMap(({ at, task, day }) => (at ? [{ at, task, day }] : []));
  const hours = hourGrid(moments.map(({ at }) => at));
  const momentWord = moment === "written" ? "written down" : "done";

  const outcomes = deadlineOutcomes(tasks, today);
  const settled = outcomes.filter(({ day }) => inRange(day));
  const overdue = outcomes.filter((outcome) => outcome.isOpen).sort((a, b) => a.early - b.early);
  const outcome = (["hard", "soft"] as const).map((type) => {
    const ofType = settled.filter(({ task }) => task.deadlineKind === type);
    return { type, ofType, total: ofType.length, onTime: ofType.filter(isOnTime).length };
  });
  const lateness = earlyLateBuckets(settled);
  /** Finished in the range with a deadline of their own: how far ahead it was set, against how long they took. */
  const due = finished.filter((task) => task.deadlineDate);
  const ahead = median(due.map((task) => daysBetween(task.createdOn, task.deadlineDate!)));
  const dueTook = median(due.map(turnaround));

  const loose = tasks.filter((task) => task.isRoot && task.isOpen && task.isLoose);

  const [, groupTitle, noneName] = GROUPS.find(([key]) => key === groupKey)!;
  const groupItems = groupKey === "list" ? taskLists : groupKey === "goal" ? goals.data : tags.data;
  const groups = groupStats(groupKey, doneInRange, finished, settled, open);
  const groupRows = [...groupItems, ...(groups.has(NO_GROUP) ? [{ id: NO_GROUP, name: noneName }] : [])]
    .map((item) => ({ name: item.name, ...(groups.get(item.id) ?? { id: item.id, ...NO_GROUP_ROW }) }))
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
  const flow = pointsFlow(points.data, from);

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
          Tasks and subtasks, not rewards. A subtask counts under its main task's list, goals and tags. Dates narrow the boxes about
          a stretch of time. Done and Keeping up have windows of their own; Open work and Unorganized are about now.
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
          <TaskCells
            cells={[
              ["Today", counts.today, "Done today", listDone((day) => day === today)],
              ["Last 7 days", counts.last7, "Done in the last 7 days", listDone((day) => day >= addDays(today, -6) && day <= today)],
              ["Last 30 days", counts.last30, "Done in the last 30 days", listDone((day) => day >= addDays(today, -29) && day <= today)],
              ["All time", counts.all, "Done, all time", listDone(() => true)],
            ]}
          />
          {(typical !== null || counts.last30 > 0) && (
            <p className="text-xs" data-done-compare>
              {typical !== null && `A usual week holds ${Math.round(typical * 10) / 10}; the last 7 days hold ${counts.last7}. `}
              {hasPrev30 && `The 30 days before the last 30 held ${counts.prev30}. `}
              {counts.last30 > 0 && `Of the last 30 days: ${count(kinds.tasks, "main task")}, ${count(kinds.subtasks, "subtask")}, ${count(kinds.repeats, "repeat")}.`}
            </p>
          )}
          <SummaryCells
            cells={[
              ["Streak", count(streak.current, "day")],
              ["Longest", count(streak.longest, "day")],
              ["Active days", `${activeDays(byDay, today, RECENT_DAYS)}/${RECENT_DAYS}`],
            ]}
          />
          <CalendarDots weeks={calendarWeeks(byDay, today, CALENDAR_WEEKS)} />
          <Note>
            A streak is days in a row with at least one task done; active days are the days with one among the last {RECENT_DAYS}, so a
            day off costs a day and not the run. A usual week is the middle one of the four before the last 7 days. Each press of a
            persistent task counts as one.
          </Note>
        </StatFrame>
      ),
    },
    {
      key: "flow",
      label: STAT_BOXES.flow,
      node: (
        <StatFrame title="Keeping up" color="#3f9b5c" aria-label="Keeping up">
          <TaskCells
            cells={[
              ["Written down", recent.written.length, `Written down in the last ${RECENT_DAYS} days`, listed(newestFirst(recent.written, (task) => task.createdOn), (task) => formatDay(task.createdOn))],
              ["Done", recent.done.length, `Done in the last ${RECENT_DAYS} days`, listed(newestFirst(recent.done, (task) => task.closedOn!), (task) => formatDay(task.closedOn!))],
              ["Open now", `${recent.open.length} (${signed(recent.open.length - recent.openBefore)})`, "Open now, the oldest first", listed([...recent.open].sort((a, b) => age(b) - age(a)), (task) => count(age(task), "day"))],
            ]}
          />
          <PairColumns weeks={weeks} />
          <Note>
            The numbers are for the last {RECENT_DAYS} days, with how the open tasks moved over them in brackets; the columns are whole
            weeks from Monday. Where more is written down than done, the pile grows. One-off tasks and their subtasks; a subtask left
            unticked counts as done with its main task.
          </Note>
        </StatFrame>
      ),
    },
    {
      key: "open",
      label: STAT_BOXES.open,
      node: (
        <StatFrame title="Open work" color="#7a6ad8" aria-label="Open work">
          <TaskCells
            cells={[
              ["Open", open.length, "Open tasks, the oldest first", listed(open, (task) => count(age(task), "day"))],
              ["Overdue", overdue.length, "Open and past their deadline", overdue.map((o) => ({ task: o.task, note: outcomeNote(o) }))],
              [`Over ${OLD_DAYS} days old`, old.length, `Open for more than ${OLD_DAYS} days`, listed(old, (task) => count(age(task), "day"))],
            ]}
          />
          {open.length === 0 ? (
            <Empty>Nothing open.</Empty>
          ) : (
            <Bars aria-label="How long open tasks have been open" rows={bucketRows(durationBuckets(open.map(age)))} />
          )}
          <Note>
            Tasks and subtasks still to do, by how long ago they were written down, in the same steps as Time to finish{open.length > 0 && ` (median: ${count(Math.round(median(open.map(age))!), "day")})`}.
            Overdue: the ones past a deadline of their own. Click a number to see the tasks. The Dates filter does not apply.
          </Note>
        </StatFrame>
      ),
    },
    {
      key: "deadlines",
      label: "Deadlines",
      node: (
        <TileFrame title="Deadlines" aria-label="Deadlines">
          {settled.length === 0 ? (
            <Empty>No deadlines met or missed in these dates.</Empty>
          ) : (
            <>
              <TaskCells
                cells={outcome.map(
                  ({ type, ofType, total, onTime }) =>
                    [
                      `${type === "hard" ? "Hard" : "Soft"} on time`,
                      total ? `${onTime}/${total} · ${percent(onTime / total)}` : "-",
                      `Tasks with a ${type} deadline`,
                      // The furthest behind first.
                      [...ofType].sort((a, b) => a.early - b.early).map((o) => ({ task: o.task, note: outcomeNote(o) })),
                    ] as const,
                )}
              />
              <Bars
                aria-label="Finished early or late"
                rows={bucketRows(lateness).map((row, i) => ({ ...row, color: lateness[i].late ? "var(--chart-late)" : undefined }))}
              />
              <Note>
                Tasks with a deadline of their own, by how far from it they were ticked off. One still open after its deadline counts
                as missed, under the day of the deadline.
              </Note>
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
                  ["Written to deadline", days(ahead)],
                  ["With deadline: to done", days(dueTook)],
                ]}
              />
              <Bars aria-label="Days from written down to done" rows={bucketRows(durationBuckets(finished.map(turnaround)))} />
              <Note>
                Each bar is the tasks that took that long, with its share of them all. Medians: half the tasks took this long or
                less. From {count(finished.length, "finished task")}, {due.length} with a
                deadline: "Written to deadline" is how far ahead those deadlines were set, "With deadline: to done" how long the same
                tasks took. Tasks still open are not in here; see Open work.
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
                  <th className="pr-2 text-right font-normal">Open</th>
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
                    <td className="py-0.5 pr-2 text-right" data-group-open>
                      {row.open}
                    </td>
                    <td className="py-0.5 pr-2 text-right" data-group-on-time>
                      {row.due ? `${row.onTime}/${row.due}` : "-"}
                    </td>
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
            Open: tasks and subtasks still to do, whatever the dates. On time: deadlines met, out of those met or missed in these
            dates. To done: median days from written down to done. The numbers beside the share bars count each thing done once, though
            it shows under every goal or tag it carries.
          </Note>
        </StatFrame>
      ),
    },
    {
      key: "written",
      label: STAT_BOXES.written,
      node: (
        <StatFrame title="Time of day" color="#2a9ba8" aria-label="Time of day">
          <div className="flex flex-wrap gap-1">
            {MOMENTS.map(([key, label]) => (
              <button key={key} type="button" className={`nes-btn btn-small ${key === moment ? "is-primary" : ""}`} aria-pressed={key === moment} onClick={() => setMoment(key)}>
                {label}
              </button>
            ))}
          </div>
          {hours.total === 0 ? (
            <Empty>No tasks {momentWord} in these dates.</Empty>
          ) : (
            <>
              <TaskCells
                cells={DAY_PARTS.map(
                  ({ name }, i) =>
                    [
                      name,
                      percent(hours.parts[i] / hours.total),
                      `${moment === "written" ? "Written down" : "Done"}: ${name.toLowerCase()}`,
                      moments
                        .filter(({ at }) => dayPartOf(at) === i)
                        .sort((a, b) => b.at.getTime() - a.at.getTime())
                        .map(({ task, day }) => ({ task, note: formatDay(day) })),
                    ] as const,
                )}
              />
              <HourGrid grid={hours.grid} cap={hours.cap} what={momentWord} />
              <Note>
                When tasks were {momentWord}, by this device's clock. {DAY_PARTS.map(({ name, from: start, to }) => `${name} ${start}-${to}h`).join(", ")}.
                {moment === "done" && " Done is when a task was ticked, which can be well after the work itself."}
              </Note>
            </>
          )}
        </StatFrame>
      ),
    },
    {
      key: "points",
      label: "Points",
      node: (
        <StatFrame title="Points" color="#e0b000" chart="#c98500" aria-label="Points over time">
          {balance.length === 0 ? (
            <Empty>No points booked yet.</Empty>
          ) : (
            <>
              <SummaryCells
                cells={[
                  ["Earned", flow.earned],
                  ["Spent", flow.spent],
                ]}
              />
              <BalanceChart series={balance} />
            </>
          )}
          <Note>
            Earned and spent in these dates, and the balance at the end of each day, from the newest bookings (300 at most). Only the
            Dates filter applies here.
          </Note>
        </StatFrame>
      ),
    },
    {
      key: "unorganized",
      label: "Unorganized",
      node: (
        <TileFrame title="Unorganized" tone="setup" aria-label="Unorganized">
          <TaskCells cells={[["Open tasks", loose.length, "Unorganized open tasks", listed(loose, () => undefined)]]} />
          <Note>Open main tasks with no deadline, goal or tag. Click the number to see them.</Note>
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
 * The Stats page: every box of the stats, the filter too, as tiles of one grid: moved, pinned and hidden
 * like the dashboard's, over as many columns as fit, with an arrangement of their own. A stats box dropped
 * on a folder's tab is shown in that folder too.
 */
export function StatsPanel() {
  const stats = useStatBoxes();
  const layout = useLayout("stats");
  const saveLayout = useSaveLayout("stats");
  const drop = useDropOnTab();

  if (stats.error) return <p className="text-sm text-red-600">Couldn't load your stats: {stats.error.message}</p>;
  // The layout is waited for (not required), so the boxes don't jump once it arrives.
  if (!stats.boxes || layout.isLoading) return <p className="text-sm text-stone-500">Loading…</p>;

  // Every box is a tile of a grid like the dashboard's: dragged by its tab button, pinned, or minimized away.
  const boxes = stats.boxes.map((box) => ({ ...box, view: statView(box.key) }));
  const saved = withTopBoxes(normalizeLayout(layout.data), [FILTER_BOX]);
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
