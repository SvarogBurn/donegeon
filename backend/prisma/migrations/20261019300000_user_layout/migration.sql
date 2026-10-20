-- Which boxes of the user's page are minimized; null = none.
ALTER TABLE "User" ADD COLUMN "userLayout" JSONB;
