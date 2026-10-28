-- The setting that switches the points system off (nothing booked, refused or taken back); on by default.
ALTER TABLE "User" ADD COLUMN "pointsOff" BOOLEAN NOT NULL DEFAULT false;
