import { Prisma, type Task } from "@prisma/client";
import { currentRound, dueAfter, movesFrom } from "../../../shared/repeat.js";
import { alreadyMade } from "../lib/clientId.js";
import { HttpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { untickedSchema } from "../schemas/task.js";
import { bookTask, reverseBooking } from "./points.service.js";
import { countedBelow } from "./taskWrite.service.js";

/** When the press was made, as the device saw it, and on which of the user's days. */
interface Moment {
  today: string;
  at: Date;
}

/**
 * One press of a persistent task's "done it" button: logs it, books the points and unticks its subtasks for the
 * next round. The task itself stays open; on a schedule, it is due again one interval on. `id` is made on the
 * device for a press made offline: the press already made under it is the answer the second time.
 */
export async function pressTask(task: Task, id: string | undefined, { today, at }: Moment) {
  const made = id && alreadyMade(await prisma.taskCompletion.findUnique({ where: { id } }), task.userId);
  if (made) return { completion: made, isNew: false, nextDue: task.nextDue };
  if (!task.isPersistent) throw new HttpError(400, "Only persistent tasks can be done again and again");
  // A persistent task under it keeps its own rounds, and their ticks.
  const ticked = (await countedBelow(task.id)).flatMap((t) =>
    t.completedAt && t.completedOn ? [{ id: t.id, completedAt: t.completedAt, completedOn: t.completedOn }] : [],
  );
  const { repeatEvery, nextDue } = task;
  const next = repeatEvery && nextDue ? dueAfter({ ...task, repeatEvery, nextDue }, today) : null;

  const completion = await prisma.$transaction(async (tx) => {
    const booked = await bookTask(tx, task);
    if (next) {
      await tx.task.update({
        where: { id: task.id },
        data: { nextDue: next, roundMoves: movesFrom(task.roundMoves, next) ?? Prisma.DbNull },
      });
    }
    await tx.task.updateMany({
      where: { id: { in: ticked.map((t) => t.id) } },
      data: { isComplete: false, completedAt: null, completedOn: null },
    });
    return tx.taskCompletion.create({
      data: {
        id,
        createdAt: at,
        userId: task.userId,
        taskId: task.id,
        day: today,
        pointTransactionId: booked?.id ?? null,
        dueBefore: repeatEvery && nextDue ? nextDue : null,
        unticked: ticked.map((t) => ({ id: t.id, completedAt: t.completedAt.toISOString(), completedOn: t.completedOn })),
      },
    });
  });
  return { completion, isNew: true, nextDue: next };
}

/** Its round is still to come: done for now, so a press from a notification left lying has nothing to do. */
export const isDoneForNow = (task: Task, today: string) => (currentRound(task, today)?.day ?? "") > today;

/**
 * Undo of a press: the log entry goes, its points are reversed, the subtasks it unticked get their ticks back (those
 * not ticked again since) and a scheduled task is due when it was before. Undone already (an undo sent twice): nothing.
 */
export async function undoPress(task: Task, completionId: string) {
  const completion = await prisma.taskCompletion.findFirst({ where: { id: completionId, taskId: task.id } });
  if (!completion) return;
  const unticked = untickedSchema.catch([]).parse(completion.unticked);

  await prisma.$transaction(async (tx) => {
    const booked = completion.pointTransactionId
      ? await tx.pointTransaction.findUnique({ where: { id: completion.pointTransactionId } })
      : null;
    if (booked) await reverseBooking(tx, booked);
    if (unticked.length > 0) {
      // One statement for all of them, each getting back its own stamp. Times are kept in UTC, as Prisma writes them.
      await tx.$executeRaw`
        UPDATE "Task" SET "isComplete" = true, "completedAt" = (v.at::timestamptz AT TIME ZONE 'UTC'), "completedOn" = v.day
        FROM unnest(${unticked.map((sub) => sub.id)}::text[], ${unticked.map((sub) => sub.completedAt)}::text[], ${unticked.map((sub) => sub.completedOn)}::text[]) AS v(id, at, day)
        WHERE "Task".id = v.id AND "Task"."userId" = ${task.userId} AND "Task"."isComplete" = false`;
    }
    if (completion.dueBefore && task.repeatEvery) {
      await tx.task.update({ where: { id: task.id }, data: { nextDue: completion.dueBefore } });
    }
    await tx.taskCompletion.delete({ where: { id: completion.id } });
  });
}
