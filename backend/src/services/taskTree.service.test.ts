import { describe, expect, it } from "vitest";
import { buildTree, completionPatch, depthOf, insertAt, subtreeIds, withFinishedRoots } from "./taskTree.service.js";

const t0 = new Date("2026-10-01T10:00:00Z");

function task(id: string, parentId: string | null, position = 0, isComplete = false) {
  return { id, parentId, position, isComplete, createdAt: t0 };
}

describe("buildTree", () => {
  const tasks = [
    task("root", null),
    task("b", "root", 1),
    task("a", "root", 0, true),
    task("a1", "a", 0, true),
    task("a2", "a", 1),
    task("a2x", "a2", 0),
    task("other", null, 1),
  ];

  it("nests children under parents in sibling order", () => {
    const [root, other] = buildTree(tasks);
    expect(root.id).toBe("root");
    expect(other.id).toBe("other");
    expect(root.children.map((c) => c.id)).toEqual(["a", "b"]);
    expect(root.children[0].children.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(root.children[0].children[1].children[0].id).toBe("a2x");
  });

  it("counts descendants at every depth without the node itself", () => {
    const [root] = buildTree(tasks);
    expect(root.descendantCount).toBe(5);
    expect(root.descendantDoneCount).toBe(2);
    expect(root.children[0].descendantCount).toBe(3);
    expect(root.children[0].descendantDoneCount).toBe(1);
  });

  it("breaks position ties by creation time", () => {
    const tied = [
      { ...task("late", null), createdAt: new Date("2026-10-02T00:00:00Z") },
      { ...task("early", null), createdAt: new Date("2026-10-01T00:00:00Z") },
    ];
    expect(buildTree(tied).map((n) => n.id)).toEqual(["early", "late"]);
  });
});

describe("subtreeIds / depthOf", () => {
  const tasks = [task("root", null), task("a", "root"), task("a1", "a"), task("z", null)];

  it("collects a task and all its descendants", () => {
    expect(subtreeIds(tasks, "root").sort()).toEqual(["a", "a1", "root"]);
    expect(subtreeIds(tasks, "a1")).toEqual(["a1"]);
  });

  it("reports depth from the top-level task", () => {
    expect(depthOf(tasks, "root")).toBe(0);
    expect(depthOf(tasks, "a")).toBe(1);
    expect(depthOf(tasks, "a1")).toBe(2);
  });
});

describe("insertAt", () => {
  it("inserts at the start, middle and end", () => {
    expect(insertAt(["a", "b"], "x", 0)).toEqual(["x", "a", "b"]);
    expect(insertAt(["a", "b"], "x", 1)).toEqual(["a", "x", "b"]);
    expect(insertAt(["a", "b"], "x", 2)).toEqual(["a", "b", "x"]);
  });

  it("clamps an out-of-range index", () => {
    expect(insertAt(["a"], "x", 99)).toEqual(["a", "x"]);
    expect(insertAt([], "x", 3)).toEqual(["x"]);
  });
});

describe("completionPatch", () => {
  const open = { isComplete: false, completedAt: null, completedOn: null };
  const stamped = { isComplete: true, completedAt: t0, completedOn: "2026-10-01" };
  const later = new Date("2026-10-05T10:00:00Z");

  it("stamps the user's local day on completion", () => {
    expect(completionPatch(open, true, later, "2026-10-05")).toEqual({
      isComplete: true,
      completedAt: later,
      completedOn: "2026-10-05",
    });
  });

  it("leaves an existing stamp alone when completed again", () => {
    expect(completionPatch(stamped, true, later, "2026-10-05")).toEqual(stamped);
  });

  it("clears the stamp when un-completed, and re-stamps with the new day", () => {
    const cleared = completionPatch(stamped, false, later, "2026-10-05");
    expect(cleared).toEqual(open);
    expect(completionPatch(cleared, true, later, "2026-10-05").completedOn).toBe("2026-10-05");
  });
});

describe("withFinishedRoots", () => {
  const node = (id: string, parentId: string | null, completedOn: string | null = null) => ({
    id,
    parentId,
    isComplete: completedOn !== null,
    completedOn,
  });

  it("counts everything open under a ticked main task as done that day", () => {
    const { tasks, finished } = withFinishedRoots([
      node("root", null, "2026-10-04"),
      node("early", "root", "2026-10-02"),
      node("open", "root"),
      node("deep", "open"),
    ]);
    expect(tasks.map((t) => t.completedOn)).toEqual(["2026-10-04", "2026-10-02", "2026-10-04", "2026-10-04"]);
    expect([...finished].sort()).toEqual(["deep", "early", "open", "root"]);
  });

  it("leaves open main tasks alone, even when a subtask is ticked", () => {
    const input = [node("root", null), node("sub", "root", "2026-10-04"), node("leaf", "sub")];
    const { tasks, finished } = withFinishedRoots(input);
    expect(tasks).toEqual(input);
    expect(finished.size).toBe(0);
  });
});
