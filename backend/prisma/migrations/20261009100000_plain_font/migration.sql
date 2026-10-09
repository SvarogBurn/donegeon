-- The Theme setting that shows the text inside the boxes in an ordinary font instead of the pixel one; off by default.
ALTER TABLE "User" ADD COLUMN "plainFont" BOOLEAN NOT NULL DEFAULT false;
