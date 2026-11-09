/**
 * Where the keyboard's cursor goes next (components/KeyCursor): the nearest stop in the arrow's direction, as a TV
 * remote moves. Boxes are as the viewport sees them (getBoundingClientRect). The fixed bars (the task bar, the
 * installed app's strip) are a layer of their own: from the page the cursor goes to more of the page, even below the
 * fold, and only reaches a bar when there is nothing else that way.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Stop<T> {
  item: T;
  box: Box;
  inBar: boolean;
}

export type Direction = "up" | "down" | "left" | "right";

/** How far a box may reach back over the edge it is leaving and still count as beyond it (borders, outlines). */
const SLACK_PX = 2;

const middleX = (box: Box) => (box.left + box.right) / 2;
const middleY = (box: Box) => (box.top + box.bottom) / 2;

/** The gap between two spans on a line, 0 when they overlap. */
const apart = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, b1 - a2, a1 - b2);

/** Whether `to` lies beyond `from`'s edge in `dir`: its near edge past it, or at least its middle. */
function isBeyond(from: Box, to: Box, dir: Direction) {
  switch (dir) {
    case "down":
      return to.top >= from.bottom - SLACK_PX || middleY(to) >= from.bottom;
    case "up":
      return to.bottom <= from.top + SLACK_PX || middleY(to) <= from.top;
    case "right":
      return to.left >= from.right - SLACK_PX || middleX(to) >= from.right;
    case "left":
      return to.right <= from.left + SLACK_PX || middleX(to) <= from.left;
  }
}

/** How far `to` is that way: the gap along the arrow, and twice what it is off to the side (beside it in line counts as 0). */
function distance(from: Box, to: Box, dir: Direction) {
  const vertical = dir === "up" || dir === "down";
  const along = vertical ? apart(from.top, from.bottom, to.top, to.bottom) : apart(from.left, from.right, to.left, to.right);
  const across = vertical ? apart(from.left, from.right, to.left, to.right) : apart(from.top, from.bottom, to.top, to.bottom);
  // Two in the same line: the one whose middle is nearer the cursor's middle.
  const centres = vertical ? Math.abs(middleX(to) - middleX(from)) : Math.abs(middleY(to) - middleY(from));
  return along + 2 * across + centres / 1000;
}

function nearestOf<T>(stops: Stop<T>[], score: (stop: Stop<T>) => number) {
  let best: Stop<T> | null = null;
  let bestScore = Infinity;
  for (const stop of stops) {
    const s = score(stop);
    if (s < bestScore) [best, bestScore] = [stop, s];
  }
  return best;
}

/** The stop to go to from `from` (on the page, or in a bar) with the arrow `dir`; null when there is none that way. `stops` leaves out the one at `from`. */
export function nextInDirection<T>(from: Box, fromBar: boolean, stops: Stop<T>[], dir: Direction): Stop<T> | null {
  const ahead = stops.filter((stop) => isBeyond(from, stop.box, dir));
  const page = fromBar ? ahead : ahead.filter((stop) => !stop.inBar);
  return nearestOf(page.length > 0 ? page : ahead, (stop) => distance(from, stop.box, dir));
}

/** The stop nearest `from` whichever way (the cursor's old place, when it is no longer among the stops: a popup opened or closed). */
export function nearestTo<T>(from: Box, stops: Stop<T>[]): Stop<T> | null {
  return nearestOf(stops, (stop) => Math.hypot(middleX(stop.box) - middleX(from), middleY(stop.box) - middleY(from)));
}

/** Where the cursor starts with nothing under the mouse: the page's first stop on screen, reading left to right, top to bottom. */
export function firstOnScreen<T>(stops: Stop<T>[], height: number): Stop<T> | null {
  const seen = stops.filter((stop) => !stop.inBar && stop.box.bottom > 0 && stop.box.top < height);
  // Stops less than a line apart are in one row.
  const row = (box: Box) => Math.round(box.top / 16);
  return nearestOf(seen.length > 0 ? seen : stops, (stop) => row(stop.box) * 1e6 + stop.box.left);
}
