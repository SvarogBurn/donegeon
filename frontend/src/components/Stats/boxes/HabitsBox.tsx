import { addDays } from "../../../../../shared/dates";
import { habitRows, type HabitRow } from "../../../lib/habits";
import { plainFirstLine } from "../../../lib/markup";
import { calendarWeeks } from "../../../lib/stats";
import { CalendarDots, Empty, Note } from "../charts";
import { percent, StatFrame, type StatBox } from "./common";

// A year of weeks in each habit's dots, as many of them as fit.
const CALENDAR_WEEKS = 53;
const RECENT_PRESSES = 30;

/** What a habit's bar says: its share of its rounds, or with nothing to score, how often it was pressed. */
function rateText({ task, days, share, span }: HabitRow, today: string) {
  if (share !== null) return `${percent(share)} · ${span} days`;
  if (task.habit?.every) return "too new";
  return `${days.filter((day) => day > addDays(today, -RECENT_PRESSES) && day <= today).length} in ${RECENT_PRESSES} days`;
}

/** Each habit on its own: how well it is kept, and a year of its days. */
export const HabitsBox: StatBox = ({ stats: { view } }) => {
  const { tasks, done, today } = view;
  const habits = habitRows(tasks, done, today);
  return (
    <StatFrame title="Habits" color="#4a86c8" aria-label="Habits">
      {habits.length === 0 ? (
        <Empty>No persistent tasks here yet.</Empty>
      ) : (
        <ul className="space-y-3" data-habits>
          {habits.map((habit) => {
            const name = plainFirstLine(habit.task.title);
            const byDay = new Map<string, number>();
            for (const day of habit.days) byDay.set(day, (byDay.get(day) ?? 0) + 1);
            return (
              <li key={habit.task.id} className="space-y-1" data-habit={name} data-habit-share={habit.share ?? ""}>
                <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                  <span className="min-w-0 truncate" title={name}>
                    {name}
                  </span>
                  <span className="flex-none">{rateText(habit, today)}</span>
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
      {habits.length > 0 && (
        <Note>
          Persistent tasks, one by one. The share is the presses against what the task's schedule asks for, over the last 30 days, 90 once it is
          that old, and 365 after a year; today only counts once it is done. Without a schedule there is nothing to measure against, so it says
          how many presses the last {RECENT_PRESSES} days hold. The dots are a year of days, whatever dates the filter has.
        </Note>
      )}
    </StatFrame>
  );
};
