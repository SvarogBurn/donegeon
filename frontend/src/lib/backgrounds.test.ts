import { describe, expect, it } from "vitest";
import { calmLook } from "./backgrounds";

describe("calmLook", () => {
  it("puts the theme's own in place of a picture and a see-through fill", () => {
    expect(calmLook("hills", "clear", "clear")).toEqual(["default", "default", "default"]);
  });
  it("keeps the plain choices", () => {
    expect(calmLook("black", "white", "black")).toEqual(["black", "white", "black"]);
    expect(calmLook("default", "default", "default")).toEqual(["default", "default", "default"]);
  });
});
