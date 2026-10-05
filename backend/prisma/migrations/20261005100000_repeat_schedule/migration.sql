-- Persistent tasks can be put on a schedule: due again every N days, weeks or months.
CREATE TYPE "RepeatUnit" AS ENUM ('day', 'week', 'month');

ALTER TABLE "Task" ADD COLUMN "repeatEvery" INTEGER,
ADD COLUMN "repeatUnit" "RepeatUnit" NOT NULL DEFAULT 'week',
ADD COLUMN "repeatAfterDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "nextDue" TEXT;

ALTER TABLE "TaskCompletion" ADD COLUMN "dueBefore" TEXT;
