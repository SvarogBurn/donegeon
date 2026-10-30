import { describe, expect, it } from "vitest";
import { bigEveryIn, BIG_EVERY, isBigMoment, kindOf, soundOffIn } from "./bigMoment";

describe("isBigMoment", () => {
  it("comes at each multiple", () => {
    expect([9, 10, 11, 20].map((n) => isBigMoment(n, 10))).toEqual([false, true, false, true]);
  });
  it("never comes when it is off, or at nothing done", () => {
    expect(isBigMoment(10, null)).toBe(false);
    expect(isBigMoment(0, 10)).toBe(false);
  });
});

describe("the settings", () => {
  it("start with sounds on and the default count", () => {
    expect(soundOffIn(null)).toBe(false);
    expect(bigEveryIn(null)).toBe(BIG_EVERY);
    expect(bigEveryIn({})).toBe(BIG_EVERY);
  });
  it("read what was saved", () => {
    expect(soundOffIn({ soundOff: true })).toBe(true);
    expect(bigEveryIn({ bigEvery: 5 })).toBe(5);
    expect(bigEveryIn({ bigEvery: null })).toBeNull();
  });
  it("ignore nonsense", () => {
    expect(bigEveryIn({ bigEvery: "a lot" })).toBe(BIG_EVERY);
    expect(bigEveryIn({ bigEvery: 0 })).toBe(BIG_EVERY);
  });
});

describe("kindOf", () => {
  it("starts with lightning, then takes turns", () => {
    expect([1, 2, 3, 4].map(kindOf)).toEqual(["lightning", "confetti", "lightning", "confetti"]);
  });
});
