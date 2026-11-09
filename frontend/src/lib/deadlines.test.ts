import { describe, expect, it } from "vitest";
import type { TaskTreeNode } from "../types";
import { finishingPlan } from "./deadlines";

function node(id: string, extra: Partial<TaskTreeNode> = {}): TaskTreeNode {
  return { id, isComplete: false, isPersistent: false, children: [], ...extra } as TaskTreeNode;
}

describe("a big task finished with what was done", () => {
  it("deletes the open subtasks, keeps the ticked ones, and ticks the big task", () => {
    const big = node("big", { children: [node("done", { isComplete: true }), node("open"), node("also", { children: [node("deeper")] })] });
    expect(finishingPlan(big)).toEqual({ remove: ["open", "also"], tick: ["big"] });
  });

  it("keeps an open subtask with ticked work under it, deletes its open parts and ticks it before the big task", () => {
    const big = node("big", { children: [node("half", { children: [node("a", { isComplete: true }), node("b")] }), node("open")] });
    expect(finishingPlan(big)).toEqual({ remove: ["b", "open"], tick: ["half", "big"] });
  });

  it("keeps a persistent subtask at any depth, and the open task it is under, which is ticked", () => {
    const habit = node("habit", { isPersistent: true, children: [node("step")] });
    const big = node("big", { children: [habit, node("wrap", { children: [node("habit2", { isPersistent: true }), node("gone")] })] });
    expect(finishingPlan(big)).toEqual({ remove: ["gone"], tick: ["wrap", "big"] });
  });
});
