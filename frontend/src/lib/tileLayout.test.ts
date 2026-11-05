import { describe, expect, it } from "vitest";
import { arrange, EMPTY_LAYOUT, type DashboardLayout } from "./tileLayout";

const keys = ["today", "list:a", "list:b", "newList", "deadlines", "pressure", "cal:month", "goals", "tags", "done"];

describe("arrange where nothing was arranged", () => {
  it("spreads the tiles over the columns that fit, each to the shortest; hiding one moves no other", () => {
    const columns = [
      ["today", "newList", "cal:month"],
      ["list:a", "deadlines", "tags"],
      ["list:b", "pressure", "goals", "done"],
    ];
    expect(arrange(EMPTY_LAYOUT, 3, keys, keys, true).columns).toEqual(columns);
    expect(arrange({ ...EMPTY_LAYOUT, hidden: ["done", "tags", "newList", "goals"] }, 3, keys, keys, true).columns).toEqual(columns);
    // Without `spreads` (the Stats page): one column, as before.
    expect(arrange(EMPTY_LAYOUT, 3, keys).columns).toEqual([keys]);
  });

  it("on a phone, Today first", () => {
    expect(arrange(EMPTY_LAYOUT, 1, ["list:a", "today", "goals"]).columns).toEqual([["today", "list:a", "goals"]]);
  });

  it("on a phone with only the wide arrangement saved, Today still first; one arranged on a phone keeps its place", () => {
    const wide: DashboardLayout = { pinned: [], byColumns: { wide: [["list:a", "goals"], ["today"]] } };
    expect(arrange(wide, 1, ["list:a", "goals", "today"]).columns).toEqual([["today", "list:a", "goals"]]);
    const phone: DashboardLayout = { pinned: [], byColumns: { phone: [["list:a", "today"]] } };
    expect(arrange(phone, 1, ["list:a", "today"]).columns).toEqual([["list:a", "today"]]);
  });

  it("a saved arrangement is kept as it was", () => {
    const wide: DashboardLayout = { pinned: [], byColumns: { wide: [["deadlines", "today", "list:a"]] } };
    expect(arrange(wide, 3, ["deadlines", "today", "list:a"]).columns).toEqual([["deadlines", "today", "list:a"]]);
  });
});
