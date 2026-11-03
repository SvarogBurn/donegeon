-- The settings that show the Stats and Calendar tabs; on by default.
ALTER TABLE "User" ADD COLUMN "statsTab" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "calendarTab" BOOLEAN NOT NULL DEFAULT true;
