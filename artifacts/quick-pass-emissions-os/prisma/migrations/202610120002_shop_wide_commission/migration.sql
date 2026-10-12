-- Preserve existing personal policies while allowing the owner's shop-wide rule.
ALTER TABLE "CommissionPolicy" DROP CONSTRAINT "commission_bounds";
ALTER TABLE "CommissionPolicy" ADD CONSTRAINT "commission_bounds" CHECK (
  "threshold" BETWEEN 0 AND 100000
  AND "rateCents" BETWEEN 0 AND 2000000000
  AND "attribution" IN ('PERSONAL_APPROVED_DAILY', 'SHOP_WIDE_APPROVED_DAILY')
);
