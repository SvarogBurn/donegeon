import { useEffect, useRef } from "react";
import { ValueChip } from "../components/Points/ValueChip";
import { TileFrame } from "../components/Tiles/TileFrame";
import { PixelCheckbox } from "../components/PixelCheckbox";
import { localDate } from "../api/client";
import { useDonePages, useLists, useToggleTask } from "../hooks/useTasks";
import { addDays, formatDay } from "../lib/dates";
import type { TaskTreeNode } from "../types";

/** A finished task's subtasks, as they were left: read-only. */
function Subtasks({ nodes }: { nodes: TaskTreeNode[] }) {
  return (
    <ul className="ml-3 border-l border-stone-200 pl-3 dark:border-stone-800">
      {nodes.map((node) => (
        <li key={node.id}>
          <span className={node.isComplete ? "" : "text-stone-500"}>
            {node.isComplete ? "✓" : "○"} {node.title}
          </span>
          {node.children.length > 0 && <Subtasks nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

function FinishedTask({ node, listName }: { node: TaskTreeNode; listName: string | undefined }) {
  const toggle = useToggleTask();

  return (
    <li data-finished={node.id}>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm">
        <PixelCheckbox
          checked
          disabled={toggle.isPending}
          onChange={() => toggle.mutate(node.id)}
          aria-label={`Mark "${node.title}" not done`}
          title="Untick to make it open again"
        />
        <span className="min-w-0 flex-1 break-words whitespace-pre-line">{node.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-stone-500">
          {node.children.length > 0 && (
            <span className="tabular-nums">
              {node.descendantDoneCount}/{node.descendantCount} done
            </span>
          )}
          {listName && <span className="max-w-40 truncate">{listName}</span>}
          <ValueChip node={node} />
        </span>
      </div>
      {toggle.error && <p className="text-xs text-red-600">{toggle.error.message}</p>}
      {node.children.length > 0 && (
        <details className="ml-6 text-sm">
          <summary className="cursor-pointer text-xs text-stone-500">Subtasks</summary>
          <Subtasks nodes={node.children} />
        </details>
      )}
    </li>
  );
}

/** A subtask ticked on its own, shown on the day it was ticked with the tasks it sits under. */
function TickedSubtask({ node, path, listName }: { node: TaskTreeNode; path: string[]; listName: string | undefined }) {
  const toggle = useToggleTask();

  return (
    <li data-done-subtask={node.id}>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm">
        <PixelCheckbox
          checked
          disabled={toggle.isPending}
          onChange={() => toggle.mutate(node.id)}
          aria-label={`Mark "${node.title}" not done`}
          title="Untick to make it open again"
        />
        <span className="min-w-0 flex-1 break-words">
          <span className="whitespace-pre-line">{node.title}</span> <span className="text-xs text-stone-500">{path.join(" › ")}</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-stone-500">
          {listName && <span className="max-w-40 truncate">{listName}</span>}
          <ValueChip node={node} />
        </span>
      </div>
      {toggle.error && <p className="text-xs text-red-600">{toggle.error.message}</p>}
    </li>
  );
}

interface Entry {
  node: TaskTreeNode;
  /** Titles of the tasks a subtask sits under, outermost first; empty for a main task. */
  path: string[];
  listId: string | null;
}

/** Everything ticked: main tasks, and subtasks at any depth, each with the day of its own tick. */
function tickedEntries(trees: TaskTreeNode[]): Entry[] {
  const entries: Entry[] = [];
  const visit = (nodes: TaskTreeNode[], path: string[], listId: string | null) => {
    for (const node of nodes) {
      const inList = path.length === 0 ? node.listId : listId;
      if (node.isComplete && node.completedOn) entries.push({ node, path, listId: inList });
      visit(node.children, [...path, node.title.split("\n")[0]], inList);
    }
  };
  visit(trees, [], null);
  return entries;
}

/**
 * What was done, newest day first: finished main tasks (and bought one-off
 * rewards), and every subtask on the day it was ticked, whether or not its
 * main task is finished yet. Finished main tasks also stay in their lists for
 * 24 hours. Unticking anything here makes it open again. The newest few days
 * are loaded first; the days before them come as the page is scrolled down.
 */
export function DonePage() {
  const done = useDonePages();
  const lists = useLists();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = done;
  const more = useRef<HTMLButtonElement>(null);
  // Reaching the end of the page asks for the days before; the button does the same by hand.
  useEffect(() => {
    const button = more.current;
    if (!button || !hasNextPage || isFetchingNextPage) return;
    const seen = new IntersectionObserver(([entry]) => entry.isIntersecting && fetchNextPage(), { rootMargin: "400px" });
    seen.observe(button);
    return () => seen.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, done.data?.pages.length]);

  const error = done.error ?? lists.error;
  if (error && !done.data) return <p className="text-sm text-red-600">Couldn't load your tasks: {error.message}</p>;
  if (!done.data || !lists.data) return <p className="text-sm text-stone-500">Loading…</p>;

  const today = localDate();
  // A page's trees also hold ticks of other days, which belong to the page those days are in.
  const finished = done.data.pages
    .flatMap((page) => tickedEntries(page.tasks).filter(({ node }) => page.days.includes(node.completedOn!)))
    // A task ticked a moment ago has no server time yet; it goes first.
    .sort((a, b) => (b.node.completedAt ?? "9").localeCompare(a.node.completedAt ?? "9"));
  const days = [...new Set(finished.map(({ node }) => node.completedOn!))].sort().reverse();
  const listName = (id: string | null) => lists.data.find((list) => list.id === id)?.name;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-pixel text-base">Done</h1>
      {days.length === 0 && (
        <p className="card text-sm text-stone-500">Nothing done yet. Tick a task or a subtask and it shows up here.</p>
      )}
      {days.map((day) => (
        <TileFrame
          key={day}
          tone="record"
          data-done-on={day}
          title={`${formatDay(day, true)}/${day.slice(0, 4)}${day === today ? " · Today" : day === addDays(today, -1) ? " · Yesterday" : ""}`}
        >
          <ul className="space-y-1.5">
            {finished
              .filter(({ node }) => node.completedOn === day)
              .map(({ node, path, listId }) =>
                path.length === 0 ? (
                  <FinishedTask key={node.id} node={node} listName={listName(listId)} />
                ) : (
                  <TickedSubtask key={node.id} node={node} path={path} listName={listName(listId)} />
                ),
              )}
          </ul>
        </TileFrame>
      ))}
      {hasNextPage && (
        <button ref={more} type="button" className="btn-quiet mx-auto block text-sm" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
          {isFetchingNextPage ? "Loading…" : "Show earlier days"}
        </button>
      )}
      {done.error && <p className="text-sm text-red-600">Couldn't load earlier days: {done.error.message}</p>}
    </div>
  );
}
