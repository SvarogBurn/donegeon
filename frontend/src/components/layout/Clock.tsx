import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { clockNow, getDevDate, getTimeOffset, localDate, setDevDate, setTimeOffset } from "../../api/client";
import { formatFullDay } from "../../lib/dates";

const two = (n: number) => String(n).padStart(2, "0");
const timeOf = (date: Date) => `${two(date.getHours())}:${two(date.getMinutes())}`;

/**
 * The task bar's clock: the time with the date underneath, amber when the app is set to another day or time (see
 * PretendNotice). In the browser it sits in the bell's button: a click opens the notifications, and the bell
 * (`beforeTime`) sits in the gap left of the time, the date being the wider. It is also what reloads everything when
 * the day changes under the page, so the installed app keeps it mounted, hidden.
 */
export function Clock({ beforeTime }: { beforeTime?: ReactNode }) {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);

  const now = clockNow();
  const today = localDate();
  const isPretend = getDevDate() !== null || getTimeOffset() !== 0;

  // Keeps the clock running, and reloads everything when the day changes under the page.
  const shownDay = useRef(today);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((n) => n + 1);
      if (localDate() === shownDay.current) return;
      shownDay.current = localDate();
      queryClient.invalidateQueries();
    }, 1000);
    return () => clearInterval(timer);
  }, [queryClient]);

  return (
    <span
      className={`block px-1 text-right font-pixel leading-tight tabular-nums ${isPretend ? "text-amber-700 dark:text-amber-400" : "text-stone-700 dark:text-stone-200"}`}
      aria-label="Time and date"
    >
      <span className="flex items-center justify-end gap-1">
        {beforeTime && <span className="mr-auto flex">{beforeTime}</span>}
        <span className="text-xs sm:text-sm" data-clock-time>
          {timeOf(now)}
        </span>
      </span>
      <span className="block text-[8px]" data-clock-date={today}>
        {formatFullDay(today)}
      </span>
    </span>
  );
}

/**
 * The app can no longer be set to another day or time from the clock, but one set before (or by a browser check,
 * through localStorage) still holds: this says so and puts the real time back.
 */
export function PretendNotice() {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  if (getDevDate() === null && getTimeOffset() === 0) return null;

  function reset() {
    setDevDate(null);
    setTimeOffset(0);
    setTick((n) => n + 1);
    queryClient.invalidateQueries();
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-3 py-2 text-xs text-amber-700 dark:border-stone-700 dark:text-amber-400">
      The app is set to another day or time.
      <button type="button" className="btn-quiet shrink-0 text-xs" onClick={reset}>
        Back to the real time
      </button>
    </div>
  );
}
