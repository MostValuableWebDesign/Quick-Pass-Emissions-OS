-- Existing addresses remain manual; contact verification is independent of address provenance.
ALTER TABLE "Employee" ADD COLUMN "addressSource" TEXT NOT NULL DEFAULT 'MANUAL', ADD COLUMN "addressProviderId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Dealership" ADD COLUMN "addressSource" TEXT NOT NULL DEFAULT 'MANUAL', ADD COLUMN "addressProviderId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Vendor" ADD COLUMN "addressSource" TEXT NOT NULL DEFAULT 'MANUAL', ADD COLUMN "addressProviderId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "streetAddress" TEXT NOT NULL DEFAULT '', ADD COLUMN "addressLine2" TEXT NOT NULL DEFAULT '',
ADD COLUMN "city" TEXT NOT NULL DEFAULT '', ADD COLUMN "state" TEXT NOT NULL DEFAULT '', ADD COLUMN "postalCode" TEXT NOT NULL DEFAULT '';
