import { describe, expect, it } from "vitest";
import { bigEveryIn, BIG_EVERY, bigKindsIn, celebrate, getBigMoment, isBigMoment, kindOf, onBigMoment, popCheer, soundOffIn } from "./bigMoment";

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
  it("tick every kind until some are unticked", () => {
    expect(bigKindsIn(null)).toEqual(["lightning", "confetti"]);
    expect(bigKindsIn({ bigOff: ["lightning"] })).toEqual(["confetti"]);
    expect(bigKindsIn({ bigOff: ["lightning", "confetti"] })).toEqual([]);
    expect(bigKindsIn({ bigOff: "lightning" })).toEqual(["lightning", "confetti"]);
  });
  it("ignore nonsense", () => {
    expect(bigEveryIn({ bigEvery: "a lot" })).toBe(BIG_EVERY);
    expect(bigEveryIn({ bigEvery: 0 })).toBe(BIG_EVERY);
  });
});

describe("kindOf", () => {
  it("starts with lightning, then takes turns", () => {
    expect([1, 2, 3, 4].map((turn) => kindOf(turn))).toEqual(["lightning", "confetti", "lightning", "confetti"]);
  });
  it("takes turns among the kinds ticked, and is the words alone with none", () => {
    expect([1, 2, 3].map((turn) => kindOf(turn, ["confetti"]))).toEqual(["confetti", "confetti", "confetti"]);
    expect(kindOf(1, [])).toBe("words");
  });
});

describe("popCheer", () => {
  it("brings a pop, afresh each time", () => {
    let heard = 0;
    const stop = onBigMoment(() => heard++);
    popCheer();
    const first = getBigMoment();
    popCheer();
    stop();
    expect(first).toMatchObject({ kind: "cheer", count: 0 });
    expect(getBigMoment()?.id).toBe(first!.id + 1);
    expect(heard).toBe(2);
  });
  it("doesn't take a turn from the moments", () => {
    celebrate(10, 10);
    const before = getBigMoment()!.kind;
    popCheer();
    celebrate(20, 10);
    expect(getBigMoment()!.kind).toBe(before === "lightning" ? "confetti" : "lightning");
  });
  it("carries the cheers that came in, and none for one sent", () => {
    const cheers = [{ id: "1", username: "ann", line: "Well done!" as const }];
    popCheer(cheers);
    expect(getBigMoment()?.cheers).toEqual(cheers);
    popCheer();
    expect(getBigMoment()?.cheers).toEqual([]);
  });
});
