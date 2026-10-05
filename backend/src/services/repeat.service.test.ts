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
  const planned = { repeatEvery: 3, repeatUnit: "week", repeatAfterDone: false, nextDue: "2026-10-05" } as const;

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

  it("after done: counted from the day it was done", () => {
    const afterDone = { ...planned, repeatAfterDone: true };
    expect(dueAfter(afterDone, "2026-10-07")).toBe("2026-10-28");
    expect(dueAfter(afterDone, "2026-10-01")).toBe("2026-10-22");
  });
});
