import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { formatDay } from "../../../lib/dates";
import { frameIn, isLight } from "../../../lib/frameTones";
import type { Completion, Outcome, StatFilter, StatTask } from "../../../lib/stats";
import type { StatsView } from "../../../lib/statsView";
import type { Folder, Goal, List, PointsSummary, Tag } from "../../../types";
import { TileFrame } from "../../Tiles/TileFrame";
import type { ListedTask } from "../TaskListDialog";

/** What a box of the stats is drawn from: the filtered view, what the filter offers, and the point ledger. */
export interface StatsData {
  view: StatsView;
  filter: StatFilter;
  setFilter: (filter: StatFilter) => void;
  /** Task lists only: reward lists are left out of the stats. */
  taskLists: List[];
  lists: List[];
  goals: Goal[];
  tags: Tag[];
  folders: Folder[];
  points: PointsSummary;
}

/** A box of the stats, drawn from the same data as all the others. */
export type StatBox = (props: { stats: StatsData }) => ReactNode;

// The days the Done and Keeping-up numbers and the active days look back over.
export const RECENT_DAYS = 28;

export const days = (n: number | null) => (n === null ? "-" : n === 0 ? "same day" : `${Math.round(n * 10) / 10} ${n === 1 ? "day" : "days"}`);
export const percent = (share: number | null) => (share === null ? "-" : `${Math.round(share * 100)}%`);
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "+3", "-2", "0": how a number moved. */
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Bars of buckets, each with its count and its share of them all, so the spread reads without adding up. */
export const bucketRows = (buckets: { label: string; count: number }[]) => {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return buckets.map(({ label, count: value }) => ({ label, value, text: value ? `${value} · ${Math.round((value / total) * 100)}%` : "0" }));
};

/** What a deadline's outcome says in a list of tasks. */
export const outcomeNote = ({ early, isOpen }: Outcome) => (isOpen ? `${count(-early, "day")} overdue` : early >= 0 ? "on time" : `${count(-early, "day")} late`);

/** Tasks for the list a click on a number opens, each with its note. */
export const listed = (tasks: StatTask[], note: (task: StatTask) => string | undefined): ListedTask[] => tasks.map((task) => ({ task, note: note(task) }));

export const newestFirst = (tasks: StatTask[], dayOf: (task: StatTask) => string) => [...tasks].sort((a, b) => dayOf(b).localeCompare(dayOf(a)));

/** What was done on the days `isIn` takes, for the list a click on a number opens. Newest first; presses of one task on one day are one row. */
export function listDone(done: Completion[], isIn: (day: string) => boolean): ListedTask[] {
  const rows = new Map<string, ListedTask & { day: string }>();
  for (const { day, task } of done) {
    if (!isIn(day)) continue;
    const row = rows.get(`${task.id}:${day}`);
    if (row) row.times = (row.times ?? 1) + 1;
    else rows.set(`${task.id}:${day}`, { task, day, note: formatDay(day) });
  }
  return [...rows.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * A stats box in a colour of its own, so the boxes can be told apart at a glance: its frame's band takes it,
 * and so do its bars and dots (--chart; the dots' steps are mixed from it in index.css). Without `color` the frame
 * keeps its tone's colour, and `chart` alone colours the bars and dots to go with it.
 */
export function StatFrame({ color, chart = color, style: more, ...frame }: ComponentProps<typeof TileFrame> & { color?: string; chart?: string }) {
  const style = {
    ...more,
    "--chart": chart,
    ...(color ? { "--frame": frameIn(color), "--band-text": isLight(color) ? "#222034" : "#fff" } : {}),
  } as CSSProperties;
  return <TileFrame {...frame} data-chart="" style={style} />;
}

/** A row of buttons picking one of `choices`, the picked one pressed. */
export function Choices<K extends string>({ choices, value, onPick }: { choices: [K, string][]; value: K; onPick: (key: K) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {choices.map(([key, label]) => (
        <button key={key} type="button" className={`nes-btn btn-small ${key === value ? "is-primary" : ""}`} aria-pressed={key === value} onClick={() => onPick(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
