-- The streak freeze: a day with nothing done written down (Hit kind "day"), and the setting that switches it off.
ALTER TYPE "HitKind" ADD VALUE 'day';

ALTER TABLE "User" ADD COLUMN "freezeOff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "freezeSince" TEXT;
