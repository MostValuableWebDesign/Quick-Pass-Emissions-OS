-- Unknown reference configuration is not a zero balance, measurement or verification.
ALTER TABLE "Vendor" ALTER COLUMN "verifiedDate" DROP NOT NULL;
ALTER TABLE "ChemicalItem" ALTER COLUMN "unit" DROP NOT NULL;
ALTER TABLE "ChemicalItem" ALTER COLUMN "reorderPoint" DROP NOT NULL;
ALTER TABLE "ChemicalItem" ADD CONSTRAINT "chemical_unit_before_stock"
  CHECK ("balance" IS NULL OR "unit" IS NOT NULL);
ALTER TABLE "CertificateSetting" ALTER COLUMN "reorderPoint" DROP NOT NULL;
ALTER TABLE "CertificateSetting" ALTER COLUMN "leadDays" DROP NOT NULL;
ALTER TABLE "CertificateSetting" ALTER COLUMN "windowDays" DROP NOT NULL;
CREATE TABLE "BusinessImport" (
 "id" TEXT PRIMARY KEY,
 "sourceFingerprint" TEXT NOT NULL,
 "sourceName" TEXT NOT NULL,
 "actorId" TEXT NOT NULL REFERENCES "User"("id"),
 "storeId" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "items" JSONB NOT NULL,
 "counts" JSONB NOT NULL
);
CREATE INDEX "BusinessImport_createdAt_idx" ON "BusinessImport"("createdAt");
