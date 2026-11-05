import { describe, expect, it } from "vitest";
import type { TaskTreeNode } from "../types";
import { tasksOn } from "./notifySchedule";
import { isOwnToday, isPutOff, leftToDo, todayItems, weekDays } from "./week";
import { missedOffRest, roundsDue } from "./repeat";

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

describe("a task written straight into Today, on a schedule", () => {
  const daily = (nextDue: string, extra: Partial<TaskTreeNode> = {}) => task("sketch", { listId: null, isPersistent: true, repeatEvery: 1, repeatUnit: "day", repeatAfterDone: false, repeatMakeUp: false, nextDue, completions: [], ...extra });

  it("comes back on the day its round is due, marked for an earlier day or not", () => {
    expect(isOwnToday(daily(today, { todaySince: "2026-10-19" }), today)).toBe(true);
    expect(isOwnToday(daily("2026-10-19"), today)).toBe(true);
  });

  it("is not there before its round, and is the same to the push as to the box", () => {
    const sketch = daily("2026-10-21", { todaySince: "2026-10-19" });
    expect(isOwnToday(sketch, today)).toBe(false);
    expect(isOwnToday(sketch, "2026-10-21")).toBe(true);
    expect(tasksOn([sketch], today, "bottom", "never")).toEqual([]);
    expect(tasksOn([sketch], "2026-10-21", "bottom", "never").map((node) => node.id)).toEqual(["sketch"]);
  });

  it("is not a task from a list, which Today shows by itself, nor one with no schedule left from a day gone by", () => {
    expect(isOwnToday(task("listed", { isPersistent: true, repeatEvery: 1, nextDue: today }), today)).toBe(false);
    expect(isOwnToday(task("once", { listId: null, todaySince: "2026-10-19" }), today)).toBe(false);
  });
});

describe("leftToDo", () => {
  const daily = (nextDue: string, extra: Partial<TaskTreeNode> = {}) => task("run", { isPersistent: true, repeatEvery: 1, repeatUnit: "day", repeatAfterDone: false, repeatMakeUp: false, nextDue, completions: [], ...extra });

  it("counts open tasks and due rounds, not done ones or rounds still to come", () => {
    expect(leftToDo([task("a"), task("b", { isComplete: true }), daily(today), daily("2026-10-21")], today)).toBe(2);
  });

  it("counts each round a task making them up still owes", () => {
    expect(leftToDo([daily("2026-10-17", { repeatMakeUp: true })], today)).toBe(4);
  });

  it("leaves out a persistent task with no schedule", () => {
    expect(leftToDo([task("p", { isPersistent: true, completions: [] })], today)).toBe(0);
  });
});

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

describe("rest days", () => {
  const daily = (nextDue: string, extra: Partial<TaskTreeNode> = {}) => task("run", { isPersistent: true, repeatEvery: 1, repeatUnit: "day", repeatAfterDone: false, repeatMakeUp: false, nextDue, completions: [], ...extra });

  it("rounds on a rest day gone by aren't owed when making them up", () => {
    const rest = new Set(["2026-10-18", "2026-10-19"]);
    expect(roundsDue(daily("2026-10-17", { repeatMakeUp: true }), today, rest)).toBe(2);
    // Today's round is owed today even when resting.
    expect(roundsDue(daily(today, { repeatMakeUp: true }), today, new Set([today]))).toBe(1);
  });

  it("no red '!' on Monday for rounds dropped on rest days only", () => {
    // Skipping missed rounds: one left from last week, on rest days, is no miss.
    const node = daily("2026-10-15");
    const flagged = (rest: Set<string>) => weekDays([node], today, "stay", "never", rest)[0].items.some((item) => item.missed);
    expect(flagged(new Set())).toBe(true);
    expect(flagged(new Set(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]))).toBe(false);
    expect(missedOffRest(node, "2026-10-19", new Set(["2026-10-15"]))).toBe(true);
  });
});

describe("Today's tasks in Week", () => {
  it("are on today, a ticked one on the day it was ticked; one marked for another day isn't", () => {
    const open = task("call", { todaySince: today });
    const before = task("old", { todaySince: "2026-10-19" });
    const ticked = task("shop", { todaySince: "2026-10-19", isComplete: true, completedOn: "2026-10-19" });
    const days = weekDays([open, before, ticked], today, "stay", "never");
    expect(days.find((d) => d.day === today)!.items.map((item) => [item.node.id, item.auto])).toEqual([["call", "today"]]);
    expect(days.find((d) => d.day === "2026-10-19")!.items.map((item) => item.node.id)).toEqual(["shop"]);
  });
});
