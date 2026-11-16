CREATE TABLE "DealerVirUpload" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "result" JSONB,
    "billingVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealerVirUpload_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DealerVirRecord" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "testKey" TEXT,
    "certificate" TEXT NOT NULL,
    "testNumber" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "minute" INTEGER,
    "vinHash" TEXT,
    "outcome" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "billing" TEXT NOT NULL,
    "serviceId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealerVirRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DealerVirRecord_reportKey_key" ON "DealerVirRecord"("reportKey");
CREATE UNIQUE INDEX "DealerVirRecord_sourceKey_key" ON "DealerVirRecord"("sourceKey");
CREATE UNIQUE INDEX "DealerVirRecord_testKey_key" ON "DealerVirRecord"("testKey");
CREATE INDEX "DealerVirRecord_vinHash_date_idx" ON "DealerVirRecord"("vinHash", "date");
CREATE INDEX "DealerVirRecord_dealershipId_date_idx" ON "DealerVirRecord"("dealershipId", "date");
CREATE INDEX "DealerVirUpload_createdBy_createdAt_idx" ON "DealerVirUpload"("createdBy", "createdAt");
ALTER TABLE "DealerVirUpload" ADD CONSTRAINT "DealerVirUpload_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerVirRecord" ADD CONSTRAINT "DealerVirRecord_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "DealerVirUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealerVirRecord" ADD CONSTRAINT "DealerVirRecord_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
