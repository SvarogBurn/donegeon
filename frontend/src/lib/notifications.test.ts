import { describe, expect, it } from "vitest";
import type { TaskTreeNode } from "../types";
import { passedDeadlines } from "./notifications";

function node(id: string, extra: Partial<TaskTreeNode> = {}): TaskTreeNode {
  return { id, title: id, isComplete: false, deadlineDate: null, children: [], ...extra } as TaskTreeNode;
}

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
