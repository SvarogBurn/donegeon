import { formatDay } from "../../../lib/dates";
import { flowOver, flowWeeks } from "../../../lib/stats";
import { Note, PairColumns } from "../charts";
import { TaskCells } from "../TaskListDialog";
import { count, listed, newestFirst, RECENT_DAYS, signed, StatFrame, type StatBox } from "./common";

// The weeks of written down against done.
const FLOW_WEEKS = 12;

/** Whether what gets done keeps up with what is written down. */
export const FlowBox: StatBox = ({ stats: { view } }) => {
  const { tasks, today, age } = view;
  const recent = flowOver(tasks, today, RECENT_DAYS);
  return (
    <StatFrame title="Keeping up" color="#3f9b5c" aria-label="Keeping up">
      <TaskCells
        cells={[
          ["Written down", recent.written.length, `Written down in the last ${RECENT_DAYS} days`, listed(newestFirst(recent.written, (task) => task.createdOn), (task) => formatDay(task.createdOn))],
          ["Done", recent.done.length, `Done in the last ${RECENT_DAYS} days`, listed(newestFirst(recent.done, (task) => task.closedOn!), (task) => formatDay(task.closedOn!))],
          ["Open now", `${recent.open.length} (${signed(recent.open.length - recent.openBefore)})`, "Open now, the oldest first", listed([...recent.open].sort((a, b) => age(b) - age(a)), (task) => count(age(task), "day"))],
        ]}
      />
      <PairColumns weeks={flowWeeks(tasks, today, FLOW_WEEKS)} />
      <Note>
        The numbers are for the last {RECENT_DAYS} days, with how the open tasks moved over them in brackets; the columns are whole
        weeks from Monday. Where more is written down than done, the pile grows. One-off tasks and their subtasks; a subtask left
        unticked counts as done with its main task.
      </Note>
    </StatFrame>
  );
};
