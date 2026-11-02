import { Children, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { panStrip, STRIP } from "../Calendar/dayStrip";

/** Scrolls the row on to the slide before or after the one in the middle. */
function step(row: HTMLElement | null, direction: -1 | 1) {
  if (!row) return;
  const slides = [...row.children] as HTMLElement[];
  const leftOf = (slide: HTMLElement) => slide.offsetLeft - (row.clientWidth - slide.offsetWidth) / 2;
  const distances = slides.map((slide) => Math.abs(leftOf(slide) - row.scrollLeft));
  const at = distances.indexOf(Math.min(...distances));
  const next = slides[at + direction];
  if (next) row.scrollTo({ left: leftOf(next), behavior: "smooth" });
}

/** One of the two arrows: the dropdown's pixel arrow, which points down, turned to its side. */
function Arrow({ direction, onClick }: { direction: -1 | 1; onClick: () => void }) {
  const name = direction < 0 ? "prev" : "next";
  return (
    <button type="button" className="stepper-arrow mt-[calc(var(--u)*30)] flex-none max-sm:hidden" aria-label={direction < 0 ? "Previous friend" : "Next friend"} onClick={onClick} {...{ [`data-carousel-${name}`]: true }}>
      <span className="task-arrow" style={{ transform: `rotate(${direction * -90}deg)` }} aria-hidden />
    </button>
  );
}

/**
 * Slides side by side, one in the middle with the next ones peeking in: swiped on a phone, dragged by a mouse (as the
 * calendar's days are; a slide only settles in the middle once let go), or stepped with the arrow keys. The arrows beside
 * it only show once the slides spill out of the box (and not on a phone, which swipes).
 */
export function Carousel({ label, children }: { label: string; children: ReactNode }) {
  const whole = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const count = Children.count(children);
  const [spills, setSpills] = useState(false);
  useLayoutEffect(() => {
    // Against the whole width, not the row's: the arrows take some of that, and they'd go and come again near the limit.
    const measure = () => setSpills(row.current!.scrollWidth > whole.current!.clientWidth);
    measure();
    const sized = new ResizeObserver(measure);
    sized.observe(whole.current!);
    return () => sized.disconnect();
  }, [count]);
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as Element).closest("input, select")) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    step(row.current, e.key === "ArrowLeft" ? -1 : 1);
  };
  return (
    <div ref={whole} className="flex items-start gap-1" data-carousel>
      {spills && <Arrow direction={-1} onClick={() => step(row.current, -1)} />}
      <div
        ref={row}
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={panStrip}
        // The auto margins keep a slide or two in the middle without cutting off the first when there are more than fit.
        className={`${STRIP} min-w-0 flex-1 !items-start snap-x snap-mandatory gap-3 data-panning:snap-none [&>:first-child]:ml-auto [&>:last-child]:mr-auto`}
      >
        {children}
      </div>
      {spills && <Arrow direction={1} onClick={() => step(row.current, 1)} />}
    </div>
  );
}
