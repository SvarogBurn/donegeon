import { useEffect, useLayoutEffect, useState, type MouseEvent, type RefObject } from "react";

/** A tab of the task bar (and of the installed app's bottom bar): the label under its icon, near-black, the frame's blue on the open page. */
export const barTab = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-0.5 px-1.5 pt-1 pb-0.5 font-pixel text-[8px] sm:px-2 ${isActive ? "bg-stone-200/80 text-[#3544a1] dark:bg-stone-800/80 dark:text-[#cbdbfc]" : "text-stone-900 hover:bg-stone-200/50 dark:text-stone-100 dark:hover:bg-stone-800/50"}`;

/**
 * A fixed bar's height changes (it wraps on narrow screens, folders come and go), so it is published as a CSS
 * variable for whatever must stay clear of it: the page's padding, the undo bar, popups.
 */
export function usePublishedHeight(ref: RefObject<HTMLElement | null>, variable: "--bar-h" | "--top-h") {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(variable, `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(variable);
    };
  }, [ref, variable]);
}

/**
 * The "New folder" tab is out of sight until the bar's empty space is clicked, right-clicked or held;
 * it goes away again once used, with Escape, or with a click anywhere else. Spread `handlers` on the bar.
 */
export function useNewFolderTab(ref: RefObject<HTMLElement | null>) {
  const [isNewShown, setIsNewShown] = useState(false);
  const onEmptySpace = (e: MouseEvent) => !(e.target as Element).closest("a, button, input, [role=dialog]");
  useEffect(() => {
    if (!isNewShown) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsNewShown(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setIsNewShown(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isNewShown, ref]);

  const handlers = {
    "data-new-folder-shown": isNewShown || undefined,
    onClick: (e: MouseEvent) => onEmptySpace(e) && setIsNewShown(!isNewShown),
    // A hold on a touch screen arrives as this, as a right-click does.
    onContextMenu: (e: MouseEvent) => {
      if (!onEmptySpace(e)) return;
      e.preventDefault();
      setIsNewShown(true);
    },
  };
  return { isNewShown, onNewUsed: () => setIsNewShown(false), handlers };
}

/** How far the page must move one way before the bar goes or comes back, so a finger's wobble doesn't flicker it. */
const SCROLL_SLACK_PX = 8;

/**
 * Whether the installed app's bars are out of the way, as in a phone app: they go while the page is scrolled down and
 * come back as soon as it is scrolled up, or near the top. Never while something is dragged (a pointer held down: the
 * page scrolls under a drag by itself, and the tabs must stay there to drop on), nor while `keep` is set.
 */
export function useHideOnScroll(keep: boolean) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (keep) return setHidden(false);
    let last = window.scrollY;
    let frame = 0;
    let held = false;
    const onDown = () => void (held = true);
    // A touch the browser takes over to scroll the page is cancelled: from then on it is a scroll, not a drag.
    const onUp = () => void (held = false);
    const check = () => {
      frame = 0;
      const y = window.scrollY;
      if (held || y < 40) setHidden(false);
      else if (y > last + SCROLL_SLACK_PX) setHidden(true);
      else if (y < last - SCROLL_SLACK_PX) setHidden(false);
      else return;
      last = y;
    };
    const onScroll = () => void (frame ||= requestAnimationFrame(check));
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, [keep]);
  return hidden;
}
