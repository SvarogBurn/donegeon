-- Whether the built-in boxes show their colour button; off by default.
ALTER TABLE "User" ADD COLUMN "boxColorEdit" BOOLEAN NOT NULL DEFAULT false;
