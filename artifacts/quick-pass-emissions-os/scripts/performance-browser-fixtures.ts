import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { addDays, businessDate } from "../src/lib/time";

/** Only called after the browser runner's owned-database guard. No live credentials or ledger writes. */
export async function performanceBrowserFixtures(
  db: PrismaClient,
  ownerId: string,
  station: string,
) {
  const hash = createHash("sha256").update(station).digest("hex");
  const today = businessDate();
  const dates = new Set<string>();
  for (let i = 0; i < 61; i++) dates.add(addDays(today, -i));
  for (let i = 0; i < 61; i++) dates.add(addDays("2026-01-15", -i));
  const identity = (date: string, inspector: string, index: number) =>
    createHash("sha256").update(`${date}:${inspector}:${index}`).digest("hex");
  const profiles = ["Fixture One", "Fixture Two"].map((name, i) => ({
    id: `fixture-staff-${i}`,
    name,
    inspector: name,
    hourlyCents: 2300,
    mondayCents: null,
    standardMinutes: 600,
    shiftsPerWeek: 5,
    availableWeekdays: [1, 2, 3, 4, 5, 6],
    scheduledWeekdays: [1, 2, 3, 4, 5],
    commissionEligible: true,
    approximate: false,
  }));
  await db.auditLog.create({
    data: {
      actorId: ownerId,
      entityId: hash,
      action: "STATION_PERFORMANCE_PAY_PLAN",
       details: { revision: 1, profiles, adjustments: [] },
    },
  });
  for (const date of dates)
    await db.auditLog.create({
      data: {
        actorId: ownerId,
        entityId: hash,
        action: "STATION_PERFORMANCE_DAY_CACHED",
        details: {
          date,
          total: 95,
          passed: 75,
          failed: 18,
          aborted: 2,
          other: 0,
          retrievedAt: new Date().toISOString(),
          verifiedEmpty: false,
          testTimes: [
            ...Array.from({ length: 70 }, (_, i) => ({
              inspector: "Fixture One",
              minute: 540 + i * 5,
              vinHash: identity(date === "2026-01-15" && i === 0 ? "2026-01-14" :
                date === "2026-01-15" && i === 1 ? "2025-12-15" : date, "Fixture One", i),
              recordKey: identity(date, "Fixture One", i),
              outcome: i < 55 ? "passed" : i < 68 ? "failed" : "aborted",
            })),
            ...Array.from({ length: 25 }, (_, i) => ({
              inspector: "Fixture Two",
              minute: 540 + i * 8,
              vinHash: identity(date, "Fixture Two", i),
              recordKey: identity(date, "Fixture Two", i),
              outcome: i < 20 ? "passed" : "failed",
            })),
          ],
          inspectors: [
            { inspector: "Fixture One", total: 70, passed: 55, failed: 13, aborted: 2, other: 0 },
            { inspector: "Fixture Two", total: 25, passed: 20, failed: 5, aborted: 0, other: 0 },
          ],
        },
      },
    });
}
