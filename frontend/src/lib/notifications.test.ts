import { describe, expect, it } from "vitest";
import type { TaskTreeNode } from "../types";
import { isOverdue, leftUndone, passedDeadlines, passedItem } from "./notifications";

function node(id: string, extra: Partial<TaskTreeNode> = {}): TaskTreeNode {
  return { id, title: id, isComplete: false, deadlineDate: null, todaySince: null, weekDay: null, isPersistent: false, completions: [], children: [], ...extra } as TaskTreeNode;
}

describe("isOverdue and passedItem", () => {
  const today = "2026-10-29";

  it("are overdue the day after the deadline, not on it, and not once done", () => {
    expect(isOverdue(node("a", { deadlineDate: "2026-10-28" }), today)).toBe(true);
    expect(isOverdue(node("a", { deadlineDate: today }), today)).toBe(false);
    expect(isOverdue(node("a", { deadlineDate: "2026-10-28", isComplete: true }), today)).toBe(false);
    expect(isOverdue(node("a"), today)).toBe(false);
  });

  it("gives the popup what the bell gives it", () => {
    const task = node("a", { deadlineDate: "2026-10-27" });
    expect(passedItem(task, ["Main"], today)).toEqual({ node: task, path: ["Main"], daysLate: 2, key: "a:2026-10-27" });
  });
});

describe("passedDeadlines", () => {
  const today = "2026-10-19";

  it("leaves a deadline alone on its own day: that is the last day to do it in", () => {
    expect(passedDeadlines([node("a", { deadlineDate: today }), node("b", { deadlineDate: "2026-10-25" })], today)).toEqual([]);
  });

  it("tells about open main tasks and direct subtasks the day after their deadline, the latest first", () => {
    const trees = [
      node("old", { deadlineDate: "2026-10-10" }),
      node("exam", { children: [node("part", { deadlineDate: "2026-10-18" }), node("done", { deadlineDate: "2026-10-01", isComplete: true })] }),
    ];
    const passed = passedDeadlines(trees, today);
    expect(passed.map((p) => [p.node.id, p.daysLate, p.path])).toEqual([
      ["part", 1, ["exam"]],
      ["old", 9, []],
    ]);
    expect(passed[0].key).toBe("part:2026-10-18");
  });

  it("skips what a finished main task took to the Done page", () => {
    const trees = [node("m", { isComplete: true, deadlineDate: "2026-10-01", children: [node("s", { deadlineDate: "2026-10-01" })] })];
    expect(passedDeadlines(trees, today)).toEqual([]);
  });
});

describe("leftUndone", () => {
  const today = "2026-10-21";

  it("asks about open tasks marked for Today or planned in Week on a day gone by, the latest first, at any depth", () => {
    const trees = [
      node("today", { todaySince: today }),
      node("ahead", { todaySince: "2026-10-23" }),
      node("old", { todaySince: "2026-10-19", listId: "l" }),
      node("main", { listId: "l", children: [node("sub", { weekDay: "2026-10-20" })] }),
      node("ticked", { todaySince: "2026-10-19", isComplete: true }),
    ];
    const left = leftUndone(trees, today);
    expect(left.map((item) => [item.node.id, item.day, item.inToday, item.inWeek, item.path])).toEqual([
      ["sub", "2026-10-20", false, true, ["main"]],
      ["old", "2026-10-19", true, false, []],
    ]);
    expect(left[0].key).toBe("undone:sub:2026-10-20");
  });

  it("leaves out one planned again for today or later, a persistent one pressed since, and what a finished task took", () => {
    const trees = [
      node("moved", { todaySince: "2026-10-19", weekDay: "2026-10-22" }),
      node("pressed", { todaySince: "2026-10-20", isPersistent: true, completions: [{ id: "c", day: "2026-10-20" }] as TaskTreeNode["completions"] }),
      node("finished", { isComplete: true, children: [node("inside", { todaySince: "2026-10-19" })] }),
    ];
    expect(leftUndone(trees, today)).toEqual([]);
  });

  it("leaves out a task on a schedule: a round not done stays due in Today, and an old press isn't in the trees to ask", () => {
    const trees = [node("daily", { todaySince: "2026-10-18", isPersistent: true, repeatEvery: 1, nextDue: "2026-10-18", completions: [] })];
    expect(leftUndone(trees, today)).toEqual([]);
  });

  it("names the later day for one left in both", () => {
    expect(leftUndone([node("both", { todaySince: "2026-10-18", weekDay: "2026-10-20" })], today).map((item) => [item.day, item.inToday, item.inWeek])).toEqual([["2026-10-20", true, true]]);
  });
});
