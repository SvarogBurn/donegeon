/*
  Warnings:

  - You are about to drop the `TaskListMembership` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_goalId_fkey";

-- DropForeignKey
ALTER TABLE "TaskListMembership" DROP CONSTRAINT "TaskListMembership_listId_fkey";

-- DropForeignKey
ALTER TABLE "TaskListMembership" DROP CONSTRAINT "TaskListMembership_taskId_fkey";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "listId" TEXT;

-- DropTable
DROP TABLE "TaskListMembership";

-- CreateIndex
CREATE INDEX "Task_listId_idx" ON "Task"("listId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing data: what used to be goal cards on the dashboard become lists.
-- Each goal that holds tasks gets a list of the same name (the goal itself
-- stays, still assigned to those tasks); everything else goes to "Tasks".
INSERT INTO "List" ("id", "userId", "name", "position", "isArchived", "createdAt")
SELECT gen_random_uuid()::text, g."userId", g."name",
       row_number() OVER (PARTITION BY g."userId" ORDER BY g."createdAt"), false, now()
FROM "Goal" g
WHERE EXISTS (SELECT 1 FROM "Task" t WHERE t."goalId" = g."id" AND t."parentId" IS NULL);

UPDATE "Task" t SET "listId" = l."id"
FROM "Goal" g JOIN "List" l ON l."userId" = g."userId" AND l."name" = g."name" AND l."position" > 0
WHERE t."goalId" = g."id" AND t."parentId" IS NULL;

INSERT INTO "List" ("id", "userId", "name", "position", "isArchived", "createdAt")
SELECT gen_random_uuid()::text, u."id", 'Tasks', 0, false, now()
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "List" l WHERE l."userId" = u."id")
   OR EXISTS (SELECT 1 FROM "Task" t WHERE t."userId" = u."id" AND t."parentId" IS NULL AND t."listId" IS NULL);

UPDATE "Task" t SET "listId" = l."id"
FROM "List" l
WHERE l."userId" = t."userId" AND l."name" = 'Tasks' AND l."position" = 0
  AND t."parentId" IS NULL AND t."listId" IS NULL;
