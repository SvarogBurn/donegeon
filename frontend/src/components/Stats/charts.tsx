import type { ReactNode } from "react";
import { formatDay } from "../../lib/dates";
import { heatCap, heatLevel, type FlowWeek } from "../../lib/stats";

// The stats page's charts. Colours come from the --chart, --heat and --series variables in index.css.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-stone-500">{children}</p>;

/** A line of small print under a chart: what it counts. */
export const Note = ({ children }: { children: ReactNode }) => <p className="text-xs text-stone-500">{children}</p>;

export interface BarRow {
  label: string;
  value: number;
  /** Shown at the right instead of the plain value. */
  text?: string;
  color?: string;
}

/** Horizontal bars, one per row, measured against the longest. */
export function Bars({ rows, "aria-label": label }: { rows: BarRow[]; "aria-label": string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs tabular-nums" aria-label={label}>
      {rows.map((row) => (
        <li key={row.label} className="contents" data-bar={row.label} data-value={row.value} title={`${row.label}: ${row.text ?? row.value}`}>
          <span className="max-w-40 truncate">{row.label}</span>
          <span className="h-3" style={{ backgroundColor: "var(--chart-track)" }}>
            <span className="block h-full" style={{ width: `${(row.value / max) * 100}%`, backgroundColor: row.color ?? "var(--chart)" }} />
          </span>
          <span className="text-right">{row.text ?? row.value}</span>
        </li>
      ))}
    </ul>
  );
}

function HeatLegend() {
  return (
    <p className="flex items-center justify-end gap-[2px] text-xs text-stone-500" aria-hidden>
      <span className="mr-1">Less</span>
      {[0, 1, 2, 3, 4].map((level) => (
        <span key={level} className="size-[10px]" style={{ backgroundColor: `var(--heat-${level})` }} />
      ))}
      <span className="ml-1">More</span>
    </p>
  );
}

/**
 * A dot per day, a column per week, the newest week at the right: the more
 * done that day, the stronger the dot. When the box is too narrow for every
 * week, the oldest ones are cut off at the left. `bare`: only the dots, for a small copy.
 */
export function CalendarDots({ weeks, bare = false, label = "Tasks done per day over the last year" }: { weeks: { day: string; count: number | null }[][]; bare?: boolean; label?: string }) {
  const cap = heatCap(weeks.flat().map((cell) => cell.count ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {!bare && (
          <div className="flex flex-none flex-col gap-[2px] pt-[14px] text-[8px] leading-[10px] text-stone-500" aria-hidden>
            {["M", "", "W", "", "F", "", "S"].map((name, i) => (
              <span key={i} className="h-[10px]">
                {name}
              </span>
            ))}
          </div>
        )}
        <div className="flex min-w-0 flex-1 justify-end gap-[2px] overflow-hidden" role="img" aria-label={label}>
          {weeks.map((week, w) => {
            const month = week[0].day.slice(5, 7);
            const startsMonth = w > 0 && weeks[w - 1][0].day.slice(5, 7) !== month;
            return (
              <div key={week[0].day} className="flex flex-none flex-col gap-[2px]">
                {!bare && (
                  <span className="h-[12px] w-[10px] text-[8px] leading-[12px] whitespace-nowrap text-stone-500">
                    {startsMonth ? MONTHS[Number(month) - 1] : ""}
                  </span>
                )}
                {week.map(({ day, count }) =>
                  count === null ? (
                    <span key={day} className="size-[10px]" />
                  ) : (
                    <span
                      key={day}
                      className="size-[10px]"
                      data-day={day}
                      data-count={count}
                      style={{ backgroundColor: `var(--heat-${heatLevel(count, cap)})` }}
                      title={`${formatDay(day, true)}/${day.slice(0, 4)}: ${count} done`}
                    />
                  ),
                )}
              </div>
            );
          })}
        </div>
      </div>
      {!bare && <HeatLegend />}
    </div>
  );
}

/**
 * Two columns per week, the newest at the right: what was written down beside what was done. Where the
 * first is the taller one the pile grew that week. The week still running is paler: it isn't over yet.
 */
export function PairColumns({ weeks }: { weeks: FlowWeek[] }) {
  const max = Math.max(1, ...weeks.flatMap((week) => [week.written, week.done]));
  const column = (value: number, color: string) => <span className="min-w-0 flex-1" style={{ height: `${(value / max) * 100}%`, minHeight: value > 0 ? 2 : 0, backgroundColor: color }} />;
  return (
    <div className="space-y-1 text-xs text-stone-500 tabular-nums">
      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        <div className="flex flex-col justify-between text-right">
          <span>{max}</span>
          <span>0</span>
        </div>
        <ul className="flex h-24 items-end gap-[6px] border-b-2" style={{ borderColor: "var(--chart-track)" }} aria-label="Written down and done per week">
          {weeks.map((week) => (
            <li
              key={week.monday}
              className={`flex h-full min-w-0 flex-1 items-end gap-[2px] ${week.isPartial ? "opacity-50" : ""}`}
              data-flow-week={week.monday}
              data-written={week.written}
              data-done={week.done}
              title={`Week of ${formatDay(week.monday)}${week.isPartial ? " (so far)" : ""}: ${week.written} written down, ${week.done} done, ${week.open} open at its end`}
            >
              {column(week.written, "var(--series-other)")}
              {column(week.done, "var(--chart)")}
            </li>
          ))}
        </ul>
        <span />
        <div className="flex justify-between">
          <span>{formatDay(weeks[0].monday)}</span>
          <span>this week</span>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-stone-900 dark:text-stone-100">
        {[
          ["Written down", "var(--series-other)"],
          ["Done", "var(--chart)"],
        ].map(([name, color]) => (
          <li key={name} className="flex items-center gap-1">
            <span className="size-[10px] flex-none" style={{ backgroundColor: color }} aria-hidden />
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
