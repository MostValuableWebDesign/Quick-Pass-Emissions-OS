-- Additive only. Existing inspections, invoice snapshots and payment records are untouched.
CREATE TABLE "MarketingCampaign" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "channel" TEXT NOT NULL,
 "stationHashes" JSONB NOT NULL, "startDate" TEXT NOT NULL, "endDate" TEXT NOT NULL,
 "offer" TEXT NOT NULL DEFAULT '', "budgetCents" INTEGER NOT NULL DEFAULT 0,
 "status" TEXT NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 0,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "marketing_campaign_money" CHECK ("budgetCents" >= 0),
 CONSTRAINT "marketing_campaign_dates" CHECK ("endDate" >= "startDate"),
 CONSTRAINT "marketing_campaign_status" CHECK ("status" IN ('DRAFT','ACTIVE','PAUSED','COMPLETED','ARCHIVED')),
 CONSTRAINT "marketing_campaign_channel" CHECK ("channel" IN ('GOOGLE','SOCIAL','FLYERS','REFERRALS','DEALERSHIPS','OTHER'))
);
CREATE TABLE "MarketingExpense" (
 "id" TEXT PRIMARY KEY, "campaignId" TEXT NOT NULL, "stationHash" TEXT NOT NULL,
 "date" TEXT NOT NULL, "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
 "description" TEXT NOT NULL, "reference" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "voidedAt" TIMESTAMP(3), "voidReason" TEXT,
 CONSTRAINT "MarketingExpense_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MarketingPromo" (
 "id" TEXT PRIMARY KEY, "campaignId" TEXT NOT NULL, "code" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "value" INTEGER NOT NULL, "startDate" TEXT NOT NULL,
 "endDate" TEXT NOT NULL, "stationHashes" JSONB NOT NULL, "usageLimit" INTEGER NOT NULL CHECK ("usageLimit" > 0),
 "active" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 0,
 "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "marketing_promo_discount" CHECK ("value" > 0 AND ("kind" = 'FIXED' OR ("kind" = 'PERCENT' AND "value" <= 10000))),
 CONSTRAINT "marketing_promo_dates" CHECK ("endDate" >= "startDate"),
 CONSTRAINT "MarketingPromo_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MarketingObservation" (
 "id" TEXT PRIMARY KEY, "recordId" TEXT, "serviceId" TEXT, "stationHash" TEXT NOT NULL,
 "date" TEXT NOT NULL, "source" TEXT, "campaignId" TEXT, "inspectionKind" TEXT NOT NULL DEFAULT 'UNKNOWN',
 "evidence" TEXT NOT NULL DEFAULT '', "version" INTEGER NOT NULL DEFAULT 0, "createdBy" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "marketing_observation_target" CHECK (("recordId" IS NULL) <> ("serviceId" IS NULL)),
 CONSTRAINT "marketing_observation_source" CHECK ("source" IS NULL OR "source" IN ('GOOGLE','DRIVE_BY','REFERRAL','DEALERSHIP','SOCIAL','FLYER','RETURNING','OTHER','UNKNOWN')),
 CONSTRAINT "marketing_observation_kind" CHECK ("inspectionKind" IN ('PAID','FREE','UNKNOWN','OTHER')),
 CONSTRAINT "MarketingObservation_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "StationRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "MarketingObservation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "DealerService"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "MarketingObservation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MarketingRedemption" (
 "id" TEXT PRIMARY KEY, "promoId" TEXT NOT NULL, "serviceId" TEXT NOT NULL, "stationHash" TEXT NOT NULL,
 "date" TEXT NOT NULL, "baseCents" INTEGER NOT NULL, "discountCents" INTEGER NOT NULL, "finalCents" INTEGER NOT NULL,
 "terms" JSONB NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "marketing_redemption_money" CHECK ("baseCents" > 0 AND "discountCents" > 0 AND "finalCents" > 0 AND "baseCents" = "discountCents" + "finalCents"),
 CONSTRAINT "MarketingRedemption_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "MarketingPromo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "MarketingRedemption_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "DealerService"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MarketingAction" (
 "id" TEXT PRIMARY KEY, "campaignId" TEXT NOT NULL, "title" TEXT NOT NULL, "rationale" TEXT NOT NULL,
 "periodStart" TEXT NOT NULL, "periodEnd" TEXT NOT NULL, "reviewDate" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PLANNED', "resultNotes" TEXT NOT NULL DEFAULT '', "baseline" JSONB NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 0, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "marketing_action_dates" CHECK ("periodEnd" >= "periodStart"),
 CONSTRAINT "marketing_action_status" CHECK ("status" IN ('PLANNED','DONE','REVIEWED')),
 CONSTRAINT "MarketingAction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MarketingMaterial" (
 "id" TEXT PRIMARY KEY, "campaignId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "copy" TEXT NOT NULL DEFAULT '', "objectPath" TEXT, "filename" TEXT, "mimeType" TEXT,
 "byteSize" INTEGER, "status" TEXT NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 0,
 "createdBy" TEXT NOT NULL, "approvedBy" TEXT, "approvedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "marketing_material_status" CHECK ("status" IN ('DRAFT','APPROVED','ARCHIVED')),
 CONSTRAINT "marketing_material_size" CHECK ("byteSize" IS NULL OR "byteSize" BETWEEN 1 AND 2097152),
 CONSTRAINT "MarketingMaterial_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketingExpense_reference_key" ON "MarketingExpense"("reference");
CREATE INDEX "MarketingExpense_campaignId_date_idx" ON "MarketingExpense"("campaignId","date");
CREATE UNIQUE INDEX "MarketingPromo_code_key" ON "MarketingPromo"("code");
CREATE UNIQUE INDEX "MarketingObservation_recordId_key" ON "MarketingObservation"("recordId");
CREATE UNIQUE INDEX "MarketingObservation_serviceId_key" ON "MarketingObservation"("serviceId");
CREATE INDEX "MarketingObservation_stationHash_date_idx" ON "MarketingObservation"("stationHash","date");
CREATE UNIQUE INDEX "MarketingRedemption_serviceId_key" ON "MarketingRedemption"("serviceId");
