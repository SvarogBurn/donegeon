import { describe, expect, it } from "vitest";
import type { TaskTreeNode } from "../types";
import { hasDeadlinePage, hasTaskPage, isBigHabit, isBigTask } from "./taskPage";

function node(extra: Partial<TaskTreeNode> = {}): TaskTreeNode {
  return { deadlineType: null, deadlineDate: null, isPersistent: false, notes: null, children: [], ...extra } as TaskTreeNode;
}
const two = [node(), node()];

describe("a task's own page", () => {
  it("a persistent task with at least two subtasks has one, as a big task does", () => {
    expect(isBigHabit(node({ isPersistent: true, children: two }))).toBe(true);
    expect(hasTaskPage(node({ isPersistent: true, children: two }))).toBe(true);
    expect(hasDeadlinePage(node({ isPersistent: true, children: two }))).toBe(true);
  });

  it("not with fewer, nor without being persistent, unless it has a note", () => {
    expect(hasTaskPage(node({ isPersistent: true, children: [node()] }))).toBe(false);
    expect(hasTaskPage(node({ children: two }))).toBe(false);
    expect(hasTaskPage(node({ isPersistent: true, notes: "Why" }))).toBe(true);
  });

  it("a big habit is no big task: deadline colours go by that one", () => {
    expect(isBigTask(node({ isPersistent: true, children: two }))).toBe(false);
  });
});
