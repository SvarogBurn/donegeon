-- The most a points amount can be set to, if the user wants a limit; null (the default) = no cap.
ALTER TABLE "User" ADD COLUMN "pointsCap" INTEGER;
