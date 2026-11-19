ALTER TABLE "DealerService"
ADD COLUMN "vehicleVins" JSONB NOT NULL DEFAULT '[]'::jsonb;
