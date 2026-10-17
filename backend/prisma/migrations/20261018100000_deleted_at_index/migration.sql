-- Deleted tasks and lists are removed for good a minute after the delete, by a check every minute across
-- all users: these keep it from reading the whole table each time.
CREATE INDEX "Task_deletedAt_idx" ON "Task"("deletedAt");
CREATE INDEX "List_deletedAt_idx" ON "List"("deletedAt");
