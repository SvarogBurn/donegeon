-- A tick the next round took off a persistent task's subtask stays done: exp, stats and its points.
CREATE TABLE "RoundTick" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "pointTransactionId" TEXT,
    "completionId" TEXT,

    CONSTRAINT "RoundTick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoundTick_taskId_at_key" ON "RoundTick"("taskId", "at");
CREATE INDEX "RoundTick_userId_idx" ON "RoundTick"("userId");
CREATE INDEX "RoundTick_completionId_idx" ON "RoundTick"("completionId");

ALTER TABLE "RoundTick" ADD CONSTRAINT "RoundTick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundTick" ADD CONSTRAINT "RoundTick_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundTick" ADD CONSTRAINT "RoundTick_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "TaskCompletion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The ticks past presses took off count again. A tick's booking isn't linked: the next press closes it.
INSERT INTO "RoundTick" ("id", "userId", "taskId", "day", "at", "completionId")
SELECT gen_random_uuid()::text, p."userId", tick.id, tick."completedOn", (tick."completedAt"::timestamptz AT TIME ZONE 'UTC'), p.id
FROM "TaskCompletion" p
CROSS JOIN LATERAL jsonb_to_recordset(CASE WHEN jsonb_typeof(p.unticked) = 'array' THEN p.unticked ELSE '[]'::jsonb END) AS tick(id text, "completedAt" text, "completedOn" text)
JOIN "Task" t ON t.id = tick.id
ON CONFLICT DO NOTHING;
