import { describe, expect, it } from "vitest";
import { clientTimeFrom } from "./localDate.js";

describe("clientTimeFrom", () => {
  const now = new Date("2026-10-18T12:00:00Z");

  it("is now when nothing was sent, or not a time", () => {
    expect(clientTimeFrom(undefined, now)).toEqual(now);
    expect(clientTimeFrom("yesterday-ish", now)).toEqual(now);
  });

  it("is the time sent for a change made offline", () => {
    expect(clientTimeFrom("2026-10-17T08:30:00Z", now)).toEqual(new Date("2026-10-17T08:30:00Z"));
  });

  it("is never later than now, nor more than a week ago", () => {
    expect(clientTimeFrom("2026-10-19T00:00:00Z", now)).toEqual(now);
    expect(clientTimeFrom("2026-09-01T00:00:00Z", now)).toEqual(new Date("2026-10-11T12:00:00Z"));
  });
});
