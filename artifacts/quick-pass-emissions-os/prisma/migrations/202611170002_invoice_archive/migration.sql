ALTER TABLE "DealerInvoice"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "DealerInvoice_archivedAt_createdAt_idx"
ON "DealerInvoice"("archivedAt", "createdAt");
