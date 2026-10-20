import { addDays } from "../../../../../shared/dates";
import { activeDays, calendarWeeks, countByDay, firstDay, periodCounts, streaks, typicalWeek } from "../../../lib/stats";
import { doneKinds } from "../../../lib/statsView";
import { SummaryCells } from "../../Countdown/sheet";
import { CalendarDots, Note } from "../charts";
import { TaskCells } from "../TaskListDialog";
import { count, listDone, RECENT_DAYS, StatFrame, type StatBox } from "./common";

/** The colour of the Done tile's band (the "record" tone in frameTones). */
const DONE_COLOR = "#ad61cb";
// A year of weeks in the calendar of dots.
const CALENDAR_WEEKS = 53;

/** What got done, and when: today, the last week and month, all time, the streak, and a year of days as dots. */
export const DoneBox: StatBox = ({ stats: { view } }) => {
  const { done, today } = view;
  const byDay = countByDay(done);
  const counts = periodCounts(byDay, today);
  const streak = streaks(byDay, today);
  const typical = typicalWeek(byDay, today);
  const since = firstDay(byDay);
  // The 30 days before the last 30 are only something to go by once the history reaches back over them.
  const hasPrev30 = since !== null && since <= addDays(today, 1 - 60);
  const kinds = doneKinds(done, today);
  const listed = (isIn: (day: string) => boolean) => listDone(done, isIn);
  return (
    <StatFrame title="Done" tone="record" chart={DONE_COLOR} aria-label="Done stats">
      <TaskCells
        cells={[
          ["Today", counts.today, "Done today", listed((day) => day === today)],
          ["Last 7 days", counts.last7, "Done in the last 7 days", listed((day) => day >= addDays(today, -6) && day <= today)],
          ["Last 30 days", counts.last30, "Done in the last 30 days", listed((day) => day >= addDays(today, -29) && day <= today)],
          ["All time", counts.all, "Done, all time", listed(() => true)],
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
  );
};
