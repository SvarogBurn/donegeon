-- A task on a schedule: whether rounds missed are still to be done (one press each) or skipped.
ALTER TABLE "Task" ADD COLUMN "repeatMakeUp" BOOLEAN NOT NULL DEFAULT false;
