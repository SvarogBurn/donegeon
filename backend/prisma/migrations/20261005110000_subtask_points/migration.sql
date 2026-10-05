-- Subtasks can carry points: their own amount, or their main task's when it passes its amount down.
ALTER TABLE "Task" ADD COLUMN "pointsToSubtasks" BOOLEAN NOT NULL DEFAULT false;
