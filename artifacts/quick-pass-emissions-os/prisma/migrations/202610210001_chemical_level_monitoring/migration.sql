-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "sensorIncidentId" TEXT;

-- CreateTable
CREATE TABLE "ChemicalSensor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "chemicalId" TEXT NOT NULL,
    "containerSize" TEXT NOT NULL,
    "locationNote" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "registeredBy" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "staleAfterMinutes" INTEGER NOT NULL DEFAULT 1440,
    "heartbeatMinutes" INTEGER,
    "lastState" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastObservedAt" TIMESTAMP(3),
    "lastAppliedAt" TIMESTAMP(3),
    "lastReceivedAt" TIMESTAMP(3),
    "stateFenceAt" TIMESTAMP(3),
    "manualRefilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChemicalSensor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalSensorCredential" (
    "id" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ChemicalSensorCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalSensorEvent" (
    "id" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventIdentity" TEXT,
    "state" TEXT NOT NULL,
    "fault" TEXT,
    "observedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disposition" TEXT NOT NULL,
    "chemicalId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "actorId" TEXT,

    CONSTRAINT "ChemicalSensorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalSensorIncident" (
    "id" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "openedByEventId" TEXT NOT NULL,
    "taskId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "ChemicalSensorIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalSensorRate" (
    "key" TEXT NOT NULL,
    "minute" BIGINT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "ChemicalSensorRate_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ChemicalSensor_stationId_active_idx" ON "ChemicalSensor"("stationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ChemicalSensorCredential_tokenHash_key" ON "ChemicalSensorCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "ChemicalSensorCredential_sensorId_revokedAt_idx" ON "ChemicalSensorCredential"("sensorId", "revokedAt");

-- CreateIndex
CREATE INDEX "ChemicalSensorEvent_sensorId_source_receivedAt_id_idx" ON "ChemicalSensorEvent"("sensorId", "source", "receivedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ChemicalSensorEvent_sensorId_source_dedupeKey_key" ON "ChemicalSensorEvent"("sensorId", "source", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChemicalSensorIncident_openedByEventId_key" ON "ChemicalSensorIncident"("openedByEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ChemicalSensorIncident_taskId_key" ON "ChemicalSensorIncident"("taskId");

-- CreateIndex
CREATE INDEX "ChemicalSensorIncident_sensorId_closedAt_idx" ON "ChemicalSensorIncident"("sensorId", "closedAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sensorIncidentId_fkey" FOREIGN KEY ("sensorIncidentId") REFERENCES "ChemicalSensorIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalSensor" ADD CONSTRAINT "ChemicalSensor_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "AnalyticsStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalSensor" ADD CONSTRAINT "ChemicalSensor_chemicalId_fkey" FOREIGN KEY ("chemicalId") REFERENCES "ChemicalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalSensorCredential" ADD CONSTRAINT "ChemicalSensorCredential_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "ChemicalSensor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalSensorEvent" ADD CONSTRAINT "ChemicalSensorEvent_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "ChemicalSensor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalSensorIncident" ADD CONSTRAINT "ChemicalSensorIncident_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "ChemicalSensor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active low incident per sensor, even across processes.
CREATE UNIQUE INDEX "ChemicalSensorIncident_one_open" ON "ChemicalSensorIncident" ("sensorId") WHERE "closedAt" IS NULL;
ALTER TABLE "ChemicalSensor" ADD CONSTRAINT "ChemicalSensor_bounds" CHECK (
  "version" >= 0 AND "staleAfterMinutes" BETWEEN 5 AND 43200 AND
  ("heartbeatMinutes" IS NULL OR "heartbeatMinutes" BETWEEN 1 AND 1440) AND
  "lastState" IN ('LOW','ABOVE_THRESHOLD','UNKNOWN','FAULT')
);
ALTER TABLE "ChemicalSensorEvent" ADD CONSTRAINT "ChemicalSensorEvent_bounds" CHECK (
  "source" IN ('LIVE','SYNTHETIC','MANUAL') AND "state" IN ('LOW','ABOVE_THRESHOLD','UNKNOWN','FAULT','HEARTBEAT','REFILLED')
);
ALTER TABLE "ChemicalSensor" ADD CONSTRAINT "ChemicalSensor_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChemicalSensorIncident" ADD CONSTRAINT "ChemicalSensorIncident_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
