/**
 * A tick or a "done it" press the server refused (over the points cap, not
 * enough points, points already spent...): what it said, and where on the
 * screen the click was, so the notice can show right there.
 */
export interface Refusal {
  message: string;
  /** The control that was clicked, as the viewport saw it; null when nothing was (Ctrl+Z). */
  at: { left: number; top: number; bottom: number } | null;
}

/** A click older than this did not cause the refusal that is coming in now. */
const CLICK_IS_OLD_MS = 5000;

let current: Refusal | null = null;
let clicked: { el: Element; box: DOMRect; time: number } | null = null;
const listeners = new Set<() => void>();

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => e.target instanceof Element && (clicked = { el: e.target, box: e.target.getBoundingClientRect(), time: Date.now() }), true);
}

function set(next: Refusal | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

/** Shows why the last click did nothing, next to what was clicked. */
export function refuse(error: Error) {
  const recent = clicked && Date.now() - clicked.time < CLICK_IS_OLD_MS ? clicked : null;
  // Where it is now, or, if the click took it off the screen (a finished task leaves its list), where it was.
  const box = recent && (recent.el.isConnected ? recent.el.getBoundingClientRect() : recent.box);
  set({ message: error.message, at: box ? { left: box.left, top: box.top, bottom: box.bottom } : null });
}

export const dismissRefusal = () => current && set(null);
export const getRefusal = () => current;
export function onRefusal(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
