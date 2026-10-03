import { Fragment } from "react";
import { useCombinedCountdown } from "../../hooks/useTasks";
import { formatPace } from "../../lib/dates";
import { pressureColor } from "./pressureColor";
import { CELL, DayCells, dayRow, PaceCell, SheetTable, SummaryCells } from "./sheet";

const HEADERS = ["Day", "Date", "Done", "Left", "Per day"];

/**
 * Every deadline, hard and soft, in one table: each day's "Per day" is the sum
 * of what each deadline needs that day. A merged row marks where each deadline
 * falls (just above its day). Hidden until there is a deadline.
 */
export function CombinedTable() {
  const { data: countdown } = useCombinedCountdown();
  if (!countdown || countdown.items.length === 0) return null;

  const today = countdown.rows.find((row) => row.date === countdown.today);
  const left = today?.remaining ?? countdown.totalTasks;

  return (
    <section className="card space-y-3" aria-label="All deadlines">
      <h2 className="font-semibold">All deadlines</h2>
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
                  <td
                    colSpan={HEADERS.length}
                    className={`${CELL} bg-stone-100 text-center font-semibold dark:bg-stone-800`}
                    title={`${item.deadlineType === "soft" ? "Soft" : "Hard"} deadline`}
                  >
                    {item.title.split("\n")[0]} deadline
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
    </section>
  );
}
