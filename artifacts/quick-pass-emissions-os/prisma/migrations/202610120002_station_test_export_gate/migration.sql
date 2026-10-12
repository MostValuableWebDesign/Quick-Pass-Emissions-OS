-- Coordination only; existing station snapshots and business ledgers are unchanged.
CREATE TABLE "StationTestExportState" (
  "stationHash" TEXT NOT NULL,
  "activeToken" TEXT,
  "activeUntil" TIMESTAMP(3),
  "cooldownUntil" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StationTestExportState_pkey" PRIMARY KEY ("stationHash"),
  CONSTRAINT "StationTestExportState_active_pair" CHECK
    (("activeToken" IS NULL) = ("activeUntil" IS NULL))
);
