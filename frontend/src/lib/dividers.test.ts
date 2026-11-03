import { describe, expect, it } from "vitest";
import { partsOf, typedDivider } from "./dividers";

const row = (name: string, isDivider = false) => ({ name, isDivider });
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("typedDivider", () => {
  it("reads three dashes or more as a divider, with the rest as its title", () => {
    expect(typedDivider("--- Work")).toBe("Work");
    expect(typedDivider("-----Work  ")).toBe("Work");
  });

  it("gives one with nothing after it the plain name", () => {
    expect(typedDivider("---")).toBe("Divider");
  });

  it("leaves anything else a task", () => {
    expect(typedDivider("-- Work")).toBeNull();
    expect(typedDivider("Work --- out")).toBeNull();
  });
});

describe("partsOf", () => {
  const reversed = <T,>(part: T[]) => [...part].reverse();

  it("arranges each part on its own, the dividers staying where they are", () => {
    const rows = [row("a"), row("b"), row("one", true), row("c"), row("d"), row("two", true), row("e")];
    expect(names(partsOf(rows, reversed))).toEqual(["b", "a", "one", "d", "c", "two", "e"]);
  });

  it("is the whole list when there is no divider", () => {
    expect(names(partsOf([row("a"), row("b")], reversed))).toEqual(["b", "a"]);
  });

  it("copes with dividers at either end and side by side", () => {
    expect(names(partsOf([row("one", true), row("two", true), row("a")], reversed))).toEqual(["one", "two", "a"]);
    expect(names(partsOf([row("a"), row("one", true)], reversed))).toEqual(["a", "one"]);
  });
});
