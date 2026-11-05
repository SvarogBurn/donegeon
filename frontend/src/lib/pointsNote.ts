import type { ListKind } from "../types";

/**
 * What to say when a tick or press books less than the item is worth (the server books it the same way, bookingFor in
 * points.service.ts): earning stops at the cap, and a reward costing more than the balance takes what there is. Null
 * when it books in full, or there's nothing to book. The words are drafts (Claude).
 */
export function pointsNote(value: number, kind: ListKind, balance: number, cap: number | null): string | null {
  if (value <= 0) return null;
  if (kind === "reward") return balance < value ? (balance > 0 ? `Paid the ${balance} ${balance === 1 ? "point" : "points"} you had` : "Bought with no points left to pay") : null;
  if (cap === null || balance + value <= cap) return null;
  const room = Math.max(0, cap - balance);
  return `At your cap of ${cap}: +${room} of ${value}`;
}
