ALTER TABLE "Vendor"
 ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT '{}',
 ADD COLUMN "extension" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "alternateContact" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "alternatePhone" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "alternateExtension" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "alternateEmail" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "website" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "supportUrl" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "hours" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "emergencyDetails" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "emergencyPhone" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "operationalInstructions" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "supportedServices" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "sourceReference" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "lastConfirmedDate" TEXT,
 ADD COLUMN "accountReference" TEXT NOT NULL DEFAULT '';
CREATE TABLE "SupportPreference" (
 "category" TEXT PRIMARY KEY,
 "vendorId" TEXT REFERENCES "Vendor"("id") ON DELETE RESTRICT,
 "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0)
);
CREATE TABLE "SupportAssociation" (
 "id" TEXT PRIMARY KEY,
 "vendorId" TEXT NOT NULL REFERENCES "Vendor"("id") ON DELETE RESTRICT,
 "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE RESTRICT,
 "bayId" TEXT REFERENCES "CarwashBay"("id") ON DELETE RESTRICT,
 CHECK (("equipmentId" IS NOT NULL)::int + ("bayId" IS NOT NULL)::int = 1),
 UNIQUE ("vendorId", "equipmentId"), UNIQUE ("vendorId", "bayId")
);
CREATE TABLE "SupportContactHistory" (
 "id" TEXT PRIMARY KEY,
 "vendorId" TEXT NOT NULL REFERENCES "Vendor"("id") ON DELETE RESTRICT,
 "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "actorName" TEXT NOT NULL,
 "contactedAt" TIMESTAMP(3) NOT NULL,
 "method" TEXT NOT NULL CHECK ("method" IN ('PHONE','EMAIL','PORTAL','IN_PERSON','OTHER')),
 "equipmentId" TEXT REFERENCES "Equipment"("id") ON DELETE RESTRICT,
 "ticketId" TEXT REFERENCES "MaintenanceTicket"("id") ON DELETE RESTRICT,
 "outcome" TEXT NOT NULL DEFAULT '',
 "reference" TEXT NOT NULL DEFAULT '',
 "followUpDate" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SupportContactHistory_vendorId_createdAt_idx" ON "SupportContactHistory"("vendorId","createdAt");
