import { describe, expect, it } from "vitest";
import { bookingFor, openBooking, taskValue } from "./points.service.js";

describe("taskValue", () => {
  it("uses the list's default until the task has its own amount", () => {
    expect(taskValue({ points: null }, { defaultPoints: 5 })).toBe(5);
    expect(taskValue({ points: 8 }, { defaultPoints: 5 })).toBe(8);
  });

  it("keeps a hand-set amount of 0", () => {
    expect(taskValue({ points: 0 }, { defaultPoints: 5 })).toBe(0);
  });

  it("is worth nothing without a list", () => {
    expect(taskValue({ points: null }, null)).toBe(0);
  });
});

describe("bookingFor", () => {
  it("adds points in a task list, whatever the balance", () => {
    expect(bookingFor("task", 5, -3)).toEqual({ ok: true, row: { type: "earned", amount: 5 } });
  });

  it("subtracts points in a reward list", () => {
    expect(bookingFor("reward", 10, 10)).toEqual({ ok: true, row: { type: "redeemed", amount: -10 } });
  });

  it("refuses a reward the balance can't cover and says how much is missing", () => {
    expect(bookingFor("reward", 10, 4)).toEqual({ ok: false, short: 6 });
  });

  it("writes nothing for an item worth 0", () => {
    expect(bookingFor("task", 0, 0)).toEqual({ ok: true, row: null });
    expect(bookingFor("reward", 0, -5)).toEqual({ ok: true, row: null });
  });
});

describe("openBooking", () => {
  const row = (id: string, type: "earned" | "redeemed" | "reversal", minute: number, reversesId: string | null = null) => ({
    id,
    type,
    amount: 1,
    reversesId,
    createdAt: new Date(Date.UTC(2026, 9, 4, 10, minute)),
  });

  it("finds the booking that is still standing", () => {
    expect(openBooking([row("a", "earned", 0)])?.id).toBe("a");
  });

  it("skips bookings already reversed, so tick / untick / tick reverses the second tick", () => {
    const rows = [row("a", "earned", 0), row("a-undo", "reversal", 1, "a"), row("b", "earned", 2)];
    expect(openBooking(rows)?.id).toBe("b");
  });

  it("has nothing to reverse once everything is reversed", () => {
    expect(openBooking([row("a", "redeemed", 0), row("a-undo", "reversal", 1, "a")])).toBeNull();
    expect(openBooking([])).toBeNull();
  });
});
