import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { localDate } from "../../api/client";
import { useDoneOn } from "../../hooks/useTasks";
import { addDays, formatDay } from "../../lib/dates";
import type { TaskTreeNode } from "../../types";
import { TileFrame } from "../Tiles/TileFrame";
import { RichText } from "../RichText";

interface DoneTask {
  id: string;
  title: string;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
  completedAt: string | null;
  /** A persistent task pressed more than once that day. */
  times?: number;
}

const firstLine = (title: string) => title.split("\n")[0];

/** Every task ticked off on `day`, at any depth, in the order they were ticked; a persistent task once, with how often. */
function doneOn(trees: TaskTreeNode[], day: string): DoneTask[] {
  const found: DoneTask[] = [];
  const visit = (nodes: TaskTreeNode[], path: string[]) => {
    for (const node of nodes) {
      const title = firstLine(node.title);
      if (node.completedOn === day) found.push({ id: node.id, title, path, completedAt: node.completedAt });
      const presses = node.completions.filter((press) => press.day === day);
      if (presses.length > 0) {
        found.push({ id: node.id, title, path, completedAt: presses.at(-1)!.createdAt, times: presses.length });
      }
      visit(node.children, [...path, title]);
    }
  };
  visit(trees, []);
  // A task ticked a moment ago has no server time yet; it goes last.
  return found.sort((a, b) => (a.completedAt ?? "9").localeCompare(b.completedAt ?? "9"));
}

/**
 * What was done on one day; step back and forth a day at a time, or pick a day from the calendar.
 * `tasks`, the task trees, have today and yesterday; a day before that is loaded when it is shown.
 * A click anywhere on the box that isn't on one of its buttons opens the Done page, with every day.
 */
export function DoneLog({ tasks }: { tasks: TaskTreeNode[] }) {
  const today = localDate();
  // null follows today, so the box rolls over with the day.
  const [picked, setPicked] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const day = picked && picked < today ? picked : today;
  const earlier = day < addDays(today, -1);
  const loaded = useDoneOn(day, earlier);
  const done = doneOn(earlier ? (loaded.data ?? []) : tasks, day);

  const show = (next: string) => setPicked(next >= today ? null : next);
  const label = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : null;

  return (
    <TileFrame
      // The title is a link, so the page can be reached from the keyboard too.
      title={<Link to="/done">Done</Link>}
      tone="record"
      aria-label="Done"
      className="cursor-pointer"
      onClick={(e) => !(e.target as Element).closest("a, button, input") && navigate("/done")}
    >
      {/* The day sits in the middle at a fixed width, so the arrows stay put under the pointer while stepping. */}
      <div
        className="relative flex items-center justify-center gap-1"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") show(addDays(day, -1));
          if (e.key === "ArrowRight") show(addDays(day, 1));
        }}
      >
        <button type="button" className="btn-quiet glyph px-3 py-2 text-2xl" aria-label="Previous day" onClick={() => show(addDays(day, -1))}>
          ‹
        </button>
        <p className="w-32 text-center text-sm tabular-nums" data-done-day={day} aria-live="polite">
          {formatDay(day, true)}/{day.slice(0, 4)}
          <span className="block text-xs text-stone-500">{label ?? "\u00a0"}</span>
        </p>
        <button
          type="button"
          className="btn-quiet glyph px-3 py-2 text-2xl"
          aria-label="Next day"
          disabled={day === today}
          onClick={() => show(addDays(day, 1))}
        >
          ›
        </button>
        <div className="absolute right-0">
          <button
            type="button"
            className="btn-quiet glyph"
            aria-label="Pick the day from a calendar"
            onClick={() => picker.current?.showPicker()}
          >
            ▦
          </button>
          {/* Only used for its calendar popup; never shown, so its locale format doesn't matter. */}
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute right-0 bottom-0 size-0 opacity-0"
            max={today}
            value={day}
            onChange={(e) => e.target.value && show(e.target.value)}
          />
        </div>
      </div>
      {earlier && !loaded.data ? (
        loaded.error ? (
          <p className="text-sm text-red-600">Couldn't load that day: {loaded.error.message}</p>
        ) : (
          <p className="text-sm text-stone-500">Loading…</p>
        )
      ) : done.length === 0 ? (
        <p className="text-sm text-stone-500">Nothing ticked off.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {done.map((task) => (
            <li key={task.id} className="flex items-baseline gap-2">
              <span className="min-w-0 truncate"><RichText text={task.title} /></span>
              {task.times && task.times > 1 && <span className="shrink-0 text-stone-500 tabular-nums">×{task.times}</span>}
              {task.path.length > 0 && <span className="min-w-0 shrink-[2] truncate text-stone-500">{task.path.join(" › ")}</span>}
            </li>
          ))}
        </ul>
      )}
    </TileFrame>
  );
}
