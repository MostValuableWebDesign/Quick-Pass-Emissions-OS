import type { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addDays, businessDate } from "../src/lib/time";
import { reportFixture } from "../tests/station-fixtures";
export async function stationBrowserFixture(db: PrismaClient, ownerId: string, directory: string) {
  process.env.GA_STATION_ID = "SYNTHETIC";
  const date = addDays(businessDate(), -2);
  const employee = await db.employee.findFirst({
    where: { user: { role: "EMPLOYEE" } },
    include: { user: true },
  });
  if (!employee) throw new Error("Station fixture needs owned employee.");
  const s = await import("../src/modules/station/service");
  await s.saveSettings(ownerId, {
    revision: 0,
    effectiveDate: addDays(date, -10),
    weekStart: 1,
    hours: [],
    observationDays: 7,
    minimumDays: 3,
    sourceTimezoneConfirmed: true,
    reason: "Synthetic fixture owner confirmation",
  });
  await s.saveMapping(ownerId, {
    inspector: "Fixture Inspector",
    employeeId: employee.id,
    effectiveDate: date,
    reason: "Synthetic exact inspector mapping",
  });
  await s.saveRule(ownerId, {
    outcome: "Pass",
    effectiveDate: date,
    eligible: true,
    priceCents: 2501,
    reason: "Synthetic owner price and eligibility",
  });
  const source = join(directory, "station-report.xls");
  const wrongStation = join(directory, "station-mismatch.xls");
  await writeFile(source, reportFixture(date), { mode: 0o600 });
  await writeFile(wrongStation, reportFixture(date, undefined, "OTHER"), { mode: 0o600 });
  if (process.env.E2E_STATION_ONLY === "1") {
    // Resume the failed browser journey after its already-verified initial import.
    await s.importReport(ownerId, {
      body: reportFixture(date),
      reason: "Owned continuation after verified initial import",
    });
  }
  if (process.env.E2E_STATION_FINAL_READ === "1") {
    const run = await s.importReport(ownerId, {
      body: reportFixture(date),
      reason: "Owned read-only visual continuation fixture",
    });
    const row = (
      await s.stationTransaction(ownerId, (tx, hash) => s.currentRecords(tx, hash, date, date))
    )[0];
    await s.reviewRecord(ownerId, {
      recordId: row.id,
      version: row.version,
      disposition: "RETAIL",
      eligibility: "RULE",
      reattribute: false,
      dealerServiceId: "",
      financeEntryId: "",
      reason: "Reproduce already verified browser review state",
    });
    await s.attestCoverage(ownerId, {
      importId: run.id,
      expectedRows: 1,
      reason: "Reproduce already verified coverage state",
    });
    await s.reconcileCount(ownerId, {
      employeeId: employee.id,
      date,
      expectedVersion: 0,
      reason: "Reproduce already verified reconciliation state",
    });
  }
  return { date, source, wrongStation, employeeId: employee.id, employeeName: employee.user.name };
}
