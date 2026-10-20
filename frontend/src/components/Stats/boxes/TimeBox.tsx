import { daysBetween } from "../../../../../shared/dates";
import { durationBuckets, median, turnaround } from "../../../lib/stats";
import { SummaryCells } from "../../Countdown/sheet";
import { Bars, Empty, Note } from "../charts";
import { bucketRows, count, days, StatFrame, type StatBox } from "./common";

/** How long tasks take, from written down to done, and how far ahead deadlines are set. */
export const TimeBox: StatBox = ({ stats: { view } }) => {
  const { finished } = view;
  /** Finished in the range with a deadline of their own: how far ahead it was set, against how long they took. */
  const due = finished.filter((task) => task.deadlineDate);
  return (
    <StatFrame title="Time to finish" color="#df7126" aria-label="Time to finish">
      {finished.length === 0 ? (
        <Empty>No finished tasks in these dates.</Empty>
      ) : (
        <>
          <SummaryCells
            cells={[
              ["Written to done", days(median(finished.map(turnaround)))],
              ["Written to deadline", days(median(due.map((task) => daysBetween(task.createdOn, task.deadlineDate!))))],
              ["With deadline: to done", days(median(due.map(turnaround)))],
            ]}
          />
          <Bars aria-label="Days from written down to done" rows={bucketRows(durationBuckets(finished.map(turnaround)))} />
          <Note>
            Each bar is the tasks that took that long, with its share of them all. Medians: half the tasks took this long or
            less. From {count(finished.length, "finished task")}, {due.length} with a
            deadline: "Written to deadline" is how far ahead those deadlines were set, "With deadline: to done" how long the same
            tasks took. Tasks still open are not in here; see Open work.
          </Note>
        </>
      )}
    </StatFrame>
  );
};
