import { describe, expect, it } from "vitest";
import { healthOf, heartsAt, maxHp, restDays, settleRest } from "../../../shared/health.js";
import { expFor, levelOf, spanOf } from "../../../shared/levels.js";
import { missedDays, missesOf, type ValuedRow } from "./health.service.js";

describe("hearts", () => {
  it("5 at the start, one more every 2 levels, 10 from Lv 11", () => {
    expect([1, 2, 3, 4, 5, 9, 10, 11, 30].map(heartsAt)).toEqual([5, 5, 6, 6, 7, 9, 9, 10, 10]);
    expect(maxHp(1)).toBe(10);
  });
});

describe("healthOf", () => {
  const exp = (day: string, count: number) => ({ day, count });
  const hit = (day: string, damage: number) => ({ day, damage });
  const today = "2026-11-30";
  const walk = (hits: { day: string; damage: number }[], done: { day: string; count: number }[]) => healthOf({ hits, done, today });

  it("a hit costs its damage, and nothing heals it but a level", () => {
    expect(walk([hit("2026-11-01", 3)], [exp("2026-11-02", 4)])).toMatchObject({ hp: 7, max: 10, level: 1, lost: 0 });
    expect(walk([hit("2026-11-01", 3)], [exp("2026-11-02", 5)])).toMatchObject({ hp: 10, level: 2 });
  });

  it("a hit lands at the start of its day: a level later that day heals it, one reached before doesn't", () => {
    expect(walk([hit("2026-11-01", 3)], [exp("2026-11-01", 5)]).hp).toBe(10);
    expect(walk([hit("2026-11-02", 3)], [exp("2026-11-01", 5)]).hp).toBe(7);
  });

  it("the hearts grow with the level", () => {
    expect(walk([], [exp("2026-11-01", expFor(3))])).toMatchObject({ hp: 12, max: 12, level: 3 });
  });

  it("run out, the character drops 1 level, always, its hearts full again; never below Lv 1", () => {
    const days = [exp("2026-11-01", expFor(5))];
    const once = walk([hit("2026-11-02", 14)], days);
    expect(once).toMatchObject({ level: 4, hp: 12, max: 12, lost: expFor(5) - expFor(4), knockouts: [{ day: "2026-11-02", from: 5, to: 4 }] });
    const twice = walk([hit("2026-11-02", 14), hit("2026-11-03", 12)], days);
    expect(twice.knockouts.map(({ from, to }) => [from, to])).toEqual([[5, 4], [4, 3]]);
    expect(twice).toMatchObject({ level: 3, hp: 12, lost: expFor(5) - expFor(3) });
    const many = walk(Array.from({ length: 7 }, (_, i) => hit(`2026-11-0${i + 2}`, 20)), [exp("2026-11-01", expFor(30))]);
    expect(many.knockouts.map(({ from, to }) => from - to)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(walk([hit("2026-11-02", 10)], [])).toMatchObject({ level: 1, lost: 0, knockouts: [{ from: 1, to: 1 }] });
  });

  it("a comeback: 3 tasks on the day of the knockout or the 2 after win its level back", () => {
    const start = exp("2026-11-01", expFor(5));
    const won = walk([hit("2026-11-02", 14)], [start, exp("2026-11-02", 1), exp("2026-11-04", 2)]);
    expect(won).toMatchObject({ level: 5, lost: 0, quest: null, comebacks: [{ day: "2026-11-04", from: 4, to: 5 }] });
    // Two only, then the time is up: the level stays lost, and nothing more.
    const missed = walk([hit("2026-11-02", 14)], [start, exp("2026-11-03", 2), exp("2026-11-05", 1)]);
    expect(missed).toMatchObject({ level: 4, comebacks: [], quest: null });
    // Still going: the quest says how far it is.
    const open = healthOf({ hits: [hit("2026-11-02", 14)], done: [start, exp("2026-11-02", 1)], today: "2026-11-03" });
    expect(open.quest).toEqual({ day: "2026-11-02", until: "2026-11-04", done: 1, needed: 3 });
  });

  it("a second knockout during a comeback starts a new one, which wins back only its own level", () => {
    const health = walk([hit("2026-11-02", 14), hit("2026-11-03", 12)], [exp("2026-11-01", expFor(5)), exp("2026-11-03", 3)]);
    expect(health.knockouts.map(({ to }) => to)).toEqual([4, 3]);
    expect(health.comebacks).toEqual([{ day: "2026-11-03", from: 3, to: 4 }]);
  });

  it("nothing missed on a rest day costs anything", () => {
    const rest = new Set(["2026-11-01"]);
    expect(healthOf({ hits: [hit("2026-11-02", 3)], done: [], rest, today }).hp).toBe(10);
    expect(healthOf({ hits: [hit("2026-11-03", 3)], done: [], rest, today }).hp).toBe(7);
  });

  it("last week summed up: done, missed, levels, rest days", () => {
    const health = healthOf({ hits: [hit("2026-11-10", 1), hit("2026-11-11", 1)], done: [exp("2026-11-01", expFor(2)), exp("2026-11-12", 2)], rest: new Set(["2026-11-14"]), week: "2026-11-09", today: "2026-11-18" });
    expect(health.lastWeek).toEqual({ from: "2026-11-09", to: "2026-11-15", done: 2, hits: 2, hpLost: 2, levelFrom: 2, levelTo: 2, knockouts: 0, freezes: 0, comebacks: 0, rested: 1 });
  });
});

describe("rest days", () => {
  it("settleRest: days gone by stay, days from today are the new ones', old ones go", () => {
    const today = "2026-11-10";
    const before = [{ from: "2026-11-08", to: "2026-11-12" }, { from: "2026-08-01", to: "2026-08-02" }];
    // Taking the whole rest back leaves the days already gone by; a new one from yesterday starts today.
    expect(settleRest(before, [{ from: "2026-11-09", to: "2026-11-11" }], today)).toEqual([
      { from: "2026-11-08", to: "2026-11-09" },
      { from: "2026-11-10", to: "2026-11-11" },
    ]);
    expect(settleRest([], [{ from: "2026-11-01", to: "2026-11-05" }], today)).toEqual([]);
  });

  it("restDays: every day of the ranges, in a window if given", () => {
    expect([...restDays([{ from: "2026-11-01", to: "2026-11-03" }], "2026-11-02")]).toEqual(["2026-11-02", "2026-11-03"]);
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

  it("a deadline gone by with its task open hits the day after, for half a heart whatever it was worth", () => {
    const rows = [
      row({ id: "essay", deadlineDate: "2026-11-08", value: 5 }),
      row({ id: "draft", parentId: "essay", value: 3 }),
      row({ id: "outline", parentId: "essay", value: 4, isComplete: true, completedOn: "2026-11-05" }),
      row({ id: "habit", parentId: "essay", isPersistent: true, value: 9 }),
    ];
    expect(missesOf(rows, today, since)).toEqual([{ key: "deadline:essay:2026-11-08", kind: "deadline", taskId: "essay", title: "essay", day: "2026-11-09", damage: 1 }]);
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
    expect(missesOf(rows, today, since).map(({ taskId, damage }) => [taskId, damage])).toEqual([["soft", 1], ["late", 1]]);
  });

  it("each deadline that goes by hits anew in full, however often the task was postponed; one moved before its day is free", () => {
    const missedOn = (deadlineDate: string, day: string) => missesOf([row({ id: "late", deadlineDate, value: 6 })], day, since);
    expect(missedOn("2026-11-12", today)).toEqual([]);
    expect(missedOn("2026-11-05", "2026-11-06").map(({ key, damage }) => [key, damage])).toEqual([["deadline:late:2026-11-05", 1]]);
    expect(missedOn("2026-11-08", "2026-11-09").map(({ key, damage }) => [key, damage])).toEqual([["deadline:late:2026-11-08", 1]]);
  });

  it("not a deadline under a persistent task: a press unticks it, so it would look missed however it was done", () => {
    const rows = [row({ id: "habit", isPersistent: true }), row({ id: "step", parentId: "habit", deadlineDate: "2026-11-05" }), row({ id: "deeper", parentId: "step" })];
    expect(missesOf(rows, today, since)).toEqual([]);
  });

  it("every round of a schedule whose day went by unpressed, a moved one on the day it was moved to", () => {
    const daily = row({ id: "walk", isPersistent: true, repeatEvery: 1, repeatUnit: "day", nextDue: "2026-11-07", roundMoves: { "2026-11-08": "2026-11-12" } });
    const weekly = row({ id: "clean", isPersistent: true, repeatEvery: 1, repeatUnit: "week", nextDue: "2026-11-03", value: 1 });
    const keys = missesOf([daily, weekly, row({ id: "chore", parentId: "clean", value: 2 })], today, since).map(({ key, day, damage }) => [key, day, damage]);
    expect(keys).toEqual([
      ["round:walk:2026-11-07", "2026-11-08", 1],
      ["round:walk:2026-11-09", "2026-11-10", 1],
      ["round:clean:2026-11-03", "2026-11-04", 1],
    ]);
  });

  it("nothing missed on a rest day: no deadline, no round", () => {
    const rows = [row({ id: "essay", deadlineDate: "2026-11-08" }), row({ id: "walk", isPersistent: true, repeatEvery: 1, nextDue: "2026-11-07" })];
    const rest = new Set(["2026-11-07", "2026-11-08"]);
    expect(missesOf(rows, today, since, rest).map(({ key }) => key)).toEqual(["round:walk:2026-11-09"]);
  });

  it("no rounds before health came in, and none for a task without a schedule", () => {
    const rows = [row({ id: "walk", isPersistent: true, repeatEvery: 1, nextDue: "2026-10-27" }), row({ id: "whenever", isPersistent: true })];
    expect(missesOf(rows, "2026-10-31", since).map(({ key }) => key)).toEqual(["round:walk:2026-10-29", "round:walk:2026-10-30"]);
  });
});

describe("the streak freeze", () => {
  const today = "2026-11-20";
  const done = (...days: [string, number][]) => days.map(([day, count]) => ({ day, count }));

  it("a day with nothing done, written down, costs a level and keeps the streak; the exp keeps its share of the level", () => {
    // Lv 10 is reached at 247 and takes 103 exp: 60 into it, and as far into Lv 9 after.
    const health = healthOf({ hits: [], done: done(["2026-11-01", expFor(10) + 60]), missed: ["2026-11-02"], today });
    expect(health.freezes).toEqual([{ day: "2026-11-02", from: 10, to: 9 }]);
    expect(health.frozen).toEqual(["2026-11-02"]);
    const shown = levelOf(expFor(10) + 60 - health.lost);
    expect([shown.level, shown.into]).toEqual([9, Math.floor((60 / spanOf(10)) * spanOf(9))]);
  });

  it("one level a day; at Lv 1 the streak breaks, and nothing more is frozen until a day is done again", () => {
    const missed = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-07"];
    const health = healthOf({ hits: [], done: done(["2026-11-01", expFor(3)], ["2026-11-06", 1]), missed, today });
    expect(health.freezes.map(({ day, to }) => [day, to])).toEqual([["2026-11-02", 2], ["2026-11-03", 1]]);
    expect(health.level).toBe(1);
  });

  it("none before anything was done, none for a day not written down, none for a day done after all (synced late)", () => {
    expect(healthOf({ hits: [], done: done(["2026-11-05", expFor(5)]), missed: ["2026-11-03"], today }).freezes).toEqual([]);
    expect(healthOf({ hits: [], done: done(["2026-11-01", expFor(5)]), missed: [], today }).freezes).toEqual([]);
    expect(healthOf({ hits: [], done: done(["2026-11-01", expFor(5)], ["2026-11-02", 1]), missed: ["2026-11-02"], today }).freezes).toEqual([]);
  });

  it("a level lost to a freeze doesn't heal when it comes back", () => {
    // Lv 5 (14 hp) frozen down to 4 (12 hp), hit for 3, then back to Lv 5: still 9.
    const health = healthOf({ hits: [{ day: "2026-11-03", damage: 3 }], done: done(["2026-11-01", expFor(5)], ["2026-11-04", 30]), missed: ["2026-11-02"], today });
    expect(health).toMatchObject({ level: 5, hp: 9 });
  });

  it("missedDays: from the day after the first one done and `since`, 60 days back at most, to yesterday, those not written yet", () => {
    const days = done(["2026-11-10", 2], ["2026-11-12", 1]);
    expect(missedDays(days, new Set(), "2026-11-15", "2026-10-30")).toEqual(["2026-11-11", "2026-11-13", "2026-11-14"]);
    expect(missedDays(days, new Set(["2026-11-13"]), "2026-11-15", "2026-11-12")).toEqual(["2026-11-14"]);
    expect(missedDays(done(["2026-01-01", 1]), new Set(), "2026-11-15", "2026-01-01")[0]).toBe("2026-09-16");
    expect(missedDays([], new Set(), "2026-11-15", "2026-10-30")).toEqual([]);
    expect(missedDays(days, new Set(), "2026-11-15", "2026-10-30", new Set(["2026-11-13"]))).toEqual(["2026-11-11", "2026-11-14"]);
  });

  it("a rest day carries the streak with no level lost", () => {
    const health = healthOf({ hits: [], done: done(["2026-11-01", expFor(3)], ["2026-11-03", 1]), missed: [], rest: new Set(["2026-11-02"]), today });
    expect(health).toMatchObject({ freezes: [], frozen: ["2026-11-02"], level: 3 });
  });
});
