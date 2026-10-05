-- How the stats boxes on the user's page are arranged and which are hidden.
ALTER TABLE "User" ADD COLUMN "statsLayout" JSONB;
