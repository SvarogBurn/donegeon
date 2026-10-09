import { describe, expect, it } from "vitest";
import { activeToken, parseShortSyntax, type SyntaxContext } from "./shortSyntax";

// A Friday.
const ctx: SyntaxContext = {
  today: "2026-10-09",
  tags: [
    { id: "t1", name: "home" },
    { id: "t2", name: "Deep work" },
  ],
  goals: [{ id: "g1", name: "Fitness" }],
  lists: [
    { id: "l1", name: "Chores" },
    { id: "l2", name: "Side projects" },
  ],
  depth: 0,
};
const parse = (text: string, depth = 0) => parseShortSyntax(text, { ...ctx, depth });

describe("parseShortSyntax", () => {
  it("leaves a plain title alone", () => {
    const parsed = parse("Buy milk");
    expect(parsed).toMatchObject({ title: "Buy milk", tagIds: [], goalIds: [], today: false, tokens: [] });
  });

  it("reads tags: known ones by id whatever the case, unknown ones as new", () => {
    expect(parse("Sweep #HOME #urgent")).toMatchObject({ title: "Sweep", tagIds: ["t1"], newTags: ["urgent"] });
    expect(parse("#home sweep #home").tagIds).toEqual(["t1"]);
    expect(parse("a #New b #new").newTags).toEqual(["New"]);
  });

  it("matches the longest known name, spaces and all", () => {
    expect(parse("#deep work on essay")).toMatchObject({ title: "on essay", tagIds: ["t2"], newTags: [] });
    expect(parse("#deep workout")).toMatchObject({ title: "workout", newTags: ["deep"] });
  });

  it("reads goals", () => {
    expect(parse("Run ^fitness ^Money")).toMatchObject({ title: "Run", goalIds: ["g1"], newGoals: ["Money"] });
  });

  it("reads @ as a hard and ~ as a soft deadline", () => {
    expect(parse("Essay @tomorrow")).toMatchObject({ title: "Essay", deadlineDate: "2026-10-10", deadlineType: "hard" });
    expect(parse("Essay ~mon")).toMatchObject({ title: "Essay", deadlineDate: "2026-10-12", deadlineType: "soft" });
  });

  it("reads every way of writing a day", () => {
    const day = (words: string) => parse(`x ~${words}`).deadlineDate;
    expect(day("today")).toBe("2026-10-09");
    expect(day("tmr")).toBe("2026-10-10");
    expect(day("fri")).toBe("2026-10-16");
    expect(day("Saturday")).toBe("2026-10-10");
    expect(day("thurs")).toBe("2026-10-15");
    expect(day("next week")).toBe("2026-10-16");
    expect(day("next month")).toBe("2026-11-09");
    expect(day("in 3 days")).toBe("2026-10-12");
    expect(day("in 2 weeks")).toBe("2026-10-23");
    expect(day("3d")).toBe("2026-10-12");
    expect(day("0d")).toBe("2026-10-09");
    expect(day("2w")).toBe("2026-10-23");
    expect(day("25/12")).toBe("2026-12-25");
    expect(day("1/2")).toBe("2027-02-01");
    expect(day("25/12/27")).toBe("2027-12-25");
    expect(day("25 dec")).toBe("2026-12-25");
    expect(day("March 3")).toBe("2027-03-03");
    expect(day("31/2")).toBeUndefined();
  });

  it("takes @today and @now as do today, not as a deadline", () => {
    expect(parse("Water plants @today")).toMatchObject({ title: "Water plants", today: true });
    expect(parse("Water plants @today").deadlineDate).toBeUndefined();
    expect(parse("@now Water plants")).toMatchObject({ title: "Water plants", today: true });
    expect(parse("x @today @fri")).toMatchObject({ today: true, deadlineDate: "2026-10-16" });
  });

  it("reads schedules", () => {
    expect(parse("Vacuum @every 2 weeks").repeat).toEqual({ every: 2, unit: "week", nextDue: "2026-10-09" });
    expect(parse("Vacuum @daily").repeat).toEqual({ every: 1, unit: "day", nextDue: "2026-10-09" });
    expect(parse("Vacuum @every month").repeat).toEqual({ every: 1, unit: "month", nextDue: "2026-10-09" });
    expect(parse("Bins @every fri").repeat).toEqual({ every: 1, unit: "week", nextDue: "2026-10-09" });
    expect(parse("Bins @every tue")).toMatchObject({ title: "Bins", repeat: { every: 1, unit: "week", nextDue: "2026-10-13" } });
  });

  it("reads points and a list", () => {
    expect(parse("Oven 20p /chores")).toMatchObject({ title: "Oven", points: 20, listId: "l1" });
    expect(parse("Game /side projects now")).toMatchObject({ title: "Game now", listId: "l2" });
  });

  it("keeps the title tidy around shortcuts in the middle", () => {
    expect(parse("Pay rent @25/12 #home ^Money 5p @today").title).toBe("Pay rent");
    expect(parse("Pay #home rent").title).toBe("Pay rent");
    expect(parse("Pay #home\nrent").title).toBe("Pay\nrent");
  });

  it("is not fooled by text that only looks like a shortcut", () => {
    for (const title of ["a#b", "Fix bug #123", "mail bob@example.com", "@bob knows", "~5 minutes", "and/or", "/etc/hosts", "x1080p", "wait ~ a bit", "@sunny day", "~25 janitors", "in 3 dogs ~in 3 dogs"]) {
      expect(parse(title)).toMatchObject({ title, tokens: [] });
    }
  });

  it("keeps what a backslash is in front of", () => {
    expect(parse("Fix \\#home sign")).toMatchObject({ title: "Fix #home sign", tagIds: [] });
    expect(parse("Watch \\1080p film")).toMatchObject({ title: "Watch 1080p film", tokens: [] });
  });

  it("lets the first deadline or schedule win, and leaves the rest as text", () => {
    expect(parse("x @fri ~mon")).toMatchObject({ title: "x ~mon", deadlineDate: "2026-10-16", deadlineType: "hard" });
    expect(parse("x @daily @fri")).toMatchObject({ title: "x @fri", repeat: { every: 1 } });
    expect(parse("x @daily @fri").deadlineDate).toBeUndefined();
    expect(parse("x @fri @daily")).toMatchObject({ title: "x @daily", deadlineDate: "2026-10-16" });
    expect(parse("x @fri @daily").repeat).toBeUndefined();
    expect(parse("x 5p 6p")).toMatchObject({ title: "x 6p", points: 5 });
  });

  it("leaves out what a subtask can't have", () => {
    expect(parse("x @fri /chores @daily", 1)).toMatchObject({ title: "x /chores @daily", deadlineDate: "2026-10-16" });
    expect(parse("x @fri #home @today 3p", 2)).toMatchObject({ title: "x @fri", tagIds: ["t1"], today: true, points: 3 });
  });

  it("says where each shortcut was typed", () => {
    expect(parse("Run ^fitness 5p").tokens).toEqual([
      { start: 4, end: 12, kind: "goal", label: "^Fitness" },
      { start: 13, end: 15, kind: "points", label: "5 pts" },
    ]);
  });
});

describe("activeToken", () => {
  const at = (text: string, depth = 0) => activeToken(text, text.length, { ...ctx, depth });
  const inserts = (text: string, depth = 0) => at(text, depth)?.suggestions.map((s) => s.insert);

  it("offers known names, and making a new one", () => {
    expect(inserts("Sweep #")).toEqual(["#home", "#Deep work"]);
    expect(inserts("Sweep #ho")).toEqual(["#home", "#ho"]);
    expect(inserts("Sweep #home")).toEqual(["#home"]);
    expect(inserts("Sweep #deep w")).toEqual(["#Deep work"]);
    expect(inserts("x /s")).toEqual(["/Side projects", "/Chores"]);
  });

  it("offers only days and schedules that are read back as such", () => {
    const all = [...(inserts("x @") ?? []), ...(inserts("x @e") ?? []), ...(inserts("x @m") ?? []), ...(inserts("x @n") ?? []), ...(inserts("x ~") ?? [])];
    expect(all.length).toBeGreaterThan(15);
    for (const insert of all) expect(parse(`x ${insert}`), insert).toMatchObject({ title: "x" });
    expect(inserts("x @to")).toEqual(["@today", "@tomorrow"]);
    expect(at("x @25/12")?.suggestions).toEqual([{ insert: "@25/12", detail: "hard Fri 25/12" }]);
  });

  it("is over once the shortcut is", () => {
    expect(at("Sweep #home now")).toBeNull();
    expect(at("Sweep @fri and")).toBeNull();
    expect(at("plain text")).toBeNull();
    expect(at("mail bob@ex")).toBeNull();
  });

  it("offers a subtask no list and no schedule", () => {
    expect(inserts("x /", 1)).toEqual([]);
    expect(inserts("x @da", 1)).toEqual([]);
  });
});
