import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { ImportInput } from "../src/modules/business-import/rules";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Isolated _test database required.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("business imports in isolated PostgreSQL", () => {
  let db: PrismaClient,
    service: typeof import("../src/modules/business-import/service"),
    owner: string,
    employee: string;
  const source = (): ImportInput => ({
    sourceName: "Synthetic operations fixture",
    sourceFingerprint: "b".repeat(64),
    items: [
      {
        key: "parts",
        section: "Synthetic supplies",
        entity: "VENDOR",
        values: {
          name: "Synthetic parts vendor",
          contact: "",
          phone: "555-0100",
          email: "",
          services: "Parts only",
          reference: "synthetic-reference",
          notes: "Not independently verified",
        },
      },
      {
        key: "soap",
        section: "Synthetic chemicals",
        entity: "CHEMICAL",
        values: { name: "Synthetic soap", notes: "Supplier assignment requires verification." },
      },
      {
        key: "cert",
        section: "Synthetic ordering",
        entity: "CERTIFICATES",
        values: { minimumOrder: 300 },
      },
      {
        key: "pay",
        section: "Synthetic narrative",
        entity: "REVIEW",
        values: {
          title: "Compensation review",
          details: "Estimate only; no compensation authorized.",
          required: "Identity mapping and effective date",
        },
      },
    ],
  });
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    service = await import("../src/modules/business-import/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "User", "Vendor", "ChemicalItem", "CertificateSetting" CASCADE',
    );
    owner = (
      await db.user.create({
        data: { name: "Synthetic owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
      })
    ).id;
    employee = (
      await db.user.create({
        data: {
          name: "Synthetic employee",
          email: `${randomUUID()}@example.test`,
          role: "EMPLOYEE",
        },
      })
    ).id;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  const noBackup = async () => {};
  it("previews without writes and rejects nonowners before backup", async () => {
    const preview = await service.previewImport(owner, source());
    expect(preview.counts).toEqual({
      created: 3,
      updated: 0,
      unchanged: 0,
      conflicted: 0,
      skipped: 1,
    });
    expect(await db.businessImport.count()).toBe(0);
    expect(await db.vendor.count()).toBe(0);
    const sealed = service.sealPreview(preview);
    expect(service.openPreview(sealed).id).toBe(preview.id);
    expect(() => service.openPreview(`${sealed}tampered`)).toThrow();
    expect(() => service.openPreview(service.sealPreview({ ...preview, expires: 1 }))).toThrow();
    await expect(service.previewImport(employee, source())).rejects.toThrow("owner");
    const backup = vi.fn(noBackup);
    await expect(service.applyImport(employee, preview, backup)).rejects.toThrow();
    expect(backup).not.toHaveBeenCalled();
  });
  it("persists unknown configuration and audit without financial or schedule effects; repeats safely", async () => {
    const untouched = () =>
      Promise.all([
        db.certificateMovement.count(),
        db.chemicalMovement.count(),
        db.payArrangement.count(),
        db.payrollDraft.count(),
        db.employeeSchedule.count(),
        db.bayRentalAgreement.count(),
        db.taskInstance.count(),
      ]);
    const before = await untouched();
    const preview = await service.previewImport(owner, source());
    const applied = await service.applyImport(owner, preview, noBackup);
    expect(applied.counts.created).toBe(3);
    expect((await db.vendor.findFirst())?.verifiedDate).toBe(null);
    expect(await db.chemicalItem.findFirst()).toMatchObject({
      unit: null,
      balance: null,
      reorderPoint: null,
      vendorId: null,
    });
    expect(await db.certificateSetting.findFirst()).toMatchObject({
      minimumOrder: 300,
      leadDays: null,
      windowDays: null,
      reorderPoint: null,
    });
    const retry = await service.applyImport(owner, preview, noBackup);
    expect(retry.counts).toEqual({
      created: 0,
      updated: 0,
      unchanged: 3,
      conflicted: 0,
      skipped: 1,
    });
    expect(await db.vendor.count()).toBe(1);
    expect((await service.previewImport(owner, source())).counts).toEqual(retry.counts);
    expect(await db.businessImport.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "VENDOR_SAVED" } })).toBe(1);
    expect(await untouched()).toEqual(before);
  });
  it("serializes concurrent applications and preserves later staff edits", async () => {
    const preview = await service.previewImport(owner, source());
    const results = await Promise.all([
      service.applyImport(owner, preview, noBackup),
      service.applyImport(owner, preview, noBackup),
    ]);
    expect(results.map((r) => r.counts.created).sort()).toEqual([0, 3]);
    const vendor = await db.vendor.findFirstOrThrow();
    await db.vendor.update({
      where: { id: vendor.id },
      data: { services: "Staff correction", version: { increment: 1 } },
    });
    const result = await service.applyImport(
      owner,
      await service.previewImport(owner, source()),
      noBackup,
    );
    expect(result.counts.conflicted).toBe(1);
    expect((await db.vendor.findUnique({ where: { id: vendor.id } }))?.services).toBe(
      "Staff correction",
    );
  });
  it("rechecks actor and identity, and does not write when backup fails", async () => {
    const preview = await service.previewImport(owner, source());
    await expect(
      service.applyImport(owner, preview, async () => {
        throw Error("Synthetic backup failure");
      }),
    ).rejects.toThrow("backup");
    expect(await db.vendor.count()).toBe(0);
    await expect(
      service.applyImport(owner, { ...preview, storeId: randomUUID() }, noBackup),
    ).rejects.toThrow("identity");
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(service.applyImport(owner, preview, noBackup)).rejects.toThrow("owner");
  });
  it("conflicts after a stale preview and resumes only unresolved items with a new review", async () => {
    const preview = await service.previewImport(owner, source());
    const existing = await db.vendor.create({
      data: {
        name: "Synthetic parts vendor",
        contact: "",
        phone: "555-0100",
        email: "",
        services: "Parts only",
        reference: "synthetic-reference",
        notes: "",
        verifiedDate: null,
      },
    });
    const first = await service.applyImport(owner, preview, noBackup);
    expect(first.counts).toMatchObject({ created: 2, conflicted: 1 });
    const fresh = await service.previewImport(owner, source());
    const resumed = await service.applyImport(owner, fresh, noBackup);
    expect(resumed.counts).toMatchObject({ updated: 1, unchanged: 2, conflicted: 0 });
    expect((await db.vendor.findUnique({ where: { id: existing.id } }))?.notes).toBe(
      "Not independently verified",
    );
  });
  it("keeps imported unverified suppliers out of operational choices and forbids movements without units", async () => {
    await service.applyImport(owner, await service.previewImport(owner, source()), noBackup);
    const maintenance = await import("../src/modules/maintenance/service");
    const chemicals = await import("../src/modules/chemicals/service");
    expect((await maintenance.maintenanceOverview(owner)).vendors).toEqual([]);
    expect((await chemicals.chemicalOverview(owner)).vendors).toEqual([]);
    const item = await db.chemicalItem.findFirstOrThrow();
    await expect(
      chemicals.moveChemical(owner, {
        id: item.id,
        version: item.version,
        kind: "RECONCILE",
        quantity: 10,
        date: "2026-01-01",
        reference: "synthetic-count",
        reason: "fixture",
      }),
    ).rejects.toThrow("unit");
  });
  it("rolls back domain writes and provenance together on a mid-transaction failure", async () => {
    const chemicals = await import("../src/modules/chemicals/service");
    const failure = vi
      .spyOn(chemicals, "saveChemicalInTransaction")
      .mockRejectedValueOnce(new Error("Synthetic transaction failure"));
    try {
      await expect(
        service.applyImport(owner, await service.previewImport(owner, source()), noBackup),
      ).rejects.toThrow("Synthetic");
      expect(await db.vendor.count()).toBe(0);
      expect(await db.businessImport.count()).toBe(0);
      expect(await db.auditLog.count({ where: { action: "VENDOR_SAVED" } })).toBe(0);
    } finally {
      failure.mockRestore();
    }
    expect(
      (await service.applyImport(owner, await service.previewImport(owner, source()), noBackup))
        .counts.created,
    ).toBe(3);
  });
});
