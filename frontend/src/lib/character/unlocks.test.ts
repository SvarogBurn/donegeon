import { describe, expect, it } from "vitest";
import { BODIES, BODY_BY_ID, DEFAULT_LOOK, type Look } from "./bodies";
import { defaultTitle, earnedTitles, shownTitle, TITLES, unseenOf } from "./titles";
import { bodyLock, choiceLock, daysProgress, earnedRewards, lockedIn, nextGoals, REWARDS, shownLook, tryOn, withoutLocked, type Progress, type Unlocks } from "./unlocks";

const start: Progress = { level: 1, longest: 0, current: 0, onTime: 0, mail: 0, returned: false, skills: [], presses: 0, frogs: 0, earlyDays: 0, onTimeRun: 0, busiestDay: 0, steady: false };
const at = (p: Partial<Progress>): Progress => ({ ...start, ...p });
const unlocks = (p: Partial<Progress> = {}, saved: Look = DEFAULT_LOOK, devMode = false, seen: string[] = []): Unlocks => ({ progress: at(p), devMode, saved, seen });
const skilled = (level: number) => [{ key: "list:a", name: "Cooking", level }];

describe("the rewards", () => {
  it("each name a body, or a choice some body has (only the human, for the human's own)", () => {
    for (const reward of REWARDS) {
      if (reward.body) expect(BODY_BY_ID.has(reward.body), reward.id).toBe(true);
      else {
        const bodies = reward.on ? [BODY_BY_ID.get(reward.on)!] : BODIES;
        const has = bodies.some((b) => b.options?.some((o) => o.id === reward.option && o.choices.some((c) => c.id === reward.choice)));
        expect(has, reward.id).toBe(true);
        expect(reward.name, reward.id).not.toBe(reward.choice);
      }
    }
    expect(new Set(REWARDS.map((r) => r.id)).size).toBe(REWARDS.length);
  });

  it("lock every choice of the human's clothes and extras but each row's first and None: nothing is left unearnable", () => {
    const free = new Set(["eyes", "nose", "hair", "fringe", "beard"]);
    for (const option of BODY_BY_ID.get("human")!.options ?? []) {
      if (free.has(option.id)) continue;
      for (const choice of option.choices.slice(1)) {
        if (choice.id !== "none") expect(choiceLock(unlocks(), "human", option.id, choice.id), `${option.id}:${choice.id}`).not.toBeNull();
      }
    }
  });

  it("give one piece a level from Lv 2 to Lv 19, and the sheep at Lv 5 and the dragon at Lv 30 of the bodies", () => {
    for (let level = 2; level <= 30; level++) {
      const fresh = earnedRewards(at({ level })).filter((r) => !earnedRewards(at({ level: level - 1 })).includes(r));
      expect(fresh.filter((r) => r.option).length, `Lv ${level}`).toBe(level <= 19 ? 1 : 0);
      expect(fresh.filter((r) => r.body).length, `Lv ${level}`).toBe([5, 30].includes(level) ? 1 : 0);
    }
    expect(earnedRewards(at({ level: 2 })).map((r) => r.id)).toEqual(["cane:metal"]);
    expect(choiceLock(unlocks({ level: 6 }), "human", "top", "dress")).toBeNull();
    expect(choiceLock(unlocks({ level: 7 }), "human", "top", "coat")).toBeNull();
  });

  it("give one piece a level of the best skill from Lv 2 to Lv 12: the things held first", () => {
    for (let level = 2; level <= 13; level++) {
      const fresh = earnedRewards(at({ skills: skilled(level) })).filter((r) => !earnedRewards(at({ skills: skilled(level - 1) })).includes(r));
      expect(fresh.length, `skill Lv ${level}`).toBe(level <= 12 ? 1 : 0);
    }
    expect(earnedRewards(at({ skills: [...skilled(1), { key: "tag:b", name: "Gym", level: 3 }] })).map((r) => r.id)).toEqual(["held:pencil", "held:laptop"]);
    expect(choiceLock(unlocks({ level: 40, skills: skilled(5) }), "wolf", "held", "bow")?.id).toBe("held:bow");
    expect(choiceLock(unlocks({ skills: skilled(6) }), "wolf", "held", "bow")).toBeNull();
  });

  it("never take back what more progress has earned", () => {
    const steps = [
      at({}),
      at({ level: 5 }),
      at({ level: 5, longest: 7, presses: 50 }),
      at({ level: 12, longest: 30, onTime: 10, presses: 50, frogs: 5, earlyDays: 10 }),
      at({ level: 40, longest: 100, onTime: 60, mail: 10, presses: 60, frogs: 9, earlyDays: 12, onTimeRun: 20, busiestDay: 25, steady: true, skills: skilled(12) }),
    ];
    for (let i = 1; i < steps.length; i++) {
      const before = earnedRewards(steps[i - 1]).map((r) => r.id);
      expect(earnedRewards(steps[i]).map((r) => r.id)).toEqual(expect.arrayContaining(before));
    }
    expect(earnedRewards(steps.at(-1)!).length).toBe(REWARDS.length);
  });
});

describe("locks", () => {
  it("lock the animals and pieces not yet earned, and open them once earned", () => {
    expect(bodyLock(unlocks(), "human")).toBeNull();
    expect(bodyLock(unlocks(), "wolf")?.id).toBe("body:wolf");
    expect(bodyLock(unlocks({ presses: 50 }), "wolf")).toBeNull();
    expect(bodyLock(unlocks({ level: 40, longest: 60, busiestDay: 24 }), "bunny")?.id).toBe("body:bunny");
    expect(bodyLock(unlocks({ busiestDay: 25 }), "bunny")).toBeNull();
    expect(bodyLock(unlocks({ mail: 9 }), "mice")?.id).toBe("body:mice");
    expect(bodyLock(unlocks({ mail: 10 }), "mice")).toBeNull();
    expect(bodyLock(unlocks({ frogs: 5 }), "frog")).toBeNull();
    expect(bodyLock(unlocks({ earlyDays: 10 }), "deer")).toBeNull();
    expect(bodyLock(unlocks({ onTimeRun: 20 }), "whitecat")).toBeNull();
    expect(bodyLock(unlocks({ longest: 100 }), "boar")?.id).toBe("body:boar");
    expect(bodyLock(unlocks({ steady: true }), "boar")).toBeNull();
    expect(bodyLock(unlocks({ level: 5 }), "sheep")).toBeNull();
    expect(bodyLock(unlocks({ level: 30 }), "dragon")).toBeNull();
    expect(bodyLock(unlocks({ longest: 100 }), "dragon")).toBeNull();
    expect(choiceLock(unlocks(), "human", "top", "shirt")?.id).toBe("top:shirt");
    expect(choiceLock(unlocks({ level: 3 }), "human", "top", "shirt")).toBeNull();
    expect(choiceLock(unlocks(), "human", "tail", "bushy")?.id).toBe("human:tail:bushy");
  });

  it("leave free what a body has of its own and every row's first choice", () => {
    expect(choiceLock(unlocks(), "wolf", "tail", "bushy")).toBeNull();
    expect(choiceLock(unlocks(), "wolf", "top", "own")).toBeNull();
    expect(choiceLock(unlocks(), "bunny", "ears", "up")).toBeNull();
    expect(choiceLock(unlocks(), "human", "top", "hoodie")).toBeNull();
    expect(choiceLock(unlocks(), "human", "hair", "afro")).toBeNull();
    expect(choiceLock(unlocks(), "human", "hat", "none")).toBeNull();
  });

  it("let whatever the saved look wears stay, and open everything in the hidden dev mode", () => {
    const saved: Look = { v: 2, body: "wolf", options: { glasses: "sunglasses" }, colors: {} };
    expect(bodyLock(unlocks({}, saved), "wolf")).toBeNull();
    expect(choiceLock(unlocks({}, saved), "human", "glasses", "sunglasses")).toBeNull();
    expect(BODIES.every((b) => !bodyLock(unlocks({}, DEFAULT_LOOK, true), b.id))).toBe(true);
  });

  it("lock every body but the human at the start", () => {
    expect(BODIES.filter((b) => !bodyLock(unlocks(), b.id)).map((b) => b.id)).toEqual(["human"]);
  });

  it("keep open what the sheet has announced, though its deed no longer counts (a skill taken off, tasks deleted)", () => {
    expect(choiceLock(unlocks({}, DEFAULT_LOOK, false, ["held:bow"]), "human", "held", "bow")).toBeNull();
    expect(bodyLock(unlocks({}, DEFAULT_LOOK, false, ["body:wolf"]), "wolf")).toBeNull();
    expect(bodyLock(unlocks({}, DEFAULT_LOOK, false, ["body:wolf"]), "deer")?.id).toBe("body:deer");
  });

  it("take off what was only tried on when saved, back to what was saved", () => {
    const saved: Look = { v: 2, body: "human", options: { top: "hoodie" }, colors: {} };
    const tried: Look = { v: 2, body: "wolf", options: { top: "blouse", hat: "fedora", glasses: "none" }, colors: { fur: "#FFFFFF" } };
    const u = unlocks({ level: 10 }, saved);
    expect(lockedIn(tried, u).map((r) => r.id)).toEqual(["body:wolf", "top:blouse"]);
    expect(withoutLocked(tried, u)).toEqual({ v: 2, body: "human", options: { top: "hoodie", hat: "fedora", glasses: "none" }, colors: { fur: "#FFFFFF" } });
    expect(lockedIn(withoutLocked(tried, u), u)).toEqual([]);
  });

  it("try a reward on: a body as itself, a piece on the human where the body hasn't got it", () => {
    const wolf: Look = { v: 2, body: "wolf", options: {}, colors: {} };
    expect(tryOn(wolf, REWARDS.find((r) => r.id === "body:frog")!).body).toBe("frog");
    expect(tryOn(wolf, REWARDS.find((r) => r.id === "top:shirt")!)).toMatchObject({ body: "wolf", options: { top: "shirt" } });
    expect(tryOn(wolf, REWARDS.find((r) => r.id === "human:tail:cat")!)).toMatchObject({ body: "human", options: { tail: "cat" } });
    expect(tryOn({ ...wolf, body: "dragon" }, REWARDS.find((r) => r.id === "hat:fedora")!).body).toBe("human");
  });
});

describe("daysProgress", () => {
  it("goes on across days the streak freeze kept, without counting them", () => {
    const days = ["2026-10-14", "2026-10-15", "2026-10-18"];
    expect(daysProgress(days, "2026-10-20", ["2026-10-16", "2026-10-17", "2026-10-19"])).toMatchObject({ longest: 3, current: 3 });
    expect(daysProgress(days, "2026-10-20", ["2026-10-16"])).toMatchObject({ longest: 2, current: 0 });
  });

  it("finds the longest and the current streak, and a comeback after a week away", () => {
    expect(daysProgress([], "2026-10-22")).toEqual({ longest: 0, current: 0, returned: false });
    expect(daysProgress(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-21"], "2026-10-22")).toEqual({ longest: 3, current: 1, returned: true });
    expect(daysProgress(["2026-10-20", "2026-10-21", "2026-10-22"], "2026-10-22")).toEqual({ longest: 3, current: 3, returned: false });
    expect(daysProgress(["2026-10-19", "2026-10-20"], "2026-10-22").current).toBe(0);
    // Seven days with nothing between is not yet a comeback's eight.
    expect(daysProgress(["2026-10-01", "2026-10-08"], "2026-10-08").returned).toBe(false);
    expect(daysProgress(["2026-10-01", "2026-10-09"], "2026-10-09").returned).toBe(true);
  });
});

describe("next goals", () => {
  it("name the next level's piece and the next streak's, with how far the streak is, and never a body", () => {
    expect(nextGoals(at({ level: 4, current: 2, longest: 2 }))).toEqual(["Round glasses at Lv 5", "Pencil at Lv 2 in a skill (pick one under Skills)", "Cat ears at a 3-day streak (2 / 3)"]);
    expect(nextGoals(at({ level: 4, skills: skilled(5) }))[1]).toBe("Bow at Lv 6 in a skill (Cooking is Lv 5)");
    // Never a body: only the puppy's ears and tail are named at 14 days.
    expect(nextGoals(at({ level: 4, current: 9, longest: 9 }))[2]).toBe("Puppy ears, Puppy tail at a 14-day streak (9 / 14)");
    expect(nextGoals(at({ level: 40, longest: 100, skills: skilled(12) }))).toEqual([]);
  });
});

describe("titles", () => {
  it("are short, and have ids of their own", () => {
    expect(new Set(TITLES.map((t) => t.id)).size).toBe(TITLES.length);
    for (const title of TITLES) expect(title.name.length, title.name).toBeLessThanOrEqual(20);
  });

  it("start as Scavenger and rise with the level", () => {
    expect(defaultTitle(start).name).toBe("Scavenger");
    expect(defaultTitle(at({ level: 3 })).name).toBe("Wanderer");
    expect(defaultTitle(at({ level: 41 })).name).toBe("Lord of the Donegeon");
  });

  it("show the one picked while it is earned, else the highest rank (a title typed before is no id)", () => {
    const p = at({ level: 8, longest: 7 });
    expect(shownTitle("steadfast", p).name).toBe("Steadfast");
    expect(shownTitle("undying", p).name).toBe("Torchbearer");
    expect(shownTitle("Scholar", p).name).toBe("Torchbearer");
  });

  it("come from deeds and skills too", () => {
    const names = earnedTitles(at({ mail: 1, returned: true, onTime: 10, skills: [{ key: "list:a", name: "Cooking", level: 20 }] })).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Herald", "Returner", "Punctual", "Adept of Cooking", "Master of Cooking"]));
  });
});

describe("unseenOf", () => {
  it("names what was earned and not yet seen, never the starting title, and says when a level brought it", () => {
    expect(unseenOf(start, [])).toEqual({ rewards: [], titles: [], levelUp: false });
    const lv3 = unseenOf(at({ level: 3 }), []);
    expect(lv3.rewards.map((r) => r.id)).toEqual(["cane:metal", "top:shirt"]);
    expect(lv3.titles.map((t) => t.name)).toEqual(["Wanderer"]);
    expect(lv3.levelUp).toBe(true);
    const seen = [...lv3.rewards.map((r) => r.id), ...lv3.titles.map((t) => t.id)];
    expect(unseenOf(at({ level: 3 }), seen).rewards).toEqual([]);
    const streak = unseenOf(at({ level: 3, longest: 3 }), seen);
    expect(streak.rewards.map((r) => r.id)).toEqual(["human:ears:cat"]);
    expect(streak.levelUp).toBe(false);
  });
});

describe("a knockout", () => {
  const wearing: Look = { ...DEFAULT_LOOK, body: "sheep", options: { top: "shirt" } };
  const seen = ["top:shirt", "body:sheep", "body:wolf"];
  const knocked = (level: number): Unlocks => ({ ...unlocks({ level }, wearing, false, seen), knockedOut: true });

  it("takes back what levels earned, announced or worn, until the level is earned again", () => {
    expect(choiceLock(unlocks({ level: 2 }, wearing, false, seen), "human", "top", "shirt")).toBeNull();
    expect(choiceLock(knocked(2), "human", "top", "shirt")?.id).toBe("top:shirt");
    expect(bodyLock(knocked(4), "sheep")?.id).toBe("body:sheep");
    expect(choiceLock(knocked(3), "human", "top", "shirt")).toBeNull();
    expect(bodyLock(knocked(5), "sheep")).toBeNull();
  });

  it("leaves what a deed earned", () => {
    expect(bodyLock(knocked(1), "wolf")).toBeNull();
  });

  it("shows the look without it: the default body and each row's first where the saved one is gone too", () => {
    const { saved: _, ...u } = knocked(2);
    expect(shownLook(wearing, u)).toMatchObject({ body: "human", options: {} });
    expect(shownLook(wearing, { ...u, progress: at({ level: 5 }) })).toMatchObject({ body: "sheep", options: { top: "shirt" } });
  });
});
