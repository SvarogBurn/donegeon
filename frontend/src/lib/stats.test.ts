import { describe, expect, it } from "vitest";
import {
  countByDay,
  deadlineOutcomes,
  durationBuckets,
  earlyLateBuckets,
  groupStats,
  isOnTime,
  median,
  NO_GROUP,
  periodCounts,
  rangeStart,
  shareOverTime,
  streaks,
  typicalWeek,
  type Completion,
} from "./stats";
import { statTask } from "./stats.fixtures";

const TODAY = "2026-10-20";


const done = (day: string, task = statTask(), isPress = false): Completion => ({ day, task, at: new Date(`${day}T12:00:00`), isPress });

describe("streaks", () => {
  it("runs to today, or to yesterday while today is still empty", () => {
    const byDay = countByDay([done("2026-10-18"), done("2026-10-19")]);
    expect(streaks(byDay, TODAY)).toEqual({ current: 2, longest: 2 });
    expect(streaks(countByDay([done("2026-10-18"), done("2026-10-19"), done(TODAY)]), TODAY).current).toBe(3);
  });

  it("is broken by a day with nothing done, the longest run kept", () => {
    const byDay = countByDay(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-17", TODAY].map((day) => done(day)));
    expect(streaks(byDay, TODAY)).toEqual({ current: 1, longest: 3 });
  });

  it("goes on across days the streak freeze kept, without counting them; a gap only partly frozen still breaks it", () => {
    const byDay = countByDay(["2026-10-14", "2026-10-15", "2026-10-18"].map((day) => done(day)));
    expect(streaks(byDay, TODAY, ["2026-10-16", "2026-10-17", "2026-10-19"])).toEqual({ current: 3, longest: 3 });
    expect(streaks(byDay, TODAY, ["2026-10-16"])).toEqual({ current: 0, longest: 2 });
  });
});

describe("periodCounts", () => {
  it("counts whole rolling windows, today included, and the windows before them", () => {
    const byDay = countByDay([done(TODAY), done("2026-10-14"), done("2026-10-13"), done("2026-09-20"), done("2025-12-31")]);
    const counts = periodCounts(byDay, TODAY);
    expect(counts.today).toBe(1);
    // 14 Oct is the 7th day back; 13 Oct falls in the 7 before.
    expect(counts.last7).toBe(2);
    expect(counts.prev7).toBe(1);
    // The last 30 days start on 21 September: the 20th is in the 30 before them.
    expect(counts.last30).toBe(3);
    expect(counts.prev30).toBe(1);
    expect(counts.year).toBe(4);
    expect(counts.all).toBe(5);
  });
});

describe("typicalWeek", () => {
  it("is null until the history reaches back over the weeks it compares", () => {
    expect(typicalWeek(countByDay([done("2026-10-10")]), TODAY)).toBeNull();
  });

  it("is the median of the four weeks before the last 7 days", () => {
    const days = ["2026-10-12", "2026-10-11", "2026-10-05", "2026-10-04", "2026-09-27", "2026-09-20", "2026-09-13"];
    expect(typicalWeek(countByDay(days.map((day) => done(day))), TODAY)).toBe(1.5);
  });
});

describe("rangeStart and median", () => {
  it("counts today in a range; all time has no start", () => {
    expect(rangeStart(TODAY, "7")).toBe("2026-10-14");
    expect(rangeStart(TODAY, "all")).toBeNull();
  });

  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("deadlineOutcomes", () => {
  it("counts finished tasks by how early they were, and open ones past their deadline as late", () => {
    const early = statTask({ id: "early", deadlineDate: "2026-10-10", completedOn: "2026-10-08", isOpen: false });
    const late = statTask({ id: "late", deadlineDate: "2026-10-10", completedOn: "2026-10-12", isOpen: false });
    const overdue = statTask({ id: "overdue", deadlineDate: "2026-10-15" });
    const notYet = statTask({ id: "notYet", deadlineDate: "2026-10-25" });
    const persistent = statTask({ id: "persistent", deadlineDate: "2026-10-01", isPersistent: true });
    const outcomes = deadlineOutcomes([early, late, overdue, notYet, persistent], TODAY);
    expect(outcomes.map((o) => [o.task.id, o.early, o.isOpen, o.day])).toEqual([
      ["early", 2, false, "2026-10-08"],
      ["late", -2, false, "2026-10-12"],
      ["overdue", -5, true, "2026-10-15"],
    ]);
    expect(outcomes.filter(isOnTime).map((o) => o.task.id)).toEqual(["early"]);
  });

  it("puts settled deadlines in fixed rows, the open ones in a row of their own", () => {
    const outcomes = deadlineOutcomes(
      [
        statTask({ deadlineDate: "2026-10-10", completedOn: "2026-10-10", isOpen: false }),
        statTask({ deadlineDate: "2026-10-10", completedOn: "2026-10-20", isOpen: false }),
        statTask({ deadlineDate: "2026-10-15" }),
      ],
      TODAY,
    );
    const rows = Object.fromEntries(earlyLateBuckets(outcomes).map((b) => [b.label, b.count]));
    expect(rows).toMatchObject({ "On the day": 1, "7+ days late": 1, "Still open, overdue": 1 });
  });
});

describe("durationBuckets", () => {
  it("keeps every bucket, empty ones too, shortest first", () => {
    const buckets = durationBuckets([0, 1, 2, 3, 8, 100]);
    expect(buckets.map((b) => b.label)).toEqual(["Same day", "1 day", "2-3 days", "4-7 days", "8-14 days", "15-30 days", "31-90 days", "Over 90 days"]);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 2, 0, 1, 0, 0, 1]);
  });
});

describe("groupStats", () => {
  it("counts a task under each of its goals, and one with none under the empty group", () => {
    const two = statTask({ id: "two", goalIds: ["g1", "g2"] });
    const none = statTask({ id: "none" });
    const groups = groupStats("goal", [done(TODAY, two), done(TODAY, none)], [], [], [none]);
    expect(groups.get("g1")?.done).toBe(1);
    expect(groups.get("g2")?.done).toBe(1);
    expect(groups.get(NO_GROUP)).toMatchObject({ done: 1, open: 1 });
  });
});

describe("shareOverTime", () => {
  it("picks days for a week or less, weeks for a few, months beyond, newest six periods", () => {
    expect(shareOverTime("list", [], "2026-10-15", TODAY).unit).toBe("day");
    expect(shareOverTime("list", [], "2026-09-20", TODAY).unit).toBe("week");
    const months = shareOverTime("list", [], "2025-10-01", TODAY);
    expect(months.unit).toBe("month");
    expect(months.periods).toHaveLength(6);
    expect(months.periods.at(-1)?.key).toBe("2026-10");
  });
});
