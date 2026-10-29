-- The character's health: the misses that cost it (Hit), and the setting that switches it off.
CREATE TYPE "HitKind" AS ENUM ('deadline', 'round');

ALTER TABLE "User" ADD COLUMN "healthOff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "healthSince" TEXT;

CREATE TABLE "Hit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "HitKind" NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "damage" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Hit_userId_key_key" ON "Hit"("userId", "key");

CREATE INDEX "Hit_userId_day_idx" ON "Hit"("userId", "day");

CREATE INDEX "Hit_taskId_idx" ON "Hit"("taskId");

ALTER TABLE "Hit" ADD CONSTRAINT "Hit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Hit" ADD CONSTRAINT "Hit_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
