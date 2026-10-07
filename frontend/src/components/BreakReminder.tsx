import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { dismissBreak, getBreak, onBreak } from "../lib/breakReminder";

/** The reminder to take a break, for those who switched it on in their settings. Enter (the focused button) or Esc closes it. */
export function BreakReminder() {
  const done = useSyncExternalStore(onBreak, getBreak);
  if (done === null) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && dismissBreak()}
      onKeyDown={(e) => e.key === "Escape" && dismissBreak()}
    >
      <div className="card w-80 max-w-full space-y-3" role="alertdialog" aria-modal="true" aria-label="Take a break" data-break-reminder={done}>
        <p>
          You've just done {done} {done === 1 ? "task" : "tasks"}, be sure to take a break to eat and drink!
        </p>
        <div className="flex justify-end">
          <button type="button" className="nes-btn is-primary btn-small" onClick={dismissBreak} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
