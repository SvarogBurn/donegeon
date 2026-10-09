import { useState } from "react";
import { CalBoxView } from "../components/Calendar/CalBoxView";
import { CAL_BOXES } from "../components/Calendar/calendarData";
import { TreeProvider } from "../components/TaskTree/TreeContext";
import { TreeError, UndoBar } from "../components/TaskTree/TreeStatus";
import { TileControlsContext } from "../components/Tiles/TileFrame";
import { useTabDrag } from "../components/Tiles/useTabDrag";
import { useDropOnTab, useFolders, useLayout, useSaveLayout, useTaskTrees } from "../hooks/useTasks";
import { calView } from "../lib/folders";
import { normalizeLayout } from "../lib/tileLayout";

/**
 * The Calendar page: the Days box, a row of days to go through sideways, over the Calendar box, a month naming
 * what is on each day; both as wide as the page. A day picked in the month comes to the front of the row.
 * Either box can be dragged by its tab button onto a tab of the task bar: onto Tasks, to be shown on the Tasks
 * page too; onto a folder (or "New"), to be shown in that folder too. It stays here as well.
 */
export function CalendarPage() {
  const tasks = useTaskTrees();
  const layout = useLayout();
  const saveLayout = useSaveLayout();
  const { data: folders = [] } = useFolders();
  const drop = useDropOnTab();
  const [note, setNote] = useState<string | null>(null);

  const startDrag = useTabDrag((view, tab) => {
    const label = CAL_BOXES[view.slice(view.indexOf(":") + 1)];
    if (tab !== "main") {
      drop.dropOnTab(view, tab);
      const folder = folders.find((other) => other.id === tab);
      setNote(folder ? `“${label}” is now shown in “${folder.name}” too.` : null);
      return;
    }
    // The Tasks page keeps the boxes it borrows with its arrangement; one that was hidden there is shown again.
    const saved = normalizeLayout(layout.data);
    saveLayout.mutate({ ...saved, extras: [...new Set([...(saved.extras ?? []), view])], hidden: (saved.hidden ?? []).filter((key) => key !== view) });
    setNote(`“${label}” is now shown on the Tasks page too.`);
  });

  if (tasks.error) return <p className="text-sm text-red-600">Couldn't load your tasks: {tasks.error.message}</p>;
  // The Tasks page's arrangement is waited for: a box dropped on Tasks is added to it.
  if (!tasks.data || layout.isLoading) return <p className="text-sm text-stone-500">Loading…</p>;
  const error = saveLayout.error ?? drop.error;

  return (
    <TreeProvider tasks={tasks.data}>
      <div className="space-y-4">
        <TreeError />
        {["days", "month"].map((name) => (
          <TileControlsContext.Provider
            key={name}
            value={{
              name: CAL_BOXES[name],
              isPinned: false,
              onDragStart: (e) => startDrag(e, calView(name)),
              dragTitle: "Drag onto a tab of the task bar: Tasks, or a folder, shows this box too",
            }}
          >
            <CalBoxView name={name} />
          </TileControlsContext.Provider>
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
