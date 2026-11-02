import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A button and the small popup it opens, like a task's ⋯ menu (TaskMenu keeps its own, for what its fields do with
 * Enter): under the button, its right edge on the button's, following it as what is around it scrolls, and on a phone
 * a sheet along the bottom of the screen. A click beside it or Escape closes it. `arrow`: the dropdown's pixel arrow
 * in the button. `children` gets the way to close it.
 */
export function Popup({ label, button, buttonClassName, arrow = false, name, children }: { label: string; button: ReactNode; buttonClassName: string; arrow?: boolean; name: string; children: (close: () => void) => ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const at = ref.current?.getBoundingClientRect();
      if (at) setPlace({ top: at.bottom + window.scrollY + 4, left: at.right + window.scrollX });
    };
    measure();
    // The carousel scrolled under it takes its button along: the popup follows.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menu.current?.contains(target)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button ref={ref} type="button" className={buttonClassName} aria-label={label} aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)} {...{ [`data-${name}`]: true }}>
        {arrow && <span className="task-arrow" style={isOpen ? undefined : { transform: "rotate(-90deg)" }} aria-hidden />}
        {button}
      </button>
      {isOpen &&
        place &&
        createPortal(
          <div
            ref={menu}
            style={{ "--menu-top": `${place.top}px`, "--menu-left": `${place.left}px` } as CSSProperties}
            className="card absolute top-(--menu-top) left-(--menu-left) z-50 w-56 -translate-x-full max-sm:translate-x-0 space-y-1 !p-2 shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:top-auto max-sm:bottom-2 max-sm:z-50 max-sm:max-h-[75dvh] max-sm:w-auto max-sm:overflow-y-auto"
            role="dialog"
            aria-label={label}
          >
            {children(() => setIsOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}
