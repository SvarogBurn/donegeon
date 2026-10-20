import { describe, expect, it } from "vitest";
import { formatDay, parseDay, parseDayWords, parseRepeatWords } from "./dates";

// A Tuesday.
const TODAY = "2026-10-20";

describe("parseDay", () => {
  it("reads a date day first, with or without the year, in any of the usual separators", () => {
    expect(parseDay("7/10/2026")).toBe("2026-10-07");
    expect(parseDay("07.10.26")).toBe("2026-10-07");
    expect(parseDay("7-10", 2027)).toBe("2027-10-07");
  });

  it("refuses what is not a real day", () => {
    expect(parseDay("30/2/2026")).toBeNull();
    expect(parseDay("13/13")).toBeNull();
    expect(parseDay("soon")).toBeNull();
  });
});

describe("parseDayWords", () => {
  const day = (text: string) => parseDayWords(text, TODAY)?.day ?? null;

  it("reads days said in words", () => {
    expect(day("today")).toBe(TODAY);
    expect(day("tomorrow")).toBe("2026-10-21");
    expect(day("next week")).toBe("2026-10-27");
    expect(day("in 3 days")).toBe("2026-10-23");
    expect(day("2w")).toBe("2026-11-03");
  });

  it("takes a weekday as the next one, never today", () => {
    expect(day("fri")).toBe("2026-10-23");
    expect(day("tuesday")).toBe("2026-10-27");
  });

  it("puts a day and month without a year in the coming year once it has passed", () => {
    expect(day("25/12")).toBe("2026-12-25");
    expect(day("1 jan")).toBe("2027-01-01");
    expect(day("oct 19")).toBe("2027-10-19");
  });

  it("says how much of the text was the day, and takes nothing that only looks like one", () => {
    expect(parseDayWords("fri buy milk", TODAY)).toEqual({ day: "2026-10-23", length: 3 });
    expect(day("in 3 dogs")).toBeNull();
    expect(day("sunny")).toBeNull();
    expect(day("janitor")).toBeNull();
  });
});

describe("parseRepeatWords", () => {
  it("reads schedules, starting today", () => {
    expect(parseRepeatWords("daily", TODAY)).toEqual({ every: 1, unit: "day", nextDue: TODAY, length: 5 });
    expect(parseRepeatWords("every 2 weeks", TODAY)).toMatchObject({ every: 2, unit: "week", nextDue: TODAY });
  });

  it("starts a weekday's schedule on the coming one, today if it is that day", () => {
    expect(parseRepeatWords("every fri", TODAY)?.nextDue).toBe("2026-10-23");
    expect(parseRepeatWords("every tue", TODAY)?.nextDue).toBe(TODAY);
  });

  it("takes nothing that isn't a schedule", () => {
    expect(parseRepeatWords("every 0 days", TODAY)).toBeNull();
    expect(parseRepeatWords("everything", TODAY)).toBeNull();
  });
});

describe("formatDay", () => {
  it("writes the day first, without the year", () => {
    expect(formatDay("2026-10-07")).toBe("07/10");
  });
});
