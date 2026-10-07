import type { ListKind } from "../types";

/** "+5" in a task list, "−10" in a reward list. */
export function formatValue(value: number, kind: ListKind) {
  return `${kind === "reward" ? "−" : "+"}${value}`;
}

/** A ledger amount with its sign: "+5", "−10". */
export function formatAmount(amount: number) {
  return amount < 0 ? `−${-amount}` : `+${amount}`;
}

/** The most the server takes for an amount. */
export const MAX_POINTS = 1_000_000_000;

/** What was typed into a points field as digits only, and no more than the server takes. */
export function typedPoints(text: string) {
  const digits = text.replace(/\D/g, "");
  return digits !== "" && Number(digits) > MAX_POINTS ? String(MAX_POINTS) : digits;
}

/** A points field is as wide as its digits, and never narrower than `least` of them. */
export function pointsFieldWidth(text: string, least = 2) {
  return { width: `calc(${Math.max(text.length, least)}ch + 12px)` };
}
