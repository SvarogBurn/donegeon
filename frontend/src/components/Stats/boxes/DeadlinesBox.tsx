import { earlyLateBuckets, isOnTime } from "../../../lib/stats";
import { TileFrame } from "../../Tiles/TileFrame";
import { Bars, Empty, Note } from "../charts";
import { TaskCells } from "../TaskListDialog";
import { bucketRows, outcomeNote, percent, type StatBox } from "./common";

/** How deadlines went: met or missed, hard and soft apart, and by how far. */
export const DeadlinesBox: StatBox = ({ stats: { view } }) => {
  const { settled } = view;
  const outcome = (["hard", "soft"] as const).map((type) => {
    const ofType = settled.filter(({ task }) => task.deadlineKind === type);
    return { type, ofType, total: ofType.length, onTime: ofType.filter(isOnTime).length };
  });
  const lateness = earlyLateBuckets(settled);
  return (
    <TileFrame title="Deadlines" aria-label="Deadlines">
      {settled.length === 0 ? (
        <Empty>No deadlines met or missed in these dates.</Empty>
      ) : (
        <>
          <TaskCells
            cells={outcome.map(
              ({ type, ofType, total, onTime }) =>
                [
                  `${type === "hard" ? "Hard" : "Soft"} on time`,
                  total ? `${onTime}/${total} · ${percent(onTime / total)}` : "-",
                  `Tasks with a ${type} deadline`,
                  // The furthest behind first.
                  [...ofType].sort((a, b) => a.early - b.early).map((o) => ({ task: o.task, note: outcomeNote(o) })),
                ] as const,
            )}
          />
          <Bars
            aria-label="Finished early or late"
            rows={bucketRows(lateness).map((row, i) => ({ ...row, color: lateness[i].late ? "var(--chart-late)" : undefined }))}
          />
          <Note>
            Tasks with a deadline of their own, by how far from it they were ticked off. One still open after its deadline counts
            as missed, under the day of the deadline.
          </Note>
        </>
      )}
    </TileFrame>
  );
};
