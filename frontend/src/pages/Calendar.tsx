import { useLayoutEffect, useRef, useState } from "react";
import { CalBoxView } from "../components/Calendar/CalBoxView";
import { CAL_BOXES } from "../components/Calendar/calendarData";
import { TreeProvider } from "../components/TaskTree/TreeContext";
import { TreeError, UndoBar } from "../components/TaskTree/TreeStatus";
import { TileControlsContext } from "../components/Tiles/TileFrame";
import { useTabDrag } from "../components/Tiles/useTabDrag";
import { useDropOnTab, useFolders, useLayout, useSaveLayout, useTaskTrees } from "../hooks/useTasks";
import { calView } from "../lib/folders";
import { normalizeLayout } from "../lib/tileLayout";

const NAMES = Object.keys(CAL_BOXES);

/**
 * The Calendar page: the Days box, a row of days to go through sideways, and the Calendar box, a month naming
 * what is on each day; one under the other, both as wide as the page. A day picked in the month comes to the
 * front of the row. Either box is dragged by its tab button: onto the other, to take its place (the order is
 * kept with the account); or onto a tab of the task bar: onto Tasks, to be shown on the Tasks page too; onto
 * a folder (or "New"), to be shown in that folder too. It stays here as well.
 */
export function CalendarPage() {
  const tasks = useTaskTrees();
  const layout = useLayout();
  const saveLayout = useSaveLayout();
  const ownLayout = useLayout("calendar");
  const saveOwnLayout = useSaveLayout("calendar");
  const { data: folders = [] } = useFolders();
  const drop = useDropOnTab();
  const [note, setNote] = useState<string | null>(null);
  const page = useRef<HTMLDivElement>(null);
  // Set while the boxes change places: how far everything in them was scrolled.
  const scrolled = useRef<[HTMLElement, number, number][]>([]);

  // The page is one column whatever the screen, so its arrangement is only an order: kept as the layout's one column.
  const order = [...new Set([...(ownLayout.data?.byColumns.wide?.[0] ?? []), ...NAMES])].filter((name) => NAMES.includes(name));

  const startDrag = useTabDrag(
    (name, tab) => {
      const view = calView(name);
      if (tab !== "main") {
        drop.dropOnTab(view, tab);
        const folder = folders.find((other) => other.id === tab);
        setNote(folder ? `“${CAL_BOXES[name]}” is now shown in “${folder.name}” too.` : null);
        return;
      }
      // The Tasks page keeps the boxes it borrows with its arrangement; one that was hidden there is shown again.
      const saved = normalizeLayout(layout.data);
      saveLayout.mutate({ ...saved, extras: [...new Set([...(saved.extras ?? []), view])], hidden: (saved.hidden ?? []).filter((key) => key !== view) });
      setNote(`“${CAL_BOXES[name]}” is now shown on the Tasks page too.`);
    },
    (name, onto, after) => {
      const next = order.filter((other) => other !== name);
      next.splice(next.indexOf(onto) + (after ? 1 : 0), 0, name);
      if (next.join() === order.join()) return;
      scrolled.current = [...page.current!.querySelectorAll<HTMLElement>("*")].filter((el) => el.scrollLeft || el.scrollTop).map((el) => [el, el.scrollLeft, el.scrollTop]);
      saveOwnLayout.mutate({ pinned: [], byColumns: { wide: [next] } });
      setNote(null);
    },
  );

  // A box put elsewhere in the page comes back scrolled to its start: the row of days, and each day, are put back where they were.
  useLayoutEffect(() => {
    for (const [el, left, top] of scrolled.current) el.scrollTo({ left, top, behavior: "instant" });
    scrolled.current = [];
  }, [order.join()]);

  if (tasks.error) return <p className="text-sm text-red-600">Couldn't load your tasks: {tasks.error.message}</p>;
  // The arrangements are waited for: this page's, so the boxes don't change places once it arrives; the Tasks page's, as a box dropped on Tasks is added to it.
  if (!tasks.data || layout.isLoading || ownLayout.isLoading) return <p className="text-sm text-stone-500">Loading…</p>;
  const error = saveLayout.error ?? saveOwnLayout.error ?? drop.error;

  return (
    <TreeProvider tasks={tasks.data}>
      <div ref={page} className="space-y-4">
        <TreeError />
        {order.map((name) => (
          <div
            key={name}
            data-box={name}
            // The box another is dragged onto: ringed, as the far side of a tall one is off the screen, and thicker on the side the other lands.
            className="outline-emerald-600 data-drop:outline-2 data-[drop=above]:shadow-[0_-4px_0_var(--color-emerald-600)] data-[drop=below]:shadow-[0_4px_0_var(--color-emerald-600)]"
          >
            <TileControlsContext.Provider
              value={{
                name: CAL_BOXES[name],
                isPinned: false,
                onDragStart: (e) => startDrag(e, name),
                dragTitle: "Drag onto the other box to change places; or onto a tab of the task bar: Tasks, or a folder, shows this box too",
              }}
            >
              <CalBoxView name={name} />
            </TileControlsContext.Provider>
          </div>
        ))}
        {note && !error && (
          <p className="text-center text-sm" role="status" data-cal-note>
            {note}
          </p>
        )}
        {error && <p className="text-center text-sm text-red-600">Couldn't move the box: {error.message}</p>}
        <UndoBar />
      </div>
    </TreeProvider>
  );
}
