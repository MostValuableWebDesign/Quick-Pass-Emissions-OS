-- Additive only: existing tasks, offers, inventory and financial sources remain intact.
-- AlterTable
ALTER TABLE "MarketingPromo" ADD COLUMN     "approvalStatus" TEXT NOT NULL DEFAULT 'LEGACY_REVIEW',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "eligibility" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "eligibleService" TEXT NOT NULL DEFAULT 'EMISSIONS',
ADD COLUMN     "minimumCents" INTEGER,
ADD COLUMN     "stackingAllowed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN     "area" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "checklist" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "managerTask" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "oversightId" TEXT,
ADD COLUMN     "sourceHref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "station" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "workspaceKey" TEXT;

-- AlterTable
ALTER TABLE "TaskInstance" ADD COLUMN     "area" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "checklist" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "evidence" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "managerTask" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "oversightId" TEXT,
ADD COLUMN     "sourceHref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "station" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "TaskDependency" (
    "taskId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("taskId","prerequisiteId")
);

-- CreateTable
CREATE TABLE "ManagerAvailability" (
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "days" JSONB NOT NULL,
    "reservePercent" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerAvailability_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ManagerCommitment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "ManagerCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "availabilityVersion" INTEGER,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ManagerSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "balance" INTEGER,
    "reorderLevel" INTEGER,
    "preferredVendor" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "countedAt" TIMESTAMP(3),

    CONSTRAINT "SupplyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyPurchase" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "vendor" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerFinancialEvidence" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" TIMESTAMP(3),
    "reconciledBy" TEXT,

    CONSTRAINT "ManagerFinancialEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerBankPolicy" (
    "id" TEXT NOT NULL DEFAULT 'business',
    "remoteLimitCents" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ManagerBankPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagerCommitment_userId_date_idx" ON "ManagerCommitment"("userId", "date");

-- CreateIndex
CREATE INDEX "ManagerSchedule_userId_startDate_idx" ON "ManagerSchedule"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyItem_name_key" ON "SupplyItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyPurchase_reference_key" ON "SupplyPurchase"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerFinancialEvidence_sourceKey_key" ON "ManagerFinancialEvidence"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerFinancialEvidence_reference_key" ON "ManagerFinancialEvidence"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplate_workspaceKey_key" ON "TaskTemplate"("workspaceKey");

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "TaskInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyPurchase" ADD CONSTRAINT "SupplyPurchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskTemplate" ADD CONSTRAINT "manager_template_duration" CHECK ("durationMinutes" BETWEEN 5 AND 480);
ALTER TABLE "TaskInstance" ADD CONSTRAINT "manager_task_duration" CHECK ("durationMinutes" BETWEEN 5 AND 480);
ALTER TABLE "TaskDependency" ADD CONSTRAINT "task_dependency_not_self" CHECK ("taskId" <> "prerequisiteId");
ALTER TABLE "ManagerAvailability" ADD CONSTRAINT "manager_reserve_bounds" CHECK ("reservePercent" BETWEEN 0 AND 80);
ALTER TABLE "SupplyItem" ADD CONSTRAINT "supply_bounds" CHECK (("balance" IS NULL OR "balance" BETWEEN 0 AND 2000000000) AND ("reorderLevel" IS NULL OR "reorderLevel" BETWEEN 0 AND 2000000000));
ALTER TABLE "SupplyPurchase" ADD CONSTRAINT "supply_purchase_bounds" CHECK ("quantity" BETWEEN 1 AND 2000000000 AND "status" IN ('PREPARED','SUBMITTED','RECEIVED','RECONCILED'));
ALTER TABLE "ManagerFinancialEvidence" ADD CONSTRAINT "manager_evidence_bounds" CHECK ("amountCents" > 0 AND "kind" IN ('PAYROLL','DEPOSIT') AND (("reconciledAt" IS NULL) = ("reconciledBy" IS NULL)));
ALTER TABLE "ManagerBankPolicy" ADD CONSTRAINT "manager_remote_limit_bounds" CHECK ("remoteLimitCents" IS NULL OR "remoteLimitCents" > 0);
ALTER TABLE "MarketingPromo" ADD CONSTRAINT "promo_minimum_bounds" CHECK ("minimumCents" IS NULL OR "minimumCents" >= 0);
CREATE INDEX "TaskInstance_area_dueAt_idx" ON "TaskInstance"("area", "dueAt");

ALTER TABLE "TaskTemplate" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TaskTemplate" ADD COLUMN "generatedThrough" TEXT;
