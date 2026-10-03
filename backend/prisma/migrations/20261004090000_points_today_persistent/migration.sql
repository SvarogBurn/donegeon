-- CreateEnum
CREATE TYPE "ListKind" AS ENUM ('task', 'reward');

-- DropForeignKey
ALTER TABLE "DailyEntry" DROP CONSTRAINT "DailyEntry_taskId_fkey";

-- DropForeignKey
ALTER TABLE "DailyEntry" DROP CONSTRAINT "DailyEntry_userId_fkey";

-- DropForeignKey
ALTER TABLE "PointTransaction" DROP CONSTRAINT "PointTransaction_relatedRewardId_fkey";

-- DropForeignKey
ALTER TABLE "Reward" DROP CONSTRAINT "Reward_userId_fkey";

-- AlterTable
ALTER TABLE "List" ADD COLUMN     "defaultPoints" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "kind" "ListKind" NOT NULL DEFAULT 'task';

-- AlterTable
ALTER TABLE "PointTransaction" DROP COLUMN "relatedRewardId",
ADD COLUMN     "reversesId" TEXT,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "isPersistent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "todaySince" TEXT;

-- DropTable
DROP TABLE "DailyEntry";

-- DropTable
DROP TABLE "Reward";

-- DropEnum
DROP TYPE "DailyEntryStatus";

-- CreateTable
CREATE TABLE "TaskCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "pointTransactionId" TEXT,
    "unticked" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCompletion_taskId_idx" ON "TaskCompletion"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "PointTransaction_reversesId_key" ON "PointTransaction"("reversesId");

-- CreateIndex
CREATE INDEX "PointTransaction_relatedTaskId_idx" ON "PointTransaction"("relatedTaskId");

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "PointTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

