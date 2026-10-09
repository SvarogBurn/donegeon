import { Fragment } from "react";
import { useNavigate } from "react-router";
import { useCombinedCountdown, useTaskTrees } from "../../hooks/useTasks";
import { formatPace } from "../../lib/dates";
import { findNode } from "../../lib/optimisticToggle";
import { findTaskRow, pathIdsTo, showOnPage } from "../../lib/showOnPage";
import { hasTaskPage } from "../../lib/taskPage";
import { TileFrame } from "../Tiles/TileFrame";
import { pressureColor } from "./pressureColor";
import { CELL, DayCells, dayRow, PaceCell, SheetTable, SummaryCells } from "./sheet";
import { RichText } from "../RichText";

const HEADERS = ["Day", "Date", "Done", "Left", "Per day"];

/**
 * Every deadline still open, hard and soft, in one table: each day's "Per day" is the sum
 * of what each deadline needs that day. A merged row marks where each deadline
 * falls (just above its day); a click on it opens the task's own page if it has one (a big task),
 * and otherwise shows the task where it is in its list. Hidden until there is a deadline.
 */
export function CombinedTable() {
  const navigate = useNavigate();
  const { data: countdown } = useCombinedCountdown();
  const { data: trees = [] } = useTaskTrees();
  if (!countdown || countdown.items.length === 0) return null;

  function open(taskId: string) {
    const node = findNode(trees, taskId);
    if (node && hasTaskPage(node)) navigate(`/tasks/${taskId}`);
    else showOnPage((isLast) => findTaskRow(taskId, pathIdsTo(trees, taskId) ?? [], isLast));
  }

  const today = countdown.rows.find((row) => row.date === countdown.today);
  const left = today?.remaining ?? countdown.totalTasks;

  return (
    <TileFrame title="All deadlines" aria-label="All deadlines">
      <SummaryCells
        cells={[
          ["Tasks", countdown.totalTasks],
          ["Done", countdown.totalTasks - left],
          ["Left", left],
          ["Deadlines", countdown.items.length],
        ]}
      />
      <SheetTable headers={HEADERS}>
        {countdown.rows.map((row) => {
          const style = dayRow(row.date, countdown.today);
          const deadlines = countdown.items.filter((item) => item.deadlineDate === row.date);
          // A day with nothing to do and nothing done is left out (its deadline marker stays); today always shows.
          const isEmpty = row.perDay === 0 && row.doneThatDay === 0 && !style.isToday;
          return (
            <Fragment key={row.date}>
              {deadlines.map((item) => (
                <tr key={item.taskId} data-deadline-marker>
                  <td colSpan={HEADERS.length} className={`${CELL} bg-stone-100 !p-0 text-center font-semibold dark:bg-stone-800`}>
                    <button
                      type="button"
                      className="block w-full cursor-pointer px-1 py-0.5 sm:px-2 hover:bg-stone-200 focus-visible:bg-stone-200 dark:hover:bg-stone-700 dark:focus-visible:bg-stone-700"
                      title={`${item.deadlineType === "soft" ? "Soft" : "Hard"} deadline. Click to go to the task`}
                      onClick={() => open(item.taskId)}
                    >
                      <RichText text={item.title.split("\n")[0]} /> deadline
                    </button>
                  </td>
                </tr>
              ))}
              {!isEmpty && (
                <tr data-today={style.isToday || undefined} className={style.row}>
                  <DayCells date={row.date} cell={style.cell} />
                  {/* A day that has gone by with nothing done reads 0; today and later stay blank until something is. */}
                  <td className={style.number}>{row.doneThatDay || (style.isPast ? 0 : "")}</td>
                  <td className={style.number}>{row.remaining}</td>
                  <PaceCell
                    className={style.number}
                    fill={pressureColor({ remaining: row.remaining, perDay: row.overdue ? null : row.perDay })}
                    title={row.overdue ? "Includes overdue work, counted in full" : undefined}
                  >
                    {formatPace(row.perDay)}
                  </PaceCell>
                </tr>
              )}
            </Fragment>
          );
        })}
      </SheetTable>
    </TileFrame>
  );
}
