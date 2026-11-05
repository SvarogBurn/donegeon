import { isUnreachable } from "../api/client";

/**
 * A tick or a "done it" press the server refused (over the points cap, not
 * enough points, points already spent...): what it said, and where on the
 * screen the click was, so the notice can show right there.
 */
export interface Refusal {
  message: string;
  /** A note, not a refusal: what happened isn't quite what the click looked like (points stopped at the cap). Grey, not red. */
  isNote?: boolean;
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

/** The change a refusal is about: the task, and for a press which one. */
export interface RefusedChange {
  id?: string;
  completionId?: string;
}
const refusedListeners = new Set<(change: RefusedChange) => void>();

/**
 * Shows why the last click did nothing, next to what was clicked (or next to `el`, for a key pressed on it). With
 * `change`, whatever was offered at the click for it (the undo of a tick or press) hears that it didn't happen.
 */
export function refuse(error: Error, change?: RefusedChange, el?: Element) {
  // Not a refusal: the server never heard of it, and the notice at the top of the page says so.
  if (isUnreachable(error)) return;
  const recent = el ? { el, box: el.getBoundingClientRect() } : clicked && Date.now() - clicked.time < CLICK_IS_OLD_MS ? clicked : null;
  // Where it is now, or, if the click took it off the screen (a finished task leaves its list), where it was.
  const box = recent && (recent.el.isConnected ? recent.el.getBoundingClientRect() : recent.box);
  set({ message: error.message, at: box ? { left: box.left, top: box.top, bottom: box.bottom } : null });
  if (change) refusedListeners.forEach((listener) => listener(change));
}

/** A note beside the last click (or `el`), in the refusal's place but grey: it went through, with something to know. */
export function note(message: string, el?: Element) {
  const recent = el ? { el, box: el.getBoundingClientRect() } : clicked && Date.now() - clicked.time < CLICK_IS_OLD_MS ? clicked : null;
  const box = recent && (recent.el.isConnected ? recent.el.getBoundingClientRect() : recent.box);
  set({ message, isNote: true, at: box ? { left: box.left, top: box.top, bottom: box.bottom } : null });
}

export function onRefusedChange(listener: (change: RefusedChange) => void) {
  refusedListeners.add(listener);
  return () => void refusedListeners.delete(listener);
}

export const dismissRefusal = () => current && set(null);
export const getRefusal = () => current;
export function onRefusal(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
