import { describe, expect, it } from "vitest";
import { hasMarkup, parseMarkup, plainTitle, toggleMarker } from "./markup";

describe("parseMarkup", () => {
  it("reads each style", () => {
    expect(parseMarkup("a **b** c")).toEqual(["a ", { style: "bold", children: ["b"] }, " c"]);
    expect(parseMarkup("*i*")).toEqual([{ style: "italic", children: ["i"] }]);
    expect(parseMarkup("__u__")).toEqual([{ style: "underline", children: ["u"] }]);
    expect(parseMarkup("==m==")).toEqual([{ style: "mark", children: ["m"] }]);
    expect(parseMarkup("~~s~~")).toEqual([{ style: "strike", children: ["s"] }]);
  });

  it("reads styles inside one another", () => {
    expect(parseMarkup("**a *b* c**")).toEqual([{ style: "bold", children: ["a ", { style: "italic", children: ["b"] }, " c"] }]);
    expect(parseMarkup("*a **b** c*")).toEqual([{ style: "italic", children: ["a ", { style: "bold", children: ["b"] }, " c"] }]);
    expect(parseMarkup("***a***")).toEqual([{ style: "bold", children: [{ style: "italic", children: ["a"] }] }]);
    expect(parseMarkup("__==a==__")).toEqual([{ style: "underline", children: [{ style: "mark", children: ["a"] }] }]);
  });

  it("leaves alone what isn't markup", () => {
    for (const text of ["5 * 3 * 2", "a * b", "**open", "snake_case_name", "a == b", "2 ** 3", "*a\nb*", "wait ~ a bit", "**", "a ** b ** c"]) {
      expect(parseMarkup(text), text).toEqual([text]);
      expect(hasMarkup(text)).toBe(false);
    }
  });

  it("keeps what a backslash is in front of", () => {
    expect(parseMarkup("\\*a\\*")).toEqual(["*a*"]);
    expect(parseMarkup("**a \\** b**")).toEqual([{ style: "bold", children: ["a ** b"] }]);
  });

  it("gives the words alone", () => {
    expect(plainTitle("Pay **rent** ==*now*==")).toBe("Pay rent now");
    expect(plainTitle("5 * 3")).toBe("5 * 3");
  });
});

describe("toggleMarker", () => {
  it("puts the marker around the selection", () => {
    expect(toggleMarker("pay rent", 4, 8, "**")).toEqual({ text: "pay **rent**", start: 6, end: 10 });
  });
  it("takes it off again, whether or not the markers are selected", () => {
    expect(toggleMarker("pay **rent**", 6, 10, "**")).toEqual({ text: "pay rent", start: 4, end: 8 });
    expect(toggleMarker("pay **rent**", 4, 12, "**")).toEqual({ text: "pay rent", start: 4, end: 8 });
  });
  it("tells italics from bold by the asterisks", () => {
    expect(toggleMarker("**plain**", 2, 7, "*")).toEqual({ text: "***plain***", start: 3, end: 8 });
    expect(toggleMarker("***plain***", 3, 8, "*")).toEqual({ text: "**plain**", start: 2, end: 7 });
    expect(toggleMarker("***plain***", 3, 8, "**")).toEqual({ text: "*plain*", start: 1, end: 6 });
    expect(toggleMarker("**plain**", 0, 9, "*")).toEqual({ text: "***plain***", start: 1, end: 10 });
  });
  it("opens a pair around the caret", () => {
    expect(toggleMarker("pay ", 4, 4, "*")).toEqual({ text: "pay **", start: 5, end: 5 });
  });
});
