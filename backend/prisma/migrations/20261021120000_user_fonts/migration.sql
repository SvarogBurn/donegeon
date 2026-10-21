-- The plain font switch becomes a choice of fonts, one for the boxes and one for the Notes page's notes.
CREATE TYPE "TextFont" AS ENUM ('pixel', 'plain', 'dyslexic', 'large');

ALTER TABLE "User" ADD COLUMN "boxFont" "TextFont" NOT NULL DEFAULT 'pixel',
ADD COLUMN "notesFont" "TextFont" NOT NULL DEFAULT 'pixel';

-- Whoever had the plain font in the boxes keeps it.
UPDATE "User" SET "boxFont" = 'plain' WHERE "plainFont";

ALTER TABLE "User" DROP COLUMN "plainFont";
