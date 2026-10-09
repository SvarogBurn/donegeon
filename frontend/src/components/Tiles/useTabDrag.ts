import type { PointerEvent as ReactPointerEvent } from "react";
import { edgeScroller } from "../../lib/edgeScroll";

/** The tab of the task bar under the pointer, if it takes dropped boxes. */
const tabAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-tab-drop]") ?? null;
/** The box of the page under the pointer. */
const boxAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-box]") ?? null;

/**
 * For the boxes of a page that is not a grid of tiles (the Calendar page's, one under the other; each in an
 * element with data-box, its name). A box's tab button drags it onto another box, to take its place, or onto a
 * tab of the task bar. Returns what starts the drag. `onDrop` is told the tab's data-tab-drop, as TileGrid's
 * onDropOnTab is; `onMove` the box it was dropped on, and whether it goes after that one.
 * The box it would be dropped on has data-drop ("above" / "below": the side it lands on) for as long.
 */
export function useTabDrag(onDrop: (name: string, tab: string) => void, onMove: (name: string, onto: string, after: boolean) => void) {
  return (e: ReactPointerEvent<HTMLElement>, name: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const box = handle.closest<HTMLElement>("[data-box]");
    let tab: HTMLElement | null = null;
    let onto: HTMLElement | null = null;
    const hoverTab = (next: HTMLElement | null) => {
      if (next === tab) return;
      tab?.removeAttribute("data-drop-hover");
      next?.setAttribute("data-drop-hover", "");
      tab = next;
    };
    // A box takes the place of the one it is dropped on: it lands under one it came down to, over one it came up to.
    const isAfter = (other: HTMLElement) => Boolean(box && box.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
    const hoverBox = (next: HTMLElement | null) => {
      if (next === onto) return;
      onto?.removeAttribute("data-drop");
      next?.setAttribute("data-drop", isAfter(next) ? "below" : "above");
      onto = next;
    };
    // Brings out the bar's "New folder" tab for the length of the drag (index.css).
    document.documentElement.dataset.draggingList = "";
    const scroller = edgeScroller();
    handle.setPointerCapture(e.pointerId);
    if (box) box.style.opacity = "0.4";

    const onPointerMove = (ev: PointerEvent) => {
      hoverTab(tabAt(ev.clientX, ev.clientY));
      const over = tab ? null : boxAt(ev.clientX, ev.clientY);
      hoverBox(over === box ? null : over);
      // The task bar lies along the bottom edge: over a tab, the page must not scroll away underneath.
      scroller.update(tab ? window.innerHeight / 2 : ev.clientY);
    };
    const finish = (dropped: boolean) => {
      delete document.documentElement.dataset.draggingList;
      scroller.stop();
      if (box) box.style.opacity = "";
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      const droppedOn = tab?.dataset.tabDrop;
      const movedOnto = onto;
      hoverTab(null);
      hoverBox(null);
      if (!dropped) return;
      if (droppedOn !== undefined) onDrop(name, droppedOn);
      else if (movedOnto) onMove(name, movedOnto.dataset.box!, isAfter(movedOnto));
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
  };
}
