import { useRef, useState } from "react";
import { localDate } from "../../api/client";
import { addDays, formatDay } from "../../lib/dates";
import type { TaskTreeNode } from "../../types";

interface DoneTask {
  id: string;
  title: string;
  /** Titles of the tasks it sits under, outermost first. */
  path: string[];
  completedAt: string | null;
}

const firstLine = (title: string) => title.split("\n")[0];

/** Every task ticked off on `day`, at any depth, in the order they were ticked. */
function doneOn(trees: TaskTreeNode[], day: string): DoneTask[] {
  const found: DoneTask[] = [];
  const visit = (nodes: TaskTreeNode[], path: string[]) => {
    for (const node of nodes) {
      const title = firstLine(node.title);
      if (node.completedOn === day) found.push({ id: node.id, title, path, completedAt: node.completedAt });
      visit(node.children, [...path, title]);
    }
  };
  visit(trees, []);
  // A task ticked a moment ago has no server time yet; it goes last.
  return found.sort((a, b) => (a.completedAt ?? "9").localeCompare(b.completedAt ?? "9"));
}

/** What was done on one day; step back and forth a day at a time, or pick a day from the calendar. */
export function DoneLog({ tasks }: { tasks: TaskTreeNode[] }) {
  const today = localDate();
  // null follows today, so the box rolls over with the day.
  const [picked, setPicked] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const day = picked && picked < today ? picked : today;
  const done = doneOn(tasks, day);

  const show = (next: string) => setPicked(next >= today ? null : next);
  const label = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : null;

  return (
    <section className="card space-y-3" aria-label="Done">
      <div
        className="flex items-center gap-1"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") show(addDays(day, -1));
          if (e.key === "ArrowRight") show(addDays(day, 1));
        }}
      >
        <h2 className="mr-auto font-semibold">Done</h2>
        <button type="button" className="btn-quiet" aria-label="Previous day" onClick={() => show(addDays(day, -1))}>
          ‹
        </button>
        <p className="min-w-36 text-center text-sm tabular-nums" data-done-day={day} aria-live="polite">
          {formatDay(day, true)}/{day.slice(0, 4)}
          {label && <span className="text-stone-500"> · {label}</span>}
        </p>
        <button
          type="button"
          className="btn-quiet"
          aria-label="Next day"
          disabled={day === today}
          onClick={() => show(addDays(day, 1))}
        >
          ›
        </button>
        <div className="relative">
          <button
            type="button"
            className="btn-quiet"
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
      {done.length === 0 ? (
        <p className="text-sm text-stone-500">Nothing ticked off.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {done.map((task) => (
            <li key={task.id} className="flex items-baseline gap-2">
              <span className="min-w-0 truncate">{task.title}</span>
              {task.path.length > 0 && <span className="min-w-0 shrink-[2] truncate text-stone-500">{task.path.join(" › ")}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
