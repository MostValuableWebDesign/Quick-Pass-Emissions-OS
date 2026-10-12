-- AlterTable
ALTER TABLE "GoogleBusinessConnection" DROP COLUMN "lastScheduledDate", ADD COLUMN "rateLimitedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GoogleBusinessSync" ADD COLUMN     "publishedCycle" TEXT,
ADD COLUMN     "publishedPage" INTEGER,
ADD COLUMN     "requestId" TEXT;

-- CreateTable
CREATE TABLE "GoogleBusinessRequest" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GoogleBusinessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleBusinessRequest_locationId_createdAt_idx" ON "GoogleBusinessRequest"("locationId", "createdAt");

-- AddForeignKey
ALTER TABLE "GoogleBusinessRequest" ADD CONSTRAINT "GoogleBusinessRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GoogleBusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleBusinessSync" ADD CONSTRAINT "GoogleBusinessSync_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "GoogleBusinessRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Retain usable legacy caches. A complete page count is recorded only for a finished cycle.
UPDATE "GoogleBusinessSync" s SET "publishedCycle" = s."cycle",
  "publishedPage" = CASE WHEN s."status" = 'SUCCESS' THEN s."page" ELSE NULL END
WHERE EXISTS (SELECT 1 FROM "GoogleBusinessCache" c WHERE c."cycle" = s."cycle" AND c."locationId" = s."locationId" AND c."kind" = s."kind" AND c."period" = s."period");
-- Old tasks have no explicit manual request provenance. Never resume ambiguous automatic work.
UPDATE "GoogleBusinessSync" SET "status" = 'CANCELED', "cursor" = NULL, "leaseToken" = NULL,
  "leaseUntil" = NULL, "error" = 'Legacy automatic work stopped. Click Sync now for a new manual request.'
WHERE "status" IN ('QUEUED', 'RUNNING', 'RETRY');
ALTER TABLE "GoogleBusinessRequest" ADD CONSTRAINT "google_request_status" CHECK ("status" IN ('QUEUED','RUNNING','SUCCESS','PARTIAL','FAILED'));
