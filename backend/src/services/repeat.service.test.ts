import { describe, expect, it } from "vitest";
import { addInterval, currentRound, dueAfter, movesFrom } from "../../../shared/repeat.js";
import { staleRoundTicks } from "./repeat.service.js";

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

describe("staleRoundTicks", () => {
  const root = {
    id: "r",
    parentId: null,
    isPersistent: true,
    repeatEvery: 1,
    repeatUnit: "week",
    repeatAfterDone: false,
    repeatMakeUp: false,
    nextDue: "2026-10-07",
    isComplete: false,
    completedOn: null,
  } as const;
  const sub = (id: string, parentId: string, completedOn: string | null) => ({
    ...root,
    id,
    parentId,
    isPersistent: false,
    repeatEvery: null,
    nextDue: null,
    isComplete: completedOn !== null,
    completedOn,
  });
  // Monday 2026-10-19: the round of Wednesday 2026-10-07 was dropped.
  const rows = [root, sub("a", "r", "2026-10-08"), sub("b", "a", "2026-10-09"), sub("c", "r", "2026-10-19"), sub("d", "r", null)];

  it("unticks subtasks at any depth ticked before this Monday, when the round was dropped", () => {
    expect(staleRoundTicks(rows, "2026-10-21")).toEqual(["a", "b"]);
  });

  it("keeps them while the round is still open, or is made up, or counts from the day done", () => {
    expect(staleRoundTicks(rows, "2026-10-11")).toEqual([]);
    expect(staleRoundTicks([{ ...root, repeatMakeUp: true }, ...rows.slice(1)], "2026-10-21")).toEqual([]);
    expect(staleRoundTicks([{ ...root, repeatAfterDone: true }, ...rows.slice(1)], "2026-10-21")).toEqual([]);
  });

  it("keeps them under a round moved into this week, and under a persistent task without a schedule", () => {
    expect(staleRoundTicks([{ ...root, roundMoves: { "2026-10-07": "2026-10-20" } }, ...rows.slice(1)], "2026-10-21")).toEqual([]);
    expect(staleRoundTicks([{ ...root, repeatEvery: null, nextDue: null }, ...rows.slice(1)], "2026-10-21")).toEqual([]);
  });

  it("goes by the nearest persistent task above: a persistent subtask has rounds of its own", () => {
    // "p" is persistent without a schedule under the dropped "r", "q" a persistent subtask whose own round was dropped.
    const main = { ...root, id: "m", isPersistent: false, repeatEvery: null, nextDue: null };
    const nested = [
      root,
      { ...sub("p", "r", null), isPersistent: true },
      sub("e", "p", "2026-10-08"),
      main,
      { ...root, id: "q", parentId: "m" },
      sub("f", "q", "2026-10-08"),
      sub("g", "m", "2026-10-08"),
    ];
    expect(staleRoundTicks(nested, "2026-10-21")).toEqual(["f"]);
  });
});

describe("currentRound (shared with the app)", () => {
  // Monday 19 October.
  const weekly = { repeatEvery: 1, repeatUnit: "week", repeatAfterDone: false, repeatMakeUp: false, nextDue: "2026-10-08" } as const;

  it("drops a round left open from an earlier week: this week's is the round, the one before missed", () => {
    expect(currentRound(weekly, "2026-10-19")).toEqual({ day: "2026-10-22", planned: "2026-10-22", missed: true });
  });

  it("keeps a round of this week, moved or not", () => {
    const thisWeek = { ...weekly, nextDue: "2026-10-22" };
    expect(currentRound(thisWeek, "2026-10-19")).toEqual({ day: "2026-10-22", planned: "2026-10-22", missed: false });
    expect(currentRound({ ...thisWeek, roundMoves: { "2026-10-22": "2026-10-24" } }, "2026-10-19")?.day).toBe("2026-10-24");
  });

  it("keeps every missed round when they are made up, and when the next is counted from the day done", () => {
    expect(currentRound({ ...weekly, repeatMakeUp: true }, "2026-10-19")?.missed).toBe(false);
    expect(currentRound({ ...weekly, repeatAfterDone: true }, "2026-10-19")?.planned).toBe("2026-10-08");
  });

  it("is null without a schedule", () => {
    expect(currentRound({ ...weekly, repeatEvery: null }, "2026-10-19")).toBeNull();
  });
});

describe("movesFrom", () => {
  it("forgets the moves of rounds before the next one", () => {
    expect(movesFrom({ "2026-10-15": "2026-10-16", "2026-10-22": "2026-10-23" }, "2026-10-22")).toEqual({ "2026-10-22": "2026-10-23" });
    expect(movesFrom({ "2026-10-15": "2026-10-16" }, "2026-10-22")).toBeNull();
    expect(movesFrom("not moves", "2026-10-22")).toBeNull();
  });
});
