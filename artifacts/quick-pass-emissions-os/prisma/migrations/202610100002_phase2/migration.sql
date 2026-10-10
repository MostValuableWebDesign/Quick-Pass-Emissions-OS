-- CreateEnum
CREATE TYPE "PayKind" AS ENUM ('FIXED', 'HOURLY');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('OPEN', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'RETURNED', 'APPROVED');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('OPENING', 'USAGE', 'VOID', 'RECONCILE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PayArrangement" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "kind" "PayKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayArrangement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPolicy" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "threshold" INTEGER NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "attribution" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyEmission" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyEmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'OPEN',
    "cancelledReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollInput" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "emissionsComplete" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollDraft" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "preparedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateSetting" (
    "id" TEXT NOT NULL DEFAULT 'certificates',
    "minimumOrder" INTEGER NOT NULL,
    "reorderPoint" INTEGER NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateStock" (
    "id" TEXT NOT NULL DEFAULT 'certificates',
    "balance" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "openingDate" TEXT NOT NULL,
    "reconciledDate" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateMovement" (
    "id" TEXT NOT NULL,
    "kind" "MovementKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "purchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificatePurchase" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "minimumOrder" INTEGER NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "confirmation" TEXT,
    "paymentReference" TEXT,
    "received" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificatePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayArrangement_employeeId_effectiveDate_key" ON "PayArrangement"("employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPolicy_employeeId_effectiveDate_key" ON "CommissionPolicy"("employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEmission_sourceRef_key" ON "DailyEmission"("sourceRef");

-- CreateIndex
CREATE INDEX "DailyEmission_date_idx" ON "DailyEmission"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEmission_employeeId_date_key" ON "DailyEmission"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_startDate_endDate_key" ON "PayrollPeriod"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollInput_periodId_employeeId_key" ON "PayrollInput"("periodId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDraft_periodId_revision_key" ON "PayrollDraft"("periodId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_draftId_employeeId_key" ON "PayrollLine"("draftId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateMovement_reference_key" ON "CertificateMovement"("reference");

-- CreateIndex
CREATE INDEX "CertificateMovement_date_kind_idx" ON "CertificateMovement"("date", "kind");

-- AddForeignKey
ALTER TABLE "PayArrangement" ADD CONSTRAINT "PayArrangement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPolicy" ADD CONSTRAINT "CommissionPolicy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEmission" ADD CONSTRAINT "DailyEmission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollInput" ADD CONSTRAINT "PayrollInput_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollInput" ADD CONSTRAINT "PayrollInput_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollDraft" ADD CONSTRAINT "PayrollDraft_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PayrollDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateMovement" ADD CONSTRAINT "CertificateMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CertificatePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Financial and inventory bounds are also enforced for direct database writes.
ALTER TABLE "PayArrangement" ADD CONSTRAINT "pay_amount_nonnegative" CHECK ("amountCents" BETWEEN 0 AND 2000000000);
ALTER TABLE "CommissionPolicy" ADD CONSTRAINT "commission_bounds" CHECK ("threshold" BETWEEN 0 AND 100000 AND "rateCents" BETWEEN 0 AND 2000000000 AND "attribution" = 'PERSONAL_APPROVED_DAILY');
ALTER TABLE "DailyEmission" ADD CONSTRAINT "emission_bounds" CHECK ("count" BETWEEN 0 AND 100000 AND "version" >= 0), ADD CONSTRAINT "emission_approval_pair" CHECK (("approvedBy" IS NULL) = ("approvedAt" IS NULL));
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "period_date_order" CHECK ("startDate" <= "endDate");
ALTER TABLE "PayrollInput" ADD CONSTRAINT "payroll_minutes_bounds" CHECK ("minutes" BETWEEN 0 AND 527040 AND "version" >= 0), ADD CONSTRAINT "input_approval_pair" CHECK (("approvedBy" IS NULL) = ("approvedAt" IS NULL));
ALTER TABLE "PayrollDraft" ADD CONSTRAINT "draft_money_bounds" CHECK ("totalCents" BETWEEN 0 AND 2000000000 AND "revision" > 0);
ALTER TABLE "PayrollLine" ADD CONSTRAINT "line_money_bounds" CHECK ("baseCents" >= 0 AND "commissionCents" >= 0 AND "totalCents"::bigint = "baseCents"::bigint + "commissionCents"::bigint);
ALTER TABLE "CertificateSetting" ADD CONSTRAINT "certificate_settings_bounds" CHECK ("minimumOrder" BETWEEN 300 AND 1000000 AND "reorderPoint" BETWEEN 0 AND 1000000 AND "leadDays" BETWEEN 0 AND 365 AND "windowDays" BETWEEN 7 AND 90);
ALTER TABLE "CertificateStock" ADD CONSTRAINT "stock_nonnegative" CHECK ("balance" >= 0 AND "version" >= 0);
ALTER TABLE "CertificateMovement" ADD CONSTRAINT "movement_direction" CHECK ("balanceAfter" >= 0 AND ("kind" IN ('OPENING', 'RECONCILE') OR ("kind" IN ('USAGE', 'VOID') AND "delta" < 0) OR ("kind" = 'RECEIPT' AND "delta" > 0)));
ALTER TABLE "CertificatePurchase" ADD CONSTRAINT "purchase_quantity_bounds" CHECK ("minimumOrder" >= 300 AND "quantity" BETWEEN "minimumOrder" AND 1000000 AND "received" BETWEEN 0 AND "quantity");
