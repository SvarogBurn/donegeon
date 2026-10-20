import { describe, expect, it } from "vitest";
import { folderOrder, moveItem, resolveTaskBar } from "./taskBar";

const DEFAULT = { left: ["tasks", "stats", "calendar", "notes"], right: ["points", "user", "clock"] };

describe("resolveTaskBar", () => {
  it("is the usual bar when nothing was saved, the folders after the pages", () => {
    expect(resolveTaskBar(null, [])).toEqual(DEFAULT);
    expect(resolveTaskBar(null, ["a", "b"])).toEqual({ ...DEFAULT, left: [...DEFAULT.left, "folder:a", "folder:b"] });
  });

  it("ignores something that isn't a layout", () => {
    expect(resolveTaskBar({ left: "tasks" }, [])).toEqual(DEFAULT);
    expect(resolveTaskBar({ left: [1], right: [] }, [])).toEqual(DEFAULT);
  });

  it("keeps the saved order and sides", () => {
    const saved = { left: ["clock", "tasks", "folder:a"], right: ["stats", "calendar", "notes", "points", "user"] };
    expect(resolveTaskBar(saved, ["a"])).toEqual(saved);
  });

  it("drops unknown items, repeats and folders that are gone", () => {
    const saved = { left: ["tasks", "nope", "folder:gone", "tasks", "folder:a"], right: ["clock"] };
    expect(resolveTaskBar(saved, ["a"]).left).toEqual(["tasks", "folder:a", "stats", "calendar", "notes"]);
  });

  it("puts a missing page back on its usual side", () => {
    const saved = { left: ["user"], right: ["tasks"] };
    expect(resolveTaskBar(saved, [])).toEqual({ left: ["user", "stats", "calendar", "notes"], right: ["tasks", "points", "clock"] });
  });

  it("puts a new folder at the end of the left side", () => {
    const saved = { left: ["tasks", "stats", "calendar", "notes"], right: ["folder:a", "points", "user", "clock"] };
    expect(resolveTaskBar(saved, ["a", "b"])).toEqual({ ...saved, left: [...saved.left, "folder:b"] });
  });

  it("fills the folders' places in their own order", () => {
    // Reordered elsewhere (the installed app's strip): b now comes before a.
    const saved = { left: ["tasks", "folder:a", "stats", "calendar", "notes"], right: ["points", "folder:b", "user", "clock"] };
    expect(resolveTaskBar(saved, ["b", "a"])).toEqual({
      left: ["tasks", "folder:b", "stats", "calendar", "notes"],
      right: ["points", "folder:a", "user", "clock"],
    });
  });
});

describe("moveItem", () => {
  const layout = { left: ["tasks", "stats", "folder:a"], right: ["points", "clock"] };

  it("moves along the same side", () => {
    expect(moveItem(layout, "tasks", { beside: "folder:a", after: true }).left).toEqual(["stats", "folder:a", "tasks"]);
    expect(moveItem(layout, "folder:a", { beside: "tasks", after: false }).left).toEqual(["folder:a", "tasks", "stats"]);
  });

  it("moves to the other side", () => {
    expect(moveItem(layout, "stats", { beside: "points", after: true })).toEqual({ left: ["tasks", "folder:a"], right: ["points", "stats", "clock"] });
    expect(moveItem(layout, "clock", { beside: "tasks", after: false })).toEqual({ left: ["clock", "tasks", "stats", "folder:a"], right: ["points"] });
  });

  it("moves onto an empty side", () => {
    const empty = { left: ["tasks", "clock"], right: [] };
    expect(moveItem(empty, "clock", { side: "right" })).toEqual({ left: ["tasks"], right: ["clock"] });
  });

  it("changes nothing dropped on itself or beside an item that isn't there", () => {
    expect(moveItem(layout, "stats", { beside: "stats", after: true })).toBe(layout);
    expect(moveItem(layout, "stats", { beside: "nope", after: true })).toBe(layout);
  });
});

describe("folderOrder", () => {
  it("is the folders left to right across both sides", () => {
    expect(folderOrder({ left: ["tasks", "folder:b"], right: ["folder:a", "clock"] })).toEqual(["b", "a"]);
  });
});
