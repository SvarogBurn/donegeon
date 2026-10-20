import { describe, expect, it } from "vitest";
import { LoginLimit, MAX_TRIES, WINDOW_MS } from "./loginLimit.js";

describe("LoginLimit", () => {
  const now = Date.UTC(2026, 9, 20, 12, 0, 0);

  it("lets wrong tries through until there are too many, then makes them wait out the window", () => {
    const limit = new LoginLimit();
    for (let i = 0; i < MAX_TRIES; i++) {
      expect(limit.waitFor("reo|1.2.3.4", now)).toBe(0);
      limit.failed("reo|1.2.3.4", now);
    }
    expect(limit.waitFor("reo|1.2.3.4", now)).toBe(15);
    expect(limit.waitFor("reo|1.2.3.4", now + WINDOW_MS - 60_000)).toBe(1);
    expect(limit.waitFor("reo|1.2.3.4", now + WINDOW_MS)).toBe(0);
  });

  it("counts each username and address apart", () => {
    const limit = new LoginLimit();
    for (let i = 0; i < MAX_TRIES; i++) limit.failed("reo|1.2.3.4", now);
    expect(limit.waitFor("reo|5.6.7.8", now)).toBe(0);
    expect(limit.waitFor("friend|1.2.3.4", now)).toBe(0);
  });

  it("forgets the wrong tries once the right password is given, or once the window is over", () => {
    const limit = new LoginLimit();
    for (let i = 0; i < MAX_TRIES - 1; i++) limit.failed("reo|1.2.3.4", now);
    limit.succeeded("reo|1.2.3.4");
    limit.failed("reo|1.2.3.4", now);
    expect(limit.waitFor("reo|1.2.3.4", now)).toBe(0);

    for (let i = 0; i < MAX_TRIES; i++) limit.failed("x|1.2.3.4", now);
    limit.failed("x|1.2.3.4", now + WINDOW_MS);
    expect(limit.waitFor("x|1.2.3.4", now + WINDOW_MS)).toBe(0);
  });
});
