import type { List, PointTransaction, Prisma, Task } from "@prisma/client";
import { HttpError } from "../lib/httpError.js";

/**
 * What a top-level task is worth: its own amount if it has one, else its
 * list's default, else (no list: it lives only in Today) the user's amount
 * for Today, which they set in the Today box.
 */
export function taskValue(task: Pick<Task, "points">, list: Pick<List, "defaultPoints"> | null, todayPoints: number): number {
  return task.points ?? (list ? list.defaultPoints : todayPoints);
}

/**
 * What a subtask (at any depth) is worth: its own amount if it has one, else
 * what its main task is worth if that one passes its amount down, else nothing.
 */
export function subtaskValue(task: Pick<Task, "points">, root: Pick<Task, "pointsToSubtasks">, rootValue: number): number {
  return task.points ?? (root.pointsToSubtasks ? rootValue : 0);
}

export type Booking =
  | { ok: true; row: { type: "earned" | "redeemed"; amount: number } | null }
  | { ok: false; short: number };

/**
 * The ledger row for doing an item worth `value` in a list of this kind: a
 * task list adds, a reward list subtracts and needs the balance to cover it.
 * Nothing is written for a value of 0.
 */
export function bookingFor(kind: List["kind"], value: number, balance: number): Booking {
  if (value <= 0) return { ok: true, row: null };
  if (kind === "task") return { ok: true, row: { type: "earned", amount: value } };
  if (balance < value) return { ok: false, short: value - balance };
  return { ok: true, row: { type: "redeemed", amount: -value } };
}

type LedgerRow = Pick<PointTransaction, "id" | "type" | "amount" | "reversesId" | "createdAt">;

/** The newest earned / redeemed row that no reversal has cancelled yet. */
export function openBooking<T extends LedgerRow>(rows: T[]): T | null {
  const reversed = new Set(rows.map((row) => row.reversesId));
  return (
    rows
      .filter((row) => row.type !== "reversal" && !reversed.has(row.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  );
}

export async function balanceOf(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const sum = await tx.pointTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
  return sum._sum.amount ?? 0;
}

/**
 * Books a task being done (ticked, or pressed if persistent). A subtask is booked
 * in its main task's list: that list's kind decides add or subtract.
 * Returns the row, or null if the task is worth nothing.
 */
export async function bookTask(tx: Prisma.TransactionClient, task: Task) {
  let root = task;
  while (root.parentId) root = await tx.task.findUniqueOrThrow({ where: { id: root.parentId } });
  // A task that lives only in Today has no list: it earns its own amount, or the user's amount for Today.
  const list = root.listId ? await tx.list.findUnique({ where: { id: root.listId } }) : null;
  const { todayPoints } = await tx.user.findUniqueOrThrow({ where: { id: task.userId }, select: { todayPoints: true } });
  const rootValue = taskValue(root, list, todayPoints);
  const value = task.parentId ? subtaskValue(task, root, rootValue) : rootValue;
  const booking = bookingFor(list?.kind ?? "task", value, await balanceOf(tx, task.userId));
  if (!booking.ok) throw new HttpError(400, `Not enough points: you need ${booking.short} more`);
  if (!booking.row) return null;
  return tx.pointTransaction.create({
    data: { ...booking.row, userId: task.userId, relatedTaskId: task.id, title: task.title },
  });
}

/** Cancels a booking with a reversal row; the original row is never edited. */
export async function reverseBooking(tx: Prisma.TransactionClient, row: PointTransaction) {
  if (row.type === "reversal") return;
  if (await tx.pointTransaction.findUnique({ where: { reversesId: row.id } })) return;
  await tx.pointTransaction.create({
    data: {
      userId: row.userId,
      type: "reversal",
      amount: -row.amount,
      relatedTaskId: row.relatedTaskId,
      title: row.title,
      reversesId: row.id,
    },
  });
}

/**
 * Un-ticking gives back (or takes back) exactly what ticking booked, whatever
 * the task is worth or wherever it sits now. Presses of a persistent task are
 * booked separately and are not touched here.
 */
export async function reverseTaskBooking(tx: Prisma.TransactionClient, task: Pick<Task, "id">) {
  const [rows, presses] = await Promise.all([
    tx.pointTransaction.findMany({ where: { relatedTaskId: task.id } }),
    tx.taskCompletion.findMany({ where: { taskId: task.id }, select: { pointTransactionId: true } }),
  ]);
  const pressed = new Set(presses.map((press) => press.pointTransactionId));
  const open = openBooking(rows.filter((row) => !pressed.has(row.id)));
  if (open) await reverseBooking(tx, open);
}
