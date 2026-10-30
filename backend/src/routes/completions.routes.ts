import { Router } from "express";
import { z } from "zod";
import { userId } from "../middleware/requireAuth.js";
import { id } from "../schemas/common.js";
import { isDoneForNow, pressTask, undoPress } from "../services/completions.service.js";
import { clearAnswered } from "../services/notifications.service.js";
import { ownTask } from "../services/ownership.js";
import { doneToday } from "../services/taskWrite.service.js";

/** The presses of a persistent task's "done it" button, under /tasks/:id/completions. */
export const completionsRouter = Router({ mergeParams: true });

// One press: logs it, books the points and unticks its subtasks for the next round (see pressTask).
// `id`: made on the device for a press made offline; see lib/clientId. `fromNotification`: the Done on a pushed reminder,
// which may be an old one, for a round done since: then nothing happens. Done there, the app isn't open to plan again,
// so the reminders the press answers are called off here.
completionsRouter.post("/", async (req, res) => {
  const input = z.object({ id: id.optional(), fromNotification: z.boolean().optional() }).parse(req.body ?? {});
  const task = await ownTask(userId(req), (req.params as { id: string }).id);
  if (input.fromNotification && isDoneForNow(task, req.localDate)) {
    res.json({ completion: null, doneToday: await doneToday(task.userId, req.localDate) });
    return;
  }
  const { completion, isNew, nextDue } = await pressTask(task, input.id, { today: req.localDate, at: req.clientTime });
  if (input.fromNotification && nextDue) await clearAnswered(task.userId, task.id, nextDue);
  res.status(isNew ? 201 : 200).json({
    completion: { id: completion.id, day: completion.day },
    doneToday: await doneToday(task.userId, req.localDate),
  });
});

// Undo of a press (see undoPress); undone already is no error.
completionsRouter.delete("/:completionId", async (req, res) => {
  const params = req.params as { id: string; completionId: string };
  await undoPress(await ownTask(userId(req), params.id), params.completionId);
  res.status(204).end();
});
