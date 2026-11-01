import { useState } from "react";
import { useUpdateTask } from "../../../hooks/tasks";
import { habitRows, type HabitRow } from "../../../lib/habits";
import { plainFirstLine } from "../../../lib/markup";
import { calendarWeeks } from "../../../lib/stats";
import { PixelCheckbox } from "../../PixelCheckbox";
import { CalendarDots, Empty, Note } from "../charts";
import { count, percent, StatFrame, type StatBox } from "./common";

// A year of weeks in each habit's dots, as many of them as fit.
const CALENDAR_WEEKS = 53;

/** What a habit's bar says: its share of its rounds, or with nothing to score, how often it was pressed. */
function rateText({ task, days, share }: HabitRow) {
  if (share !== null) return percent(share);
  if (task.habit?.every) return "too new";
  return count(days.length, "press", "presses");
}

/** Each habit on its own: how well it is kept, and a year of its days. "Choose" switches them on or off, as the task's ⋯ does. */
export const HabitsBox: StatBox = ({ stats: { view } }) => {
  const { tasks, done, today } = view;
  const update = useUpdateTask();
  const [isChoosing, setIsChoosing] = useState(false);
  // What was picked here shows at once: the stats only catch up once the change is saved.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const habits = habitRows(tasks, done, today);
  const isHidden = ({ task }: HabitRow) => picked[task.id] ?? task.habit?.hidden ?? false;
  const shown = habits.filter((habit) => !isHidden(habit));
  function pick(id: string, hideInStats: boolean) {
    setPicked({ ...picked, [id]: hideInStats });
    update.mutate({ id, changes: { hideInStats } });
  }
  return (
    <StatFrame title="Habits" color="#4a86c8" aria-label="Habits">
      {habits.length === 0 ? (
        <Empty>No persistent tasks here yet.</Empty>
      ) : (
        <div className="flex justify-end">
          <button type="button" className="btn-quiet text-xs" aria-expanded={isChoosing} onClick={() => setIsChoosing(!isChoosing)} data-habits-choose>
            {isChoosing ? "Done" : "Choose"}
          </button>
        </div>
      )}
      {isChoosing && (
        <ul className="space-y-1 text-xs" data-habit-picker>
          {habits.map((habit) => (
            <li key={habit.task.id}>
              <label className="flex items-center gap-2">
                <PixelCheckbox small checked={!isHidden(habit)} onChange={(e) => pick(habit.task.id, !e.target.checked)} data-habit-switch={plainFirstLine(habit.task.title)} />
                <span className="min-w-0 truncate">{plainFirstLine(habit.task.title)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {habits.length > 0 && shown.length === 0 && !isChoosing && <Empty>Every habit is switched off here.</Empty>}
      {shown.length > 0 && (
        <ul className="space-y-3" data-habits>
          {shown.map((habit) => {
            const name = plainFirstLine(habit.task.title);
            const byDay = new Map<string, number>();
            for (const day of habit.days) byDay.set(day, (byDay.get(day) ?? 0) + 1);
            return (
              <li key={habit.task.id} className="space-y-1" data-habit={name} data-habit-share={habit.share ?? ""}>
                <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                  <span className="min-w-0 truncate" title={name}>
                    {name}
                  </span>
                  <span className="flex-none">{rateText(habit)}</span>
                </div>
                <span className="block h-3" style={{ backgroundColor: "var(--chart-track)" }}>
                  <span className="block h-full" style={{ width: `${(habit.share ?? 0) * 100}%`, backgroundColor: "var(--chart)" }} />
                </span>
                <CalendarDots weeks={calendarWeeks(byDay, today, CALENDAR_WEEKS)} bare label={`${name}, done per day over the last year`} />
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > 0 && (
        <Note>
          Persistent tasks, one by one. The share is the presses against what the task's schedule asks for, over all the days since it was made;
          today only counts once it is done. Without a schedule there is nothing to measure against, so it says how many presses there have
          been. The dots are a year of days, whatever dates the filter has.
        </Note>
      )}
    </StatFrame>
  );
};
