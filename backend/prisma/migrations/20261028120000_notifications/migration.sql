-- Notifications: which ones the account gets (User.notifications), the devices they are pushed to, and what the app
-- planned for the server to send.
ALTER TABLE "User" ADD COLUMN "notifications" JSONB;

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduledNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "params" JSONB,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE INDEX "ScheduledNotification_sentAt_sendAt_idx" ON "ScheduledNotification"("sentAt", "sendAt");
CREATE UNIQUE INDEX "ScheduledNotification_userId_key_key" ON "ScheduledNotification"("userId", "key");

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledNotification" ADD CONSTRAINT "ScheduledNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
