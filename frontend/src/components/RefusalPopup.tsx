import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { dismissRefusal, getRefusal, onRefusal } from "../lib/refusal";

const SHOWN_MS = 5000;
const GAP_PX = 6;
const EDGE_PX = 8;

/**
 * The little notice for a tick or press that was refused: it opens under the
 * box or button that was clicked (above it when there is no room below), and
 * goes after a few seconds, or on the next click, key or scroll.
 */
export function RefusalPopup() {
  const refusal = useSyncExternalStore(onRefusal, getRefusal);
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!refusal || !el) return setPlace(null);
    const { width, height } = el.getBoundingClientRect();
    const room = { width: window.innerWidth, height: window.innerHeight };
    // Nothing was clicked (Ctrl+Z): in the middle, over the task bar.
    const at = refusal.at ?? { left: (room.width - width) / 2, top: room.height * 0.75, bottom: room.height * 0.75 };
    const below = at.bottom + GAP_PX;
    setPlace({
      left: Math.max(EDGE_PX, Math.min(at.left, room.width - width - EDGE_PX)),
      top: below + height + EDGE_PX <= room.height ? below : Math.max(EDGE_PX, at.top - GAP_PX - height),
    });
  }, [refusal]);

  useEffect(() => {
    if (!refusal) return;
    const timer = window.setTimeout(dismissRefusal, SHOWN_MS);
    const events = ["pointerdown", "keydown", "scroll", "resize"] as const;
    events.forEach((event) => window.addEventListener(event, dismissRefusal, true));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, dismissRefusal, true));
    };
  }, [refusal]);

  if (!refusal) return null;
  return createPortal(
    <div
      ref={ref}
      role="alert"
      data-refusal
      // Placed once it has been measured; over everything, the tutorial too.
      style={{ left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? "visible" : "hidden" }}
      className="fixed z-[70] max-w-[min(18rem,calc(100vw-1rem))] border-2 border-red-600 bg-white px-2 py-1.5 text-xs text-red-700 shadow-[2px_2px_0_rgb(0_0_0/0.35)] dark:border-red-500 dark:bg-stone-900 dark:text-red-300"
    >
      {refusal.message}
    </div>,
    document.body,
  );
}
