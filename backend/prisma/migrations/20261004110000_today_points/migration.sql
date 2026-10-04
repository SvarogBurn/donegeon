-- What a task written straight into Today is worth by default, per user.
ALTER TABLE "User" ADD COLUMN "todayPoints" INTEGER NOT NULL DEFAULT 2;
