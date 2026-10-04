import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { clockNow, getDevDate, getTimeOffset, localDate, setDevDate, setTimeOffset } from "../../api/client";
import { formatFullDay } from "../../lib/dates";

const two = (n: number) => String(n).padStart(2, "0");
const timeOf = (date: Date) => `${two(date.getHours())}:${two(date.getMinutes())}`;

/**
 * The task bar's clock: the time with the date underneath. Clicking it opens a
 * small panel where both can be changed, which makes the whole app treat that
 * moment as now (what "today" is for ticks, countdowns and the daily rollover).
 * A chosen time keeps running; a chosen date stays until it is reset.
 */
export function Clock() {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function changed() {
    shownDay.current = localDate();
    setTick((n) => n + 1);
    queryClient.invalidateQueries();
  }

  /** "HH:MM" becomes how far that is from the device's own clock. */
  function changeTime(value: string) {
    const [hours, minutes] = value.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
    const real = new Date();
    setTimeOffset(hours * 60 + minutes - (real.getHours() * 60 + real.getMinutes()));
    changed();
  }

  function changeDate(value: string) {
    setDevDate(value || null);
    changed();
  }

  function reset() {
    setDevDate(null);
    setTimeOffset(0);
    changed();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`block cursor-pointer px-1 text-right font-pixel leading-tight tabular-nums ${isPretend ? "text-amber-700 dark:text-amber-400" : "text-stone-700 dark:text-stone-200"}`}
        aria-label="Time and date"
        aria-expanded={isOpen}
        title={isPretend ? "Not the real time or date. Click to change or reset." : "Click to change the time or date"}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="block text-xs sm:text-sm" data-clock-time>
          {timeOf(now)}
        </span>
        <span className="block text-[8px]" data-clock-date={today}>
          {formatFullDay(today)}
        </span>
      </button>
      {isOpen && (
        <div className="card absolute right-0 bottom-full z-50 mb-2 w-56 space-y-2 !p-3 text-xs shadow-lg" role="dialog" aria-label="Change the time and date">
          <label className="flex items-center justify-between gap-2">
            Time
            <input type="time" className="bg-transparent" value={timeOf(now)} onChange={(e) => changeTime(e.target.value)} />
          </label>
          <label className="flex items-center justify-between gap-2">
            Date
            <input type="date" className="bg-transparent" value={today} onChange={(e) => changeDate(e.target.value)} />
          </label>
          <p className="text-stone-500">The app treats this as now.</p>
          {isPretend && (
            <button type="button" className="nes-btn btn-small" onClick={reset}>
              Back to the real time
            </button>
          )}
        </div>
      )}
    </div>
  );
}
