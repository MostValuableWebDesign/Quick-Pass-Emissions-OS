-- Additive only: earlier migrations and domain snapshots are unchanged.
CREATE TABLE "SummarySchedule" (
 "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL, "revision" INTEGER NOT NULL CHECK ("revision">0),
 "active" BOOLEAN NOT NULL DEFAULT true, "frequency" TEXT NOT NULL CHECK ("frequency" IN ('DAILY','WEEKLY')),
 "weekday" INTEGER CHECK ("weekday" BETWEEN 1 AND 7), "time" TEXT NOT NULL,
 "openDaysOnly" BOOLEAN NOT NULL, "nextDate" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("key","revision"), CHECK ("frequency"='DAILY' OR "weekday" IS NOT NULL));
CREATE UNIQUE INDEX "SummarySchedule_one_active" ON "SummarySchedule" ("key") WHERE "active";
CREATE TABLE "ReminderPolicy" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL CHECK ("kind" IN ('MAINTENANCE','CERTIFICATION','DEALER','RENTAL')),
 "revision" INTEGER NOT NULL CHECK ("revision">0), "active" BOOLEAN NOT NULL,
 "advanceDays" INTEGER NOT NULL CHECK ("advanceDays" BETWEEN 0 AND 365),
 "escalationDays" INTEGER NOT NULL CHECK ("escalationDays" BETWEEN 0 AND 365),
 "recipients" TEXT[] NOT NULL, "escalationRecipients" TEXT[] NOT NULL,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("kind","revision"));
CREATE TABLE "ForecastPolicy" (
 "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL, "revision" INTEGER NOT NULL CHECK ("revision">0),
 "windowDays" INTEGER NOT NULL CHECK ("windowDays" BETWEEN 7 AND 365),
 "minimumDays" INTEGER NOT NULL CHECK ("minimumDays" BETWEEN 1 AND "windowDays"),
 "leadDays" INTEGER NOT NULL CHECK ("leadDays" BETWEEN 0 AND 365),
 "threshold" INTEGER NOT NULL CHECK ("threshold" BETWEEN 0 AND 2000000000),
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("key","revision"));
CREATE TABLE "AutomationJob" (
 "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "kind" TEXT NOT NULL CHECK ("kind" IN ('SUMMARY','REMINDERS')),
 "scheduleId" TEXT, "occurrenceDate" TEXT, "dueAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','RUNNING','SUCCESS','FAILED','SUPERSEDED')),
 "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 4),
 "nextAttemptAt" TIMESTAMP(3) NOT NULL, "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT,
 "completedAt" TIMESTAMP(3), "failure" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AutomationJob_status_nextAttemptAt_idx" ON "AutomationJob" ("status","nextAttemptAt");
CREATE TABLE "SavedSummary" (
 "id" TEXT PRIMARY KEY, "jobId" TEXT NOT NULL UNIQUE REFERENCES "AutomationJob"("id") ON DELETE RESTRICT,
 "scheduleId" TEXT NOT NULL, "generatedAt" TIMESTAMP(3) NOT NULL,
 "periodStart" TEXT NOT NULL, "periodEnd" TEXT NOT NULL, "payload" JSONB NOT NULL);
CREATE TABLE "ActionReminder" (
 "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "kind" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "stage" TEXT NOT NULL CHECK ("stage" IN ('ADVANCE','OVERDUE','ESCALATED')),
 "policyId" TEXT NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "href" TEXT NOT NULL,
 "dueDate" TEXT NOT NULL, "acknowledgedAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3), "resolution" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "ActionReminder_userId_resolvedAt_idx" ON "ActionReminder" ("userId","resolvedAt");
CREATE TABLE "AutomationDelivery" (
 "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "summaryId" TEXT REFERENCES "SavedSummary"("id") ON DELETE RESTRICT,
 "reminderId" TEXT REFERENCES "ActionReminder"("id") ON DELETE RESTRICT,
 "status" TEXT NOT NULL DEFAULT 'DELIVERED' CHECK ("status" IN ('DELIVERED','REVOKED')),
 "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "failure" TEXT,
 CHECK (("summaryId" IS NULL) <> ("reminderId" IS NULL)));
