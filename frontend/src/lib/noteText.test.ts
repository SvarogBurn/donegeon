import { describe, expect, it } from "vitest";
import { alignLines, enterOnLine, itemPrefix, lineAlign, parseNote } from "./noteText";

describe("parseNote", () => {
  it("reads text, blank lines and list items", () => {
    expect(parseNote("Pack:\n* passport\n- **tickets**\n\n1. call mum\n2) water plants")).toEqual([
      { kind: "text", text: "Pack:" },
      { kind: "item", depth: 0, number: undefined, text: "passport" },
      { kind: "item", depth: 0, number: undefined, text: "**tickets**" },
      { kind: "blank" },
      { kind: "item", depth: 0, number: 1, text: "call mum" },
      { kind: "item", depth: 0, number: 2, text: "water plants" },
    ]);
  });

  it("nests items two spaces (or a tab) a level, up to a limit", () => {
    expect(parseNote("* a\n  * b\n\t- c\n            * d").map((line) => line.kind === "item" && line.depth)).toEqual([0, 1, 1, 4]);
  });

  it("keeps italics and words that only look like a list as text", () => {
    expect(parseNote("*italic* word\n-5 degrees\n2026. a year")).toEqual([
      { kind: "text", text: "*italic* word" },
      { kind: "text", text: "-5 degrees" },
      { kind: "text", text: "2026. a year" },
    ]);
  });
});

describe("parseNote headings", () => {
  it("reads one to three hashes as heading levels, deeper ones as the third", () => {
    expect(parseNote("# Big\n## Mid\n### Small\n###### Tiny\n   ## Indented\n## Plan ##")).toEqual([
      { kind: "heading", level: 1, text: "Big" },
      { kind: "heading", level: 2, text: "Mid" },
      { kind: "heading", level: 3, text: "Small" },
      { kind: "heading", level: 3, text: "Tiny" },
      { kind: "heading", level: 2, text: "Indented" },
      { kind: "heading", level: 2, text: "Plan" },
    ]);
  });

  it("keeps the heading's markup", () => {
    expect(parseNote("# **Big** plan")).toEqual([{ kind: "heading", level: 1, text: "**Big** plan" }]);
  });

  it("keeps tags, a lone hash, seven hashes and an escaped hash as text", () => {
    expect(parseNote("#tag line\n#\n####### seven\n\\# literal")).toEqual([
      { kind: "text", text: "#tag line" },
      { kind: "text", text: "#" },
      { kind: "text", text: "####### seven" },
      { kind: "text", text: "# literal" },
    ]);
  });
});

describe("itemPrefix and enterOnLine", () => {
  it("finds a list line's marker", () => {
    expect(itemPrefix("  * milk")).toBe("  * ");
    expect(itemPrefix("12. eggs")).toBe("12. ");
    expect(itemPrefix("milk")).toBeNull();
  });

  it("carries a list on, counting numbers", () => {
    expect(enterOnLine("  - milk")).toEqual({ next: "  - " });
    expect(enterOnLine("3. eggs")).toEqual({ next: "4. " });
  });

  it("ends a list on an empty item, and does nothing on plain text", () => {
    expect(enterOnLine("* ")).toEqual({ endList: true });
    expect(enterOnLine("just words")).toBeNull();
  });
});

describe("alignment", () => {
  it("reads '<> ' as centred and '>> ' as to the right, in front of any line", () => {
    expect(parseNote("<> Title\n>> - milk\n<> ## Plan\nplain\n\\<> literal\n<>tight")).toEqual([
      { kind: "text", text: "Title", align: "center" },
      { kind: "item", depth: 0, number: undefined, text: "milk", align: "right" },
      { kind: "heading", level: 2, text: "Plan", align: "center" },
      { kind: "text", text: "plain" },
      { kind: "text", text: "<> literal" },
      { kind: "text", text: "<>tight" },
    ]);
  });

  it("carries an aligned list on with its mark", () => {
    expect(itemPrefix("<>   * milk")).toBe("<>   * ");
    expect(enterOnLine(">> 3. eggs")).toEqual({ next: ">> 4. " });
  });

  it("finds the caret's line's alignment", () => {
    expect(lineAlign("a\n<> b\nc", 4)).toBe("center");
    expect(lineAlign("a\n<> b\nc", 0)).toBeNull();
  });

  it("aligns the caret's line, keeping the caret on its word", () => {
    expect(alignLines("one\ntwo\nthree", 5, 5, "center")).toEqual({ text: "one\n<> two\nthree", start: 8, end: 8 });
    expect(alignLines("one\n<> two\nthree", 8, 8, "right")).toEqual({ text: "one\n>> two\nthree", start: 8, end: 8 });
    expect(alignLines("one\n<> two\nthree", 8, 8, null)).toEqual({ text: "one\ntwo\nthree", start: 5, end: 5 });
  });

  it("aligns every selected line with something on it, but not one the selection only reaches the start of", () => {
    expect(alignLines("a\n\nb\nc", 0, 5, "right")).toEqual({ text: ">> a\n\n>> b\nc", start: 3, end: 11 });
    expect(alignLines("a\nb", 0, 2, "center")).toEqual({ text: "<> a\nb", start: 3, end: 5 });
  });
});
