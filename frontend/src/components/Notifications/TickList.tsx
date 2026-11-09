import { useState } from "react";
import { createPortal } from "react-dom";
import { useGoToTask } from "../../hooks/goToTask";
import { useTaskTrees } from "../../hooks/tasks";
import { useDeadlineToday, useNotifySettings, useTickedTasks } from "../../hooks/useAuth";
import { localDate } from "../../lib/clock";
import { formatDay } from "../../lib/dates";
import { KIND_NAMES } from "../../lib/notifySettings";
import { findTask, reminderTasks, tasksOn } from "../../lib/notifySchedule";
import { isDue } from "../../lib/repeat";
import { RichText } from "../RichText";
import { TickOrPress } from "../TaskTree/TickOrPress";

/**
 * The tasks a reminder named, opened by a tap on it (`/?tick=<reminder>&day=<its day>`, see tickUrl): ticked, or
 * pressed, right here. Worked out once when it opens, so a task ticked stays in the list, ticked, and can be unticked.
 * A reminder deleted since shows that day's tasks. Must sit inside a TreeProvider.
 */
export function TickList({ reminderId, day, onClose }: { reminderId: string; day: string; onClose: () => void }) {
  const trees = useTaskTrees().data ?? [];
  const [settings] = useNotifySettings();
  const ticked = useTickedTasks();
  const deadlines = useDeadlineToday();
  const goToTask = useGoToTask();
  const today = localDate();
  const reminder = settings.reminders.find((one) => one.id === reminderId);
  const [ids] = useState(() => (reminder ? reminderTasks(reminder, day, { trees, ticked, deadlines }) : tasksOn(trees, day, ticked, deadlines)).map((node) => node.id));
  // As they are now: one deleted since is left out.
  const rows = ids.map((id) => findTask(trees, id)).filter((found) => found !== null);
  const title = `${reminder ? KIND_NAMES[reminder.kind] : KIND_NAMES.today} · ${formatDay(day, true)}`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="card flex max-h-full w-[28rem] max-w-full flex-col gap-3" role="dialog" aria-modal="true" aria-label={title} data-tick-list>
        <h3 className="text-sm">{title}</h3>
        {rows.length === 0 ? (
          <p className="text-xs text-stone-500">Nothing left to do.</p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-stone-200 overflow-y-auto text-sm dark:divide-stone-800">
            {rows.map(({ node, path }) => {
              // A round still ahead (a reminder of tomorrow's or next week's): only there to be seen.
              const isAhead = Boolean(node.repeatEvery) && !isDue(node, today);
              const pressed = node.isPersistent ? node.completions.filter((press) => press.day === today).length : 0;
              return (
                <li key={node.id} className="flex items-start gap-2 px-1 py-2" data-tick-item={node.id}>
                  <TickOrPress node={node} control={isAhead ? "ahead" : undefined} title={isAhead ? "Not due yet" : undefined} />
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    title="Go to this task"
                    onClick={() => {
                      onClose();
                      goToTask(node.id);
                    }}
                  >
                    <span className={`block break-words ${node.isComplete ? "text-stone-500 line-through" : ""}`}>
                      <RichText text={node.title.split("\n")[0]} />
                      {pressed > 0 && <span className="text-xs text-stone-500 tabular-nums"> · done {pressed > 1 ? `×${pressed} ` : ""}today</span>}
                    </span>
                    {path.length > 0 && <span className="block truncate text-xs text-stone-500">in {path.join(" › ")}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end">
          <button type="button" className="nes-btn btn-small" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
