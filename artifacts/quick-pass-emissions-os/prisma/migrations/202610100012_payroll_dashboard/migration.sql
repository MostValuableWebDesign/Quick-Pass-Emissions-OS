-- Additive: existing compensation and approved JSON snapshots retain their original meaning.
ALTER TYPE "PayKind" ADD VALUE 'DAILY';
ALTER TYPE "PayKind" ADD VALUE 'WEEKLY';
ALTER TABLE "PayArrangement" ADD COLUMN "scheduledDaysPerWeek" INTEGER,
 ADD COLUMN "scheduledMinutesPerDay" INTEGER,
 ADD CONSTRAINT "pay_schedule_days" CHECK ("scheduledDaysPerWeek" BETWEEN 1 AND 7),
 ADD CONSTRAINT "pay_schedule_minutes" CHECK ("scheduledMinutesPerDay" BETWEEN 1 AND 1440);
ALTER TABLE "PayrollInput" ADD COLUMN "paidDays" INTEGER,
 ADD CONSTRAINT "pay_paid_days" CHECK ("paidDays" BETWEEN 0 AND 366);
ALTER TABLE "CommissionPolicy" ADD COLUMN "volumeThreshold" INTEGER,
 ADD COLUMN "volumeIncreaseCents" INTEGER,
 ADD CONSTRAINT "commission_volume_tier" CHECK (
  ("volumeThreshold" IS NULL AND "volumeIncreaseCents" IS NULL) OR
  ("volumeThreshold" IS NOT NULL AND "volumeIncreaseCents" IS NOT NULL AND
   "volumeThreshold" BETWEEN "threshold" AND 100000 AND "volumeIncreaseCents" BETWEEN 0 AND 2000000000));
