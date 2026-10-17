-- AlterTable
ALTER TABLE "StationRecord" ADD COLUMN     "historicalOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StationInspectionEvidence" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "stationHash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "signature" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "vinHash" TEXT,
    "plateHash" TEXT,
    "invalidVin" BOOLEAN NOT NULL DEFAULT false,
    "payment" TEXT NOT NULL,
    "retest" TEXT NOT NULL,
    "completion" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationInspectionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationVehiclePlate" (
    "id" TEXT NOT NULL,
    "stationHash" TEXT NOT NULL,
    "plateHash" TEXT NOT NULL,
    "vinHash" TEXT NOT NULL,

    CONSTRAINT "StationVehiclePlate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionHistoryJob" (
    "id" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "stationHashes" TEXT[],
    "mode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recordLimit" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'PAUSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionHistoryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionHistoryWindow" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stationHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "superseded" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stagedAt" TIMESTAMP(3),
    "sourceTotal" INTEGER,
    "totalBasis" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "unresolved" INTEGER NOT NULL DEFAULT 0,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "checkpointAt" TIMESTAMP(3),
    "importId" TEXT,
    "error" TEXT,

    CONSTRAINT "InspectionHistoryWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionHistoryRow" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recordId" TEXT,
    "reason" TEXT,

    CONSTRAINT "InspectionHistoryRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionHistoryDecision" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionHistoryDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StationInspectionEvidence_recordId_key" ON "StationInspectionEvidence"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "StationInspectionEvidence_revisionId_key" ON "StationInspectionEvidence"("revisionId");

-- CreateIndex
CREATE INDEX "StationInspectionEvidence_stationHash_businessDate_idx" ON "StationInspectionEvidence"("stationHash", "businessDate");

-- CreateIndex
CREATE INDEX "StationInspectionEvidence_stationHash_vinHash_businessDate_idx" ON "StationInspectionEvidence"("stationHash", "vinHash", "businessDate");

-- CreateIndex
CREATE INDEX "StationInspectionEvidence_stationHash_plateHash_businessDat_idx" ON "StationInspectionEvidence"("stationHash", "plateHash", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "StationInspectionEvidence_stationHash_source_sourceId_key" ON "StationInspectionEvidence"("stationHash", "source", "sourceId");

-- CreateIndex
CREATE INDEX "StationVehiclePlate_stationHash_vinHash_plateHash_idx" ON "StationVehiclePlate"("stationHash", "vinHash", "plateHash");

-- CreateIndex
CREATE UNIQUE INDEX "StationVehiclePlate_stationHash_plateHash_vinHash_key" ON "StationVehiclePlate"("stationHash", "plateHash", "vinHash");

-- CreateIndex
CREATE INDEX "InspectionHistoryWindow_jobId_status_startDate_idx" ON "InspectionHistoryWindow"("jobId", "status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionHistoryWindow_jobId_stationHash_startDate_revisio_key" ON "InspectionHistoryWindow"("jobId", "stationHash", "startDate", "revision");

-- CreateIndex
CREATE INDEX "InspectionHistoryRow_windowId_status_rowNumber_idx" ON "InspectionHistoryRow"("windowId", "status", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionHistoryRow_windowId_rowNumber_key" ON "InspectionHistoryRow"("windowId", "rowNumber");

-- CreateIndex
CREATE INDEX "StationRevision_stationHash_businessDate_idx" ON "StationRevision"("stationHash", "businessDate");

-- AddForeignKey
ALTER TABLE "StationInspectionEvidence" ADD CONSTRAINT "StationInspectionEvidence_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "StationRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationInspectionEvidence" ADD CONSTRAINT "StationInspectionEvidence_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "StationRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionHistoryWindow" ADD CONSTRAINT "InspectionHistoryWindow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "InspectionHistoryJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionHistoryRow" ADD CONSTRAINT "InspectionHistoryRow_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "InspectionHistoryWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionHistoryDecision" ADD CONSTRAINT "InspectionHistoryDecision_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "InspectionHistoryRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Retain the original review workflow and add a distinct history-only source status.
ALTER TABLE "StationImport" DROP CONSTRAINT "StationImport_status_check";
ALTER TABLE "StationImport" ADD CONSTRAINT "StationImport_status_check" CHECK ("status" IN ('IMPORTED', 'FAILED', 'HISTORY_ONLY'));
ALTER TABLE "StationInspectionEvidence" ADD CONSTRAINT "StationInspectionEvidence_status_bounds" CHECK (
  "payment" IN ('UNKNOWN','PAID','UNPAID','REFUNDED') AND
  "retest" IN ('UNKNOWN','INITIAL','PAID_RETEST','FREE_RETEST') AND
  "completion" IN ('UNKNOWN','COMPLETED','VOIDED','CANCELLED','INCOMPLETE')
);
ALTER TABLE "InspectionHistoryJob" ADD CONSTRAINT "InspectionHistoryJob_bounds" CHECK (
  "recordLimit" BETWEEN 25 AND 200 AND "endDate" >= "startDate" AND
  "mode" IN ('PORTAL','FILE') AND "status" IN ('PAUSED','RUNNING','COMPLETED','PARTIAL')
);
ALTER TABLE "InspectionHistoryWindow" ADD CONSTRAINT "InspectionHistoryWindow_bounds" CHECK (
  "endDate" >= "startDate" AND "revision" > 0 AND "attempts" >= 0 AND
  "fetched" BETWEEN 0 AND 10000 AND "imported" >= 0 AND "duplicates" >= 0 AND "rejected" >= 0 AND "unresolved" >= 0 AND
  "cursor" BETWEEN 0 AND 10000 AND ("sourceTotal" IS NULL OR "sourceTotal" BETWEEN 0 AND 10000) AND
  "status" IN ('PENDING','RUNNING','PARTIAL','COMPLETED','FAILED') AND
  (("leaseToken" IS NULL) = ("leaseUntil" IS NULL))
);
ALTER TABLE "InspectionHistoryRow" ADD CONSTRAINT "InspectionHistoryRow_bounds" CHECK (
  "rowNumber" BETWEEN 1 AND 10000 AND "status" IN ('PENDING','IMPORTED','DUPLICATE','REJECTED','UNRESOLVED')
);
