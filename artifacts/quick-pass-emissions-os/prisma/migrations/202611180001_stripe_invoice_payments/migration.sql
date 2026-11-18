CREATE TYPE "StripeInvoicePaymentState" AS ENUM ('CREATING', 'OPEN', 'PAID', 'VOID', 'FAILED', 'REVIEW');

ALTER TABLE "DealerPayment"
ADD COLUMN "stripeInvoiceId" TEXT,
ADD COLUMN "stripePaymentIntentId" TEXT;

CREATE UNIQUE INDEX "DealerPayment_stripeInvoiceId_key"
ON "DealerPayment"("stripeInvoiceId");

CREATE UNIQUE INDEX "DealerPayment_stripePaymentIntentId_key" ON "DealerPayment"("stripePaymentIntentId");

ALTER TABLE "DealerInvoice" ADD COLUMN "stripePaymentToken" TEXT;
CREATE UNIQUE INDEX "DealerInvoice_stripePaymentToken_key" ON "DealerInvoice"("stripePaymentToken");

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
  "requestStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
