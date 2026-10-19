-- The setting that shows the Notes tab (notes of their own, on no task); off by default.
ALTER TABLE "User" ADD COLUMN "notesTab" BOOLEAN NOT NULL DEFAULT false;
