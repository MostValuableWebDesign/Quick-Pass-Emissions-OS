import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Isolated test database required.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Daily owner email isolated persistence and delivery", () => {
  let db: PrismaClient;
  let s: typeof import("../src/modules/automation/owner-email");
  let owner: string, manager: string;
  const now = new Date("2026-10-12T22:30:00.000Z");
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    s = await import("../src/modules/automation/owner-email");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "OwnerEmailSetting","OwnerEmailReport","User","BusinessSetting","CertificateSetting","ChemicalItem","Dealership","BayRentalAgreement" CASCADE',
    );
    owner = (
      await db.user.create({
        data: { name: "Owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
      })
    ).id;
    manager = (
      await db.user.create({
        data: { name: "Manager", email: `${randomUUID()}@example.test`, role: "ADMIN" },
      })
    ).id;
    vi.stubEnv("RESEND_API_KEY", "fixture-only-key");
    vi.stubEnv("OWNER_SUMMARY_FROM_EMAIL", "reports@example.test");
    vi.stubEnv("OWNER_SUMMARY_APP_URL", "https://app.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json({ id: "provider-accepted" })),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    await db.$executeRawUnsafe('TRUNCATE "OwnerEmailSetting","OwnerEmailReport" CASCADE');
  });
  const configure = () =>
    s.saveOwnerEmail(owner, { revision: 0, active: true, recipients: [owner] }, now);
  async function queued() {
    await configure();
    await s.enqueueOwnerEmails(now);
    return (await s.claimOwnerEmail(now))!;
  }
  it("only permits current active owners to configure, read and receive", async () => {
    await expect(
      s.saveOwnerEmail(manager, { revision: 0, active: false, recipients: [] }, now),
    ).rejects.toThrow("permission");
    await expect(s.ownerEmailSettings(manager)).rejects.toThrow("permission");
    await expect(
      s.saveOwnerEmail(owner, { revision: 0, active: true, recipients: [manager] }, now),
    ).rejects.toThrow("active owner");
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(configure()).rejects.toThrow("permission");
  });
  it("saves paused settings without credentials but cannot enable sending", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(configure()).rejects.toThrow("setup is incomplete");
    await s.saveOwnerEmail(owner, { revision: 0, active: false, recipients: [owner] }, now);
    expect((await s.ownerEmailSettings(owner)).setting?.recipients).toEqual([owner]);
    expect(await s.runOwnerEmails(now)).toMatchObject({ configured: false, accepted: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("runs at 6:30 Eastern, reports the same day and survives concurrent runner calls", async () => {
    await configure();
    await s.enqueueOwnerEmails(new Date(now.getTime() - 1));
    expect(await db.ownerSummaryEmail.count()).toBe(0);
    await Promise.all([s.runOwnerEmails(now), s.runOwnerEmails(now), s.runOwnerEmails(now)]);
    const reports = await db.ownerEmailReport.findMany();
    expect(reports).toHaveLength(1);
    expect(reports[0].date).toBe("2026-10-12");
    expect(await db.ownerSummaryEmail.count({ where: { status: "ACCEPTED" } })).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await s.runOwnerEmails(now);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("freezes report and email body across worker interruption and timeout retry", async () => {
    const staff = await db.user.create({
      data: {
        name: "Original staff name",
        email: `${randomUUID()}@example.test`,
        role: "EMPLOYEE",
        employee: { create: {} },
      },
    });
    const delivery = await queued();
    expect(delivery.text).toContain("Original staff name");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await s.processOwnerEmail(delivery, now)).toBe("failed");
    await db.user.update({ where: { id: staff.id }, data: { name: "Changed staff name" } });
    const later = new Date(now.getTime() + 5 * 60000);
    const retry = (await s.claimOwnerEmail(later))!;
    expect(retry.id).toBe(delivery.id);
    expect(retry.text).toBe(delivery.text);
    expect(retry.text).not.toContain("Changed staff name");
    expect(await s.processOwnerEmail(retry, later)).toBe("accepted");
    const requests = fetchMock.mock.calls.map((c) => c[1]!);
    expect(requests[0].body).toBe(requests[1].body);
    expect(requests[0].headers).toEqual(requests[1].headers);
    expect((await s.ownerEmailReport(owner, delivery.reportId)).text).toBe(delivery.text);
    await expect(s.ownerEmailReport(manager, delivery.reportId)).rejects.toThrow("permission");
  });
  it.each(["deactivate", "demote", "email", "pause", "remove"])(
    "rechecks %s after claim before any external send",
    async (change) => {
      const delivery = await queued();
      if (change === "pause")
        await s.saveOwnerEmail(owner, { revision: 1, active: false, recipients: [owner] }, now);
      else if (change === "remove") {
        const other = await db.user.create({
          data: { name: "Other owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
        });
        await s.saveOwnerEmail(owner, { revision: 1, active: true, recipients: [other.id] }, now);
      } else
        await db.user.update({
          where: { id: owner },
          data:
            change === "deactivate"
              ? { active: false }
              : change === "demote"
                ? { role: "ADMIN" }
                : { email: "changed@example.test" },
        });
      await s.processOwnerEmail(delivery, now);
      expect(fetch).not.toHaveBeenCalled();
      expect(
        (await db.ownerSummaryEmail.findUniqueOrThrow({ where: { id: delivery.id } })).status,
      ).toBe("CANCELLED");
    },
  );
  it("waits for a queued personnel mutation and rechecks authorization after the lock", async () => {
    const delivery = await queued();
    let release!: () => void, acquired!: () => void;
    const held = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const unlock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mutation = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7183502)`;
      await tx.user.update({ where: { id: owner }, data: { active: false } });
      acquired();
      await unlock;
    });
    await held;
    const sending = s.processOwnerEmail(delivery, now);
    release();
    await mutation;
    expect(await sending).toBe("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fences an expired claim and stops ambiguous retries before provider key retention expires", async () => {
    const first = await queued();
    const later = new Date(now.getTime() + 3 * 60000);
    const replacement = (await s.claimOwnerEmail(later))!;
    expect(await s.processOwnerEmail(first, later)).toBe("stale");
    const expired = new Date(now.getTime() + 23 * 3600000);
    expect(await s.processOwnerEmail(replacement, expired)).toBe("review");
    expect(fetch).not.toHaveBeenCalled();
    expect(await s.claimOwnerEmail(expired)).toBeNull();
  });
  it("makes permanent rejection visible and retains the same key for authorized retry", async () => {
    const delivery = await queued();
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private provider error", { status: 422 }));
    await s.processOwnerEmail(delivery, now);
    expect(
      (await db.ownerSummaryEmail.findUniqueOrThrow({ where: { id: delivery.id } })).status,
    ).toBe("FAILED");
    await expect(s.retryOwnerEmail(manager, delivery.id, now)).rejects.toThrow("permission");
    await s.retryOwnerEmail(owner, delivery.id, now);
    const retry = (await s.claimOwnerEmail(now))!;
    expect(retry.id).toBe(delivery.id);
    await s.processOwnerEmail(retry, now);
    expect(
      (await db.ownerSummaryEmail.findUniqueOrThrow({ where: { id: delivery.id } })).status,
    ).toBe("ACCEPTED");
  });
  it("preserves the backlog cursor and paginates history at 15", async () => {
    await s.saveOwnerEmail(
      owner,
      { revision: 0, active: true, recipients: [owner] },
      new Date("2026-09-20T20:00:00Z"),
    );
    await s.enqueueOwnerEmails(now);
    expect(await db.ownerEmailReport.count()).toBe(7);
    expect(
      (await db.ownerEmailSetting.findUniqueOrThrow({ where: { id: "daily" } })).nextDate,
    ).toBe("2026-09-27");
    await s.enqueueOwnerEmails(now);
    await s.enqueueOwnerEmails(now);
    const first = await s.ownerEmailSettings(owner, 1, now),
      second = await s.ownerEmailSettings(owner, 2, now);
    expect(first.deliveries).toHaveLength(15);
    expect(second.deliveries).toHaveLength(6);
    expect(first.total).toBe(21);
    expect(
      first.deliveries.map((d) => d.id).some((id) => second.deliveries.some((d) => d.id === id)),
    ).toBe(false);
  });
  it("rejects stale configuration and does not repeat an accepted day after another save", async () => {
    await configure();
    await s.runOwnerEmails(now);
    await expect(configure()).rejects.toThrow("Settings changed");
    await s.saveOwnerEmail(owner, { revision: 1, active: true, recipients: [owner] }, now);
    await s.runOwnerEmails(now);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await db.ownerSummaryEmail.count()).toBe(1);
  });
});
