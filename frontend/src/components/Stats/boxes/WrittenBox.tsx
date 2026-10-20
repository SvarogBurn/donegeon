import { useState } from "react";
import { formatDay } from "../../../lib/dates";
import { DAY_PARTS, dayPartOf, hourGrid } from "../../../lib/stats";
import { Empty, HourGrid, Note } from "../charts";
import { TaskCells } from "../TaskListDialog";
import { Choices, percent, StatFrame, type StatBox } from "./common";

type Moment = "written" | "done";
const MOMENTS: [Moment, string][] = [
  ["written", "Written"],
  ["done", "Done"],
];

/** The time of day tasks are written down, or ticked off. */
export const WrittenBox: StatBox = ({ stats: { view } }) => {
  const [moment, setMoment] = useState<Moment>("written");
  const moments =
    moment === "written"
      ? view.written.map((task) => ({ at: task.createdAt, task, day: task.createdOn }))
      : view.doneInRange.flatMap(({ at, task, day }) => (at ? [{ at, task, day }] : []));
  const hours = hourGrid(moments.map(({ at }) => at));
  const momentWord = moment === "written" ? "written down" : "done";
  return (
    <StatFrame title="Time of day" color="#2a9ba8" aria-label="Time of day">
      <Choices choices={MOMENTS} value={moment} onPick={setMoment} />
      {hours.total === 0 ? (
        <Empty>No tasks {momentWord} in these dates.</Empty>
      ) : (
        <>
          <TaskCells
            cells={DAY_PARTS.map(
              ({ name }, i) =>
                [
                  name,
                  percent(hours.parts[i] / hours.total),
                  `${moment === "written" ? "Written down" : "Done"}: ${name.toLowerCase()}`,
                  moments
                    .filter(({ at }) => dayPartOf(at) === i)
                    .sort((a, b) => b.at.getTime() - a.at.getTime())
                    .map(({ task, day }) => ({ task, note: formatDay(day) })),
                ] as const,
            )}
          />
          <HourGrid grid={hours.grid} cap={hours.cap} what={momentWord} />
          <Note>
            When tasks were {momentWord}, by this device's clock. {DAY_PARTS.map(({ name, from: start, to }) => `${name} ${start}-${to}h`).join(", ")}.
            {moment === "done" && " Done is when a task was ticked, which can be well after the work itself."}
          </Note>
        </>
      )}
    </StatFrame>
  );
};
