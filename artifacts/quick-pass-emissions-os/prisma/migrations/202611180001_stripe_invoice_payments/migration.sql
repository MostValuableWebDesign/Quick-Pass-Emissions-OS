CREATE TYPE "StripeInvoicePaymentState" AS ENUM ('CREATING', 'OPEN', 'PAID', 'VOID', 'FAILED', 'REVIEW');

ALTER TABLE "Dealership"
ADD COLUMN "stripeCustomerId" TEXT;

CREATE UNIQUE INDEX "Dealership_stripeCustomerId_key"
ON "Dealership"("stripeCustomerId");

ALTER TABLE "DealerPayment"
ADD COLUMN "stripeInvoiceId" TEXT;

CREATE UNIQUE INDEX "DealerPayment_stripeInvoiceId_key"
ON "DealerPayment"("stripeInvoiceId");

CREATE TABLE "DealerInvoicePaymentLink" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "stripeInvoiceId" TEXT,
  "stripeCustomerId" TEXT,
  "hostedUrl" TEXT,
  "amountCents" INTEGER NOT NULL,
  "requestId" TEXT NOT NULL,
  "state" "StripeInvoicePaymentState" NOT NULL DEFAULT 'CREATING',
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DealerInvoicePaymentLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DealerInvoicePaymentLink_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "DealerInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DealerInvoicePaymentLink_invoiceId_key"
ON "DealerInvoicePaymentLink"("invoiceId");

CREATE UNIQUE INDEX "DealerInvoicePaymentLink_stripeInvoiceId_key"
ON "DealerInvoicePaymentLink"("stripeInvoiceId");

CREATE UNIQUE INDEX "DealerInvoicePaymentLink_requestId_key"
ON "DealerInvoicePaymentLink"("requestId");
