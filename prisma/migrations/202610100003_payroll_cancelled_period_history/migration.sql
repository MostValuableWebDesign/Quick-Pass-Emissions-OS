-- Cancelled periods retain their identity/history; a corrected period can reuse dates.
-- Active overlaps remain serialized and rejected by the payroll service.
DROP INDEX "PayrollPeriod_startDate_endDate_key";
CREATE INDEX "PayrollPeriod_startDate_endDate_idx" ON "PayrollPeriod"("startDate", "endDate");
