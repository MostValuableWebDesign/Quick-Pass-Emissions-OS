-- CreateEnum
CREATE TYPE "BayType" AS ENUM ('SELF_SERVICE', 'DETAILING');

-- CreateEnum
CREATE TYPE "BayStatus" AS ENUM ('UNKNOWN', 'OPERATIONAL', 'MAINTENANCE_REQUIRED', 'OUT_OF_SERVICE', 'UNDER_REPAIR');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('ANALYZER', 'KIOSK', 'PUMP', 'HOSE', 'BRUSH', 'NOZZLE', 'DISPENSER', 'DRAIN_PIT', 'PROPERTY', 'OTHER');

-- CreateEnum
CREATE TYPE "ChemicalUnit" AS ENUM ('ML', 'GRAM', 'ITEM');

-- CreateEnum
CREATE TYPE "ChemicalMovementKind" AS ENUM ('OPENING', 'RECONCILE', 'RECEIPT', 'USAGE', 'DISPOSAL');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CarwashBay" (
    "id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "identifier" TEXT NOT NULL,
    "type" "BayType" NOT NULL,
    "status" "BayStatus" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT NOT NULL DEFAULT '',
    "responsibleId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CarwashBay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "services" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "verifiedDate" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EquipmentCategory" NOT NULL,
    "bayId" TEXT,
    "vendorId" TEXT,
    "model" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeEvent" (
    "id" TEXT NOT NULL,
    "bayId" TEXT,
    "equipmentId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "resolution" TEXT,
    "createdBy" TEXT NOT NULL,
    "closedBy" TEXT,

    CONSTRAINT "DowntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" TEXT NOT NULL,
    "bayId" TEXT,
    "equipmentId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "nextDueDate" TEXT NOT NULL,
    "dueTime" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTicket" (
    "id" TEXT NOT NULL,
    "bayId" TEXT,
    "equipmentId" TEXT,
    "planId" TEXT,
    "occurrenceDate" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "assignedId" TEXT,
    "vendorId" TEXT,
    "targetDate" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "workPerformed" TEXT NOT NULL DEFAULT '',
    "repairCostCents" INTEGER,
    "reportedBy" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "ChemicalUnit" NOT NULL,
    "reorderPoint" INTEGER NOT NULL,
    "vendorId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "balance" INTEGER,
    "lastMovementDate" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChemicalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" "ChemicalMovementKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChemicalMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BayRentalAgreement" (
    "id" TEXT NOT NULL,
    "bayId" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "monthlyCents" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "responsibilities" TEXT NOT NULL,
    "status" "RentalStatus" NOT NULL DEFAULT 'ACTIVE',
    "authorizedBy" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BayRentalAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalCharge" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalPayment" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "reversesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarwashBay_slot_key" ON "CarwashBay"("slot");

-- CreateIndex
CREATE UNIQUE INDEX "CarwashBay_identifier_key" ON "CarwashBay"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_code_key" ON "Equipment"("code");

-- CreateIndex
CREATE INDEX "DowntimeEvent_startedAt_idx" ON "DowntimeEvent"("startedAt");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_status_dueAt_idx" ON "MaintenanceTicket"("status", "dueAt");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_assignedId_idx" ON "MaintenanceTicket"("assignedId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceTicket_planId_occurrenceDate_key" ON "MaintenanceTicket"("planId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "MaintenanceEvent_ticketId_createdAt_idx" ON "MaintenanceEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChemicalMovement_reference_key" ON "ChemicalMovement"("reference");

-- CreateIndex
CREATE INDEX "ChemicalMovement_itemId_createdAt_idx" ON "ChemicalMovement"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BayRentalAgreement_reference_key" ON "BayRentalAgreement"("reference");

-- CreateIndex
CREATE INDEX "BayRentalAgreement_bayId_startDate_idx" ON "BayRentalAgreement"("bayId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "RentalCharge_agreementId_month_key" ON "RentalCharge"("agreementId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "RentalPayment_reference_key" ON "RentalPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "RentalPayment_reversesId_key" ON "RentalPayment"("reversesId");

-- AddForeignKey
ALTER TABLE "CarwashBay" ADD CONSTRAINT "CarwashBay_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "CarwashBay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "CarwashBay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "CarwashBay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "CarwashBay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_assignedId_fkey" FOREIGN KEY ("assignedId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalItem" ADD CONSTRAINT "ChemicalItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalMovement" ADD CONSTRAINT "ChemicalMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChemicalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BayRentalAgreement" ADD CONSTRAINT "BayRentalAgreement_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "CarwashBay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalCharge" ADD CONSTRAINT "RentalCharge_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "BayRentalAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalPayment" ADD CONSTRAINT "RentalPayment_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "RentalCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalPayment" ADD CONSTRAINT "RentalPayment_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "RentalPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Business invariants complement the serialized domain services.
ALTER TABLE "CarwashBay" ADD CONSTRAINT "bay_slot_bounds" CHECK ("slot" BETWEEN 1 AND 6), ADD CONSTRAINT "bay_slot_type" CHECK (("slot" <= 3 AND "type" = 'SELF_SERVICE') OR ("slot" >= 4 AND "type" = 'DETAILING')), ADD CONSTRAINT "bay_version" CHECK ("version" >= 0);
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "downtime_one_target" CHECK (("bayId" IS NULL) <> ("equipmentId" IS NULL)), ADD CONSTRAINT "downtime_dates" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt"), ADD CONSTRAINT "downtime_close_pair" CHECK (("endedAt" IS NULL) = ("closedBy" IS NULL));
CREATE UNIQUE INDEX "downtime_open_bay" ON "DowntimeEvent" ("bayId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "downtime_open_equipment" ON "DowntimeEvent" ("equipmentId") WHERE "endedAt" IS NULL;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "ticket_one_target" CHECK (("bayId" IS NULL) <> ("equipmentId" IS NULL)), ADD CONSTRAINT "ticket_money_bounds" CHECK ("repairCostCents" IS NULL OR "repairCostCents" BETWEEN 0 AND 2000000000), ADD CONSTRAINT "ticket_version" CHECK ("version" >= 0), ADD CONSTRAINT "ticket_plan_pair" CHECK (("planId" IS NULL) = ("occurrenceDate" IS NULL));
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "plan_one_target" CHECK (("bayId" IS NULL) <> ("equipmentId" IS NULL)), ADD CONSTRAINT "plan_interval" CHECK ("intervalDays" BETWEEN 1 AND 3650), ADD CONSTRAINT "plan_version" CHECK ("version" >= 0);
ALTER TABLE "ChemicalItem" ADD CONSTRAINT "chemical_balance_bounds" CHECK ("balance" IS NULL OR "balance" BETWEEN 0 AND 2000000000), ADD CONSTRAINT "chemical_reorder_bounds" CHECK ("reorderPoint" BETWEEN 0 AND 2000000000), ADD CONSTRAINT "chemical_version" CHECK ("version" >= 0);
ALTER TABLE "ChemicalMovement" ADD CONSTRAINT "chemical_movement_bounds" CHECK ("balanceAfter" BETWEEN 0 AND 2000000000 AND "delta" BETWEEN -2000000000 AND 2000000000), ADD CONSTRAINT "chemical_movement_sign" CHECK (("kind" IN ('OPENING','RECEIPT') AND "delta" >= 0) OR ("kind" IN ('USAGE','DISPOSAL') AND "delta" < 0) OR "kind" = 'RECONCILE');
ALTER TABLE "BayRentalAgreement" ADD CONSTRAINT "rental_money_bounds" CHECK ("monthlyCents" BETWEEN 1 AND 2000000000), ADD CONSTRAINT "rental_due_day" CHECK ("dueDay" BETWEEN 1 AND 31), ADD CONSTRAINT "rental_date_order" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
-- Prevent overlapping non-cancelled date ranges, including through direct database writes.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "BayRentalAgreement" ADD CONSTRAINT "rental_no_overlap" EXCLUDE USING gist ("bayId" WITH =, daterange(make_date(substring("startDate",1,4)::int, substring("startDate",6,2)::int, substring("startDate",9,2)::int), CASE WHEN "endDate" IS NULL THEN NULL ELSE make_date(substring("endDate",1,4)::int, substring("endDate",6,2)::int, substring("endDate",9,2)::int) END, '[]') WITH &&) WHERE ("status" <> 'CANCELLED');
ALTER TABLE "RentalCharge" ADD CONSTRAINT "rental_charge_bounds" CHECK ("amountCents" BETWEEN 1 AND 2000000000);
ALTER TABLE "RentalPayment" ADD CONSTRAINT "rental_payment_bounds" CHECK ("amountCents" BETWEEN -2000000000 AND 2000000000 AND "amountCents" <> 0), ADD CONSTRAINT "rental_payment_reversal_sign" CHECK (("reversesId" IS NULL AND "amountCents" > 0) OR ("reversesId" IS NOT NULL AND "amountCents" < 0));

ALTER TABLE "Notification" ADD COLUMN "maintenanceId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "MaintenanceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Notification_maintenanceId_idx" ON "Notification"("maintenanceId");
