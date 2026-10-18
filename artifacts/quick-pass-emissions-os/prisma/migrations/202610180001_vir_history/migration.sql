-- Retain legacy imports, source snapshots and canonical records without asserting VIR provenance.
ALTER TABLE "StationInspectionEvidence"
  ADD COLUMN "sourceKind" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "extractionMethod" TEXT NOT NULL DEFAULT 'STRUCTURED',
  ADD COLUMN "identityStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED';
ALTER TABLE "InspectionHistoryWindow"
  ADD COLUMN "reportPayload" TEXT,
  ADD COLUMN "reportDigest" TEXT,
  ADD COLUMN "retrievedAt" TIMESTAMP(3),
  ADD COLUMN "retrievalComplete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "identityReview" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InspectionHistoryRow" ADD COLUMN "identityReview" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "InspectionHistoryWindow_station_dates_idx" ON "InspectionHistoryWindow" ("stationHash", "startDate", "endDate");
ALTER TABLE "InspectionHistoryJob" DROP CONSTRAINT "InspectionHistoryJob_bounds";
ALTER TABLE "InspectionHistoryJob" ADD CONSTRAINT "InspectionHistoryJob_bounds" CHECK (
  "recordLimit" BETWEEN 25 AND 200 AND "endDate" >= "startDate" AND
  "mode" IN ('PORTAL','FILE','REFRESH') AND "status" IN ('PAUSED','RUNNING','COMPLETED','PARTIAL')
);
ALTER TABLE "InspectionHistoryWindow" DROP CONSTRAINT "InspectionHistoryWindow_bounds";
ALTER TABLE "InspectionHistoryWindow" ADD CONSTRAINT "InspectionHistoryWindow_bounds" CHECK (
  "endDate" >= "startDate" AND "revision" > 0 AND "attempts" >= 0 AND
  "fetched" BETWEEN 0 AND 10000 AND "imported" >= 0 AND "duplicates" >= 0 AND "rejected" >= 0 AND "unresolved" >= 0 AND "identityReview" >= 0 AND
  "cursor" BETWEEN 0 AND 10000 AND ("sourceTotal" IS NULL OR "sourceTotal" BETWEEN 0 AND 10000) AND
  "status" IN ('PENDING','RUNNING','PARTIAL','COMPLETED','FAILED','UNAVAILABLE') AND
  (("leaseToken" IS NULL) = ("leaseUntil" IS NULL))
);
ALTER TABLE "StationInspectionEvidence" ADD CONSTRAINT "StationInspectionEvidence_extraction_bounds" CHECK (
  "sourceKind" IN ('LEGACY','VIR') AND "extractionMethod" IN ('STRUCTURED','EMBEDDED_TEXT','OCR') AND
  "identityStatus" IN ('UNREVIEWED','VALID_VIN','PLATE_STATE','NEEDS_REVIEW')
);
