import { describe, expect, it } from "vitest";
import { enterOnLine, itemPrefix, parseNote } from "./noteText";

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
