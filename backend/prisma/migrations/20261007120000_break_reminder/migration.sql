-- After every so many tasks done in a day the user is reminded to take a break; null (the default) = no reminder.
ALTER TABLE "User" ADD COLUMN "breakEvery" INTEGER;
