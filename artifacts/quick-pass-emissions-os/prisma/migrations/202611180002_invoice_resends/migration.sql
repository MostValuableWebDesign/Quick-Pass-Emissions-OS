CREATE TYPE "DealerInvoiceResendState" AS ENUM ('PREPARING', 'SENT', 'UNCERTAIN', 'FAILED');

CREATE TABLE "DealerInvoiceEmailResend" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "state" "DealerInvoiceResendState" NOT NULL DEFAULT 'PREPARING',
  "gmailMessageId" TEXT,
  "createdBy" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DealerInvoiceEmailResend_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DealerInvoiceEmailResend_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "DealerInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DealerInvoiceEmailResend_requestId_key"
  ON "DealerInvoiceEmailResend"("requestId");
CREATE INDEX "DealerInvoiceEmailResend_invoiceId_createdAt_idx"
  ON "DealerInvoiceEmailResend"("invoiceId", "createdAt");
