import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { BarDrop, BarSide } from "../../lib/taskBar";

/** How long a tab is held down before a hold counts (a folder's name and colour open on letting go), or it can be dragged by a finger. */
const HOLD_MS = 500;
/** How far the pointer moves before it is a drag rather than a click. */
const MOVE_PX = 6;
/** How close to the ends of a row of tabs that scrolls sideways a dragged tab must be for it to scroll on. */
const EDGE_PX = 32;
/** How far above or below a row the pointer can be and still be dropping in it. */
const ROW_SLACK_PX = 30;

/** A pointer down on a tab has become a drag, at `at`. */
export type OnTabDrag = (tab: HTMLElement, at: { x: number; y: number }) => void;

/**
 * Pressing a tab of a bar: held still and let go it is a hold (`onHoldRelease`); moved, it is dragged (`onDrag`), a
 * finger only after the hold so that a quick swipe still scrolls the row. Spread `onPointerDown` and `onClickCapture`
 * on the element and give it `ref`; `isLifted` is for its data-lifted. A click that ends a hold or a drag opens nothing.
 */
export function useTabPress<T extends HTMLElement = HTMLElement>({ onDrag, onHoldRelease }: { onDrag: OnTabDrag; onHoldRelease?: () => void }) {
  const hold = useRef(0);
  const held = useRef(false);
  const dragged = useRef(false);
  // A pointer is down on the tab: its press is not over yet.
  const pressing = useRef(false);
  const [isLifted, setIsLifted] = useState(false);
  const ref = useRef<T>(null);
  const endPress = useRef(() => {});

  // A finger held on the tab drags it, rather than scrolling the row of tabs.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => held.current && pressing.current && e.cancelable && e.preventDefault();
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);
  useEffect(() => () => endPress.current(), []);

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    endPress.current();
    held.current = false;
    dragged.current = false;
    pressing.current = true;
    const el = e.currentTarget;
    const { pointerId, pointerType } = e;
    const start = { x: e.clientX, y: e.clientY };
    hold.current = window.setTimeout(() => {
      held.current = true;
      setIsLifted(true);
    }, HOLD_MS);
    const end = () => {
      pressing.current = false;
      window.clearTimeout(hold.current);
      setIsLifted(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId || Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < MOVE_PX) return;
      // A finger that moves before the hold scrolls the row of tabs.
      if (pointerType === "touch" && !held.current) return end();
      end();
      dragged.current = true;
      onDrag(el, { x: ev.clientX, y: ev.clientY });
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      end();
      if (held.current) onHoldRelease?.();
    };
    // The browser took the press over (the row scrolled, or its own long-press): a hold still counts.
    const onCancel = onUp;
    endPress.current = end;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function onClickCapture(e: MouseEvent) {
    if (!held.current && !dragged.current) return;
    e.preventDefault();
    e.stopPropagation();
  }

  return { ref, isLifted, pressing, onPointerDown, onClickCapture };
}

/**
 * Drags the tab `key` along the bar's rows (`[data-bar-item]`s inside elements marked `data-bar-side` where there is more
 * than one): the tab it would land beside is marked on that side (data-reorder), a side with nothing on it is marked
 * whole ("into"), a row that scrolls sideways scrolls on near its ends, and letting go there calls `onDrop`. Let go away
 * from the rows, nothing changes. `onEnd` comes either way. `at` is where the pointer is as the drag begins.
 */
export function dragAlong({ key, rows, at, onDrop, onEnd }: {
  key: string;
  rows: HTMLElement[];
  at: { x: number; y: number };
  onDrop: (drop: BarDrop) => void;
  onEnd: () => void;
}) {
  let pointer = at;
  let target: { el: HTMLElement; mark: "before" | "after" | "into" } | null = null;
  const mark = (next: typeof target) => {
    target?.el.removeAttribute("data-reorder");
    next?.el.setAttribute("data-reorder", next.mark);
    target = next;
  };
  const near = (row: HTMLElement) => {
    const bounds = row.getBoundingClientRect();
    return pointer.y >= bounds.top - ROW_SLACK_PX && pointer.y <= bounds.bottom + ROW_SLACK_PX;
  };
  const retarget = () => {
    if (!rows.some(near)) return mark(null);
    const over = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("[data-bar-item]");
    if (over && rows.some((row) => row.contains(over))) {
      if (over.dataset.barItem === key) return mark(null);
      const rect = over.getBoundingClientRect();
      return mark({ el: over, mark: pointer.x > rect.left + rect.width / 2 ? "after" : "before" });
    }
    // A side with nothing on it takes the tab whole; between two tabs (or over the logo) it keeps the place it had.
    const empty = rows.find((row) => {
      const bounds = row.getBoundingClientRect();
      return row.dataset.barSide && near(row) && pointer.x >= bounds.left && pointer.x <= bounds.right && !row.querySelector("[data-bar-item]");
    });
    if (empty) mark({ el: empty, mark: "into" });
  };
  let frame = 0;
  const scroll = () => {
    for (const row of rows) {
      const bounds = row.getBoundingClientRect();
      const fromLeft = pointer.x - bounds.left;
      const fromRight = bounds.right - pointer.x;
      if (!near(row) || fromLeft < 0 || fromRight < 0 || row.scrollWidth <= row.clientWidth) continue;
      const speed = fromLeft < EDGE_PX ? -Math.ceil((EDGE_PX - fromLeft) / 4) : fromRight < EDGE_PX ? Math.ceil((EDGE_PX - fromRight) / 4) : 0;
      if (speed === 0) continue;
      row.scrollLeft += speed;
      retarget();
    }
    frame = requestAnimationFrame(scroll);
  };
  const noScroll = (e: TouchEvent) => e.cancelable && e.preventDefault();
  const onMove = (e: globalThis.PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    retarget();
  };
  const finish = (drop: boolean) => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("touchmove", noScroll);
    document.documentElement.style.cursor = "";
    document.documentElement.removeAttribute("data-dragging-bar");
    const landed = target;
    mark(null);
    onEnd();
    if (!drop || !landed) return;
    if (landed.mark === "into") onDrop({ side: landed.el.dataset.barSide as BarSide });
    else onDrop({ beside: landed.el.dataset.barItem!, after: landed.mark === "after" });
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);
  document.documentElement.style.cursor = "grabbing";
  document.documentElement.setAttribute("data-dragging-bar", "");
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("touchmove", noScroll, { passive: false });
  frame = requestAnimationFrame(scroll);
  retarget();
}
