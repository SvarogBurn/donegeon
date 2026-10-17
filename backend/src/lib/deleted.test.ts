import { describe, expect, it } from "vitest";
import { isRestorable, RESTORABLE_MS } from "./deleted.js";

describe("isRestorable", () => {
  const now = Date.UTC(2026, 9, 18, 12, 0, 0);

  it("lets a delete be undone for a minute, longer than the page offers the undo", () => {
    expect(RESTORABLE_MS).toBeGreaterThan(10_000);
    expect(isRestorable(new Date(now - 10_000), now)).toBe(true);
    expect(isRestorable(new Date(now - RESTORABLE_MS), now)).toBe(true);
  });

  it("refuses once that minute is over", () => {
    expect(isRestorable(new Date(now - RESTORABLE_MS - 1), now)).toBe(false);
    expect(isRestorable(new Date(now - 30 * 24 * 60 * 60 * 1000), now)).toBe(false);
  });
});
