import { describe, expect, it } from "vitest";
import type { List, TaskTreeNode } from "../types";
import { draftNode, insertedInTrees, movedInTrees, patchFor, pressedInTrees, removedFromTrees } from "./optimisticTasks";
import { dueAfter } from "./repeat";

const LIST: List = { id: "L", name: "List", kind: "task", defaultPoints: 3 } as List;
const ctx = { day: "2026-10-18", at: "2026-10-18T10:00:00.000Z", lists: [LIST], todayPoints: 2, parent: null };

function node(id: string, extra: Partial<TaskTreeNode> = {}): TaskTreeNode {
  return { ...draftNode({ id, title: id, listId: "L" }, ctx), ...extra };
}

describe("draftNode", () => {
  it("is a Today-only task when written with no list or parent, worth the Today amount", () => {
    const task = draftNode({ id: "t", title: "Call" }, ctx);
    expect(task.todaySince).toBe("2026-10-18");
    expect(task.value).toBe(2);
  });

  it("takes its list's amount, and a subtask what its main task hands down", () => {
    expect(draftNode({ id: "t", title: "x", listId: "L" }, ctx).value).toBe(3);
    const parent = node("P", { pointsToSubtasks: true, value: 5 });
    expect(draftNode({ id: "s", title: "x", parentId: "P" }, { ...ctx, parent }).value).toBe(5);
    expect(draftNode({ id: "s", title: "x", parentId: "P" }, { ...ctx, parent: node("Q") }).value).toBe(0);
  });

  it("is persistent and due today with a schedule", () => {
    const task = draftNode({ id: "t", title: "x", listId: "L", repeatEvery: 2, repeatUnit: "week" }, ctx);
    expect(task).toMatchObject({ isPersistent: true, repeatEvery: 2, repeatUnit: "week", nextDue: "2026-10-18" });
  });
});

describe("insertedInTrees / removedFromTrees / movedInTrees", () => {
  const trees = [node("A"), node("B", { children: [node("B1", { listId: null, parentId: "B" })], descendantCount: 1 }), node("C")];

  it("puts a main task at its place among its list's tasks", () => {
    const next = insertedInTrees(trees, node("N"), { parentId: null, listId: "L", index: 1 });
    expect(next.map((n) => n.id)).toEqual(["A", "N", "B", "C"]);
  });

  it("puts a subtask under its parent and counts it there", () => {
    const next = insertedInTrees(trees, node("N"), { parentId: "B", listId: null });
    const b = next.find((n) => n.id === "B")!;
    expect(b.children.map((n) => n.id)).toEqual(["B1", "N"]);
    expect(b.descendantCount).toBe(2);
    expect(b.children[1].listId).toBeNull();
  });

  it("takes a task out with what is under it, and puts it back where it was", () => {
    const { trees: without, spot } = removedFromTrees(trees, "B1");
    expect(without.find((n) => n.id === "B")!.descendantCount).toBe(0);
    expect(spot).toMatchObject({ parentId: "B", index: 0 });
    expect(insertedInTrees(without, spot!.node, spot!)).toEqual(trees);
  });

  it("moves a task to another place", () => {
    const next = movedInTrees(trees, "C", { parentId: null, listId: "L", index: 0 });
    expect(next.map((n) => n.id)).toEqual(["C", "A", "B"]);
  });
});

describe("patchFor", () => {
  it("sets the fields a change sets, as the server does", () => {
    const task = node("A");
    expect(patchFor(task, { today: true }, "2026-10-18").todaySince).toBe("2026-10-18");
    expect(patchFor(task, { deadlineDate: "2026-11-01" }, "2026-10-18")).toMatchObject({ deadlineDate: "2026-11-01", deadlineType: "soft" });
    expect(patchFor(task, { repeatEvery: 3 }, "2026-10-18")).toMatchObject({ isPersistent: true, repeatEvery: 3, nextDue: "2026-10-18" });
  });
});

describe("pressedInTrees", () => {
  it("logs the press, unticks the subtasks and moves a scheduled task on", () => {
    const sub = node("S", { listId: null, parentId: "W", isComplete: true, completedOn: "2026-10-18" });
    const weekly = node("W", { isPersistent: true, repeatEvery: 1, repeatUnit: "week", nextDue: "2026-10-18", children: [sub], descendantCount: 1, descendantDoneCount: 1 });
    const [pressed] = pressedInTrees([weekly], "W", { id: "p", day: "2026-10-18", createdAt: ctx.at });
    expect(pressed.completions.map((c) => c.id)).toEqual(["p"]);
    expect(pressed.nextDue).toBe("2026-10-25");
    expect(pressed.children[0].isComplete).toBe(false);
    expect(pressed.descendantDoneCount).toBe(0);
  });

  it("presses a persistent subtask too, and leaves the rounds of a persistent task under it alone", () => {
    const inner = node("I", { listId: null, parentId: "S", isComplete: true, completedOn: "2026-10-18" });
    const nested = node("N", { listId: null, parentId: "S", isPersistent: true, children: [inner], descendantCount: 1, descendantDoneCount: 1 });
    const sub = node("S", { listId: null, parentId: "M", isPersistent: true, children: [nested] });
    const [main] = pressedInTrees([node("M", { children: [sub] })], "S", { id: "p", day: "2026-10-18", createdAt: ctx.at });
    expect(main.children[0].completions.map((c) => c.id)).toEqual(["p"]);
    expect(main.children[0].children[0].children[0].isComplete).toBe(true);
  });
});

describe("persistent subtasks in the counts", () => {
  it("are not counted by the tasks above them, coming or going", () => {
    const trees = [node("B")];
    const added = insertedInTrees(trees, node("P", { isPersistent: true, children: [node("P1")], descendantCount: 1 }), { parentId: "B", listId: null });
    expect(added[0].descendantCount).toBe(0);
    const under = insertedInTrees(added, node("X"), { parentId: "P", listId: null });
    expect(under[0].descendantCount).toBe(0);
    expect(under[0].children[0].descendantCount).toBe(2);
    expect(removedFromTrees(under, "P").trees[0].descendantCount).toBe(0);
  });
});

describe("dueAfter", () => {
  const weekly = { repeatEvery: 1, repeatUnit: "week" as const, nextDue: "2026-10-12", repeatAfterDone: false, repeatMakeUp: false, roundMoves: null };

  it("counts from the day done when repeating after done, else keeps to the planned days", () => {
    expect(dueAfter({ ...weekly, repeatAfterDone: true }, "2026-10-14")).toBe("2026-10-21");
    expect(dueAfter(weekly, "2026-10-14")).toBe("2026-10-19");
    expect(dueAfter({ ...weekly, repeatMakeUp: true, nextDue: "2026-09-28" }, "2026-10-14")).toBe("2026-10-05");
  });
});
