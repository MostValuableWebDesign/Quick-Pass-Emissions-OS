import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CATEGORIES } from "../src/modules/support/rules";
import { directoryFields } from "../src/modules/support/rules";
import type { ImportInput } from "../src/modules/business-import/rules";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Isolated database required.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("service support protected persistence", () => {
  let db: PrismaClient,
    s: typeof import("../src/modules/support/service"),
    imports: typeof import("../src/modules/business-import/service"),
    owner: string,
    employee: string,
    other: string,
    bookkeeper: string,
    employeeId: string,
    vendor: string,
    ticket: string,
    equipment: string;
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    s = await import("../src/modules/support/service");
    imports = await import("../src/modules/business-import/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE "User","Vendor","Equipment","CarwashBay" CASCADE');
    for (const [key, role] of [
      ["owner", "OWNER"],
      ["employee", "EMPLOYEE"],
      ["other", "EMPLOYEE"],
      ["bookkeeper", "BOOKKEEPER"],
    ] as const) {
      const u = await db.user.create({ data: { name: key, email: `${key}@example.test`, role } });
      if (key === "owner") owner = u.id;
      if (key === "employee") {
        employee = u.id;
        employeeId = (await db.employee.create({ data: { userId: u.id } })).id;
      }
      if (key === "other") other = u.id;
      if (key === "bookkeeper") bookkeeper = u.id;
    }
    vendor = (
      await db.vendor.create({
        data: {
          name: "Synthetic service",
          contact: "Service team",
          phone: "(800) 555-0123",
          email: "",
          services: "Private legacy service narrative",
          reference: "PRIVATE-EVIDENCE",
          verifiedDate: "2026-01-01",
          notes: "PRIVATE-NOTES",
          accountReference: "PRIVATE-ACCOUNT",
          categories: [CATEGORIES[0], CATEGORIES[2]],
          supportedServices: "Operational support",
          extension: "123",
        },
      })
    ).id;
    equipment = (
      await db.equipment.create({
        data: { code: "TEST", name: "Synthetic pump", category: "PUMP", notes: "PRIVATE-ASSET" },
      })
    ).id;
    ticket = (
      await db.maintenanceTicket.create({
        data: {
          title: "Own report",
          description: "Fixture",
          priority: "NORMAL",
          equipmentId: equipment,
          assignedId: employeeId,
          reportedBy: employee,
          targetDate: "2026-01-01",
          dueAt: new Date("2026-01-01T22:00Z"),
          repairCostCents: 2500,
        },
      })
    ).id;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  const source = (): ImportInput => ({
    sourceName: "Synthetic support source",
    sourceFingerprint: "e".repeat(64),
    items: [
      {
        entity: "VENDOR",
        key: "support",
        section: "Fixture",
        values: {
          name: "Source only fixture",
          contact: "",
          phone: "800-555-0144",
          email: "",
          services: "Parts",
          reference: "",
          notes: "",
          directory: {
            categories: [CATEGORIES[4]],
            supportedServices: "Parts only",
            accountReference: "PRIVATE-SOURCE",
            sourceReference: "Synthetic section",
          },
        },
      },
    ],
  });
  it("filters many-to-many categories/search and strictly excludes private payloads", async () => {
    expect((await s.directory(employee, { category: CATEGORIES[2] })).providers).toHaveLength(1);
    expect((await s.directory(employee, { search: "synthetic" })).providers).toHaveLength(1);
    expect((await s.directory(employee, { category: CATEGORIES[1] })).providers).toHaveLength(0);
    const payload = JSON.stringify(await s.providerDetail(employee, vendor));
    expect(payload).not.toContain("PRIVATE-");
    expect(payload).not.toContain("Private legacy");
    expect(payload).not.toContain("repairCostCents");
    expect(payload).toContain("800");
    await expect(s.directory(bookkeeper)).rejects.toThrow();
    await db.user.update({ where: { id: employee }, data: { active: false } });
    await expect(s.directory(employee)).rejects.toThrow();
  });
  it("changes category-specific preferences explicitly with durable stale-write protection", async () => {
    const input = {
      category: CATEGORIES[0],
      vendorId: vendor,
      version: 0,
      reason: "Manager choice",
    };
    await expect(s.setPreference(employee, input)).rejects.toThrow();
    await s.setPreference(owner, input);
    await expect(s.setPreference(owner, input)).rejects.toThrow();
    await s.setPreference(owner, { ...input, vendorId: null, version: 1 });
    await expect(s.setPreference(owner, input)).rejects.toThrow();
    await s.setPreference(owner, { ...input, version: 2 });
    const second = await db.vendor.create({
      data: {
        name: "Other service",
        contact: "",
        phone: "",
        email: "",
        services: "support",
        reference: "",
      },
    });
    await expect(
      s.setPreference(owner, { ...input, vendorId: second.id, version: 3 }),
    ).rejects.toThrow();
  });
  it("keeps directory confirmation, category edits and status management protected and versioned", async () => {
    const row = await db.vendor.findUniqueOrThrow({ where: { id: vendor } });
    const input = {
      ...Object.fromEntries(
        Object.keys(directoryFields.shape).map((key) => [key, row[key as keyof typeof row]]),
      ),
      id: vendor,
      version: 0,
      reason: "Directory update",
    };
    await expect(s.saveDirectory(employee, input)).rejects.toThrow();
    await expect(s.saveDirectory(owner, { ...input, phone: "invented" })).rejects.toThrow();
    await expect(
      s.saveDirectory(owner, { ...input, lastConfirmedDate: "2999-01-01" }),
    ).rejects.toThrow();
    await s.saveDirectory(owner, {
      ...input,
      lastConfirmedDate: "2026-01-01",
      alternatePhone: "800-555-0144",
    });
    await expect(s.saveDirectory(owner, input)).rejects.toThrow();
    await s.setPreference(owner, {
      category: CATEGORIES[0],
      vendorId: vendor,
      version: 0,
      reason: "Choice",
    });
    await expect(
      s.saveDirectory(owner, { ...input, version: 1, categories: [CATEGORIES[2]] }),
    ).rejects.toThrow();
    await expect(
      s.setProviderStatus(employee, { id: vendor, version: 1, active: false, reason: "Archive" }),
    ).rejects.toThrow();
    await s.setProviderStatus(owner, { id: vendor, version: 1, active: false, reason: "Archive" });
    await expect(
      s.setProviderStatus(owner, { id: vendor, version: 1, active: true, reason: "Restore" }),
    ).rejects.toThrow();
    expect((await db.vendor.findUniqueOrThrow({ where: { id: vendor } })).verifiedDate).toBe(
      "2026-01-01",
    );
  });
  it("permits own/assigned provider association without changing repair lifecycle or management fields", async () => {
    const before = await db.maintenanceTicket.findUniqueOrThrow({ where: { id: ticket } });
    const input = { id: ticket, version: 0, vendorId: vendor, reason: "Contact support" };
    await expect(s.selectTicketProvider(other, input)).rejects.toThrow();
    await expect(
      s.selectTicketProvider(employee, { ...input, assignedId: null }),
    ).rejects.toThrow();
    await s.selectTicketProvider(employee, input);
    const after = await db.maintenanceTicket.findUniqueOrThrow({ where: { id: ticket } });
    for (const key of [
      "assignedId",
      "repairCostCents",
      "targetDate",
      "status",
      "reviewedBy",
      "workPerformed",
    ] as const)
      expect(after[key]).toEqual(before[key]);
    expect(after.vendorId).toBe(vendor);
    await expect(s.selectTicketProvider(employee, input)).rejects.toThrow();
    await db.maintenanceTicket.update({ where: { id: ticket }, data: { status: "COMPLETED" } });
    await expect(s.selectTicketProvider(employee, { ...input, version: 1 })).rejects.toThrow();
  });
  it("keeps explicit contact history self-reported, self-private, related-access checked and independent", async () => {
    const input = {
      vendorId: vendor,
      contactedAt: "2026-01-01T18:00:00Z",
      method: "PHONE",
      equipmentId: equipment,
      ticketId: ticket,
      outcome: "PRIVATE-OUTCOME",
      reference: "PRIVATE-HISTORY",
      followUpDate: "2026-02-01",
    };
    await expect(s.logContact(other, input)).rejects.toThrow();
    await expect(s.logContact(employee, { ...input, ticketId: null })).rejects.toThrow();
    await expect(s.logContact(employee, { ...input, actorId: owner })).rejects.toThrow();
    await s.logContact(employee, input);
    expect((await s.providerDetail(employee, vendor)).history[0].actorName).toBe("employee");
    expect((await s.providerDetail(other, vendor)).history).toHaveLength(0);
    expect((await s.providerDetail(owner, vendor)).history).toHaveLength(1);
    expect((await db.maintenanceTicket.findUniqueOrThrow({ where: { id: ticket } })).status).toBe(
      "OPEN",
    );
    await db.maintenanceTicket.update({
      where: { id: ticket },
      data: { reportedBy: owner, assignedId: null },
    });
    expect((await s.providerDetail(employee, vendor)).history).toHaveLength(0);
  });
  it("preserves archived relationships/history and excludes inactive new selections", async () => {
    await s.associateSupport(owner, {
      vendorId: vendor,
      version: 0,
      equipmentId: equipment,
      remove: false,
      reason: "Supported pump",
    });
    expect((await s.ticketSupport(employee, ticket)).relevant[0].id).toBe(vendor);
    await s.selectTicketProvider(employee, {
      id: ticket,
      version: 0,
      vendorId: vendor,
      reason: "Select",
    });
    await s.logContact(employee, {
      vendorId: vendor,
      contactedAt: "2026-01-01T00:00:00Z",
      method: "OTHER",
      outcome: "",
      reference: "",
      followUpDate: null,
    });
    await s.setProviderStatus(owner, {
      id: vendor,
      version: 1,
      active: false,
      reason: "Archive retains history",
    });
    expect((await s.directory(employee)).providers).toHaveLength(0);
    expect((await s.ticketSupport(employee, ticket)).choices).toHaveLength(0);
    expect((await s.ticketSupport(employee, ticket)).assigned?.id).toBe(vendor);
    expect((await s.providerDetail(employee, vendor)).history).toHaveLength(1);
    await expect(
      s.selectTicketProvider(employee, {
        id: ticket,
        version: 1,
        vendorId: vendor,
        reason: "Select",
      }),
    ).rejects.toThrow();
    await expect(
      s.associateSupport(owner, {
        vendorId: vendor,
        version: 2,
        equipmentId: equipment,
        remove: false,
        reason: "Select",
      }),
    ).rejects.toThrow();
    await expect(db.vendor.delete({ where: { id: vendor } })).rejects.toThrow();
  });
  it("imports unconfirmed source support into the same vendors repeatably/concurrently", async () => {
    const preview = await imports.previewImport(owner, source());
    await Promise.all([
      imports.applyImport(owner, preview, async () => {}),
      imports.applyImport(owner, preview, async () => {}),
    ]);
    const row = await db.vendor.findFirstOrThrow({ where: { name: "Source only fixture" } });
    expect(row.categories).toEqual([CATEGORIES[4]]);
    expect(row.verifiedDate).toBeNull();
    expect(row.lastConfirmedDate).toBeNull();
    expect(await db.vendor.count({ where: { name: row.name } })).toBe(1);
    expect(
      (
        await imports.applyImport(
          owner,
          await imports.previewImport(owner, source()),
          async () => {},
        )
      ).counts.unchanged,
    ).toBe(1);
    const payload = JSON.stringify(await s.directory(employee));
    expect(payload).not.toContain("PRIVATE-SOURCE");
    await expect(
      s.selectTicketProvider(employee, {
        id: ticket,
        version: 0,
        vendorId: row.id,
        reason: "Select",
      }),
    ).rejects.toThrow();
    await db.vendor.update({
      where: { id: row.id },
      data: { supportedServices: "Staff edited", version: { increment: 1 } },
    });
    expect((await imports.previewImport(owner, source())).counts.conflicted).toBe(1);
  });
});
