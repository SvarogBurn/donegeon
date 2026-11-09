import { useEffect } from "react";
import { note } from "../lib/refusal";

const INTERACTIVE = "button, a, input, textarea, select, label, [role=button]";

/** A tap on a touch screen that shows a tip: a row doesn't open for it too (a mouse click still does). */
export const isTipTap = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("[data-tip]")) && matchMedia("(pointer: coarse)").matches;

/** What an element marked `data-tip` says: its own text there, else its tooltip (a bare `data-tip` is "true" in React's hands). */
export const tipOf = (el: HTMLElement) => (el.dataset.tip && el.dataset.tip !== "true" ? el.dataset.tip : el.getAttribute("title")) || "";

/**
 * Tooltips for a touch screen, which has no hover (2026-11-04, playtest 1: what a chip meant was only in its tooltip):
 * a tap on something marked `data-tip` says its tooltip in a note beside it (the refusal's popup, grey); on one that
 * is also a button, a long press does, as the tap is the button's.
 */
export function TapTips() {
  useEffect(() => {
    const coarse = matchMedia("(pointer: coarse)");
    const tipped = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tip]") : null);
    const onClick = (e: MouseEvent) => {
      const el = coarse.matches && tipped(e);
      if (!el || el.matches(INTERACTIVE) || el.closest(INTERACTIVE)) return;
      const text = tipOf(el);
      if (text) note(text, el);
    };
    const onContextMenu = (e: MouseEvent) => {
      const el = coarse.matches && tipped(e);
      const text = el && tipOf(el);
      if (!el || !text) return;
      e.preventDefault();
      note(text, el);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);
  return null;
}
