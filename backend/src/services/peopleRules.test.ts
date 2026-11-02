import { describe, expect, it } from "vitest";
import { afterSettings, canCheer, canSee, cardFor, cheerPush, keptOfCard, type Person, type Relation } from "./peopleRules.js";

const person = (id: string, more: Partial<Person> = {}): Person => ({ id, peopleOff: false, shares: [], cheersOff: false, ...more });
const strangers: Relation = { isFriend: false, isBlocked: false };
const friends: Relation = { isFriend: true, isBlocked: false };
const blocked: Relation = { isFriend: true, isBlocked: true };

describe("canSee", () => {
  it("always sees yourself, even Off", () => {
    expect(canSee(person("a", { peopleOff: true }), person("a", { peopleOff: true }), strangers)).toBe(true);
  });

  it("friends see each other", () => {
    expect(canSee(person("a"), person("b"), friends)).toBe(true);
  });

  it("strangers never see each other", () => {
    expect(canSee(person("a"), person("b"), strangers)).toBe(false);
  });

  it("Off hides both ways, friends too", () => {
    expect(canSee(person("a", { peopleOff: true }), person("b"), friends)).toBe(false);
    expect(canSee(person("a"), person("b", { peopleOff: true }), friends)).toBe(false);
  });

  it("a block beats everything", () => {
    expect(canSee(person("a"), person("b"), blocked)).toBe(false);
  });
});

describe("canCheer", () => {
  it("needs both to see each other and have cheers on", () => {
    expect(canCheer(person("a"), person("b"), friends)).toBe(true);
    expect(canCheer(person("a"), person("b"), strangers)).toBe(false);
    expect(canCheer(person("a", { cheersOff: true }), person("b"), friends)).toBe(false);
    expect(canCheer(person("a"), person("b", { cheersOff: true }), friends)).toBe(false);
  });

  it("not yourself", () => {
    expect(canCheer(person("a"), person("a"), strangers)).toBe(false);
  });
});

describe("cheerPush", () => {
  it("says the cheer, signed", () => {
    expect(cheerPush({ id: "a", username: "gabriel" }, "Keep going!")).toMatchObject({ body: "Keep going!\n-gabriel", tag: "cheer:a" });
  });
});

const card = { level: 3, into: 1, span: 7, title: "Outsider", look: { v: 2 }, activity: { day: "2026-11-02", streak: 4, week: 9 }, skills: [{ name: "Reading" }], hearts: { hp: 4, max: 10 } };

describe("cardFor", () => {
  it("shows only the base when nothing is shared", () => {
    expect(cardFor({ card, shares: [] }, { shares: [] })).toEqual({ level: 3, into: 1, span: 7, title: "Outsider", look: { v: 2 } });
  });

  it("shows a section only if both share it", () => {
    expect(cardFor({ card, shares: ["skills", "activity"] }, { shares: ["skills"] })).toMatchObject({ skills: card.skills });
    expect(cardFor({ card, shares: ["skills", "activity"] }, { shares: ["skills"] })).not.toHaveProperty("activity");
    expect(cardFor({ card, shares: ["skills"] }, { shares: ["activity"] })).not.toHaveProperty("skills");
  });

  it("never passes on anything else that got into the card", () => {
    expect(cardFor({ card: { ...card, secret: "x" }, shares: ["skills"] }, { shares: ["skills"] })).not.toHaveProperty("secret");
  });

  it("is empty with nothing published", () => {
    expect(cardFor({ card: null, shares: ["skills"] }, { shares: ["skills"] })).toEqual({});
  });
});

describe("keptOfCard", () => {
  it("drops the sections not shared", () => {
    expect(keptOfCard(card, ["hearts"])).toEqual({ level: 3, into: 1, span: 7, title: "Outsider", look: { v: 2 }, hearts: card.hearts });
  });
});

describe("afterSettings", () => {
  const before = { shares: ["activity", "hearts"], card, healthOff: false };

  it("Off clears the card", () => {
    expect(afterSettings(before, { peopleOff: true }).card).toBeNull();
  });

  it("a share taken away takes its section", () => {
    const after = afterSettings(before, { shares: ["hearts"] });
    expect(after.shares).toEqual(["hearts"]);
    expect(after.card).not.toHaveProperty("activity");
    expect(after.card).toHaveProperty("hearts");
  });

  it("skills taken away take the title, which may carry a skill's name", () => {
    expect(afterSettings({ ...before, shares: ["skills"], card: { ...card, title: "Adept of Therapy" } }, { shares: [] }).card).not.toHaveProperty("title");
    expect(afterSettings({ ...before, shares: ["skills", "activity"] }, { shares: ["skills"] }).card).toHaveProperty("title");
  });

  it("health off takes the hearts, and they can't be shared while it is", () => {
    expect(afterSettings(before, { healthOff: true }).shares).toEqual(["activity"]);
    expect(afterSettings({ ...before, healthOff: true }, { shares: ["hearts", "stats"] }).shares).toEqual(["stats"]);
  });

  it("leaves no card where there was none", () => {
    expect(afterSettings({ ...before, card: null }, { shares: [] }).card).toBeNull();
  });
});
