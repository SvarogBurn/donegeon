import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK } from "./character/bodies";
import { cardBasics, cardSheet, shownActivity, shownStats } from "./people";

const days = [
  { day: "2026-11-01", count: 5 },
  { day: "2026-11-02", count: 2 },
  { day: "2026-11-03", count: 3 },
];
// 2026-11-03 is a Tuesday.
const basics = { exp: 12, look: DEFAULT_LOOK, streak: 4, days, today: "2026-11-03", hearts: { hp: 6, max: 10 } };

describe("cardBasics", () => {
  it("has only the character and level with nothing shared", () => {
    expect(cardBasics({ ...basics, shares: [] })).toEqual({ level: 3, into: 0, span: 10, look: DEFAULT_LOOK });
  });

  it("counts this week from Monday, and adds what is shared", () => {
    const card = cardBasics({ ...basics, shares: ["activity", "hearts"] });
    expect(card.activity).toEqual({ day: "2026-11-03", streak: 4, week: 5 });
    expect(card.hearts).toEqual({ hp: 6, max: 10 });
  });

  it("carries nothing of the health but the numbers", () => {
    const hearts = { hp: 6, max: 10, recent: [{ title: "Therapy homework" }], knockouts: [] } as { hp: number; max: number };
    expect(JSON.stringify(cardBasics({ ...basics, hearts, shares: ["hearts"] }))).not.toContain("Therapy");
  });
});

describe("cardSheet", () => {
  const sheet = { title: "Outsider", stats: [{ key: "ever" as const, stat: { value: 40, label: "done ever" } }], skills: [{ name: "Reading", exp: 6, color: "#123456" }, { name: "", exp: 1 }], today: "2026-11-03" };

  it("has only the title with nothing shared", () => {
    expect(cardSheet({ ...sheet, shares: [] })).toEqual({ title: "Outsider" });
  });

  it("carries a stat's numbers, not its label", () => {
    expect(cardSheet({ ...sheet, shares: ["stats"] }).stats).toEqual({ day: "2026-11-03", rows: [{ key: "ever", value: 40 }] });
  });

  it("carries a skill's name and level, and none not named yet", () => {
    expect(cardSheet({ ...sheet, shares: ["skills"] }).skills).toEqual([{ name: "Reading", level: 2, into: 1, span: 7, color: "#123456" }]);
  });
});

describe("shownActivity", () => {
  const activity = { day: "2026-11-03", streak: 4, week: 5 };

  it("shows it as it is today and tomorrow", () => {
    expect(shownActivity(activity, "2026-11-03")).toEqual({ streak: 4, week: 5, lastHere: null });
    expect(shownActivity(activity, "2026-11-04")).toEqual({ streak: 4, week: 5, lastHere: null });
  });

  it("doesn't claim a streak from before yesterday", () => {
    expect(shownActivity(activity, "2026-11-05")).toEqual({ streak: null, week: 5, lastHere: "2026-11-03" });
  });

  it("counts 0 for a week gone by", () => {
    expect(shownActivity(activity, "2026-11-09").week).toBe(0);
  });

  it("copes with a viewer a day behind, in another time zone", () => {
    expect(shownActivity(activity, "2026-11-02")).toEqual({ streak: 4, week: 5, lastHere: null });
  });
});

describe("shownStats", () => {
  it("names a stat itself, and leaves out one it doesn't know", () => {
    expect(shownStats([{ key: "ever", value: 40 }, { key: "<b>rude</b>", value: 1 }])).toEqual([{ key: "ever", value: 40, name: "Done ever" }]);
  });
});
