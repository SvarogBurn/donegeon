-- The dashboard's deadlines box: its range tab, how Per day is counted, soft deadlines in or out, and its colours. null = the defaults.
ALTER TABLE "User" ADD COLUMN "deadlineTable" JSONB;
