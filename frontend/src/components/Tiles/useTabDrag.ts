import type { PointerEvent as ReactPointerEvent } from "react";

/** The tab of the task bar under the pointer, if it takes dropped boxes. */
const tabAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-tab-drop]") ?? null;

/**
 * For a box outside a grid of tiles (the Calendar page's): its tab button drags it onto a tab of the task bar
 * and nowhere else. Returns what starts the drag; `onDrop` is told the tab's data-tab-drop, as TileGrid's onDropOnTab is.
 */
export function useTabDrag(onDrop: (view: string, tab: string) => void) {
  return (e: ReactPointerEvent<HTMLElement>, view: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const box = handle.closest<HTMLElement>(".tile-frame");
    let tab: HTMLElement | null = null;
    const hoverTab = (next: HTMLElement | null) => {
      if (next === tab) return;
      tab?.removeAttribute("data-drop-hover");
      next?.setAttribute("data-drop-hover", "");
      tab = next;
    };
    // Brings out the bar's "New folder" tab for the length of the drag (index.css).
    document.documentElement.dataset.draggingList = "";
    handle.setPointerCapture(e.pointerId);
    if (box) box.style.opacity = "0.4";

    const onMove = (ev: PointerEvent) => hoverTab(tabAt(ev.clientX, ev.clientY));
    const finish = (dropped: boolean) => {
      delete document.documentElement.dataset.draggingList;
      if (box) box.style.opacity = "";
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      const droppedOn = tab?.dataset.tabDrop;
      hoverTab(null);
      if (dropped && droppedOn !== undefined) onDrop(view, droppedOn);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
  };
}
