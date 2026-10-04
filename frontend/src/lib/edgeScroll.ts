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
