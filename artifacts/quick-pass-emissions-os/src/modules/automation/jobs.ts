import { runGoogleAnalytics } from "../analytics/sync";
import { runDoorAccess } from "../security/service";
import { runOwnerEmails } from "./owner-email";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, businessDate, dueInstant } from "@/lib/time";
import { automationLocks } from "./transaction";
import { overview } from "./overview";
import { operationalDatasets, operationalReport } from "./reports";
import { reconcileReminders } from "./reminders";
import { periodFor, retryAt, scheduleOccurs } from "./rules";
import { audit } from "../phase2";

export async function enqueueAutomation(now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183506)`;
    const today = businessDate(now),
      settings = await tx.businessSetting.findUnique({ where: { id: "business" } });
    const closed = new Set((await tx.closure.findMany()).map((c) => c.date));
    const schedules = await tx.summarySchedule.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
    });
    for (const s of schedules) {
      let day = s.nextDate,
        examined = 0;
      // Persist unprocessed dates; never silently discard older missed runs.
      while (day <= today && examined++ < 31) {
        if (dueInstant(day, s.time) > now) break;
        if (
          scheduleOccurs(s, day, now, settings?.configured ? settings.operatingDays : [], closed)
        ) {
          const due = dueInstant(day, s.time);
          await tx.automationJob.upsert({
            where: { key: `summary:${s.id}:${day}` },
            create: {
              key: `summary:${s.id}:${day}`,
              kind: "SUMMARY",
              scheduleId: s.id,
              occurrenceDate: day,
              dueAt: due,
              nextAttemptAt: due,
            },
            update: {},
          });
        }
        day = addDays(day, 1);
      }
      if (day !== s.nextDate)
        await tx.summarySchedule.update({ where: { id: s.id }, data: { nextDate: day } });
    }
    const slot = Math.floor(now.getTime() / 900000);
    await tx.automationJob.upsert({
      where: { key: `reminders:${slot}` },
      create: {
        key: `reminders:${slot}`,
        kind: "REMINDERS",
        dueAt: now,
        nextAttemptAt: now,
      },
      update: {},
    });
    // Exhausted interrupted claims are observable terminal failures.
    await tx.automationJob.updateMany({
      where: { status: "RUNNING", leaseUntil: { lte: now }, attempts: { gte: 4 } },
      data: {
        status: "FAILED",
        failure: "Interrupted after final attempt; owner review/retry required.",
        leaseToken: null,
        leaseUntil: null,
      },
    });
    // Owners who lose access must not retain summary deliveries.
    await tx.automationDelivery.updateMany({
      where: {
        summaryId: { not: null },
        status: "DELIVERED",
        user: { OR: [{ active: false }, { role: { not: "OWNER" } }] },
      },
      data: { status: "REVOKED", failure: "Current owner permission revoked." },
    });
  });
}
export async function claimAutomation(now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183506)`;
    const job = await tx.automationJob.findFirst({
      where: {
        attempts: { lt: 4 },
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          { status: "RUNNING", leaseUntil: { lte: now } },
        ],
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    });
    if (!job) return null;
    return tx.automationJob.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        leaseToken: randomUUID(),
        leaseUntil: new Date(now.getTime() + 300000),
        failure: null,
      },
    });
  });
}
export async function processAutomation(
  job: NonNullable<Awaited<ReturnType<typeof claimAutomation>>>,
  now = new Date(),
) {
  try {
    await db.$transaction(
      async (tx) => {
        await automationLocks(tx);
        const current = await tx.automationJob.findUnique({ where: { id: job.id } });
        if (current?.status !== "RUNNING" || current.leaseToken !== job.leaseToken) return;
        if (job.kind === "SUMMARY") {
          const schedule = await tx.summarySchedule.findUnique({ where: { id: job.scheduleId! } });
          if (!schedule?.active) {
            await tx.automationJob.update({
              where: { id: job.id },
              data: { status: "SUPERSEDED", leaseToken: null, leaseUntil: null },
            });
            return;
          }
          const period = periodFor(job.occurrenceDate!, schedule.frequency);
          const exceptions = await overview(tx, now);
          const reports = [];
          for (const dataset of operationalDatasets)
            reports.push(await operationalReport(tx, dataset, period.start, period.end, now));
          const payload = JSON.parse(
            JSON.stringify({
              label:
                "Historical snapshot — captured at generation; not current live figures or frozen books",
              timezone: "America/New_York",
              scheduledOccurrence: job.dueAt.toISOString(),
              reportingBoundaries: {
                start: dueInstant(period.start, "00:00").toISOString(),
                endExclusive: dueInstant(addDays(period.end, 1), "00:00").toISOString(),
              },
              schedule: {
                frequency: schedule.frequency,
                time: schedule.time,
                weekday: schedule.weekday,
                revision: schedule.revision,
                openDaysOnly: schedule.openDaysOnly,
              },
              ...exceptions,
              reports,
            }),
          ) as Prisma.InputJsonValue;
          const summary = await tx.savedSummary.create({
            data: {
              jobId: job.id,
              scheduleId: schedule.id,
              generatedAt: now,
              periodStart: period.start,
              periodEnd: period.end,
              payload,
            },
          });
          const owners = await tx.user.findMany({
            where: { active: true, role: "OWNER" },
            select: { id: true },
          });
          for (const owner of owners)
            await tx.automationDelivery.create({
              data: {
                key: `summary:${job.id}:${owner.id}`,
                userId: owner.id,
                summaryId: summary.id,
              },
            });
          await audit(tx, schedule.createdBy, "SUMMARY_GENERATED", summary.id, {
            jobId: job.id,
            period,
            ...{ recipients: owners.length },
          });
        } else await reconcileReminders(tx, now);
        await tx.automationJob.update({
          where: { id: job.id },
          data: {
            status: "SUCCESS",
            completedAt: now,
            leaseToken: null,
            leaseUntil: null,
            failure: null,
          },
        });
      },
      {
        timeout: 60000,
        maxWait: 10000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
    return true;
  } catch {
    await db.automationJob.updateMany({
      where: { id: job.id, status: "RUNNING", leaseToken: job.leaseToken },
      data: {
        status: job.attempts >= 4 ? "FAILED" : "PENDING",
        nextAttemptAt: retryAt(now, job.attempts),
        leaseToken: null,
        leaseUntil: null,
        failure:
          "Automation transaction failed; inspect connectivity, migration status and operator logs. No partial summary/delivery committed.",
      },
    });
    return false;
  }
}
export async function runAutomation(now = new Date()) {
  await enqueueAutomation(now);
  let completed = 0,
    failed = 0;
  // Bounded worker. Further independent triggers continue the backlog.
  for (let i = 0; i < 32; i++) {
    const job = await claimAutomation(now);
    if (!job) break;
    if (await processAutomation(job, now)) completed++;
    else failed++;
  }
  return {
    completed,
    failed,
    ownerEmail: await runOwnerEmails(now),
    doorAccess: await runDoorAccess(now),
    googleAnalytics: await runGoogleAnalytics(now),
  };
}
