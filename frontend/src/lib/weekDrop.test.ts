import { describe, expect, it } from "vitest";
import type { TaskTreeNode } from "../types";
import { weekDropFor } from "./weekDrop";

// A Tuesday; its week runs 19 to 25 October.
const TODAY = "2026-10-20";

const node = (over: Partial<TaskTreeNode> = {}) =>
  ({ id: "t", parentId: null, listId: "l", weekDay: null, todaySince: null, repeatEvery: null, repeatUnit: "week", nextDue: null, repeatAfterDone: false, repeatMakeUp: false, roundMoves: null, ...over }) as TaskTreeNode;

describe("weekDropFor", () => {
  it("puts a task after the row above where it was let go, or first", () => {
    const drop = { day: "2026-10-22", shown: ["a", "b", "c"] };
    expect(weekDropFor(node(), { ...drop, at: 2 }, TODAY)).toEqual({ kind: "place", day: "2026-10-22", after: "b" });
    expect(weekDropFor(node(), { ...drop, at: 0 }, TODAY)).toEqual({ kind: "place", day: "2026-10-22", after: null });
  });

  it("puts a task dropped on the box as a whole last on the day", () => {
    expect(weekDropFor(node(), { day: TODAY }, TODAY)).toEqual({ kind: "place", day: TODAY });
  });

  it("moves the round of a task on a schedule rather than placing it: the one dragged, else its current one", () => {
    const weekly = node({ repeatEvery: 1, nextDue: "2026-10-21" });
    expect(weekDropFor(weekly, { day: "2026-10-23", shown: [], at: 0 }, TODAY)).toEqual({ kind: "round", from: "2026-10-21", to: "2026-10-23", leaveToday: false });
    expect(weekDropFor(weekly, { day: "2026-10-24" }, TODAY, "2026-10-28")).toMatchObject({ from: "2026-10-28", to: "2026-10-24" });
  });

  it("takes a round put off to next week out of Today, when it was put there from a list", () => {
    const inToday = node({ repeatEvery: 1, nextDue: "2026-10-21", todaySince: "2026-10-19" });
    expect(weekDropFor(inToday, { day: "2026-10-26" }, TODAY)).toMatchObject({ kind: "round", leaveToday: true });
    expect(weekDropFor(inToday, { day: "2026-10-24" }, TODAY)).toMatchObject({ leaveToday: false });
  });
});
