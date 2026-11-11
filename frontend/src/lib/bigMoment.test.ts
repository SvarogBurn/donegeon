import { describe, expect, it } from "vitest";
import { bigEveryIn, BIG_EVERY, bigKindsIn, calmIn, celebrate, celebrateLevel, celebrateStreak, getBigMoment, isBigMoment, isStreakMilestone, kindOf, levelKindsIn, levelReached, milestoneOffIn, onBigMoment, popCheer, soundOffIn, streakAfterFirst, streakOffIn } from "./bigMoment";

describe("isBigMoment", () => {
  it("comes at each multiple", () => {
    expect([9, 10, 11, 20].map((n) => isBigMoment(n, 10))).toEqual([false, true, false, true]);
  });
  it("never comes when it is off, or at nothing done", () => {
    expect(isBigMoment(10, null)).toBe(false);
    expect(isBigMoment(0, 10)).toBe(false);
  });
});

describe("the settings", () => {
  it("start with sounds on and the default count", () => {
    expect(soundOffIn(null)).toBe(false);
    expect(bigEveryIn(null)).toBe(BIG_EVERY);
    expect(bigEveryIn({})).toBe(BIG_EVERY);
  });
  it("read what was saved", () => {
    expect(soundOffIn({ soundOff: true })).toBe(true);
    expect(bigEveryIn({ bigEvery: 5 })).toBe(5);
    expect(bigEveryIn({ bigEvery: null })).toBeNull();
  });
  it("tick every kind until some are unticked", () => {
    expect(bigKindsIn(null)).toEqual(["lightning", "confetti"]);
    expect(bigKindsIn({ bigOff: ["lightning"] })).toEqual(["confetti"]);
    expect(bigKindsIn({ bigOff: ["lightning", "confetti"] })).toEqual([]);
    expect(bigKindsIn({ bigOff: "lightning" })).toEqual(["lightning", "confetti"]);
  });
  it("start out of Distraction free, and read it when saved", () => {
    expect(calmIn(null)).toBe(false);
    expect(calmIn({ calm: true })).toBe(true);
    expect(calmIn({ calm: "yes" })).toBe(false);
  });
  it("ignore nonsense", () => {
    expect(bigEveryIn({ bigEvery: "a lot" })).toBe(BIG_EVERY);
    expect(bigEveryIn({ bigEvery: 0 })).toBe(BIG_EVERY);
  });
});

describe("kindOf", () => {
  it("starts with lightning, then takes turns", () => {
    expect([1, 2, 3, 4].map((turn) => kindOf(turn))).toEqual(["lightning", "confetti", "lightning", "confetti"]);
  });
  it("takes turns among the kinds ticked, and is the words alone with none", () => {
    expect([1, 2, 3].map((turn) => kindOf(turn, ["confetti"]))).toEqual(["confetti", "confetti", "confetti"]);
    expect(kindOf(1, [])).toBe("words");
  });
});

describe("popCheer", () => {
  it("brings a pop, afresh each time", () => {
    let heard = 0;
    const stop = onBigMoment(() => heard++);
    popCheer();
    const first = getBigMoment();
    popCheer();
    stop();
    expect(first).toMatchObject({ kind: "cheer", count: 0 });
    expect(getBigMoment()?.id).toBe(first!.id + 1);
    expect(heard).toBe(2);
  });
  it("doesn't take a turn from the moments", () => {
    celebrate(10, 10);
    const before = getBigMoment()!.kind;
    popCheer();
    celebrate(20, 10);
    expect(getBigMoment()!.kind).toBe(before === "lightning" ? "confetti" : "lightning");
  });
  it("carries the cheers that came in, and none for one sent", () => {
    const cheers = [{ id: "1", username: "ann", line: "Well done!" as const }];
    popCheer(cheers);
    expect(getBigMoment()?.cheers).toEqual(cheers);
    popCheer();
    expect(getBigMoment()?.cheers).toEqual([]);
  });
});

describe("the streak moment", () => {
  it("is on until switched off", () => {
    expect(streakOffIn(null)).toBe(false);
    expect(streakOffIn({ streakOff: true })).toBe(true);
  });
  it("says day 1 with nothing done yesterday", () => {
    expect(streakAfterFirst([], "2026-11-11")).toBe(1);
    expect(streakAfterFirst(["2026-11-08", "2026-11-09"], "2026-11-11")).toBe(1);
  });
  it("adds today to the days before", () => {
    expect(streakAfterFirst(["2026-11-08", "2026-11-09", "2026-11-10"], "2026-11-11")).toBe(4);
  });
  it("doesn't count today twice when the days have it already", () => {
    expect(streakAfterFirst(["2026-11-10", "2026-11-11"], "2026-11-11")).toBe(2);
  });
  it("goes on across a day the freeze kept", () => {
    expect(streakAfterFirst(["2026-11-08", "2026-11-09"], "2026-11-11", ["2026-11-10"])).toBe(3);
  });
  it("is a moment of its own, with the streak", () => {
    celebrateStreak(5);
    expect(getBigMoment()).toMatchObject({ kind: "streak", count: 5 });
  });
});

describe("the milestones", () => {
  it("are on, with both level-up looks, until switched off", () => {
    expect(milestoneOffIn(null)).toBe(false);
    expect(milestoneOffIn({ milestoneOff: true })).toBe(true);
    expect(levelKindsIn(null)).toEqual(["pillar", "banner"]);
    expect(levelKindsIn({ levelOff: ["pillar"] })).toEqual(["banner"]);
    expect(levelKindsIn({ levelOff: "pillar" })).toEqual(["pillar", "banner"]);
  });
});

describe("levelReached", () => {
  const today = "2026-11-11";
  it("is the level a task crosses into: Lv 2 at 5 exp, Lv 10 at 247", () => {
    expect(levelReached([{ day: "2026-11-10", count: 4 }], today, 1, 0, 0)).toBe(2);
    expect(levelReached([{ day: "2026-11-10", count: 240 }], today, 7, 0, 0)).toBe(10);
  });
  it("is null in the middle of a level", () => {
    expect(levelReached([{ day: "2026-11-10", count: 4 }], today, 2, 0, 0)).toBeNull();
    expect(levelReached([], today, 1, 0, 0)).toBeNull();
  });
  it("takes today's count from the tick, whether the days have it already or not", () => {
    expect(levelReached([{ day: "2026-11-10", count: 3 }], today, 2, 0, 0)).toBe(2);
    expect(levelReached([{ day: "2026-11-10", count: 3 }, { day: today, count: 1 }], today, 2, 0, 0)).toBe(2);
  });
  it("counts the mails sent and takes off what knockouts took", () => {
    expect(levelReached([{ day: "2026-11-10", count: 2 }], today, 1, 2, 0)).toBe(2);
    expect(levelReached([{ day: "2026-11-10", count: 6 }], today, 1, 0, 2)).toBe(2);
  });
});

describe("isStreakMilestone", () => {
  it("comes on the days a streak title is earned on", () => {
    expect([3, 7, 14, 30, 60, 100].every(isStreakMilestone)).toBe(true);
  });
  it("comes every 100 days past the last", () => {
    expect([200, 300].every(isStreakMilestone)).toBe(true);
  });
  it("is not on any other day", () => {
    expect([1, 2, 8, 50, 150].some(isStreakMilestone)).toBe(false);
  });
});

describe("the milestone moments", () => {
  it("are a streak marked a milestone", () => {
    celebrateStreak(7, true);
    expect(getBigMoment()).toMatchObject({ kind: "streak", count: 7, milestone: true });
    celebrateStreak(5);
    expect(getBigMoment()?.milestone).toBeUndefined();
  });
  it("take turns among the level-up looks ticked", () => {
    celebrateLevel(4);
    const first = getBigMoment()!.kind;
    celebrateLevel(10);
    expect(getBigMoment()).toMatchObject({ kind: first === "pillar" ? "banner" : "pillar", count: 10 });
    celebrateLevel(5, ["banner"]);
    expect(getBigMoment()).toMatchObject({ kind: "banner", count: 5 });
  });
  it("bring nothing with every look unticked", () => {
    celebrateStreak(2);
    const before = getBigMoment();
    celebrateLevel(6, []);
    expect(getBigMoment()).toBe(before);
  });
});
