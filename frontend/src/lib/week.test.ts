import { describe, expect, it } from "vitest";
import type { TaskTreeNode } from "../types";
import { isPutOff } from "./week";

// Tuesday; its week's Sunday is 2026-10-25, the next Monday 2026-10-26.
const today = "2026-10-20";
const on = (weekDay: string | null) => ({ weekDay }) as TaskTreeNode;

describe("isPutOff", () => {
  it("is a task planned for next week or later, not one for this week or none", () => {
    expect(isPutOff(on("2026-10-26"), today)).toBe(true);
    expect(isPutOff(on("2026-11-09"), today)).toBe(true);
    expect(isPutOff(on("2026-10-25"), today)).toBe(false);
    expect(isPutOff(on("2026-10-13"), today)).toBe(false);
    expect(isPutOff(on(null), today)).toBe(false);
  });
});
