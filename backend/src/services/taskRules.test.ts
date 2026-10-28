import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { assertDeadlineDepth, taskPatchData } from "./taskRules.js";

const TODAY = "2026-10-20";

const task = (over: Partial<Parameters<typeof taskPatchData>[0]> = {}): Parameters<typeof taskPatchData>[0] => ({
  parentId: null,
  listId: "list",
  weekDay: null,
  todaySince: null,
  isPersistent: false,
  isComplete: false,
  deadlineDate: null,
  deadlineType: null,
  repeatEvery: null,
  nextDue: null,
  ...over,
});

describe("taskPatchData", () => {
  it("writes what was sent, an empty note as none", () => {
    expect(taskPatchData(task(), { title: "New", notes: "" }, TODAY)).toMatchObject({ title: "New", notes: null });
  });

  it("makes a task with a schedule persistent, due today unless another day was given", () => {
    const data = taskPatchData(task(), { repeatEvery: 2, repeatUnit: "week" }, TODAY);
    expect(data).toMatchObject({ isPersistent: true, repeatEvery: 2, repeatUnit: "week", nextDue: TODAY, roundMoves: Prisma.DbNull });
  });

  it("takes the schedule off a task that stops being persistent", () => {
    const data = taskPatchData(task({ isPersistent: true, repeatEvery: 1, nextDue: "2026-10-25" }), { isPersistent: false }, TODAY);
    expect(data).toMatchObject({ isPersistent: false, repeatEvery: null, nextDue: null });
  });

  it("keeps moved rounds while the schedule stays as it was", () => {
    const data = taskPatchData(task({ isPersistent: true, repeatEvery: 1, nextDue: "2026-10-25" }), { title: "Renamed" }, TODAY);
    expect(data.roundMoves).toBeUndefined();
  });

  it("refuses a deadline on a persistent task, and a persistent task with a deadline", () => {
    expect(() => taskPatchData(task({ isPersistent: true }), { deadlineDate: "2026-11-01" }, TODAY)).toThrow("can't have a deadline");
    expect(() => taskPatchData(task({ deadlineDate: "2026-11-01" }), { isPersistent: true }, TODAY)).toThrow("can't have a deadline");
  });

  it("refuses making a ticked task persistent, and points handed down from a subtask", () => {
    expect(() => taskPatchData(task({ isComplete: true }), { isPersistent: true }, TODAY)).toThrow("Untick it first");
    expect(() => taskPatchData(task({ parentId: "p", listId: null }), { pointsToSubtasks: true }, TODAY)).toThrow("Only a main task");
  });

  it("won't let a task in no list leave the last box it lives in", () => {
    const onlyToday = task({ listId: null, todaySince: "2026-10-19" });
    expect(() => taskPatchData(onlyToday, { today: false }, TODAY)).toThrow("only lives in Today");
    expect(taskPatchData({ ...onlyToday, weekDay: "2026-10-21" }, { today: false }, TODAY)).toMatchObject({ todaySince: null });
    expect(() => taskPatchData(task({ listId: null, weekDay: "2026-10-21" }), { week: false }, TODAY)).toThrow("only lives in Week");
  });

  it("marks a task for today, or for a day to come, never for one gone by", () => {
    // A mark left from a day gone by is not kept: in Today again, it is for today.
    expect(taskPatchData(task({ todaySince: "2026-10-15" }), { today: true }, TODAY)).toMatchObject({ todaySince: TODAY });
    expect(taskPatchData(task(), { today: "2026-10-23" }, TODAY)).toMatchObject({ todaySince: "2026-10-23" });
    expect(taskPatchData(task(), { today: "2026-10-01" }, TODAY)).toMatchObject({ todaySince: TODAY });
    expect(taskPatchData(task(), { today: true }, TODAY)).toMatchObject({ todaySince: TODAY });
  });

  it("takes a task put off to next week out of it when it is put in Today, one planned for this week not", () => {
    expect(taskPatchData(task({ weekDay: "2026-10-26" }), { today: true }, TODAY)).toMatchObject({ todaySince: TODAY, weekDay: null });
    expect(taskPatchData(task({ listId: null, weekDay: "2026-10-26" }), { today: true }, TODAY)).toMatchObject({ todaySince: TODAY, weekDay: null });
    expect(taskPatchData(task({ weekDay: "2026-10-22" }), { today: true }, TODAY).weekDay).toBeUndefined();
  });

  it("makes a first deadline hard, and never rewrites the type a deadline has", () => {
    expect(taskPatchData(task(), { deadlineDate: "2026-11-01" }, TODAY)).toMatchObject({ deadlineDate: "2026-11-01", deadlineType: "hard" });
    expect(taskPatchData(task({ deadlineType: "soft" }), { deadlineDate: "2026-11-01" }, TODAY).deadlineType).toBeUndefined();
  });
});

describe("assertDeadlineDepth", () => {
  it("allows deadlines on main tasks and their direct subtasks only", () => {
    expect(() => assertDeadlineDepth(0)).not.toThrow();
    expect(() => assertDeadlineDepth(1)).not.toThrow();
    expect(() => assertDeadlineDepth(2)).toThrow("main tasks and their direct subtasks");
  });
});
