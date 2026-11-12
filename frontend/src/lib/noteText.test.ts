import { describe, expect, it } from "vitest";
import { addColumn, addRow, alignLines, clearCells, moveColumn, moveRow, isTableShortcut, placeTable, doubledMarker, enterOnLine, findTables, isRule, isTableRow, itemPrefix, lineAlign, newTable, parseNote, removeColumn, removeRow, withCell, writeTable } from "./noteText";

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

describe("doubledMarker", () => {
  it("keeps one marker when the one Enter carried on is typed again", () => {
    expect(doubledMarker("* * ")).toBe("* ");
    expect(doubledMarker("  - * ")).toBe("  - ");
    expect(doubledMarker("2. 2. ")).toBe("2. ");
  });

  it("leaves a line with words on it, or a single marker, alone", () => {
    expect(doubledMarker("* * a")).toBeNull();
    expect(doubledMarker("* ")).toBeNull();
    expect(doubledMarker("plain * ")).toBeNull();
  });
});

describe("tables", () => {
  it("reads rows between other lines as one table, a header only with the line under it", () => {
    expect(parseNote("Shop:\n| Item | Qty |\n| --- | :-: |\n| milk | 2 |\nafter")).toEqual([
      { kind: "text", text: "Shop:" },
      { kind: "table", header: true, aligns: [undefined, "center"], rows: [["Item", "Qty"], ["milk", "2"]] },
      { kind: "text", text: "after" },
    ]);
    expect(parseNote("| a | b |\n| c | d |")).toEqual([{ kind: "table", header: false, aligns: [undefined, undefined], rows: [["a", "b"], ["c", "d"]] }]);
  });

  it("pads short rows, reads '\\|' as a pipe and right-aligned columns", () => {
    expect(parseNote("|a|b|c|\n|-|--:|\n|x \\| y|")).toEqual([{ kind: "table", header: true, aligns: [undefined, "right", undefined], rows: [["a", "b", "c"], ["x | y", "", ""]] }]);
  });

  it("keeps lines that only start or end with a pipe, an escaped pipe and a lone one as text", () => {
    expect(isTableRow("| a")).toBe(false);
    expect(isTableRow("| a \\|")).toBe(false);
    expect(isTableRow("|")).toBe(false);
    expect(isTableRow("  | a |  ")).toBe(true);
    expect(parseNote("\\| a |")).toEqual([{ kind: "text", text: "| a |" }]);
  });

  it("writes a table back the way it reads", () => {
    const table = { header: true, aligns: [undefined, "right" as const], rows: [["a|b", " c\nd "], ["", "e"]] };
    expect(writeTable(table)).toBe("| a\\|b | c d |\n| --- | --: |\n|  | e |");
    expect(parseNote(writeTable(table))).toEqual([{ kind: "table", ...table, rows: [["a|b", "c d"], ["", "e"]] }]);
    expect(writeTable(newTable())).toBe("|  |  |\n| --- | --- |\n|  |  |");
  });

  it("changes a cell, adds and removes rows and columns, and is gone with its last", () => {
    const table = { header: false, aligns: [undefined, undefined], rows: [["a", "b"], ["c", "d"]] };
    expect(withCell(table, 1, 0, "x").rows).toEqual([["a", "b"], ["x", "d"]]);
    expect(addRow(table, 1).rows).toEqual([["a", "b"], ["", ""], ["c", "d"]]);
    expect(addColumn(table, 2)).toEqual({ header: false, aligns: [undefined, undefined, undefined], rows: [["a", "b", ""], ["c", "d", ""]] });
    expect(removeRow(table, 0)?.rows).toEqual([["c", "d"]]);
    expect(removeColumn(table, 1)?.rows).toEqual([["a"], ["c"]]);
    expect(removeRow({ ...table, rows: [["a", "b"]] }, 0)).toBeNull();
    expect(removeColumn({ ...table, aligns: [undefined], rows: [["a"]] }, 0)).toBeNull();
  });

  it("finds the tables with a line in a stretch of the note, where they start and end", () => {
    const text = "x\n| a |\n| b |\ny\n| c |";
    expect(findTables(text).map(({ from, to }) => [from, to])).toEqual([[2, 13], [16, 21]]);
    // From inside the first table's second row: the whole table, from its first row.
    expect(findTables(text, 10, 11).map(({ from, to }) => [from, to])).toEqual([[2, 13]]);
    // The line under it isn't in it.
    expect(findTables(text, 14, 14)).toEqual([]);
    expect(findTables("")).toEqual([]);
  });
});

describe("moving and emptying in tables", () => {
  const table = { header: true, aligns: [undefined, "right" as const, undefined], rows: [["h1", "h2", "h3"], ["a", "b", "c"], ["d", "e", "f"]] };

  it("moves a row, and a column with its place", () => {
    expect(moveRow(table, 2, 1).rows).toEqual([["h1", "h2", "h3"], ["d", "e", "f"], ["a", "b", "c"]]);
    expect(moveRow(table, 1, 0).rows[0]).toEqual(["a", "b", "c"]);
    expect(moveColumn(table, 1, 2)).toEqual({ header: true, aligns: [undefined, undefined, "right"], rows: [["h1", "h3", "h2"], ["a", "c", "b"], ["d", "f", "e"]] });
  });

  it("empties a block of cells, keeping the shape", () => {
    expect(clearCells(table, { top: 1, left: 0, bottom: 1, right: 2 }).rows[1]).toEqual(["", "", ""]);
    expect(clearCells(table, { top: 0, left: 1, bottom: 2, right: 1 }).rows.map((cells) => cells[1])).toEqual(["", "", ""]);
    expect(clearCells(table, { top: 1, left: 1, bottom: 2, right: 2 }).rows).toEqual([["h1", "h2", "h3"], ["a", "", ""], ["d", "", ""]]);
  });

  it("takes out several rows or columns at once, the table gone with all of them", () => {
    expect(removeRow(table, 1, 2)?.rows).toEqual([["h1", "h2", "h3"]]);
    expect(removeColumn(table, 0, 2)).toEqual({ header: true, aligns: [undefined], rows: [["h3"], ["c"], ["f"]] });
    expect(removeRow(table, 0, 3)).toBeNull();
    expect(removeColumn(table, 0, 3)).toBeNull();
  });

  it("aligns the lines selected but not a table's rows", () => {
    expect(alignLines("a\n| x |\nb", 0, 9, "center").text).toBe("<> a\n| x |\n<> b");
  });

  const note = "top\n| a |\n| b |\nmid\nend";
  // The table: "| a |\n| b |", from 4 to 15.
  it("places a table before another line, saying where it starts", () => {
    expect(placeTable(note, 4, 15, 0)).toEqual({ text: "| a |\n| b |\ntop\nmid\nend", from: 0 });
    expect(placeTable(note, 4, 15, 5)).toEqual({ text: "top\nmid\nend\n| a |\n| b |", from: 12 });
    expect(placeTable(note, 4, 15, 1)).toEqual({ text: note, from: 4 });
  });

  it("keeps a placed table apart from another by a blank line", () => {
    expect(placeTable("| x |\ntext\n| a |", 11, 16, 1)).toEqual({ text: "| x |\n\n| a |\ntext", from: 7 });
  });

  it("knows //table on a line of its own", () => {
    expect(["//table", "  //Table ", "// table", "//tables", "a //table"].map(isTableShortcut)).toEqual([true, true, false, false, false]);
  });
});

describe("break lines", () => {
  it("reads five dashes or more on a line of their own as a break line", () => {
    expect(parseNote("above\n-----\n  ----------  \nbelow")).toEqual([{ kind: "text", text: "above" }, { kind: "rule" }, { kind: "rule" }, { kind: "text", text: "below" }]);
    expect(isRule("-----")).toBe(true);
  });

  it("keeps fewer dashes, a list item of dashes and dashes with words as text", () => {
    expect(isRule("---")).toBe(false);
    expect(isRule("----")).toBe(false);
    expect(isRule("----- a")).toBe(false);
    expect(parseNote("- -----")).toEqual([{ kind: "item", depth: 0, number: undefined, text: "-----" }]);
  });

  it("is never aligned", () => {
    expect(parseNote("<> -----")).toEqual([{ kind: "rule" }]);
    expect(alignLines("a\n-----\nb", 0, 9, "center").text).toBe("<> a\n-----\n<> b");
  });
});
