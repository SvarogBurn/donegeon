import { describe, expect, it } from "vitest";
import type { Folder } from "../types";
import { NO_STAT_FILTER, type Completion } from "./stats";
import { statTask } from "./stats.fixtures";
import { doneKinds, statsView } from "./statsView";

const TODAY = "2026-10-20";
const done = (day: string, task = statTask(), isPress = false): Completion => ({ day, task, at: null, isPress });

describe("statsView", () => {
  const inA = statTask({ id: "a", listId: "list-a", createdOn: "2026-10-01" });
  const inB = statTask({ id: "b", listId: "list-b", createdOn: "2026-10-19", completedOn: "2026-10-19", closedOn: "2026-10-19", isOpen: false });
  const all = { tasks: [inA, inB], completions: [done("2026-10-19", inB), done("2026-09-01", inA, true)] };

  it("narrows by the filter, and by the lists a folder shows", () => {
    const folder = { id: "f", views: ["list:list-b"] } as Folder;
    const view = statsView(all, [folder], { ...NO_STAT_FILTER, folderId: "f" }, TODAY);
    expect(view.tasks.map((t) => t.id)).toEqual(["b"]);
    // A folder removed since narrows nothing.
    expect(statsView(all, [], { ...NO_STAT_FILTER, folderId: "f" }, TODAY).tasks).toHaveLength(2);
  });

  it("keeps the dates for the boxes about a stretch of time", () => {
    const view = statsView(all, [], { ...NO_STAT_FILTER, range: "7" }, TODAY);
    expect(view.doneInRange.map((c) => c.task.id)).toEqual(["b"]);
    expect(view.done).toHaveLength(2);
    expect(view.finished.map((t) => t.id)).toEqual(["b"]);
    expect(view.age(inA)).toBe(19);
  });
});

describe("doneKinds", () => {
  it("splits the last 30 days into main tasks, subtasks and presses", () => {
    const sub = statTask({ isRoot: false });
    expect(doneKinds([done(TODAY), done(TODAY, sub), done(TODAY, statTask(), true), done("2026-08-01")], TODAY)).toEqual({ tasks: 1, subtasks: 1, repeats: 1 });
  });
});
