import { useEffect, useLayoutEffect, useState, type MouseEvent, type RefObject } from "react";

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
