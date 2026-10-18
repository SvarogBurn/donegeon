/** How close to the top or bottom of the screen the pointer must be for the page to start scrolling. */
const EDGE_PX = 90;

/**
 * Scrolls the page while something is dragged near the top or bottom edge of
 * the screen, faster the closer it gets. A drag holds the pointer captured, so
 * the browser doesn't do this by itself.
 */
export function edgeScroller() {
  let speed = 0;
  let frame = 0;
  const tick = () => {
    if (speed === 0) return void (frame = 0);
    window.scrollBy(0, speed);
    frame = requestAnimationFrame(tick);
  };
  return {
    /** Call with the pointer's clientY on every move. */
    update(y: number) {
      const fromBottom = window.innerHeight - y;
      speed = y < EDGE_PX ? -Math.ceil((EDGE_PX - y) / 4) : fromBottom < EDGE_PX ? Math.ceil((EDGE_PX - fromBottom) / 4) : 0;
      if (speed !== 0 && frame === 0) frame = requestAnimationFrame(tick);
    },
    stop() {
      speed = 0;
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/** How close to the top or bottom edge of a scrolling part of a box the pointer must be for it to scroll. */
const AREA_PX = 40;

/**
 * Scrolls a part of a box that scrolls on its own (`[data-week-scroll]`: the Week tab's days; `[data-box-scroll]`: a
 * box's tasks, capped on a phone) while something is dragged near its top or bottom edge, so a task can be taken to a
 * day or a place out of sight. `onScroll` is told each time
 * it moved, as what is under the pointer changes with it.
 */
export function areaScroller(onScroll: () => void) {
  let area: HTMLElement | null = null;
  let speed = 0;
  let frame = 0;
  const tick = () => {
    if (!area || speed === 0) return void (frame = 0);
    const before = area.scrollTop;
    area.scrollTop += speed;
    if (area.scrollTop !== before) onScroll();
    frame = requestAnimationFrame(tick);
  };
  return {
    /**
     * Call with the pointer's clientX and clientY on every move. Says whether the part is scrolling: then the page
     * should hold still, or the two would move together under the pointer.
     */
    update(x: number, y: number): boolean {
      // The innermost part under the pointer that has more than it shows.
      let el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-week-scroll], [data-box-scroll]") ?? null;
      while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement?.closest<HTMLElement>("[data-week-scroll], [data-box-scroll]") ?? null;
      area = el;
      const rect = area?.getBoundingClientRect();
      const fromTop = rect ? y - rect.top : Infinity;
      const fromBottom = rect ? rect.bottom - y : Infinity;
      speed = fromTop < AREA_PX ? -Math.ceil((AREA_PX - fromTop) / 3) : fromBottom < AREA_PX ? Math.ceil((AREA_PX - fromBottom) / 3) : 0;
      // At its end it can't go further that way: then the page may.
      if (area && ((speed < 0 && area.scrollTop <= 0) || (speed > 0 && area.scrollTop + area.clientHeight >= area.scrollHeight - 1))) speed = 0;
      if (speed !== 0 && frame === 0) frame = requestAnimationFrame(tick);
      return speed !== 0;
    },
    stop() {
      speed = 0;
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
