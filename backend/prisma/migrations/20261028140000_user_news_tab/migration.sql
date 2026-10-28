-- The setting that shows the News tab (the newspaper); on by default.
ALTER TABLE "User" ADD COLUMN "newsTab" BOOLEAN NOT NULL DEFAULT true;
