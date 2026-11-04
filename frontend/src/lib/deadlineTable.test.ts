import { describe, expect, it } from "vitest";
import type { CombinedRow } from "../types";
import { DEADLINE_DEFAULTS, deadlineColor, foldedDays, normalizeDeadlineTable, perDayOf, rangeEnd, rangeLabel } from "./deadlineTable";

describe("normalizeDeadlineTable", () => {
  it("gives the defaults for nothing saved", () => {
    expect(normalizeDeadlineTable(null)).toEqual(DEADLINE_DEFAULTS);
    expect(normalizeDeadlineTable("x")).toEqual(DEADLINE_DEFAULTS);
  });

  it("keeps what is good and fills in the rest", () => {
    const table = normalizeDeadlineTable({
      range: { amount: 10, unit: "day" },
      perDay: "columns",
      soft: false,
      colors: { hard: "#ABCDEF", soft: "blue" },
      taskColors: { a: "#112233", b: 5 },
    });
    expect(table).toEqual({
      range: { amount: 10, unit: "day" },
      perDay: "columns",
      soft: false,
      colors: { hard: "#abcdef", soft: DEADLINE_DEFAULTS.colors.soft, big: DEADLINE_DEFAULTS.colors.big },
      taskColors: { a: "#112233" },
    });
  });

  it("drops a range out of bounds and an unknown mode", () => {
    const table = normalizeDeadlineTable({ range: { amount: 0, unit: "week" }, perDay: "max" });
    expect(table.range).toEqual(DEADLINE_DEFAULTS.range);
    expect(table.perDay).toBe("sum");
  });
});

describe("the range", () => {
  it("counts today as its first day", () => {
    expect(rangeEnd("2026-10-23", { amount: 1, unit: "day" })).toBe("2026-10-23");
    expect(rangeEnd("2026-10-23", { amount: 2, unit: "week" })).toBe("2026-11-05");
    expect(rangeEnd("2026-12-30", { amount: 3, unit: "day" })).toBe("2027-01-01");
  });

  it("is named by its length", () => {
    expect(rangeLabel({ amount: 2, unit: "week" })).toBe("2 weeks");
    expect(rangeLabel({ amount: 1, unit: "day" })).toBe("1 day");
  });
});

describe("perDayOf", () => {
  const row: CombinedRow = {
    date: "2026-10-23",
    doneThatDay: 0,
    remaining: 13,
    perDay: 7 / 8 + 6,
    overdue: true,
    paces: [null, { remaining: 0, perDay: 0 }, { remaining: 6, perDay: null }, { remaining: 7, perDay: 7 / 8 }],
  };

  it("adds every deadline up", () => {
    expect(perDayOf(row, "sum")).toEqual({ perDay: 7 / 8 + 6, remaining: 13, overdue: true });
  });

  it("takes only the soonest deadline still running with work left, overdue work in full", () => {
    expect(perDayOf(row, "soonest")).toEqual({ perDay: 6, remaining: 6, overdue: true });
    const later = { ...row, paces: [null, { remaining: 7, perDay: 7 / 8 }] };
    expect(perDayOf(later, "soonest")).toEqual({ perDay: 7 / 8, remaining: 7, overdue: false });
    expect(perDayOf({ ...row, paces: [null] }, "soonest")).toEqual({ perDay: 0, remaining: 0, overdue: false });
  });
});

describe("deadlineColor", () => {
  const table = { ...DEADLINE_DEFAULTS, taskColors: { own: "#123456" } };

  it("is the task's own, else a big task's, else its kind's", () => {
    expect(deadlineColor({ taskId: "own", deadlineType: "hard" }, true, table)).toBe("#123456");
    expect(deadlineColor({ taskId: "x", deadlineType: "hard" }, true, table)).toBe(table.colors.big);
    expect(deadlineColor({ taskId: "x", deadlineType: "hard" }, false, table)).toBe(table.colors.hard);
    expect(deadlineColor({ taskId: "x", deadlineType: "soft" }, false, table)).toBe(table.colors.soft);
  });
});

describe("foldedDays", () => {
  const row = (date: string, doneThatDay: number, remaining: number): CombinedRow => ({ date, doneThatDay, remaining, perDay: remaining, overdue: true, paces: [] });
  const rows = [row("2026-01-01", 1, 9), row("2026-06-15", 2, 7), row("2026-11-01", 0, 7), row("2026-11-02", 3, 4), row("2026-11-03", 0, 4)];

  it("folds the days before this week into one: since when, all done over them, the last of them", () => {
    expect(foldedDays(rows, "2026-01-01", "2026-11-02")).toEqual({ since: "2026-01-01", done: 3, last: rows[2] });
  });

  it("is nothing when the table starts this week", () => {
    expect(foldedDays(rows, "2026-11-02", "2026-11-02")).toBeNull();
  });
});
