ALTER TABLE "BusinessSetting"
ADD COLUMN "operatingHours" JSONB NOT NULL DEFAULT '{}'::jsonb;
