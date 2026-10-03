import { describe, expect, it } from "vitest";
import { addDays, buildCountdown, combinedCountdown, dayDiff, todayPace, todayPressure } from "./countdown.service.js";

describe("day arithmetic", () => {
  it("counts whole days across month ends and clock changes", () => {
    expect(dayDiff("2026-10-02", "2026-10-12")).toBe(10);
    expect(dayDiff("2026-10-24", "2026-10-26")).toBe(2); // EU clocks go back on the 25th
    expect(dayDiff("2026-10-12", "2026-10-02")).toBe(-10);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("buildCountdown", () => {
  // Mirrors the spreadsheet: 10 tasks, starts 2026-10-02, deadline 9 days later.
  const base = { startDate: "2026-10-02", deadlineDate: "2026-10-11" };
  const open = Array<string | null>(10).fill(null);

  it("matches the spreadsheet columns on day one", () => {
    const { rows, totalTasks } = buildCountdown({ ...base, completedOn: open, today: "2026-10-02" });
    expect(totalTasks).toBe(10);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ date: "2026-10-02", daysLeft: 9, doneThatDay: 0, remaining: 10 });
    expect(rows[0].perDay).toBeCloseTo(10 / 9);
    expect(rows.at(-1)).toMatchObject({ date: "2026-10-11", daysLeft: 0, remaining: 10, perDay: null });
  });

  it("counts completions on their day and keeps the remainder cumulative", () => {
    const completedOn = ["2026-10-02", "2026-10-04", "2026-10-04", "2026-10-04", ...open.slice(4)];
    const { rows } = buildCountdown({ ...base, completedOn, today: "2026-10-05" });
    expect(rows.map((r) => r.doneThatDay).slice(0, 4)).toEqual([1, 0, 3, 0]);
    expect(rows.map((r) => r.remaining).slice(0, 4)).toEqual([9, 9, 6, 6]);
    expect(rows[3].perDay).toBeCloseTo(6 / 6);
    // Future days keep today's remainder: the pace if nothing more gets done.
    expect(rows[8]).toMatchObject({ date: "2026-10-10", daysLeft: 1, remaining: 6, perDay: 6 });
  });

  it("needs nothing per day once everything is done, even past the deadline", () => {
    const all = Array(10).fill("2026-10-03");
    const rows = buildCountdown({ ...base, completedOn: all, today: "2026-10-12" }).rows;
    expect(rows.at(-1)).toMatchObject({ date: "2026-10-12", daysLeft: -1, remaining: 0, perDay: 0 });
  });

  it("extends past the deadline through today and flags it overdue", () => {
    const { rows } = buildCountdown({ ...base, completedOn: open, today: "2026-10-14" });
    expect(rows.at(-1)).toMatchObject({ date: "2026-10-14", daysLeft: -3, remaining: 10, perDay: null });
  });

  it("recalculates cleanly when the deadline is extended", () => {
    const { rows } = buildCountdown({ ...base, deadlineDate: "2026-10-22", completedOn: open, today: "2026-10-14" });
    expect(rows).toHaveLength(21);
    const today = rows.find((r) => r.date === "2026-10-14")!;
    expect(today).toMatchObject({ daysLeft: 8, remaining: 10, perDay: 1.25 });
  });

  it("copes with a deadline before the start date", () => {
    const { rows } = buildCountdown({ startDate: "2026-10-05", deadlineDate: "2026-10-03", completedOn: [null], today: "2026-10-05" });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(rows.every((r) => r.perDay === null)).toBe(true);
  });
});

describe("todayPressure", () => {
  const at = new Date("2026-10-02T08:00:00Z");
  const task = (id: string, parentId: string | null, extra: object = {}) => ({
    id,
    parentId,
    title: id,
    startDate: "2026-10-02",
    createdAt: at,
    deadlineDate: null,
    deadlineType: null,
    completedOn: null,
    ...extra,
  });
  const hard = (deadlineDate: string) => ({ deadlineDate, deadlineType: "hard" as const });

  const tasks = [
    task("exam", null, hard("2026-10-12")),
    task("exam-a", "exam", hard("2026-10-06")), // inside a hard parent: not counted twice
    task("exam-b", "exam", { completedOn: "2026-10-02" }),
    task("chores", null, { deadlineDate: "2026-10-03", deadlineType: "soft" }),
    task("project", null),
    task("project-part", "project", hard("2026-10-04")),
    task("project-part-1", "project-part"),
    task("late", null, hard("2026-10-01")),
  ];

  it("sums hard deadlines only, without double counting", () => {
    const summary = todayPressure(tasks, "2026-10-02");
    expect(summary.items.map((i) => i.taskId)).toEqual(["late", "project-part", "exam"]);
    expect(summary.items.map((i) => i.remaining)).toEqual([1, 2, 2]);
    expect(summary.totalOutstanding).toBe(5);
    // late: 1 overdue (all due now) + project-part: 2 over 2 days + exam: 2 over 10 days
    expect(summary.perDayToday).toBeCloseTo(1 + 1 + 0.2);
    expect(summary.items[0].perDay).toBeNull();
  });

  it("gives any task with a deadline, soft ones too, today's pace over its own subtree", () => {
    expect(todayPace(tasks, tasks[3], "2026-10-02")).toEqual({ daysLeft: 1, remaining: 1, perDay: 1 });
    expect(todayPace(tasks, tasks[0], "2026-10-02")).toEqual({ daysLeft: 10, remaining: 2, perDay: 0.2 });
  });
});

describe("combinedCountdown", () => {
  const at = new Date("2026-10-03T08:00:00Z");
  const task = (id: string, parentId: string | null, extra: object = {}) => ({
    id,
    parentId,
    title: id,
    startDate: "2026-10-03",
    createdAt: at,
    deadlineDate: null as string | null,
    deadlineType: null as "hard" | "soft" | null,
    completedOn: null as string | null,
    ...extra,
  });
  const kids = (parent: string, n: number) => Array.from({ length: n }, (_, i) => task(`${parent}-${i}`, parent));
  // The user's example: 7 tasks due 10/10 and 6 tasks due 06/10, seen on 03/10.
  const exam = [task("exam", null, { deadlineDate: "2026-10-10", deadlineType: "hard" }), ...kids("exam", 6)];
  const essay = [task("essay", null, { deadlineDate: "2026-10-06", deadlineType: "soft" }), ...kids("essay", 5)];

  it("adds each deadline's own pace: 1/day + 2/day = 3/day until the sooner deadline", () => {
    const { rows, items, totalTasks } = combinedCountdown([...exam, ...essay], "2026-10-03");
    expect(totalTasks).toBe(13);
    expect(items.map((i) => [i.taskId, i.deadlineDate, i.deadlineType])).toEqual([
      ["essay", "2026-10-06", "soft"],
      ["exam", "2026-10-10", "hard"],
    ]);
    expect(rows.map((r) => r.date)).toEqual(["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
    // Future days follow the plan: each deadline keeps today's pace until it is due.
    expect(rows.slice(0, 3).map((r) => r.perDay)).toEqual([3, 3, 3]);
    // From its deadline on, the plan has the essay finished, and the exam on 10/10.
    expect(rows.slice(3).map((r) => r.perDay)).toEqual([1, 1, 1, 1, 0]);
    expect(rows.slice(2, 4).map((r) => r.remaining)).toEqual([13, 7]);
    expect(rows[0]).toMatchObject({ remaining: 13, doneThatDay: 0, overdue: false });
  });

  it("drops a finished deadline once its day comes", () => {
    const done = essay.map((t) => ({ ...t, completedOn: "2026-10-03" }));
    const { rows } = combinedCountdown([...exam, ...done], "2026-10-03");
    expect(rows[0]).toMatchObject({ doneThatDay: 6, remaining: 7, perDay: 1, overdue: false });
    expect(rows[3]).toMatchObject({ date: "2026-10-06", remaining: 7, perDay: 1, overdue: false });
  });

  it("counts unfinished work in full, flagged overdue, once its deadline has come", () => {
    const { rows } = combinedCountdown([...exam, ...essay], "2026-10-06");
    expect(rows[3]).toMatchObject({ date: "2026-10-06", remaining: 13, perDay: 7 / 4 + 6, overdue: true });
    // …and stays overdue on the days after, since it can no longer be done on time.
    expect(rows[4]).toMatchObject({ date: "2026-10-07", remaining: 13, perDay: 7 / 4 + 6, overdue: true });
  });

  it("starts each deadline on the day its task was written down, and past days use what was done", () => {
    const later = essay.map((t) => ({ ...t, startDate: "2026-10-05" }));
    const done = exam.map((t, i) => ({ ...t, completedOn: i < 3 ? "2026-10-05" : null }));
    const { rows } = combinedCountdown([...done, ...later], "2026-10-07");
    expect(rows[0]).toMatchObject({ date: "2026-10-03", remaining: 7, perDay: 1, doneThatDay: 0 });
    expect(rows[2]).toMatchObject({ date: "2026-10-05", remaining: 4 + 6, perDay: 4 / 5 + 6, doneThatDay: 3 });
    expect(rows[4]).toMatchObject({ date: "2026-10-07", remaining: 10, perDay: 4 / 3 + 6, overdue: true });
  });

  it("skips a subtask's deadline inside a task that has one, and is empty without deadlines", () => {
    const nested = [...exam.slice(0, 1), { ...exam[1], deadlineDate: "2026-10-04", deadlineType: "hard" as const }, ...exam.slice(2)];
    expect(combinedCountdown(nested, "2026-10-03").items.map((i) => i.taskId)).toEqual(["exam"]);
    expect(combinedCountdown(kids("x", 3), "2026-10-03")).toMatchObject({ items: [], rows: [], totalTasks: 0 });
  });
});
