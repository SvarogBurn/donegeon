import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createPortal } from "react-dom";
import { backToRealTime, clockNow, localDate, setDevDate, setTimeOffset } from "../../lib/clock";
import { localDay } from "../../lib/dates";
import { timeOf } from "./Clock";

const field = "border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100";

/** The hidden dev clock, behind seven quick taps on the bell: sets the day and time the app goes by, on this device. */
export function DevClock({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [day, setDay] = useState(localDate);
  const [time, setTime] = useState(() => timeOf(clockNow()));

  function done() {
    void queryClient.invalidateQueries();
    onClose();
  }

  function apply() {
    if (!day || !time) return;
    const device = new Date();
    const [hours, minutes] = time.split(":").map(Number);
    setDevDate(day === localDay(device) ? null : day);
    setTimeOffset(hours * 60 + minutes - (device.getHours() * 60 + device.getMinutes()));
    done();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="card w-80 max-w-full space-y-3" role="dialog" aria-modal="true" aria-label="Dev clock" data-dev-clock>
        <h2 className="font-pixel text-[10px]">Dev clock</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-2">
            Day
            <input type="date" className={field} value={day} onChange={(e) => setDay(e.target.value)} autoFocus data-dev-day />
          </label>
          <label className="flex items-center gap-2">
            Time
            <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} data-dev-time />
          </label>
        </div>
        <p className="text-xs text-stone-500">
          The server goes by this day too, so it isn't only for show: what you tick is stamped with it, and rounds and deadlines passed on the way count as missed on this account, and stay that way.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn-quiet text-xs"
            onClick={() => {
              backToRealTime();
              done();
            }}
            data-dev-reset
          >
            Back to the real time
          </button>
          <button type="button" className="nes-btn is-primary btn-small" onClick={apply} data-dev-apply>
            Set
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
