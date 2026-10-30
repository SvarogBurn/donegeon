import { describe, expect, it } from "vitest";
import { consistency, habitRate, habitRows, pressDays, windowFor } from "./habits";
import { collectStats, type Completion, type StatTask } from "./stats";
import { statTask } from "./stats.fixtures";
import type { List, StatRow } from "../types";

const TODAY = "2026-10-20";

const habit = (over: Partial<StatTask> = {}) => statTask({ isPersistent: true, habit: { every: 1, unit: "day" }, createdOn: "2026-10-11", ...over });
const press = (day: string, task: StatTask): Completion => ({ day, task, at: null, isPress: true });

describe("windowFor", () => {
  it("grows with the age", () => {
    expect([windowFor(0), windowFor(89), windowFor(90), windowFor(364), windowFor(365)]).toEqual([30, 30, 90, 90, 365]);
  });
});

describe("habitRate", () => {
  it("counts from the day it was made, not the whole window", () => {
    expect(habitRate(habit(), ["2026-10-18", "2026-10-19"], TODAY, 30)).toEqual({ done: 2, expected: 9 });
  });
  it("doesn't hold today against it, until it is done", () => {
    expect(habitRate(habit(), [], TODAY, 30)?.expected).toBe(9);
    expect(habitRate(habit(), [TODAY], TODAY, 30)).toEqual({ done: 1, expected: 10 });
  });
  it("keeps to the window", () => {
    const old = habit({ createdOn: "2026-01-01" });
    expect(habitRate(old, ["2026-09-20", "2026-09-19"], TODAY, 30)).toEqual({ done: 1, expected: 30 });
  });
  it("counts no more than was asked for", () => {
    expect(habitRate(habit({ createdOn: "2026-10-19" }), ["2026-10-19", "2026-10-19", "2026-10-19"], TODAY, 30)).toEqual({ done: 1, expected: 1 });
  });
  it("goes by the schedule's length", () => {
    const weekly = habit({ createdOn: "2026-09-29", habit: { every: 1, unit: "week" } });
    expect(habitRate(weekly, ["2026-10-06"], TODAY, 30)).toEqual({ done: 1, expected: 3 });
    const everyTwoWeeks = habit({ createdOn: "2026-09-29", habit: { every: 2, unit: "week" } });
    expect(habitRate(everyTwoWeeks, [], TODAY, 30)?.expected).toBe(1.5);
    const monthly = habit({ createdOn: "2026-07-22", habit: { every: 1, unit: "month" } });
    expect(habitRate(monthly, [], TODAY, 90)?.expected).toBeCloseTo(90 / 30.44);
  });
  it("gives a habit younger than a round time", () => {
    const weekly = habit({ createdOn: "2026-10-18", habit: { every: 1, unit: "week" } });
    expect(habitRate(weekly, [], TODAY, 30)).toBeNull();
    expect(habitRate(weekly, ["2026-10-19"], TODAY, 30)).toEqual({ done: 1, expected: 1 });
  });
  it("has nothing to say about a habit without a schedule, or one made today", () => {
    expect(habitRate(habit({ habit: { every: null, unit: "day" } }), [TODAY], TODAY, 30)).toBeNull();
    expect(habitRate(habit({ createdOn: TODAY }), [], TODAY, 30)).toBeNull();
  });
});

describe("consistency", () => {
  it("adds up the habits on a schedule", () => {
    const a = habit({ id: "a" });
    const b = habit({ id: "b" });
    const none = habit({ id: "c", habit: { every: null, unit: "day" } });
    const done = [press("2026-10-18", a), press("2026-10-19", a), press("2026-10-19", b), press("2026-10-19", none)];
    expect(consistency([a, b, none], done, TODAY)).toEqual({ share: 3 / 18, span: 30 });
  });
  it("looks as far back as the oldest habit allows", () => {
    expect(consistency([habit({ createdOn: "2026-05-01" })], [], TODAY)?.span).toBe(90);
    expect(consistency([habit({ createdOn: "2025-01-01" })], [], TODAY)?.span).toBe(365);
  });
  it("is null with nothing to score", () => {
    expect(consistency([statTask()], [], TODAY)).toBeNull();
    expect(consistency([habit({ createdOn: TODAY })], [], TODAY)).toBeNull();
  });
  it("leaves out ticks", () => {
    const a = habit();
    expect(pressDays([{ ...press("2026-10-19", a), isPress: false }]).size).toBe(0);
  });
});

describe("habitRows", () => {
  it("puts the best kept first, then those with nothing to score, the most pressed first", () => {
    const good = habit({ id: "good" });
    const poor = habit({ id: "poor" });
    const free = habit({ id: "free", habit: { every: null, unit: "day" } });
    const busy = habit({ id: "busy", habit: { every: null, unit: "day" } });
    const days = ["2026-10-17", "2026-10-18", "2026-10-19"];
    const done = [...days.map((day) => press(day, good)), press("2026-10-19", poor), press("2026-10-19", free), press("2026-10-18", busy), press("2026-10-19", busy)];
    const rows = habitRows([statTask({ id: "one-off" }), free, poor, busy, good], done, TODAY);
    expect(rows.map((row) => row.task.id)).toEqual(["good", "poor", "busy", "free"]);
    expect(rows[0].share).toBeCloseTo(3 / 9);
    expect(rows[2].share).toBeNull();
  });
});

describe("collectStats", () => {
  const row = (over: Partial<StatRow>): StatRow => ({ id: "t", parentId: null, listId: null, title: "T", startDate: "2026-10-01", deadlineDate: null, deadlineType: null, isComplete: false, completedOn: null, completedAt: null, isPersistent: false, repeatEvery: null, repeatUnit: "day", createdAt: "2026-10-01T10:00:00Z", goalIds: [], tagIds: [], pressDays: [], pressTimes: [], ...over });
  const lists = [{ id: "shop", kind: "reward" }, { id: "work", kind: "task" }] as List[];

  it("keeps what was bought apart from what was done", () => {
    const rows = [row({ id: "coffee", listId: "shop", isComplete: true, completedOn: "2026-10-10" }), row({ id: "gym", listId: "work", isComplete: true, completedOn: "2026-10-10" })];
    const { tasks, completions, rewards } = collectStats(rows, lists);
    expect(tasks.map((task) => task.id)).toEqual(["gym"]);
    expect(completions.map(({ task }) => task.id)).toEqual(["gym"]);
    expect(rewards.map(({ task }) => task.id)).toEqual(["coffee"]);
  });
  it("marks a task persistent itself as a habit, not what is under it", () => {
    const rows = [row({ id: "run", listId: "work", isPersistent: true, repeatEvery: 2, repeatUnit: "week" }), row({ id: "shoes", parentId: "run" })];
    const { tasks } = collectStats(rows, lists);
    expect(tasks.find((task) => task.id === "run")?.habit).toEqual({ every: 2, unit: "week" });
    expect(tasks.find((task) => task.id === "shoes")).toMatchObject({ isPersistent: true, habit: null });
  });
});
