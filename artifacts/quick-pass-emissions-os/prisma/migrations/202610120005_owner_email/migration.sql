-- CreateTable
CREATE TABLE "OwnerEmailSetting" (
    "id" TEXT NOT NULL DEFAULT 'daily',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "time" TEXT NOT NULL DEFAULT '18:30',
    "recipients" TEXT[],
    "nextDate" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerEmailSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerEmailReport" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "OwnerEmailReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerSummaryEmail" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "firstAttemptAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "toEmail" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "providerId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "failure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerSummaryEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerEmailReport_date_key" ON "OwnerEmailReport"("date");

-- CreateIndex
CREATE INDEX "OwnerSummaryEmail_status_nextAttemptAt_idx" ON "OwnerSummaryEmail"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerSummaryEmail_userId_reportDate_key" ON "OwnerSummaryEmail"("userId", "reportDate");

-- AddForeignKey
ALTER TABLE "OwnerEmailSetting" ADD CONSTRAINT "OwnerEmailSetting_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerSummaryEmail" ADD CONSTRAINT "OwnerSummaryEmail_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "OwnerEmailReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerSummaryEmail" ADD CONSTRAINT "OwnerSummaryEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Keep the owner-requested schedule and queue lifecycle valid at the storage boundary.
ALTER TABLE "OwnerEmailSetting" ADD CONSTRAINT "owner_email_setting_valid"
  CHECK ("id" = 'daily' AND "time" = '18:30' AND "revision" > 0 AND cardinality("recipients") <= 30);
ALTER TABLE "OwnerSummaryEmail" ADD CONSTRAINT "owner_email_status_valid"
  CHECK ("status" IN ('PENDING', 'RUNNING', 'ACCEPTED', 'FAILED', 'CANCELLED', 'REVIEW') AND "attempts" >= 0 AND "attempts" <= 4);
