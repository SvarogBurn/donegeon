import { describe, expect, it } from "vitest";
import type { StatRow } from "../types";
import { doneByDay } from "./calendar";

const row = (over: Partial<StatRow>): StatRow => ({ id: "t", parentId: null, listId: null, title: "T", startDate: "2026-10-01", deadlineDate: null, deadlineType: null, isComplete: false, completedOn: null, completedAt: null, isPersistent: false, repeatEvery: null, repeatUnit: "day", hideInStats: false, createdAt: "2026-10-01T10:00:00Z", goalIds: [], tagIds: [], pressDays: [], pressTimes: [], ...over });

describe("doneByDay", () => {
  it("has the ticks of rounds gone by on their days, one row a task a day, under what they sit in", () => {
    const rows = [
      row({ id: "habit", isPersistent: true, title: "Habit" }),
      row({
        id: "step",
        parentId: "habit",
        title: "Step",
        isComplete: true,
        completedOn: "2026-10-05",
        completedAt: "2026-10-05T10:00:00Z",
        roundTicks: [
          { day: "2026-10-03", at: "2026-10-03T10:00:00Z" },
          { day: "2026-10-05", at: "2026-10-05T08:00:00Z" },
        ],
      }),
    ];
    const days = doneByDay(rows);
    expect(days.get("2026-10-03")).toMatchObject([{ id: "step", path: ["Habit"], times: 1 }]);
    expect(days.get("2026-10-05")).toMatchObject([{ id: "step", times: 2 }]);
  });
});
