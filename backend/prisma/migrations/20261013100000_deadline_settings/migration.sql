-- Two settings: lists ordered by date (soonest first), and tasks coming into Today by themselves when their deadline is near.
CREATE TYPE "DeadlineToday" AS ENUM ('never', 'day', 'dayBefore');
ALTER TABLE "User" ADD COLUMN "sortByDeadline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "deadlineToday" "DeadlineToday" NOT NULL DEFAULT 'never';
