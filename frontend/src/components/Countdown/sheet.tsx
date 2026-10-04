import type { ReactNode } from "react";
import { formatShortDay } from "../../lib/dates";

// Shared look of the spreadsheet-style tables (a task's countdown, the dashboard's combined one).

// The spreadsheet's weekday names and colours, Sunday first (Date#getUTCDay order).
const WEEKDAYS = [
  { name: "SUN", color: "#EA9999" },
  { name: "MON", color: "#F9CB9C" },
  { name: "TUE", color: "#FFE599" },
  { name: "WED", color: "#B6D7A8" },
  { name: "THURS", color: "#A2C4C9" },
  { name: "FRI", color: "#9FC5E8" },
  { name: "SAT", color: "#D5A6BD" },
];
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

// Sheet gridlines: thin and dark enough to read; a heavier one closes each week (Sunday / Monday).
export const LINE = "border-stone-400 dark:border-stone-600";
export const CELL = `border-r border-b ${LINE} px-1 py-0.5 sm:px-2`;
const WEEK_END = "!border-b-2 !border-b-stone-700 dark:!border-b-stone-300";

/** Little labelled sheet cells above a table, e.g. Tasks / Done / Left. */
export function SummaryCells({ cells }: { cells: readonly (readonly [label: string, value: number])[] }) {
  return (
    <dl className="flex flex-wrap gap-2 text-sm tabular-nums">
      {cells.map(([label, value]) => (
        <div key={label} className={`flex border ${LINE} bg-white dark:bg-stone-900`}>
          <dt className={`border-r ${LINE} bg-stone-100 px-2 py-0.5 font-bold dark:bg-stone-800`}>{label}</dt>
          <dd data-summary={label} className="min-w-10 px-2 py-0.5 text-center">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Bold centred headers over full-length rows; never scrolled for you, so rows stay put as the days go by. */
export function SheetTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className={`border-t border-l ${LINE}`}>
      <table className="w-full border-separate border-spacing-0 text-xs tabular-nums sm:text-sm">
        <thead className="sticky top-0 z-10 bg-stone-100 dark:bg-stone-800">
          <tr>
            {headers.map((label) => (
              <th key={label} className={`${CELL} text-center font-bold sm:whitespace-nowrap`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-stone-900">{children}</tbody>
      </table>
    </div>
  );
}

/** Class names for one day's row and its cells. */
export function dayRow(date: string, today: string) {
  const isSunday = weekdayOf(date) === 0;
  const cell = `${CELL} ${isSunday ? WEEK_END : ""}`;
  return {
    isToday: date === today,
    isPast: date < today,
    row: date === today ? "font-bold outline-2 -outline-offset-2 outline-emerald-700" : "",
    cell,
    number: `${cell} text-center ${date > today ? "text-stone-500 dark:text-stone-400" : ""}`,
  };
}

/** The Day (weekday name in its sheet colour) and Date (dd/mm/yy) cells that start every row. */
export function DayCells({ date, cell }: { date: string; cell: string }) {
  const weekday = WEEKDAYS[weekdayOf(date)];
  return (
    <>
      <td className={`${cell} w-px !pr-1 !pl-1 whitespace-nowrap text-stone-900 sm:!pl-1.5`} style={{ backgroundColor: weekday.color }}>
        {weekday.name}
      </td>
      <td className={`${cell} w-px !pr-1 !pl-1 whitespace-nowrap sm:!pr-3 sm:!pl-1.5`}>{formatShortDay(date)}</td>
    </>
  );
}

/** A coloured "Per day" cell; `fill` null leaves it plain. */
export function PaceCell({ className, fill, title, children }: { className: string; fill: string | null; title?: string; children: ReactNode }) {
  return (
    <td className={`${className} ${fill ? "!text-stone-900" : ""}`} style={fill ? { backgroundColor: fill } : undefined} title={title}>
      {children}
    </td>
  );
}
