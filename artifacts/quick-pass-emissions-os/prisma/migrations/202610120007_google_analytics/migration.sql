-- CreateTable
CREATE TABLE "GoogleBusinessConnection" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "credentials" TEXT,
    "createdBy" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "connectedAt" TIMESTAMP(3),
    "discoveryAt" TIMESTAMP(3),
    "discovery" TEXT,
    "discoveryExpiresAt" TIMESTAMP(3),
    "lastScheduledDate" TEXT,
    "cooldownUntil" TIMESTAMP(3),

    CONSTRAINT "GoogleBusinessConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleBusinessOAuth" (
    "stateHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "verifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleBusinessOAuth_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "AnalyticsStation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stationHash" TEXT NOT NULL,
    "timezoneConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "AnalyticsStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsStationGrant" (
    "stationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AnalyticsStationGrant_pkey" PRIMARY KEY ("stationId","userId")
);

-- CreateTable
CREATE TABLE "GoogleBusinessLocation" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "GoogleBusinessLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleBusinessSync" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "cycle" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleBusinessSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleBusinessCache" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'GOOGLE_BUSINESS_PROFILE_API',
    "payload" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleBusinessCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsAction" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reviewDate" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "outcome" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "AnalyticsAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAttribution" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "customers" INTEGER NOT NULL,
    "costCents" INTEGER,
    "reference" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsStation_stationHash_key" ON "AnalyticsStation"("stationHash");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleBusinessLocation_locationName_key" ON "GoogleBusinessLocation"("locationName");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleBusinessLocation_stationId_key" ON "GoogleBusinessLocation"("stationId");

-- CreateIndex
CREATE INDEX "GoogleBusinessSync_status_nextAttemptAt_idx" ON "GoogleBusinessSync"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleBusinessSync_locationId_kind_period_key" ON "GoogleBusinessSync"("locationId", "kind", "period");

-- CreateIndex
CREATE INDEX "GoogleBusinessCache_expiresAt_idx" ON "GoogleBusinessCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleBusinessCache_locationId_kind_period_cycle_page_key" ON "GoogleBusinessCache"("locationId", "kind", "period", "cycle", "page");

-- CreateIndex
CREATE INDEX "AnalyticsAction_stationId_date_idx" ON "AnalyticsAction"("stationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingAttribution_reference_key" ON "MarketingAttribution"("reference");

-- CreateIndex
CREATE INDEX "MarketingAttribution_stationId_date_idx" ON "MarketingAttribution"("stationId", "date");

-- AddForeignKey
ALTER TABLE "AnalyticsStationGrant" ADD CONSTRAINT "AnalyticsStationGrant_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "AnalyticsStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleBusinessLocation" ADD CONSTRAINT "GoogleBusinessLocation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleBusinessConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleBusinessLocation" ADD CONSTRAINT "GoogleBusinessLocation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "AnalyticsStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleBusinessSync" ADD CONSTRAINT "GoogleBusinessSync_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GoogleBusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleBusinessCache" ADD CONSTRAINT "GoogleBusinessCache_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "GoogleBusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsAction" ADD CONSTRAINT "AnalyticsAction_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "AnalyticsStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "AnalyticsStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep domain bounds independently of browser validation.
ALTER TABLE "GoogleBusinessSync" ADD CONSTRAINT "google_sync_kind" CHECK ("kind" IN ('PERFORMANCE','KEYWORDS','REVIEWS')), ADD CONSTRAINT "google_sync_attempts" CHECK ("attempts" BETWEEN 0 AND 4 AND "page" BETWEEN 0 AND 199);
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "marketing_amount_bounds" CHECK ("customers" BETWEEN 0 AND 2000000000 AND ("costCents" IS NULL OR "costCents" BETWEEN 0 AND 2000000000));
ALTER TABLE "GoogleBusinessCache" ADD CONSTRAINT "google_cache_retention" CHECK ("expiresAt" > "fetchedAt" AND "expiresAt" <= "fetchedAt" + INTERVAL '30 days');
