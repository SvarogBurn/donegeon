-- The order of the boxes on the Calendar page (Days, Calendar), as the user arranged them.
ALTER TABLE "User" ADD COLUMN "calendarLayout" JSONB;
