-- Owner-confirmed Gmail sends issue drafts without separate approval.
-- Keep separate-review requirements for the legacy approval workflow.
ALTER TABLE "DealerInvoice" DROP CONSTRAINT "invoice_review_pair";
ALTER TABLE "DealerInvoice" ADD CONSTRAINT "invoice_review_pair" CHECK (
  ("approvedBy" IS NULL) = ("approvedAt" IS NULL)
  AND (
    "approvedBy" IS NULL
    OR "approvedBy" <> "createdBy"
    OR (
      "state" IN ('SENT', 'VOIDED')
      AND "sentDate" IS NOT NULL
      AND "deliveryReference" LIKE 'GMAIL:%'
    )
  )
  AND ("state" NOT IN ('APPROVED', 'SENT') OR "approvedAt" IS NOT NULL)
);
