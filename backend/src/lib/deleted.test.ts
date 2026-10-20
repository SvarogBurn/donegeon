import { describe, expect, it } from "vitest";
import { RESTORABLE_MS, UNDO_WINDOW_MS } from "../../../shared/constants.js";
import { isRestorable, needsRestore } from "./deleted.js";

describe("isRestorable", () => {
  const now = Date.UTC(2026, 9, 18, 12, 0, 0);

  it("lets a delete be undone for a minute, longer than the page offers the undo", () => {
    expect(RESTORABLE_MS).toBeGreaterThan(UNDO_WINDOW_MS);
    expect(isRestorable(new Date(now - 10_000), now)).toBe(true);
    expect(isRestorable(new Date(now - RESTORABLE_MS), now)).toBe(true);
  });

  it("refuses once that minute is over", () => {
    expect(isRestorable(new Date(now - RESTORABLE_MS - 1), now)).toBe(false);
    expect(isRestorable(new Date(now - 30 * 24 * 60 * 60 * 1000), now)).toBe(false);
  });
});

describe("needsRestore", () => {
  const now = Date.UTC(2026, 9, 18, 12, 0, 0);

  it("has nothing to do for a row that is back already: an undo sent twice", () => {
    expect(needsRestore(null, now)).toBe(false);
  });

  it("brings back a row deleted within the minute, and refuses one deleted before it with 410", () => {
    expect(needsRestore(new Date(now - 10_000), now)).toBe(true);
    expect(() => needsRestore(new Date(now - RESTORABLE_MS - 1), now)).toThrow("Too late");
  });
});
