CREATE TABLE "StationImport" (
 "id" TEXT PRIMARY KEY, "stationHash" TEXT NOT NULL, "digest" TEXT NOT NULL,
 "startDate" TEXT NOT NULL, "endDate" TEXT NOT NULL, "status" TEXT NOT NULL,
 "rows" INTEGER NOT NULL DEFAULT 0, "inserted" INTEGER NOT NULL DEFAULT 0,
 "duplicates" INTEGER NOT NULL DEFAULT 0, "elapsedMs" INTEGER NOT NULL DEFAULT 0,
 "coverage" TEXT NOT NULL DEFAULT 'PARTIAL', "reason" TEXT NOT NULL, "error" TEXT,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "reviewedAt" TIMESTAMP(3),
 CHECK ("endDate" >= "startDate"),
 CHECK ("status" IN ('IMPORTED','FAILED')),
 CHECK ("coverage" IN ('PARTIAL','OWNER_ATTESTED')),
 CHECK ("rows" >= 0 AND "inserted" >= 0 AND "duplicates" >= 0 AND "elapsedMs" >= 0)
);
CREATE TABLE "StationRecord" (
 "id" TEXT PRIMARY KEY, "stationHash" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'PENDING',
 "version" INTEGER NOT NULL DEFAULT 1, "currentRevisionId" TEXT,
 "employeeId" TEXT, "mappingId" TEXT, "disposition" TEXT NOT NULL DEFAULT 'UNRESOLVED',
 "eligible" BOOLEAN, "dealerServiceId" TEXT, "financeEntryId" TEXT,
 "reason" TEXT NOT NULL DEFAULT '',
 CHECK ("version" > 0),
 CHECK ("state" IN ('PENDING','CONFIRMED','SUPERSEDED')),
 CHECK ("disposition" IN ('UNRESOLVED','RETAIL','EXCLUDED','DEALER','FINANCE')),
 CHECK (NOT ("dealerServiceId" IS NOT NULL AND "financeEntryId" IS NOT NULL)),
 FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT,
 FOREIGN KEY ("dealerServiceId") REFERENCES "DealerService"("id") ON DELETE RESTRICT,
 FOREIGN KEY ("financeEntryId") REFERENCES "FinanceEntry"("id") ON DELETE RESTRICT
);
CREATE TABLE "StationRevision" (
 "id" TEXT PRIMARY KEY, "stationHash" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "recordId" TEXT NOT NULL REFERENCES "StationRecord"("id") ON DELETE RESTRICT,
 "importId" TEXT NOT NULL REFERENCES "StationImport"("id") ON DELETE RESTRICT,
 "sourceDate" TEXT NOT NULL, "businessDate" TEXT NOT NULL,
 "inspector" TEXT NOT NULL, "outcome" TEXT NOT NULL, "certificate" TEXT NOT NULL,
 "vehicleSuffix" TEXT NOT NULL, "vehicleHash" TEXT NOT NULL,
 "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "StationMapping" (
 "id" TEXT PRIMARY KEY, "stationHash" TEXT NOT NULL, "inspector" TEXT NOT NULL,
 "effectiveDate" TEXT NOT NULL, "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT,
 "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "StationRule" (
 "id" TEXT PRIMARY KEY, "stationHash" TEXT NOT NULL, "outcome" TEXT NOT NULL,
 "effectiveDate" TEXT NOT NULL, "eligible" BOOLEAN NOT NULL, "priceCents" INTEGER NOT NULL,
 "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("priceCents" BETWEEN 0 AND 2000000000)
);
CREATE TABLE "StationSetting" (
 "id" TEXT PRIMARY KEY, "stationHash" TEXT NOT NULL, "revision" INTEGER NOT NULL,
 "effectiveDate" TEXT NOT NULL, "weekStart" INTEGER NOT NULL, "hours" JSONB NOT NULL,
 "observationDays" INTEGER NOT NULL, "minimumDays" INTEGER NOT NULL,
 "sourceTimezoneConfirmed" BOOLEAN NOT NULL DEFAULT false,
 "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("revision" > 0 AND "weekStart" BETWEEN 1 AND 7),
 CHECK ("observationDays" BETWEEN 7 AND 365 AND "minimumDays" BETWEEN 1 AND "observationDays")
);
CREATE TABLE "StationReconciliation" (
 "id" TEXT PRIMARY KEY, "stationHash" TEXT NOT NULL,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT,
 "date" TEXT NOT NULL, "dailyEmissionId" TEXT NOT NULL REFERENCES "DailyEmission"("id") ON DELETE RESTRICT,
 "countVersion" INTEGER NOT NULL, "evidenceHash" TEXT NOT NULL, "evidence" JSONB NOT NULL,
 "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StationRevision_stationHash_fingerprint_key" ON "StationRevision"("stationHash","fingerprint");
CREATE UNIQUE INDEX "StationMapping_stationHash_inspector_effectiveDate_key" ON "StationMapping"("stationHash","inspector","effectiveDate");
CREATE UNIQUE INDEX "StationRule_stationHash_outcome_effectiveDate_key" ON "StationRule"("stationHash","outcome","effectiveDate");
CREATE UNIQUE INDEX "StationSetting_stationHash_revision_key" ON "StationSetting"("stationHash","revision");
CREATE UNIQUE INDEX "StationSetting_stationHash_effectiveDate_key" ON "StationSetting"("stationHash","effectiveDate");
CREATE INDEX "StationImport_stationHash_startDate_endDate_idx" ON "StationImport"("stationHash","startDate","endDate");
CREATE INDEX "StationRecord_stationHash_state_idx" ON "StationRecord"("stationHash","state");
CREATE INDEX "StationRevision_businessDate_idx" ON "StationRevision"("businessDate");
CREATE INDEX "StationReconciliation_stationHash_employeeId_date_idx" ON "StationReconciliation"("stationHash","employeeId","date");
