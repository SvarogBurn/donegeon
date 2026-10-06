-- Whether the account has been through the tutorial (or skipped it). Accounts from before it existed are not shown it.
ALTER TABLE "User" ADD COLUMN "tutorialSeen" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "tutorialSeen" = true;
