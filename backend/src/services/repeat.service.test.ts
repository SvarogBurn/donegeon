import { describe, expect, it } from "vitest";
import { addInterval, dueAfter } from "./repeat.service.js";

describe("addInterval", () => {
  it("adds days and weeks across months and years", () => {
    expect(addInterval("2026-10-05", 3, "week")).toBe("2026-10-26");
    expect(addInterval("2026-12-30", 5, "day")).toBe("2027-01-04");
  });

  it("keeps the day of the month, or stops at the month's last day", () => {
    expect(addInterval("2026-10-05", 1, "month")).toBe("2026-11-05");
    expect(addInterval("2026-11-15", 3, "month")).toBe("2027-02-15");
    expect(addInterval("2027-01-31", 1, "month")).toBe("2027-02-28");
    expect(addInterval("2028-01-31", 1, "month")).toBe("2028-02-29");
  });
});

describe("dueAfter", () => {
  const planned = { repeatEvery: 3, repeatUnit: "week", repeatAfterDone: false, repeatMakeUp: false, nextDue: "2026-10-05" } as const;

  it("on the planned days: the next one, however late it was done", () => {
    expect(dueAfter(planned, "2026-10-05")).toBe("2026-10-26");
    expect(dueAfter(planned, "2026-10-07")).toBe("2026-10-26");
  });

  it("on the planned days: skips rounds that were missed altogether", () => {
    expect(dueAfter(planned, "2026-10-26")).toBe("2026-11-16");
    expect(dueAfter(planned, "2026-11-20")).toBe("2026-12-07");
  });

  it("on the planned days: done early, it is the round after the one done", () => {
    expect(dueAfter(planned, "2026-10-01")).toBe("2026-10-26");
  });

  it("skipping: a round from an earlier week is dropped, so an early press is for this week's round", () => {
    const weekly = { ...planned, repeatEvery: 1, nextDue: "2026-10-08" } as const;
    // Thursday 8 Oct left open; Monday 19 Oct: this week's round is Thursday 22, done early.
    expect(dueAfter(weekly, "2026-10-19")).toBe("2026-10-29");
    // Done on the day or late within the week: the round after it, as ever.
    expect(dueAfter(weekly, "2026-10-22")).toBe("2026-10-29");
    expect(dueAfter(weekly, "2026-10-24")).toBe("2026-10-29");
  });

  it("skipping: a round moved into this week is not dropped, and the rhythm keeps its planned days", () => {
    const weekly = { ...planned, repeatEvery: 1, nextDue: "2026-10-15", roundMoves: { "2026-10-15": "2026-10-19" } } as const;
    // Thursday 15 Oct moved to Monday 19 Oct, done Tuesday 20: the next is Thursday 22, its planned day.
    expect(dueAfter(weekly, "2026-10-20")).toBe("2026-10-22");
  });

  it("making up missed rounds: each press does the oldest, however late", () => {
    const makeUp = { ...planned, repeatMakeUp: true };
    expect(dueAfter(makeUp, "2026-11-20")).toBe("2026-10-26");
    expect(dueAfter({ ...makeUp, nextDue: "2026-10-26" }, "2026-11-20")).toBe("2026-11-16");
    expect(dueAfter(makeUp, "2026-10-01")).toBe("2026-10-26");
  });

  it("after done: counted from the day it was done", () => {
    const afterDone = { ...planned, repeatAfterDone: true };
    expect(dueAfter(afterDone, "2026-10-07")).toBe("2026-10-28");
    expect(dueAfter(afterDone, "2026-10-01")).toBe("2026-10-22");
  });
});
