import { describe, expect, it } from "vitest";
import { addDays } from "../../../../shared/dates";
import type { StatRow } from "../../types";
import { collectStats } from "../stats";
import { deedsOf } from "./deeds";

const TODAY = "2026-10-22";

const row = (id: string, extra: Partial<StatRow> = {}): StatRow => ({
  id,
  parentId: null,
  listId: null,
  title: id,
  startDate: null,
  deadlineDate: null,
  deadlineType: null,
  isComplete: Boolean(extra.completedOn),
  completedOn: null,
  isPersistent: false,
  repeatEvery: null,
  repeatUnit: "day",
  createdAt: "2026-09-01T12:00:00",
  goalIds: [],
  tagIds: [],
  completedAt: null,
  pressDays: [],
  pressTimes: [],
  ...extra,
});

const deeds = (rows: StatRow[]) => deedsOf({ rows, ...collectStats(rows, []), today: TODAY });

/**
 * A task with a hard deadline, `days` days from `start` (both counted), open, with `subs` subtasks, the i-th done on
 * `doneOn(i)` (null: open).
 */
function deadline(id: string, start: string, days: number, subs: number, doneOn: (i: number) => string | null, deadlineType: "hard" | "soft" = "hard") {
  const root = row(id, { startDate: start, deadlineDate: addDays(start, days - 1), deadlineType });
  return [root, ...Array.from({ length: subs }, (_, i) => row(`${id}${i}`, { parentId: id, completedOn: doneOn(i) }))];
}
const daily = (start: string, every = 1, upTo = 30) => (i: number) => (i * every < upTo ? addDays(start, i * every) : null);

describe("the hard deadlines' pace kept for 30 days", () => {
  it("is a month of one a day on a 60-day deadline", () => {
    expect(deeds(deadline("big", "2026-09-01", 60, 60, daily("2026-09-01"))).steady).toBe(true);
  });

  it("is not one every third day", () => {
    expect(deeds(deadline("big", "2026-09-01", 60, 60, daily("2026-09-01", 3, 60))).steady).toBe(false);
  });

  it("is not 29 days, whatever was done", () => {
    expect(deeds(deadline("big", "2026-09-01", 29, 40, daily("2026-09-01", 1, 29))).steady).toBe(false);
  });

  it("goes by hard deadlines only", () => {
    expect(deeds(deadline("big", "2026-09-01", 60, 60, daily("2026-09-01"), "soft")).steady).toBe(false);
  });

  it("adds deadlines up: two after each other make one run of days", () => {
    const first = deadline("a", "2026-09-01", 15, 15, daily("2026-09-01", 1, 15));
    const second = deadline("b", "2026-09-16", 30, 30, daily("2026-09-16", 1, 15));
    expect(deeds(first).steady).toBe(false);
    expect(deeds([...first, ...second]).steady).toBe(true);
  });

  it("leaves a persistent subtask out, as the countdown does", () => {
    expect(deeds([...deadline("big", "2026-09-01", 60, 60, daily("2026-09-01")), row("p", { parentId: "big", isPersistent: true })]).steady).toBe(true);
  });
});

describe("the other deeds", () => {
  it("count presses, tasks that waited 30 days, early mornings and deadlines met in a row", () => {
    const rows = [
      row("daily", { isPersistent: true, pressDays: ["2026-09-01", "2026-09-02", "2026-09-03"], pressTimes: ["2026-09-01T06:30:00", "2026-09-02T07:59:00", "2026-09-03T08:00:00"] }),
      row("old", { createdAt: "2026-08-01T12:00:00", completedOn: "2026-08-31", completedAt: "2026-08-31T07:00:00" }),
      row("fresh", { createdAt: "2026-08-01T12:00:00", completedOn: "2026-08-30" }),
      ...["01", "02", "03"].map((d) => row(`on${d}`, { createdAt: "2026-09-30T12:00:00", deadlineDate: `2026-10-${d}`, completedOn: `2026-10-${d}` })),
      row("missed", { createdAt: "2026-09-30T12:00:00", deadlineDate: "2026-10-05", completedOn: "2026-10-07" }),
      ...["10", "11"].map((d) => row(`again${d}`, { createdAt: "2026-09-30T12:00:00", deadlineDate: `2026-10-${d}`, completedOn: `2026-10-${d}` })),
    ];
    expect(deeds(rows)).toMatchObject({ presses: 3, frogs: 1, earlyDays: 3, onTimeRun: 3, busiestDay: 1, steady: false });
    const busy = Array.from({ length: 25 }, (_, i) => row(`b${i}`, { completedOn: "2026-10-20" }));
    expect(deeds([...rows, ...busy]).busiestDay).toBe(25);
  });
});
