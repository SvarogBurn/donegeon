import { describe, expect, it } from "vitest";
import type { TaskTreeNode } from "../types";
import { isPutOff, todayItems, weekDays } from "./week";

// Tuesday; its week's Sunday is 2026-10-25, the next Monday 2026-10-26.
const today = "2026-10-20";
const on = (weekDay: string | null) => ({ weekDay }) as TaskTreeNode;

describe("isPutOff", () => {
  it("is a task planned for next week or later, not one for this week or none", () => {
    expect(isPutOff(on("2026-10-26"), today)).toBe(true);
    expect(isPutOff(on("2026-11-09"), today)).toBe(true);
    expect(isPutOff(on("2026-10-25"), today)).toBe(false);
    expect(isPutOff(on("2026-10-13"), today)).toBe(false);
    expect(isPutOff(on(null), today)).toBe(false);
  });
});

const task = (id: string, extra: Partial<TaskTreeNode> = {}) =>
  ({ id, title: id, parentId: null, listId: "l", isComplete: false, completedOn: null, todaySince: null, weekDay: null, weekPosition: 0, deadlineDate: null, nextDue: null, repeatEvery: null, children: [], ...extra }) as TaskTreeNode;

describe("nothing is carried on", () => {
  it("Today shows what is marked for today, not a mark left from a day gone by nor one for a day to come", () => {
    const trees = [task("now", { todaySince: today }), task("old", { todaySince: "2026-10-19" }), task("later", { todaySince: "2026-10-22" })];
    expect(todayItems(trees, today, "bottom", "never").map((item) => item.node.id)).toEqual(["now"]);
    expect(todayItems(trees, "2026-10-22", "bottom", "never").map((item) => item.node.id)).toEqual(["later"]);
  });

  it("Week keeps an open task on its day this week, and doesn't roll one from a week before onto Monday", () => {
    const trees = [task("tue", { weekDay: "2026-10-20" }), task("before", { weekDay: "2026-10-14" })];
    const days = weekDays(trees, "2026-10-22", "bottom", "never");
    expect(days.find((day) => day.day === "2026-10-20")!.items.map((item) => item.node.id)).toEqual(["tue"]);
    expect(days.flatMap((day) => day.items).some((item) => item.node.id === "before")).toBe(false);
  });
});
