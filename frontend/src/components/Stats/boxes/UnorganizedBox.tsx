import { TileFrame } from "../../Tiles/TileFrame";
import { Note } from "../charts";
import { TaskCells } from "../TaskListDialog";
import { listed, type StatBox } from "./common";

/** Open main tasks with nothing to sort them by: no deadline, goal or tag. */
export const UnorganizedBox: StatBox = ({ stats: { view } }) => {
  const loose = view.tasks.filter((task) => task.isRoot && task.isOpen && task.isLoose);
  return (
    <TileFrame title="Unorganized" tone="setup" aria-label="Unorganized">
      <TaskCells cells={[["Open tasks", loose.length, "Unorganized open tasks", listed(loose, () => undefined)]]} />
      <Note>Open main tasks with no deadline, goal or tag. Click the number to see them.</Note>
    </TileFrame>
  );
};
