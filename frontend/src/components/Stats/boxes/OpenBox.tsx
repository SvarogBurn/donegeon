import { durationBuckets, median } from "../../../lib/stats";
import { Bars, Empty, Note } from "../charts";
import { TaskCells } from "../TaskListDialog";
import { bucketRows, count, listed, outcomeNote, StatFrame, type StatBox } from "./common";

// An open task this old has sat for a while.
const OLD_DAYS = 30;

/** What is still to do: how much, how much is past its deadline, and how long it has waited. */
export const OpenBox: StatBox = ({ stats: { view } }) => {
  const { open, age, outcomes } = view;
  const old = open.filter((task) => age(task) > OLD_DAYS);
  // Past a deadline of its own, the furthest behind first.
  const overdue = outcomes.filter((outcome) => outcome.isOpen).sort((a, b) => a.early - b.early);
  return (
    <StatFrame title="Open work" color="#7a6ad8" aria-label="Open work">
      <TaskCells
        cells={[
          ["Open", open.length, "Open tasks, the oldest first", listed(open, (task) => count(age(task), "day"))],
          ["Overdue", overdue.length, "Open and past their deadline", overdue.map((o) => ({ task: o.task, note: outcomeNote(o) }))],
          [`Over ${OLD_DAYS} days old`, old.length, `Open for more than ${OLD_DAYS} days`, listed(old, (task) => count(age(task), "day"))],
        ]}
      />
      {open.length === 0 ? (
        <Empty>Nothing open.</Empty>
      ) : (
        <Bars aria-label="How long open tasks have been open" rows={bucketRows(durationBuckets(open.map(age)))} />
      )}
      <Note>
        Tasks and subtasks still to do, by how long ago they were written down, in the same steps as Time to finish{open.length > 0 && ` (median: ${count(Math.round(median(open.map(age))!), "day")})`}.
        Overdue: the ones past a deadline of their own. Click a number to see the tasks. The Dates filter does not apply.
      </Note>
    </StatFrame>
  );
};
