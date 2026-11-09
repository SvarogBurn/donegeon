import { describe, expect, it } from "vitest";
import { firstOnScreen, nearestTo, nextInDirection, type Box, type Stop } from "./keyCursor";

const box = (left: number, top: number, width = 40, height = 20): Box => ({ left, top, right: left + width, bottom: top + height });
const stop = (item: string, b: Box, inBar = false): Stop<string> => ({ item, box: b, inBar });

// A 3 × 3 grid, 100px apart, named by row and column.
const grid = ["a", "b", "c"].flatMap((row, r) => [1, 2, 3].map((col, c) => stop(`${row}${col}`, box(c * 100, r * 100))));
const from = (name: string) => grid.find((s) => s.item === name)!;
const go = (name: string, dir: "up" | "down" | "left" | "right", stops = grid) =>
  nextInDirection(from(name).box, false, stops.filter((s) => s.item !== name), dir)?.item ?? null;

describe("nextInDirection", () => {
  it("steps to the neighbour each way", () => {
    expect(go("b2", "up")).toBe("a2");
    expect(go("b2", "down")).toBe("c2");
    expect(go("b2", "left")).toBe("b1");
    expect(go("b2", "right")).toBe("b3");
  });

  it("finds nothing past the edge", () => {
    expect(go("a1", "up")).toBeNull();
    expect(go("a1", "left")).toBeNull();
    expect(go("c3", "down")).toBeNull();
  });

  it("prefers one in line over a nearer one off to the side", () => {
    const stops = [stop("start", box(0, 0)), stop("aside", box(100, 30)), stop("below", box(0, 80))];
    expect(nextInDirection(stops[0].box, false, stops.slice(1), "down")?.item).toBe("below");
  });

  it("takes the next row's nearest stop when none is straight below", () => {
    const stops = [stop("start", box(200, 0)), stop("left", box(0, 50)), stop("right", box(260, 50))];
    expect(nextInDirection(stops[0].box, false, stops.slice(1), "down")?.item).toBe("right");
  });

  it("goes on down the page (below the fold) before the bar", () => {
    const stops = [stop("tab", box(0, 560), true), stop("further", box(0, 900))];
    expect(nextInDirection(box(0, 500), false, stops, "down")?.item).toBe("further");
  });

  it("reaches the bar when the page has nothing more that way", () => {
    const stops = [stop("tab", box(0, 560), true), stop("above", box(0, 0))];
    expect(nextInDirection(box(0, 500), false, stops, "down")?.item).toBe("tab");
  });

  it("goes from the bar to the nearest of the page and the bar", () => {
    const stops = [stop("page", box(0, 500)), stop("tab", box(100, 560), true)];
    expect(nextInDirection(box(0, 560), true, stops, "up")?.item).toBe("page");
    expect(nextInDirection(box(0, 560), true, stops, "right")?.item).toBe("tab");
  });
});

describe("nearestTo", () => {
  it("picks the closest whichever way", () => {
    expect(nearestTo(box(110, 90), grid)?.item).toBe("b2");
  });
});

describe("firstOnScreen", () => {
  it("reads the screen's top row from the left, leaving out the bar and what is scrolled off", () => {
    const stops = [stop("tab", box(0, 560), true), stop("gone", box(0, -100)), stop("right", box(200, 12)), stop("left", box(100, 10))];
    expect(firstOnScreen(stops, 600)?.item).toBe("left");
  });
});
