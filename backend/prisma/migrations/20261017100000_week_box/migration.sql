-- The Week tab of the Today box: tasks planned for a day of the week, in an order of their own on that day.
ALTER TABLE "Task" ADD COLUMN "weekDay" TEXT;
ALTER TABLE "Task" ADD COLUMN "weekPosition" INTEGER NOT NULL DEFAULT 0;
