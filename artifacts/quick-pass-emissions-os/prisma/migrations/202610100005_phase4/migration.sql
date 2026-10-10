-- CreateEnum
CREATE TYPE "InvoiceState" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'VOIDED');

-- CreateEnum
CREATE TYPE "FinanceDirection" AS ENUM ('REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceBasis" AS ENUM ('MANUAL', 'ESTIMATE');

-- CreateTable
CREATE TABLE "Dealership" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "billingAddress" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "termsDays" INTEGER,
    "defaultRateCents" INTEGER,
    "taxBps" INTEGER,
    "termsReference" TEXT,
    "termsAuthorizedBy" TEXT,
    "termsAuthorizedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dealership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerContact" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerService" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT,
    "voidDate" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "DealerService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "issueDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "state" "InvoiceState" NOT NULL DEFAULT 'DRAFT',
    "subtotalCents" INTEGER NOT NULL,
    "taxBps" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "notes" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentDate" TEXT,
    "deliveryReference" TEXT,
    "voidDate" TEXT,
    "voidReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "DealerInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "reversesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "direction" "FinanceDirection" NOT NULL,
    "basis" "FinanceBasis" NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "voidDate" TEXT,
    "voidReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dealership_code_key" ON "Dealership"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DealerService_reference_key" ON "DealerService"("reference");

-- CreateIndex
CREATE INDEX "DealerService_dealershipId_date_idx" ON "DealerService"("dealershipId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DealerInvoice_number_key" ON "DealerInvoice"("number");

-- CreateIndex
CREATE INDEX "DealerInvoice_dealershipId_issueDate_idx" ON "DealerInvoice"("dealershipId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "DealerInvoiceLine_invoiceId_serviceId_key" ON "DealerInvoiceLine"("invoiceId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerPayment_reference_key" ON "DealerPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "DealerPayment_reversesId_key" ON "DealerPayment"("reversesId");

-- CreateIndex
CREATE INDEX "DealerPayment_date_idx" ON "DealerPayment"("date");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEntry_reference_key" ON "FinanceEntry"("reference");

-- CreateIndex
CREATE INDEX "FinanceEntry_date_idx" ON "FinanceEntry"("date");

-- AddForeignKey
ALTER TABLE "DealerContact" ADD CONSTRAINT "DealerContact_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerService" ADD CONSTRAINT "DealerService_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerService" ADD CONSTRAINT "DealerService_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "DealerInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerInvoice" ADD CONSTRAINT "DealerInvoice_dealershipId_fkey" FOREIGN KEY ("dealershipId") REFERENCES "Dealership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerInvoiceLine" ADD CONSTRAINT "DealerInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "DealerInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerInvoiceLine" ADD CONSTRAINT "DealerInvoiceLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "DealerService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerPayment" ADD CONSTRAINT "DealerPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "DealerInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerPayment" ADD CONSTRAINT "DealerPayment_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "DealerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Exact money/quantity and lifecycle bounds also apply to direct SQL writes.
ALTER TABLE "Dealership" ADD CONSTRAINT "dealer_terms_bounds" CHECK (
 ("termsDays" IS NULL AND "defaultRateCents" IS NULL AND "taxBps" IS NULL AND "termsAuthorizedBy" IS NULL AND "termsAuthorizedAt" IS NULL AND "termsReference" IS NULL)
 OR ("termsDays" IS NOT NULL AND "defaultRateCents" IS NOT NULL AND "taxBps" IS NOT NULL AND "termsDays" BETWEEN 0 AND 365 AND "defaultRateCents" BETWEEN 1 AND 2000000000 AND "taxBps" BETWEEN 0 AND 10000 AND "termsAuthorizedBy" IS NOT NULL AND "termsAuthorizedAt" IS NOT NULL AND "termsReference" IS NOT NULL)
);
ALTER TABLE "DealerService" ADD CONSTRAINT "service_amount_bounds" CHECK ("quantity" BETWEEN 1 AND 100000 AND "unitCents" BETWEEN 1 AND 2000000000 AND "quantity"::bigint * "unitCents" <= 2000000000), ADD CONSTRAINT "service_void_pair" CHECK (("voidDate" IS NULL) = ("voidReason" IS NULL) AND ("voidDate" IS NULL OR "invoiceId" IS NULL));
ALTER TABLE "DealerInvoice" ADD CONSTRAINT "invoice_amount_bounds" CHECK ("subtotalCents" BETWEEN 1 AND 2000000000 AND "taxBps" BETWEEN 0 AND 10000 AND "taxCents" = (("subtotalCents"::bigint * "taxBps" + 5000) / 10000) AND "totalCents"::bigint = "subtotalCents"::bigint + "taxCents" AND "totalCents" BETWEEN 1 AND 2000000000), ADD CONSTRAINT "invoice_dates" CHECK ("dueDate" >= "issueDate"), ADD CONSTRAINT "invoice_review_pair" CHECK (("approvedBy" IS NULL) = ("approvedAt" IS NULL) AND ("approvedBy" IS NULL OR "approvedBy" <> "createdBy") AND ("state" NOT IN ('APPROVED','SENT') OR "approvedAt" IS NOT NULL)), ADD CONSTRAINT "invoice_void_pair" CHECK (("voidDate" IS NULL) = ("voidReason" IS NULL) AND ("state" = 'VOIDED') = ("voidDate" IS NOT NULL)), ADD CONSTRAINT "invoice_sent_pair" CHECK (("sentDate" IS NULL) = ("deliveryReference" IS NULL) AND ("state" <> 'SENT' OR "sentDate" IS NOT NULL));
ALTER TABLE "DealerInvoiceLine" ADD CONSTRAINT "invoice_line_bounds" CHECK ("quantity" BETWEEN 1 AND 100000 AND "unitCents" BETWEEN 1 AND 2000000000 AND "amountCents"::bigint = "quantity"::bigint * "unitCents" AND "amountCents" BETWEEN 1 AND 2000000000);
ALTER TABLE "DealerPayment" ADD CONSTRAINT "dealer_payment_sign" CHECK (("amountCents" BETWEEN 1 AND 2000000000 AND "reversesId" IS NULL) OR ("amountCents" BETWEEN -2000000000 AND -1 AND "reversesId" IS NOT NULL));
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "finance_entry_bounds" CHECK ("amountCents" BETWEEN 1 AND 2000000000), ADD CONSTRAINT "finance_entry_review" CHECK (("verifiedBy" IS NULL) = ("verifiedAt" IS NULL) AND ("verifiedBy" IS NULL OR ("verifiedBy" <> "createdBy" AND "basis" = 'MANUAL'))), ADD CONSTRAINT "finance_entry_void_pair" CHECK (("voidDate" IS NULL) = ("voidReason" IS NULL)), ADD CONSTRAINT "finance_entry_category" CHECK ("category" IN ('EMISSIONS','TAG_KIOSK','CARWASH','DETAILING','INVENTORY','PAYROLL','COMMISSIONS','REPAIRS','UTILITIES','VENDOR','OTHER'));
