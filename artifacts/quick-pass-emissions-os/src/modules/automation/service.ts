import { z } from "zod";
import { businessDate } from "@/lib/time";
import { audit, requireRule } from "../phase2";
import { automation } from "./transaction";
import { forecastInput, policyInput, scheduleInput } from "./rules";
import { currentPolicies, visibleReminders } from "./reminders";
import { overview } from "./overview";

export async function saveSchedule(actorId: string, raw: unknown) {
  const v = scheduleInput.parse(raw);
  requireRule(
    v.key === (v.frequency === "DAILY" ? "daily" : "weekly"),
    "Schedule key and frequency must match.",
  );
  return automation(actorId, ["OWNER"], async (tx) => {
    const old = await tx.summarySchedule.findFirst({
      where: { key: v.key },
      orderBy: { revision: "desc" },
    });
    requireRule((old?.revision ?? 0) === v.revision, "Schedule changed; refresh before saving.");
    await tx.summarySchedule.updateMany({
      where: { key: v.key, active: true },
      data: { active: false },
    });
    if (old)
      await tx.automationJob.updateMany({
        where: { scheduleId: old.id, status: { in: ["PENDING", "RUNNING", "FAILED"] } },
        data: {
          status: "SUPERSEDED",
          leaseToken: null,
          leaseUntil: null,
          failure: "Schedule revision replaced.",
        },
      });
    const saved = await tx.summarySchedule.create({
      data: { ...v, revision: v.revision + 1, nextDate: businessDate(), createdBy: actorId },
    });
    await audit(tx, actorId, "SUMMARY_SCHEDULE_REVISED", saved.id, {
      ...v,
      newRevision: saved.revision,
      timezone: "America/New_York",
    });
    return saved;
  });
}
export async function saveReminderPolicy(actorId: string, raw: unknown) {
  const v = policyInput.parse(raw);
  return automation(actorId, ["OWNER"], async (tx) => {
    const old = await tx.reminderPolicy.findFirst({
      where: { kind: v.kind },
      orderBy: { revision: "desc" },
    });
    requireRule(
      (old?.revision ?? 0) === v.revision,
      "Reminder policy changed; refresh before saving.",
    );
    const ids = [...new Set([...v.recipients, ...v.escalationRecipients])];
    const users = await tx.user.findMany({ where: { id: { in: ids }, active: true } });
    requireRule(users.length === ids.length, "Choose only current active internal recipients.");
    requireRule(
      users.every((u) =>
        v.kind === "DEALER" || v.kind === "RENTAL"
          ? ["OWNER", "ADMIN", "BOOKKEEPER"].includes(u.role)
          : u.role !== "BOOKKEEPER",
      ),
      "A recipient lacks permission for this domain.",
    );
    const saved = await tx.reminderPolicy.create({
      data: { ...v, revision: v.revision + 1, createdBy: actorId },
    });
    await audit(tx, actorId, "REMINDER_POLICY_REVISED", saved.id, {
      kind: v.kind,
      revision: saved.revision,
      active: v.active,
      recipients: ids,
    });
    // Existing alerts are superseded now; next independent run creates applicable replacements.
    await tx.actionReminder.updateMany({
      where: { kind: v.kind, resolvedAt: null },
      data: { resolvedAt: new Date(), resolution: "POLICY_REVISED" },
    });
    return saved;
  });
}
export async function saveForecastPolicy(actorId: string, raw: unknown) {
  const v = forecastInput.parse(raw);
  return automation(actorId, ["OWNER"], async (tx) => {
    requireRule(
      v.key === "certificates" || (await tx.chemicalItem.findUnique({ where: { id: v.key } })),
      "Choose certificates or an existing chemical.",
    );
    const old = await tx.forecastPolicy.findFirst({
      where: { key: v.key },
      orderBy: { revision: "desc" },
    });
    requireRule((old?.revision ?? 0) === v.revision, "Forecast configuration changed; refresh.");
    const p = await tx.forecastPolicy.create({
      data: { ...v, revision: v.revision + 1, createdBy: actorId },
    });
    await audit(tx, actorId, "FORECAST_POLICY_REVISED", p.id, { ...v, newRevision: p.revision });
    return p;
  });
}
export async function automationSettings(actorId: string) {
  return automation(actorId, ["OWNER"], async (tx) => ({
    schedules: await tx.summarySchedule.findMany({
      orderBy: [{ key: "asc" }, { revision: "desc" }],
    }),
    policies: await currentPolicies(tx),
    forecasts: await tx.forecastPolicy.findMany({ orderBy: { revision: "desc" } }),
    chemicals: await tx.chemicalItem.findMany({
      where: { active: true },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    recipients: await tx.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    jobs: await tx.automationJob.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    deliveries: await tx.automationDelivery.findMany({
      orderBy: { deliveredAt: "desc" },
      take: 100,
    }),
  }));
}
export async function ownerOverview(actorId: string) {
  return automation(actorId, ["OWNER"], (tx) => overview(tx));
}
export async function ownCertification(actorId: string) {
  return automation(actorId, ["OWNER", "ADMIN", "BOOKKEEPER", "EMPLOYEE"], async (tx, actor) =>
    actor.employee
      ? tx.employee.findUnique({
          where: { id: actor.employee.id },
          select: { certificationExpires: true },
        })
      : null,
  );
}
export async function summaryArchive(actorId: string) {
  return automation(actorId, ["OWNER"], (tx) =>
    tx.savedSummary.findMany({
      select: { id: true, generatedAt: true, periodStart: true, periodEnd: true, scheduleId: true },
      orderBy: [{ generatedAt: "desc" }, { id: "asc" }],
    }),
  );
}
export async function summaryDetail(actorId: string, id: string) {
  return automation(actorId, ["OWNER"], async (tx) => {
    const summary = await tx.savedSummary.findUnique({ where: { id } });
    requireRule(summary, "Summary does not exist.");
    return summary;
  });
}
export async function remindersForUser(actorId: string) {
  return automation(actorId, ["OWNER", "ADMIN", "BOOKKEEPER", "EMPLOYEE"], (tx, actor) =>
    visibleReminders(tx, actor),
  );
}
export async function automationInbox(actorId: string) {
  return automation(actorId, ["OWNER", "ADMIN", "BOOKKEEPER", "EMPLOYEE"], async (tx, actor) => ({
    reminders: await visibleReminders(tx, actor),
    summaries:
      actor.role === "OWNER"
        ? await tx.automationDelivery.findMany({
            where: { userId: actorId, status: "DELIVERED", summaryId: { not: null } },
            select: {
              id: true,
              deliveredAt: true,
              summaryId: true,
              summary: { select: { periodStart: true, periodEnd: true } },
            },
            orderBy: [{ deliveredAt: "desc" }, { id: "asc" }],
            take: 100,
          })
        : [],
  }));
}
export async function acknowledgeReminder(actorId: string, raw: unknown) {
  const v = z.object({ id: z.string().min(1).max(100) }).parse(raw);
  return automation(actorId, ["OWNER", "ADMIN", "BOOKKEEPER", "EMPLOYEE"], async (tx, actor) => {
    const reminder = (await visibleReminders(tx, actor)).find((r) => r.id === v.id);
    requireRule(reminder, "Reminder is no longer applicable or is not yours.");
    if (reminder.acknowledgedAt) return reminder;
    const saved = await tx.actionReminder.update({
      where: { id: reminder.id },
      data: { acknowledgedAt: new Date() },
    });
    await audit(tx, actorId, "REMINDER_ACKNOWLEDGED", saved.id, {
      kind: saved.kind,
      sourceId: saved.sourceId,
    });
    return saved;
  });
}
export async function retryAutomationJob(actorId: string, raw: unknown) {
  const v = z.object({ id: z.string().min(1).max(100) }).parse(raw);
  return automation(actorId, ["OWNER"], async (tx) => {
    const job = await tx.automationJob.findUnique({ where: { id: v.id } });
    requireRule(job?.status === "FAILED", "Only terminal failures can be retried.");
    if (job.scheduleId)
      requireRule(
        (await tx.summarySchedule.findUnique({ where: { id: job.scheduleId } }))?.active,
        "Schedule is no longer active.",
      );
    await tx.automationJob.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
        failure: null,
      },
    });
    await audit(tx, actorId, "AUTOMATION_RETRY_AUTHORIZED", job.id, {
      previousAttempts: job.attempts,
    });
  });
}
