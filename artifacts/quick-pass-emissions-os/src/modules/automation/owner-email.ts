import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { addDays, businessDate, dueInstant } from "@/lib/time";
import {
  EmailSendError,
  ownerEmailConfig,
  ownerEmailSetupStatus,
  sendOwnerEmail,
} from "@/lib/email/owner-summary";
import { audit, requireRule } from "../phase2";
import { dashboardSnapshot } from "../dashboard/service";
import { automation, automationLocks } from "./transaction";
import { renderOwnerEmail } from "./owner-email-render";

const input = z.object({
  revision: z.coerce.number().int().min(0).max(1000000),
  active: z.boolean(),
  recipients: z.array(z.string().min(1).max(200)).max(30),
});
// Fixed owner-requested end-of-day schedule. Eastern DST follows the business calendar.
export const OWNER_EMAIL_TIME = "18:30";
const retryWindow = 23 * 60 * 60 * 1000; // Inside Resend's 24h idempotency retention.

export async function saveOwnerEmail(actorId: string, raw: unknown, now = new Date()) {
  const v = input.parse(raw);
  return automation(actorId, ["OWNER"], async (tx) => {
    const current = await tx.ownerEmailSetting.findUnique({ where: { id: "daily" } });
    requireRule(
      (current?.revision ?? 0) === v.revision,
      "Settings changed. Refresh before saving.",
    );
    const recipients = [...new Set(v.recipients)];
    const owners = await tx.user.findMany({
      where: { id: { in: recipients }, active: true, role: "OWNER" },
    });
    requireRule(
      owners.length === recipients.length &&
        owners.every((o) => z.email().safeParse(o.email).success),
      "Select active owner accounts with valid email addresses.",
    );
    requireRule(!v.active || recipients.length > 0, "Select at least one owner recipient.");
    requireRule(
      !v.active || ownerEmailConfig(),
      "Email setup is incomplete. Configure the provider, verified sender and HTTPS app URL before enabling.",
    );
    const setting = await tx.ownerEmailSetting.upsert({
      where: { id: "daily" },
      create: {
        active: v.active,
        revision: 1,
        time: OWNER_EMAIL_TIME,
        recipients,
        nextDate: businessDate(now),
        updatedBy: actorId,
      },
      update: {
        active: v.active,
        revision: { increment: 1 },
        time: OWNER_EMAIL_TIME,
        recipients,
        nextDate: current?.active && v.active ? current.nextDate : businessDate(now),
        updatedBy: actorId,
      },
    });
    // Do not cancel an already-attempted, still-authorized delivery merely because
    // settings were saved again: its frozen body/key must survive ambiguous retries.
    await tx.ownerSummaryEmail.updateMany({
      where: {
        status: { in: ["PENDING", "RUNNING", "FAILED"] },
        ...(v.active ? { userId: { notIn: recipients } } : {}),
      },
      data: {
        status: "CANCELLED",
        leaseToken: null,
        leaseUntil: null,
        failure: "Email paused or recipient removed.",
      },
    });
    await audit(tx, actorId, "OWNER_EMAIL_CONFIGURED", setting.id, {
      active: setting.active,
      revision: setting.revision,
      time: setting.time,
      recipients,
    });
    return setting;
  });
}

export async function ownerEmailSettings(actorId: string, page = 1, now = new Date()) {
  return automation(actorId, ["OWNER"], async (tx) => {
    const emailSetup = ownerEmailSetupStatus();
    const setting = await tx.ownerEmailSetting.findUnique({ where: { id: "daily" } });
    const owners = await tx.user.findMany({
      where: { active: true, role: "OWNER" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    const total = await tx.ownerSummaryEmail.count();
    const pages = Math.max(1, Math.ceil(total / 15));
    const currentPage = Math.min(pages, Math.max(1, Number.isSafeInteger(page) ? page : 1));
    const deliveries = await tx.ownerSummaryEmail.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 15,
      skip: (currentPage - 1) * 15,
      select: {
        id: true,
        reportId: true,
        reportDate: true,
        toEmail: true,
        status: true,
        attempts: true,
        acceptedAt: true,
        failure: true,
        firstAttemptAt: true,
      },
    });
    const preview = renderOwnerEmail(await dashboardSnapshot(tx, "OWNER", now), now);
    return {
      setting,
      owners,
      configured: !!ownerEmailConfig(),
      emailSetup,
      deliveries,
      page: currentPage,
      pages,
      total,
      preview: preview.text,
    };
  });
}
export async function ownerEmailReport(actorId: string, id: string) {
  return automation(actorId, ["OWNER"], async (tx) => {
    const report = await tx.ownerEmailReport.findUnique({
      where: { id },
      include: { emails: { select: { text: true }, take: 1 } },
    });
    requireRule(report, "Report not found.");
    return {
      date: report.date,
      generatedAt: report.generatedAt,
      text: report.emails[0]?.text ?? "No email copy available.",
    };
  });
}
export async function retryOwnerEmail(actorId: string, id: string, now = new Date()) {
  return automation(actorId, ["OWNER"], async (tx) => {
    const delivery = await tx.ownerSummaryEmail.findUnique({ where: { id } });
    requireRule(delivery?.status === "FAILED", "Only failed emails can be retried.");
    requireRule(
      delivery.firstAttemptAt && now.getTime() - delivery.firstAttemptAt.getTime() < retryWindow,
      "Automatic retry window expired. Review provider history before any separate resend.",
    );
    const setting = await tx.ownerEmailSetting.findUnique({ where: { id: "daily" } });
    const owner = await tx.user.findUnique({ where: { id: delivery.userId } });
    requireRule(
      setting?.active &&
        setting.recipients.includes(delivery.userId) &&
        owner?.active &&
        owner.role === "OWNER" &&
        owner.email === delivery.toEmail,
      "Recipient is no longer authorized.",
    );
    requireRule(ownerEmailConfig(), "Email setup is incomplete.");
    await tx.ownerSummaryEmail.update({
      where: { id },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: now, failure: null },
    });
    await audit(tx, actorId, "OWNER_EMAIL_RETRY", id, {});
  });
}

/** Independently triggered by the authenticated jobs runner, never by a page/build. */
export async function enqueueOwnerEmails(now = new Date()) {
  return db.$transaction(
    async (tx) => {
      await automationLocks(tx);
      const setting = await tx.ownerEmailSetting.findUnique({ where: { id: "daily" } });
      if (!setting?.active) return;
      const config = ownerEmailConfig();
      if (!config) return; // Visible unconfigured status; preserve the cursor until setup returns.
      const today = businessDate(now);
      const owners = await tx.user.findMany({
        where: { id: { in: setting.recipients }, active: true, role: "OWNER" },
      });
      let day = setting.nextDate;
      for (let i = 0; day <= today && i < 7; i++) {
        const due = dueInstant(day, setting.time);
        if (due > now) break;
        let report = await tx.ownerEmailReport.findUnique({ where: { date: day } });
        if (!report) {
          const snapshot = await dashboardSnapshot(tx, "OWNER", due);
          // Catch-up reports keep historical metrics separate from present attention state.
          if (day !== today)
            snapshot.attention = (await dashboardSnapshot(tx, "OWNER", now)).attention;
          report = await tx.ownerEmailReport.create({
            data: {
              date: day,
              generatedAt: now,
              payload: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
            },
          });
          await audit(tx, setting.updatedBy, "OWNER_EMAIL_REPORT_GENERATED", report.id, {
            date: day,
            recipients: owners.length,
          });
        }
        const snapshot = report.payload as unknown as Awaited<ReturnType<typeof dashboardSnapshot>>;
        const body = renderOwnerEmail(
          snapshot,
          report.generatedAt,
          `${config.appUrl}/automation/daily-email/reports/${report.id}`,
        );
        for (const owner of owners) {
          if (!z.email().safeParse(owner.email).success) continue;
          await tx.ownerSummaryEmail.upsert({
            where: { userId_reportDate: { userId: owner.id, reportDate: day } },
            create: {
              userId: owner.id,
              reportId: report.id,
              reportDate: day,
              revision: setting.revision,
              toEmail: owner.email,
              fromEmail: config.from,
              ...body,
              nextAttemptAt: now,
            },
            update: {},
          });
        }
        day = addDays(day, 1);
      }
      await tx.ownerEmailSetting.update({ where: { id: setting.id }, data: { nextDate: day } });
    },
    { timeout: 60000, maxWait: 10000 },
  );
}

export async function claimOwnerEmail(now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183506)`;
    await tx.ownerSummaryEmail.updateMany({
      where: {
        status: { in: ["PENDING", "RUNNING", "FAILED"] },
        firstAttemptAt: { lte: new Date(now.getTime() - retryWindow) },
      },
      data: {
        status: "REVIEW",
        leaseToken: null,
        leaseUntil: null,
        failure: "Retry window expired; review provider history. No automatic resend.",
      },
    });
    await tx.ownerSummaryEmail.updateMany({
      where: { status: "RUNNING", leaseUntil: { lte: now }, attempts: { gte: 4 } },
      data: {
        status: "FAILED",
        leaseToken: null,
        leaseUntil: null,
        failure: "Interrupted after final attempt; review provider history before retry.",
      },
    });
    const delivery = await tx.ownerSummaryEmail.findFirst({
      where: {
        attempts: { lt: 4 },
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          { status: "RUNNING", leaseUntil: { lte: now } },
        ],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    });
    if (!delivery) return null;
    return tx.ownerSummaryEmail.update({
      where: { id: delivery.id },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        firstAttemptAt: delivery.firstAttemptAt ?? now,
        leaseToken: randomUUID(),
        leaseUntil: new Date(now.getTime() + 120000),
      },
    });
  });
}

export async function processOwnerEmail(
  delivery: NonNullable<Awaited<ReturnType<typeof claimOwnerEmail>>>,
  now = new Date(),
) {
  try {
    return await db.$transaction(
      async (tx) => {
        const startedAt = Date.now();
        // Hold the personnel lock through the bounded send: queued role changes and
        // settings revocation cannot race this authorization check.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183506)`;
        const current = await tx.ownerSummaryEmail.findUnique({ where: { id: delivery.id } });
        if (current?.status !== "RUNNING" || current.leaseToken !== delivery.leaseToken)
          return "stale";
        const setting = await tx.ownerEmailSetting.findUnique({ where: { id: "daily" } });
        const owner = await tx.user.findUnique({ where: { id: current.userId } });
        if (
          !setting?.active ||
          !setting.recipients.includes(current.userId) ||
          !owner?.active ||
          owner.role !== "OWNER" ||
          owner.email !== current.toEmail
        ) {
          await tx.ownerSummaryEmail.update({
            where: { id: current.id },
            data: {
              status: "CANCELLED",
              leaseToken: null,
              leaseUntil: null,
              failure: "Recipient permission, address or email settings changed.",
            },
          });
          return "cancelled";
        }
        if (
          !current.firstAttemptAt ||
          now.getTime() - current.firstAttemptAt.getTime() >= retryWindow
        ) {
          await tx.ownerSummaryEmail.update({
            where: { id: current.id },
            data: {
              status: "REVIEW",
              leaseToken: null,
              leaseUntil: null,
              failure: "Retry window expired; review provider history.",
            },
          });
          return "review";
        }
        const config = ownerEmailConfig();
        requireRule(config, "Email setup is incomplete.");
        // Include lock/query wait in the transaction's deadline. Abort the provider
        // request before the transaction can expire and release authorization locks.
        const remainingMs = 17000 - (Date.now() - startedAt);
        requireRule(remainingMs > 0, "Email worker is busy; retry later.");
        const providerId = await sendOwnerEmail(config.key, current, remainingMs);
        await tx.ownerSummaryEmail.update({
          where: { id: current.id },
          data: {
            status: "ACCEPTED",
            providerId,
            acceptedAt: now,
            leaseToken: null,
            leaseUntil: null,
            failure: null,
          },
        });
        await audit(tx, owner.id, "OWNER_EMAIL_ACCEPTED", current.id, {
          reportDate: current.reportDate,
          providerId,
        });
        return "accepted";
      },
      { timeout: 20000, maxWait: 10000 },
    );
  } catch (error) {
    await db.ownerSummaryEmail.updateMany({
      where: { id: delivery.id, status: "RUNNING", leaseToken: delivery.leaseToken },
      data: {
        status:
          (error instanceof EmailSendError && !error.retryable) || delivery.attempts >= 4
            ? "FAILED"
            : "PENDING",
        nextAttemptAt: new Date(now.getTime() + Math.min(60, 2 ** delivery.attempts) * 60000),
        leaseToken: null,
        leaseUntil: null,
        failure:
          error instanceof EmailSendError
            ? error.message
            : "Email worker interrupted or unavailable; retry retains the same delivery key.",
      },
    });
    return "failed";
  }
}
export async function runOwnerEmails(now = new Date()) {
  if (!ownerEmailConfig()) return { configured: false, accepted: 0, failed: 0 };
  await enqueueOwnerEmails(now);
  let accepted = 0,
    failed = 0;
  for (let i = 0; i < 4; i++) {
    const delivery = await claimOwnerEmail(now);
    if (!delivery) break;
    const result = await processOwnerEmail(delivery, now);
    if (result === "accepted") accepted++;
    if (result === "failed") failed++;
  }
  return { configured: true, accepted, failed };
}
