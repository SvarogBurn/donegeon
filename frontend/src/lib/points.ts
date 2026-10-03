import type { ListKind } from "../types";

/** "+5" in a task list, "−10" in a reward list. */
export function formatValue(value: number, kind: ListKind) {
  return `${kind === "reward" ? "−" : "+"}${value}`;
}

/** A ledger amount with its sign: "+5", "−10". */
export function formatAmount(amount: number) {
  return amount < 0 ? `−${-amount}` : `+${amount}`;
}
