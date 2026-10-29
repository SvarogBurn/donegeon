import { describe, expect, it } from "vitest";
import { healthOf, heartsAt, maxHp } from "../../../shared/health.js";
import { expFor } from "../../../shared/levels.js";
import { missesOf, type ValuedRow } from "./health.service.js";

describe("hearts", () => {
  it("5 at the start, one more every 2 levels, 10 from Lv 11", () => {
    expect([1, 2, 3, 4, 5, 9, 10, 11, 30].map(heartsAt)).toEqual([5, 5, 6, 6, 7, 9, 9, 10, 10]);
    expect(maxHp(1)).toBe(10);
  });
});

describe("healthOf", () => {
  const exp = (day: string, count: number) => ({ day, count });
  const hit = (day: string, damage: number) => ({ day, damage });

  it("a hit costs its damage, and nothing heals it but a level", () => {
    expect(healthOf([hit("2026-11-01", 3)], [exp("2026-11-02", 4)])).toMatchObject({ hp: 7, max: 10, level: 1, lost: 0 });
    expect(healthOf([hit("2026-11-01", 3)], [exp("2026-11-02", 5)])).toMatchObject({ hp: 10, level: 2 });
  });

  it("a hit lands at the start of its day: a level later that day heals it, one reached before doesn't", () => {
    expect(healthOf([hit("2026-11-01", 3)], [exp("2026-11-01", 5)]).hp).toBe(10);
    expect(healthOf([hit("2026-11-02", 3)], [exp("2026-11-01", 5)]).hp).toBe(7);
  });

  it("the hearts grow with the level", () => {
    expect(healthOf([], [exp("2026-11-01", expFor(3))])).toMatchObject({ hp: 12, max: 12, level: 3 });
  });

  it("run out, the character drops 1 level, then 2, 3 …, its hearts full again", () => {
    const days = [exp("2026-11-01", expFor(5)), exp("2026-11-04", 7)];
    const once = healthOf([hit("2026-11-02", 14)], days.slice(0, 1));
    expect(once).toMatchObject({ level: 4, hp: 12, max: 12, lost: expFor(5) - expFor(4), knockouts: [{ day: "2026-11-02", from: 5, to: 4 }] });
    const twice = healthOf([hit("2026-11-02", 14), hit("2026-11-03", 12)], days.slice(0, 1));
    expect(twice).toMatchObject({ level: 2, hp: 10, lost: expFor(5) - expFor(2) });
    // A level regained heals; the next knockout still costs 3, as Lv 5 wasn't passed.
    const thrice = healthOf([hit("2026-11-02", 14), hit("2026-11-03", 12), hit("2026-11-05", 12)], days);
    expect(thrice.knockouts.map(({ from, to }) => [from, to])).toEqual([[5, 4], [4, 2], [3, 1]]);
    expect(thrice).toMatchObject({ level: 1, hp: 10, lost: expFor(5) + 7 });
  });

  it("never below Lv 1, at most 5 levels, and a level never had before forgives the knockouts", () => {
    const hits = Array.from({ length: 7 }, (_, i) => hit(`2026-11-0${i + 2}`, 20));
    const many = healthOf(hits, [exp("2026-11-01", expFor(30))]);
    expect(many.knockouts.map(({ from, to }) => from - to)).toEqual([1, 2, 3, 4, 5, 5, 5]);
    const low = healthOf([hit("2026-11-02", 10)], []);
    expect(low).toMatchObject({ level: 1, lost: 0, knockouts: [{ from: 1, to: 1 }] });
    // Lv 5, knocked to 4, then past 5 to 6: the next knockout costs 1 again.
    const forgiven = healthOf([hit("2026-11-02", 14), hit("2026-11-04", 14)], [exp("2026-11-01", expFor(5)), exp("2026-11-03", expFor(6) - expFor(4))]);
    expect(forgiven.knockouts.map(({ from, to }) => [from, to])).toEqual([[5, 4], [6, 5]]);
  });
});

describe("missesOf", () => {
  const today = "2026-11-10";
  const since = "2026-10-30";
  const row = (over: Partial<ValuedRow> & { id: string }): ValuedRow => ({
    parentId: null,
    title: over.id,
    isComplete: false,
    completedOn: null,
    isPersistent: false,
    deadlineDate: null,
    repeatEvery: null,
    repeatUnit: "day",
    nextDue: null,
    roundMoves: null,
    value: 2,
    valueKind: "task",
    ...over,
  });

  it("a deadline gone by with its task open hits the day after, costing what is left undone", () => {
    const rows = [
      row({ id: "essay", deadlineDate: "2026-11-08", value: 5 }),
      row({ id: "draft", parentId: "essay", value: 3 }),
      row({ id: "outline", parentId: "essay", value: 4, isComplete: true, completedOn: "2026-11-05" }),
      row({ id: "habit", parentId: "essay", isPersistent: true, value: 9 }),
    ];
    expect(missesOf(rows, today, since)).toEqual([{ key: "deadline:essay:2026-11-08", kind: "deadline", taskId: "essay", title: "essay", day: "2026-11-09", damage: 8 }]);
  });

  it("soft deadlines too; not on the day itself, nor done in time, nor before health came in, nor in a reward list", () => {
    const rows = [
      row({ id: "soft", deadlineDate: "2026-11-09", value: 0 }),
      row({ id: "today", deadlineDate: today }),
      row({ id: "inTime", deadlineDate: "2026-11-05", isComplete: true, completedOn: "2026-11-05" }),
      row({ id: "late", deadlineDate: "2026-11-05", isComplete: true, completedOn: "2026-11-07" }),
      row({ id: "old", deadlineDate: "2026-10-28" }),
      row({ id: "reward", deadlineDate: "2026-11-05", valueKind: "reward" }),
    ];
    expect(missesOf(rows, today, since).map(({ taskId, damage }) => [taskId, damage])).toEqual([["soft", 1], ["late", 2]]);
  });

  it("every round of a schedule whose day went by unpressed, a moved one on the day it was moved to", () => {
    const daily = row({ id: "walk", isPersistent: true, repeatEvery: 1, repeatUnit: "day", nextDue: "2026-11-07", roundMoves: { "2026-11-08": "2026-11-12" } });
    const weekly = row({ id: "clean", isPersistent: true, repeatEvery: 1, repeatUnit: "week", nextDue: "2026-11-03", value: 1 });
    const keys = missesOf([daily, weekly, row({ id: "chore", parentId: "clean", value: 2 })], today, since).map(({ key, day, damage }) => [key, day, damage]);
    expect(keys).toEqual([
      ["round:walk:2026-11-07", "2026-11-08", 2],
      ["round:walk:2026-11-09", "2026-11-10", 2],
      ["round:clean:2026-11-03", "2026-11-04", 3],
    ]);
  });

  it("no rounds before health came in, and none for a task without a schedule", () => {
    const rows = [row({ id: "walk", isPersistent: true, repeatEvery: 1, nextDue: "2026-10-27" }), row({ id: "whenever", isPersistent: true })];
    expect(missesOf(rows, "2026-10-31", since).map(({ key }) => key)).toEqual(["round:walk:2026-10-29", "round:walk:2026-10-30"]);
  });
});
