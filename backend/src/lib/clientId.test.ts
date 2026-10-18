import { describe, expect, it } from "vitest";
import { alreadyMade } from "./clientId.js";
import { HttpError } from "./httpError.js";

describe("alreadyMade", () => {
  it("is nothing when no row has the id yet", () => {
    expect(alreadyMade(null, "me")).toBeNull();
  });

  it("is the user's own row when the same change comes twice", () => {
    const row = { id: "t", userId: "me" };
    expect(alreadyMade(row, "me")).toBe(row);
  });

  it("refuses an id someone else's row has", () => {
    expect(() => alreadyMade({ id: "t", userId: "someone" }, "me")).toThrow(HttpError);
  });
});
