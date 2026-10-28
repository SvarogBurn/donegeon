import { describe, expect, it } from "vitest";
import { tickAllowed } from "./notifications.routes.js";

describe("the hourly call's secret", () => {
  it("lets in only the secret itself", () => {
    expect(tickAllowed("s3cret-of-some-length", "s3cret-of-some-length")).toBe(true);
    expect(tickAllowed("s3cret-of-some-length", "s3cret-of-some-lengtH")).toBe(false);
    expect(tickAllowed("s3cret-of-some-length", "short")).toBe(false);
    expect(tickAllowed("s3cret-of-some-length", undefined)).toBe(false);
  });

  it("lets nothing in when no secret is set", () => {
    expect(tickAllowed(undefined, "")).toBe(false);
    expect(tickAllowed("", "")).toBe(false);
  });
});
