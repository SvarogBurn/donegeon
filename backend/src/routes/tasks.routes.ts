import { Router, type Request } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { localDate } from "../schemas/common.js";
import { moveInput, roundInput, taskInput, taskPatch, weekInput } from "../schemas/task.js";
import { placeInWeek } from "../services/ordering.service.js";
import { ownTask } from "../services/ownership.js";
import { countdownOf, donePage, doneOn, openTrees, progressDays, searchTasks, statRows } from "../services/taskRead.service.js";
import { createTask, deleteTask, doneToday, moveRound, moveTask, restoreTask, toggleTask, updateTask } from "../services/taskWrite.service.js";
import { completionsRouter } from "./completions.routes.js";

/** The user's day and the moment the change was made, as the device sent them (see lib/localDate). */
const momentOf = (req: Request) => ({ today: req.localDate, at: req.clientTime });

/** The task named in the path, the user's own and not deleted. */
const pathTask = (req: Request<{ id: string }>) => ownTask(userId(req), req.params.id);

export const tasksRouter = Router();

// The trees the lists work with: every open main task, and what was ticked since yesterday (see openTrees).
tasksRouter.get("/", async (req, res) => {
  res.json({ tasks: await openTrees(userId(req), req.localDate) });
});

// The Done page, a few days at a time, newest first (see donePage).
tasksRouter.get("/done", async (req, res) => {
  const before = localDate.optional().parse(req.query.before);
  res.json(await donePage(userId(req), before, req.localDate));
});

// Everything ticked or pressed on one day, for the dashboard's Done box.
tasksRouter.get("/done/:day", async (req, res) => {
  res.json({ tasks: await doneOn(userId(req), localDate.parse(req.params.day), req.localDate) });
});

// Every task there is, as small flat rows for the stats.
tasksRouter.get("/stats", async (req, res) => {
  res.json({ tasks: await statRows(userId(req)) });
});

// Tasks done per day, for the level and streak on the task bar's face.
tasksRouter.get("/progress", async (req, res) => {
  res.json({ days: await progressDays(userId(req)) });
});

// The search at the top of the Tasks page (see searchTasks).
tasksRouter.get("/search", async (req, res) => {
  const q = z.string().trim().max(300).parse(req.query.q ?? "");
  res.json(q ? await searchTasks(userId(req), q) : { results: [], more: false });
});

tasksRouter.get("/:id", async (req, res) => {
  res.json({ task: await pathTask(req) });
});

// The spreadsheet-style per-day table for a task with a hard deadline.
tasksRouter.get("/:id/countdown", async (req, res) => {
  const task = await pathTask(req);
  if (task.deadlineType !== "hard" || !task.deadlineDate) {
    throw new HttpError(400, "Only tasks with a hard deadline have a countdown");
  }
  res.json({
    task: { id: task.id, title: task.title, parentId: task.parentId },
    countdown: await countdownOf(task, req.localDate),
  });
});

tasksRouter.post("/", async (req, res) => {
  const { task, isNew } = await createTask(userId(req), taskInput.parse(req.body), momentOf(req));
  res.status(isNew ? 201 : 200).json({ task });
});

tasksRouter.patch("/:id", async (req, res) => {
  const input = taskPatch.parse(req.body);
  res.json({ task: await updateTask(await pathTask(req), input, req.localDate) });
});

// A round of a task on a schedule moved to another day in the Week box (see moveRound).
tasksRouter.post("/:id/round", async (req, res) => {
  const { from, to } = roundInput.parse(req.body);
  res.json({ task: await moveRound(await pathTask(req), from, to) });
});

// A place in the Week box: on `day`, right after `after` there (null = first, left out = last). A task not yet in
// the box comes into it.
tasksRouter.post("/:id/week", async (req, res) => {
  const { day, after } = weekInput.parse(req.body);
  const task = await pathTask(req);
  await prisma.$transaction((tx) => placeInWeek(tx, task.userId, task.id, day, after, req.localDate));
  res.status(204).end();
});

// Ticks or unticks this one node (see toggleTask); the answer says how many were done today, for the break reminder.
tasksRouter.patch("/:id/toggle", async (req, res) => {
  const { done } = z.object({ done: z.boolean().optional() }).parse(req.body ?? {});
  const task = await pathTask(req);
  res.json({ task: await toggleTask(task, done, momentOf(req)), doneToday: await doneToday(task.userId, req.localDate) });
});

tasksRouter.use("/:id/completions", completionsRouter);

// Moves a task, with its subtree, anywhere (see moveTask).
tasksRouter.post("/:id/move", async (req, res) => {
  const input = moveInput.parse(req.body);
  await moveTask(await pathTask(req), input);
  res.status(204).end();
});

// Soft-deletes the task and everything beneath it; deleted already is no error.
tasksRouter.delete("/:id", async (req, res) => {
  await deleteTask(userId(req), req.params.id);
  res.status(204).end();
});

// Undo of a delete, within a minute of it; back already is no error.
tasksRouter.post("/:id/restore", async (req, res) => {
  await restoreTask(userId(req), req.params.id);
  res.status(204).end();
});
