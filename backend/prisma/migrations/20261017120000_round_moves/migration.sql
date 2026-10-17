-- Rounds of a task on a schedule moved to another day in the Week box.
ALTER TABLE "Task" ADD COLUMN "roundMoves" JSONB;
