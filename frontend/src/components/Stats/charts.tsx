import type { ReactNode } from "react";
import { formatDay, formatFullDay } from "../../lib/dates";
import { heatCap, heatLevel, type FlowWeek } from "../../lib/stats";

// The stats page's charts. Colours come from the --chart, --heat and --series variables in index.css.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAY_NAMES = ["MON", "TUE", "WED", "THURS", "FRI", "SAT", "SUN"];

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
 * week, the oldest ones are cut off at the left.
 */
export function CalendarDots({ weeks }: { weeks: { day: string; count: number | null }[][] }) {
  const cap = heatCap(weeks.flat().map((cell) => cell.count ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <div className="flex flex-none flex-col gap-[2px] pt-[14px] text-[8px] leading-[10px] text-stone-500" aria-hidden>
          {["M", "", "W", "", "F", "", "S"].map((name, i) => (
            <span key={i} className="h-[10px]">
              {name}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 justify-end gap-[2px] overflow-hidden" role="img" aria-label="Tasks done per day over the last year">
          {weeks.map((week, w) => {
            const month = week[0].day.slice(5, 7);
            const startsMonth = w > 0 && weeks[w - 1][0].day.slice(5, 7) !== month;
            return (
              <div key={week[0].day} className="flex flex-none flex-col gap-[2px]">
                <span className="h-[12px] w-[10px] text-[8px] leading-[12px] whitespace-nowrap text-stone-500">
                  {startsMonth ? MONTHS[Number(month) - 1] : ""}
                </span>
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
      <HeatLegend />
    </div>
  );
}

/** Weekdays down, the 24 hours across: the stronger the cell, the more tasks were written down (or `what`) then. */
export function HourGrid({ grid, cap, what = "written down" }: { grid: number[][]; cap: number; what?: string }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-[2px] text-[8px] leading-none" role="img" aria-label={`Tasks ${what} by weekday and hour`}>
        {grid.map((hours, weekday) => (
          <div key={weekday} className="contents">
            <span className="text-stone-500">{WEEKDAY_NAMES[weekday]}</span>
            <div className="flex gap-[2px]">
              {hours.map((count, hour) => (
                <span
                  key={hour}
                  className="h-[12px] min-w-0 flex-1"
                  data-hour={`${weekday}-${hour}`}
                  data-count={count}
                  style={{ backgroundColor: `var(--heat-${heatLevel(count, cap)})` }}
                  title={`${WEEKDAY_NAMES[weekday]} ${String(hour).padStart(2, "0")}:00-${String(hour + 1).padStart(2, "0")}:00: ${count} ${what}`}
                />
              ))}
            </div>
          </div>
        ))}
        <span />
        {/* The hour each quarter of the day starts at, under its first cell. */}
        <div className="flex text-stone-500" aria-hidden>
          {["00", "06", "12", "18"].map((hour) => (
            <span key={hour} className="flex-1">
              {hour}
            </span>
          ))}
        </div>
      </div>
      <HeatLegend />
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

export interface ShareSegment {
  id: string;
  name: string;
  color: string;
  count: number;
}

/** One bar per period, each split by share; the legend below names the colours. */
export function ShareBars({ periods, legend }: { periods: { key: string; label: string; total: number; segments: ShareSegment[] }[]; legend: Omit<ShareSegment, "count">[] }) {
  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs tabular-nums">
        {periods.map((period) => (
          <li key={period.key} className="contents" data-period={period.key}>
            <span>{period.label}</span>
            <span className="flex h-3 gap-[2px]" style={period.total === 0 ? { backgroundColor: "var(--chart-track)" } : undefined}>
              {period.segments.map((segment) => (
                <span
                  key={segment.id}
                  className="h-full min-w-[2px]"
                  style={{ flexGrow: segment.count, flexBasis: 0, backgroundColor: segment.color }}
                  title={`${period.label} · ${segment.name}: ${segment.count} (${Math.round((segment.count / period.total) * 100)}%)`}
                />
              ))}
            </span>
            <span className="text-right">{period.total}</span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {legend.map((item) => (
          <li key={item.id} className="flex items-center gap-1">
            <span className="size-[10px] flex-none" style={{ backgroundColor: item.color }} aria-hidden />
            <span className="max-w-40 truncate">{item.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The balance day by day as a stepped line: it only moves when points are booked. */
export function BalanceChart({ series }: { series: { day: string; balance: number }[] }) {
  const values = series.map((point) => point.balance);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const height = top - bottom || 1;
  const y = (balance: number) => ((top - balance) / height) * 100;
  const line = series.map((point, i) => `${i === 0 ? "M" : "H"}${i} ${i === 0 ? y(point.balance) : ""}V${y(point.balance)}H${i + 1}`).join("");

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 text-xs tabular-nums text-stone-500">
      <div className="flex flex-col justify-between text-right">
        <span>{top}</span>
        <span>{bottom}</span>
      </div>
      <svg viewBox={`0 0 ${series.length} 100`} preserveAspectRatio="none" className="h-32 w-full overflow-visible" role="img" aria-label="Point balance over time">
        <line x1="0" x2={series.length} y1={y(0)} y2={y(0)} stroke="var(--chart-track)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke="var(--chart)" strokeWidth="2" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
        {series.map((point, i) => (
          <rect key={point.day} x={i} y="0" width="1" height="100" fill="transparent" data-balance-day={point.day} data-balance={point.balance}>
            <title>{`${formatFullDay(point.day)}: ${point.balance} ${point.balance === 1 ? "point" : "points"}`}</title>
          </rect>
        ))}
      </svg>
      <span />
      <div className="flex justify-between">
        <span>{formatDay(series[0].day)}</span>
        <span>{formatDay(series.at(-1)!.day)}</span>
      </div>
    </div>
  );
}
