import { useEffect, useLayoutEffect, useRef, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";

/** How far the pointer moves before a press on the row is a drag of it. */
const DRAG_PX = 5;

/** Scrolls up and down with no scroll bar; an edge fades where there is more past it. */
const SCROLL =
  "overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden data-more-above:mask-t-from-[calc(100%-1.5rem)] data-more-below:mask-b-from-[calc(100%-1.5rem)]";

/** A row of day columns: scrolls sideways with no scroll bar, and is dragged by the mouse (see panStrip). */
export const STRIP =
  "relative flex cursor-grab items-stretch overflow-x-auto [scrollbar-width:none] data-panning:cursor-grabbing data-panning:select-none [&::-webkit-scrollbar]:hidden";

/** Marks which ways a day's list has more than it shows. */
function markMore(list: HTMLElement) {
  list.toggleAttribute("data-more-above", list.scrollTop > 0);
  list.toggleAttribute("data-more-below", list.scrollTop + list.clientHeight < list.scrollHeight - 1);
}

/** Keeps the element's marks of where it has more (markMore) up to date. */
function useMoreMarks(ref: RefObject<HTMLElement | null>) {
  // What is in it changes without it being scrolled, and so does the room it has.
  useLayoutEffect(() => markMore(ref.current!));
  useEffect(() => {
    // Held on to: the element is still told of its size once more as it is taken off the page, its ref by then empty.
    const el = ref.current!;
    const sized = new ResizeObserver(() => markMore(el));
    sized.observe(el);
    return () => sized.disconnect();
  }, [ref]);
}

/**
 * What is on a day. A long one scrolls within its own height, with no scroll bar, like the row:
 * by the wheel, a swipe, or dragging it. `isWhole` lets it be as tall as it is (the popup around it scrolls instead).
 */
export function DayList({ className, isWhole = false, children }: { className: string; isWhole?: boolean; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  useMoreMarks(list);
  return (
    <ul ref={list} data-day-list onScroll={(e) => markMore(e.currentTarget)} className={`${isWhole ? "" : "max-h-[min(60dvh,24rem)]"} ${SCROLL} ${className}`}>
      {children}
    </ul>
  );
}

/** A box's part that scrolls up and down on its own the same way (its height set in `className`). */
export function ScrollArea({ ref, className = "", children, ...rest }: HTMLAttributes<HTMLDivElement> & { ref: RefObject<HTMLDivElement | null> }) {
  useMoreMarks(ref);
  return (
    <div ref={ref} {...rest} onScroll={(e) => markMore(e.currentTarget)} className={`${SCROLL} ${className}`}>
      {children}
    </div>
  );
}

/** Scrolls the row on by as many whole days as it shows at once, less one, so the eye keeps a day to hold on to. */
export function stepStrip(row: HTMLElement | null, direction: -1 | 1) {
  const width = row?.querySelector<HTMLElement>("[data-day]")?.offsetWidth;
  if (!row || !width) return;
  const at = Math.round(row.scrollLeft / width);
  row.scrollTo({ left: (at + direction * Math.max(1, Math.floor(row.clientWidth / width) - 1)) * width, behavior: "smooth" });
}

/**
 * The row's onPointerDown. A mouse has nothing to swipe with: the row is dragged by any part of it that isn't
 * a button or a field. Dragged up or down over a day with more than it shows, it is that day's list that moves instead.
 */
export function panStrip(e: ReactPointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as Element).closest("button, input, select, a, label")) return;
  const row = e.currentTarget;
  const list = (e.target as Element).closest<HTMLElement>("[data-day-list]");
  const tall = list && list.scrollHeight > list.clientHeight ? list : null;
  const startX = e.clientX;
  const startY = e.clientY;
  const startLeft = row.scrollLeft;
  const startTop = tall?.scrollTop ?? 0;
  // Which way the drag goes is settled once, by its first few pixels.
  let moving: HTMLElement | null = null;
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!moving) {
      const isUpDown = tall !== null && Math.abs(dy) > Math.abs(dx);
      if (Math.abs(isUpDown ? dy : dx) < DRAG_PX) return;
      moving = isUpDown ? tall : row;
      row.setPointerCapture(e.pointerId);
      row.dataset.panning = "";
    }
    if (moving === row) row.scrollLeft = startLeft - dx;
    else moving.scrollTop = startTop - dy;
  };
  const onEnd = () => {
    delete row.dataset.panning;
    row.removeEventListener("pointermove", onMove);
    row.removeEventListener("pointerup", onEnd);
    row.removeEventListener("pointercancel", onEnd);
  };
  row.addEventListener("pointermove", onMove);
  row.addEventListener("pointerup", onEnd);
  row.addEventListener("pointercancel", onEnd);
}
