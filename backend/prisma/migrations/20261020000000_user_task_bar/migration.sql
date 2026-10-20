-- The order of the task bar's items and which side of it each is on; null = the default.
ALTER TABLE "User" ADD COLUMN "taskBar" JSONB;
