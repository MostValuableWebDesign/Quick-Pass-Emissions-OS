CREATE TABLE "ReminderEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "alertAt" TIMESTAMP(3) NOT NULL,
    "alertMinutes" INTEGER NOT NULL DEFAULT 15,
    "readAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReminderEvent_userId_alertAt_readAt_idx"
ON "ReminderEvent"("userId", "alertAt", "readAt");

CREATE INDEX "ReminderEvent_userId_startsAt_completedAt_cancelledAt_idx"
ON "ReminderEvent"("userId", "startsAt", "completedAt", "cancelledAt");

ALTER TABLE "ReminderEvent"
ADD CONSTRAINT "ReminderEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
