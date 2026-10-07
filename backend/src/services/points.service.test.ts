import { describe, expect, it } from "vitest";
import { bookingFor, canTakeBack, openBooking, subtaskValue, taskValue } from "./points.service.js";

describe("taskValue", () => {
  it("uses the list's default until the task has its own amount", () => {
    expect(taskValue({ points: null }, { defaultPoints: 5 }, 2)).toBe(5);
    expect(taskValue({ points: 8 }, { defaultPoints: 5 }, 2)).toBe(8);
  });

  it("keeps a hand-set amount of 0", () => {
    expect(taskValue({ points: 0 }, { defaultPoints: 5 }, 2)).toBe(0);
  });

  it("is worth the user's Today amount without a list, unless it has its own", () => {
    expect(taskValue({ points: null }, null, 2)).toBe(2);
    expect(taskValue({ points: null }, null, 6)).toBe(6);
    expect(taskValue({ points: 7 }, null, 2)).toBe(7);
    expect(taskValue({ points: 0 }, null, 2)).toBe(0);
  });
});

describe("subtaskValue", () => {
  it("is nothing unless the subtask has its own amount", () => {
    expect(subtaskValue({ points: null }, { pointsToSubtasks: false }, 5)).toBe(0);
    expect(subtaskValue({ points: 3 }, { pointsToSubtasks: false }, 5)).toBe(3);
  });

  it("takes the main task's value when that one passes it down, unless it has its own", () => {
    expect(subtaskValue({ points: null }, { pointsToSubtasks: true }, 5)).toBe(5);
    expect(subtaskValue({ points: 3 }, { pointsToSubtasks: true }, 5)).toBe(3);
    expect(subtaskValue({ points: 0 }, { pointsToSubtasks: true }, 5)).toBe(0);
  });
});

describe("bookingFor", () => {
  it("adds points in a task list, whatever the balance", () => {
    expect(bookingFor("task", 5, -3, null)).toEqual({ ok: true, row: { type: "earned", amount: 5 } });
  });

  it("subtracts points in a reward list", () => {
    expect(bookingFor("reward", 10, 10, null)).toEqual({ ok: true, row: { type: "redeemed", amount: -10 } });
  });

  it("refuses a reward the balance can't cover and says how much is missing", () => {
    expect(bookingFor("reward", 10, 4, null)).toEqual({ ok: false, short: 6 });
  });

  it("lets earning reach the user's cap but not pass it", () => {
    expect(bookingFor("task", 10, 10, 25)).toEqual({ ok: true, row: { type: "earned", amount: 10 } });
    expect(bookingFor("task", 5, 20, 25)).toEqual({ ok: true, row: { type: "earned", amount: 5 } });
    expect(bookingFor("task", 10, 20, 25)).toEqual({ ok: false, over: 5 });
  });

  it("never holds a reward to the cap", () => {
    expect(bookingFor("reward", 10, 40, 25)).toEqual({ ok: true, row: { type: "redeemed", amount: -10 } });
  });

  it("writes nothing for an item worth 0", () => {
    expect(bookingFor("task", 0, 0, null)).toEqual({ ok: true, row: null });
    expect(bookingFor("reward", 0, -5, null)).toEqual({ ok: true, row: null });
  });
});

describe("canTakeBack", () => {
  it("lets earned points be taken back down to a balance of 0", () => {
    expect(canTakeBack(10, 25)).toBe(true);
    expect(canTakeBack(10, 10)).toBe(true);
  });

  it("leaves them booked when some were spent", () => {
    expect(canTakeBack(10, 4)).toBe(false);
    expect(canTakeBack(10, 0)).toBe(false);
  });

  it("always gives a reward's cost back", () => {
    expect(canTakeBack(-10, 0)).toBe(true);
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
