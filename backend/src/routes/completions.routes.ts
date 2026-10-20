import { Router } from "express";
import { z } from "zod";
import { userId } from "../middleware/requireAuth.js";
import { id } from "../schemas/common.js";
import { pressTask, undoPress } from "../services/completions.service.js";
import { ownTask } from "../services/ownership.js";
import { doneToday } from "../services/taskWrite.service.js";

/** The presses of a persistent task's "done it" button, under /tasks/:id/completions. */
export const completionsRouter = Router({ mergeParams: true });

// One press: logs it, books the points and unticks its subtasks for the next round (see pressTask).
// `id`: made on the device for a press made offline; see lib/clientId.
completionsRouter.post("/", async (req, res) => {
  const input = z.object({ id: id.optional() }).parse(req.body ?? {});
  const task = await ownTask(userId(req), (req.params as { id: string }).id);
  const { completion, isNew } = await pressTask(task, input.id, { today: req.localDate, at: req.clientTime });
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
