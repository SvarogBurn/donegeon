import { describe, expect, it } from "vitest";
import { pointsNote } from "./pointsNote";

describe("pointsNote", () => {
  it("says when earning stops at the cap", () => {
    expect(pointsNote(4, "task", 23, 25)).toBe("At your cap of 25: +2 of 4");
    expect(pointsNote(4, "task", 25, 25)).toBe("At your cap of 25: +0 of 4");
    expect(pointsNote(4, "task", 10, 25)).toBeNull();
    expect(pointsNote(4, "task", 1000, null)).toBeNull();
  });

  it("says when a reward takes what there is", () => {
    expect(pointsNote(10, "reward", 3, null)).toBe("Paid the 3 points you had");
    expect(pointsNote(10, "reward", 0, null)).toBe("Bought with no points left to pay");
    expect(pointsNote(10, "reward", 10, null)).toBeNull();
    expect(pointsNote(0, "reward", 0, null)).toBeNull();
  });
});
