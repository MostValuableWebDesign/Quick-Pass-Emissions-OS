import { ReplitConnectors } from "@replit/connectors-sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { businessDate } from "@/lib/time";
import { automation } from "./transaction";
import { loadDashboard } from "../station/dashboard-service";
import { lowVolumeCount, lowVolumeMessage, lowVolumeWindow } from "./low-volume-rules";
import { readAsActor } from "@/lib/read-as-actor";

const ACTION = "LOW_VOLUME_ALERT_SETTINGS";
const schema = z.object({
  active: z.boolean(),
  email: z.email().max(254),
});
type Settings = z.infer<typeof schema>;

export async function lowVolumeSettings(actorId: string) {
  return readAsActor(actorId, ["OWNER"], async (tx) => {
    const [saved, latest] = await Promise.all([
      tx.auditLog.findFirst({
        where: { actorId, action: ACTION },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      tx.auditLog.findFirst({
        where: { actorId, action: "LOW_VOLUME_ALERT_RUN" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const parsed = schema.safeParse(saved?.details);
    return {
      settings: parsed.success ? parsed.data : null,
      latest: latest
        ? { at: latest.createdAt, details: latest.details as { status?: string; message?: string } }
        : null,
    };
  });
}

export async function saveLowVolumeSettings(actorId: string, input: Settings) {
  const settings = schema.parse(input);
  await automation(actorId, ["OWNER"], async (tx) => {
    await tx.auditLog.create({
      data: { actorId, action: ACTION, entityId: actorId, details: settings },
    });
  });
}

async function status(actorId: string, message: string, state: string, now: Date) {
  // One status per owner/date, updated instead of growing on every runner tick.
  const id = `low-volume-status:${actorId}:${businessDate(now)}`;
  await db.auditLog.upsert({
    where: { id },
    create: {
      id,
      actorId,
      action: "LOW_VOLUME_ALERT_RUN",
      entityId: actorId,
      details: { status: state, message },
      createdAt: now,
    },
    update: { details: { status: state, message }, createdAt: now },
  });
}

async function deliverEmail(to: string, text: string) {
  const connectors = new ReplitConnectors();
  const profile = await connectors.proxy("google-mail", "/gmail/v1/users/me/profile", {
    method: "GET",
  });
  if (!profile.ok) throw new Error("Gmail is unavailable.");
  const mailbox = (await profile.json()) as { emailAddress?: string };
  if (mailbox.emailAddress?.toLowerCase() !== "qpemissions@gmail.com")
    throw new Error("The connected Gmail sender is not Quick Pass.");
  const raw = Buffer.from(
    [
      "From: Quick Pass Emissions <qpemissions@gmail.com>",
      `To: ${to}`,
      "Subject: Quick Pass - 2 PM staffing alert",
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      text,
    ].join("\r\n"),
  ).toString("base64url");
  const sent = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!sent.ok) throw new Error("Gmail did not confirm delivery.");
  const result = (await sent.json()) as { id?: string };
  if (!result.id) throw new Error("Gmail confirmation is missing.");
}

/** Only invoked by the independent jobs runner, never by a page render. */
export async function runLowVolumeAlerts(now = new Date()) {
  const date = businessDate(now);
  const [business, closure, owners] = await Promise.all([
    db.businessSetting.findUnique({ where: { id: "business" } }),
    db.closure.findUnique({ where: { date } }),
    db.user.findMany({ where: { active: true, role: "OWNER" }, select: { id: true } }),
  ]);
  if (!lowVolumeWindow(now, business, !!closure).eligible) return { checked: 0 };
  let checked = 0;
  for (const owner of owners) {
    try {
      const { settings } = await lowVolumeSettings(owner.id);
      if (!settings?.active) continue;
      const previous = await db.auditLog.findUnique({
        where: { id: `low-volume-status:${owner.id}:${date}` },
      });
      if ((previous?.details as { status?: string } | undefined)?.status === "ABOVE_THRESHOLD")
        continue;
      const notificationKey = `low-volume:${date}:${owner.id}`;
      if (await db.notification.findUnique({ where: { key: notificationKey } })) continue;
      const data = await loadDashboard(
        owner.id,
        { start: date, end: date, trendDays: "custom" },
        true,
        { date, minute: 14 * 60 },
      );
      const checkedAt = new Date();
      const count = lowVolumeCount(data, checkedAt);
      if (count === null || !lowVolumeWindow(checkedAt, business, !!closure).eligible) {
        await status(
          owner.id,
          "No staffing recommendation sent: fresh, complete paid-test data could not be verified.",
          "DATA_UNAVAILABLE",
          checkedAt,
        );
        continue;
      }
      checked++;
      if (count > 50) {
        await status(
          owner.id,
          `${count} paid tests; no low-volume alert needed.`,
          "ABOVE_THRESHOLD",
          checkedAt,
        );
        continue;
      }
      const text = lowVolumeMessage(count, checkedAt);
      const latest = await lowVolumeSettings(owner.id);
      const activeOwner = await db.user.findFirst({
        where: { id: owner.id, active: true, role: "OWNER" },
        select: { id: true },
      });
      if (!activeOwner || !latest.settings?.active || latest.settings.email !== settings.email)
        continue;
      // Unique notification is the atomic claim. Concurrent workers cannot send twice.
      // Claim before email: an uncertain send is NEVER automatically retried.
      const claim = await db.notification.createMany({
        data: [{ key: notificationKey, userId: owner.id, title: text }],
        skipDuplicates: true,
      });
      if (!claim.count) continue;
      await status(
        owner.id,
        "In-app alert created; Gmail send started.",
        "EMAIL_PENDING",
        checkedAt,
      );
      try {
        await deliverEmail(settings.email, text);
        await status(
          owner.id,
          "In-app alert created and Gmail accepted the email. Text and calls are not connected.",
          "SENT",
          new Date(),
        );
      } catch {
        await status(
          owner.id,
          "In-app alert created. Email was not confirmed; check Gmail Sent before retrying. Text and calls are not connected.",
          "EMAIL_UNCONFIRMED",
          new Date(),
        );
      }
    } catch {
      await status(
        owner.id,
        "The check could not finish. No automatic retry of an unconfirmed email will occur.",
        "CHECK_FAILED",
        new Date(),
      );
    }
  }
  return { checked };
}
