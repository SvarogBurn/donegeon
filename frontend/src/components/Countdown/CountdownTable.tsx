import { formatPace } from "../../lib/dates";
import type { Countdown } from "../../types";
import { pressureColor } from "./pressureColor";
import { DayCells, dayRow, PaceCell, SheetTable, SummaryCells } from "./sheet";

/**
 * The spreadsheet's left-hand table: one row per day from the day the task was
 * written down to the deadline (and past it, if overdue).
 */
export function CountdownTable({ countdown }: { countdown: Countdown }) {
  const today = countdown.rows.find((row) => row.date === countdown.today);
  const left = today?.remaining ?? countdown.totalTasks;

  return (
    <div className="space-y-3">
      <SummaryCells
        cells={[
          ["Tasks", countdown.totalTasks],
          ["Done", countdown.totalTasks - left],
          ["Left", left],
          ["Days", Math.max(0, countdown.rows[0]?.daysLeft ?? 0)],
        ]}
      />
      <SheetTable headers={["Day", "Date", "Days left", "Done", "Left", "Per day"]}>
        {countdown.rows.map((row) => {
          const style = dayRow(row.date, countdown.today);
          return (
            <tr key={row.date} data-today={style.isToday || undefined} className={style.row}>
              <DayCells date={row.date} cell={style.cell} />
              <td className={style.number}>{row.daysLeft}</td>
              {/* A day that has gone by with nothing done reads 0; today and later stay blank until something is. */}
              <td className={style.number}>{row.doneThatDay || (style.isPast ? 0 : "")}</td>
              <td className={style.number}>{row.remaining}</td>
              <PaceCell className={style.number} fill={pressureColor(row)}>
                {row.perDay === null ? "overdue" : formatPace(row.perDay)}
              </PaceCell>
            </tr>
          );
        })}
      </SheetTable>
    </div>
  );
}
