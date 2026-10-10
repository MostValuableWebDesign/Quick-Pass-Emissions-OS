import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { businessDate, addDays, dueInstant } from "../src/lib/time";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Test database name must end in _test");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Phase 3 PostgreSQL operations", () => {
  let db: PrismaClient,
    m: typeof import("../src/modules/maintenance/service"),
    c: typeof import("../src/modules/chemicals/service"),
    r: typeof import("../src/modules/rentals/service"),
    jobs: typeof import("../src/modules/tasks/jobs").runJobs;
  let owner: string,
    manager: string,
    book: string,
    employee: string,
    peer: string,
    employeeId: string;
  const today = businessDate(),
    why = "Verified fixture business record";
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    m = await import("../src/modules/maintenance/service");
    c = await import("../src/modules/chemicals/service");
    r = await import("../src/modules/rentals/service");
    jobs = (await import("../src/modules/tasks/jobs")).runJobs;
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "CarwashBay", "Vendor", "ChemicalItem", "User", "BusinessSetting", "Closure", "JobRun" CASCADE',
    );
    const user = async (role: "OWNER" | "ADMIN" | "BOOKKEEPER" | "EMPLOYEE") =>
      (
        await db.user.create({
          data: { name: `Fixture ${role}`, email: `${randomUUID()}@example.test`, role },
        })
      ).id;
    owner = await user("OWNER");
    manager = await user("ADMIN");
    book = await user("BOOKKEEPER");
    employee = await user("EMPLOYEE");
    peer = await user("EMPLOYEE");
    employeeId = (await db.employee.create({ data: { userId: employee } })).id;
  });
  async function bays() {
    await m.configureBays(owner, {
      identifiers: ["S1", "S2", "S3", "D1", "D2", "D3"],
      reason: why,
    });
    return db.carwashBay.findMany({ orderBy: { slot: "asc" } });
  }
  async function vendor() {
    return m.saveVendor(owner, {
      id: "",
      version: 0,
      name: "Fixture vendor",
      contact: "Verified support",
      phone: "555-fixture",
      email: "",
      services: "Maintenance",
      reference: "checked-source",
      verifiedDate: today,
      notes: "Private vendor notes",
      active: true,
      reason: why,
    });
  }
  async function equipment() {
    return m.saveEquipment(manager, {
      id: "",
      version: 0,
      code: "PUMP-1",
      name: "Fixture pump",
      category: "PUMP",
      bayId: "",
      vendorId: "",
      active: true,
      reason: why,
    });
  }
  async function ticket(assignedId = employeeId) {
    const e = await equipment();
    return m.createTicket(manager, {
      equipmentId: e.id,
      bayId: "",
      title: "Fix pump",
      description: "Reported leak",
      priority: "HIGH",
      targetDate: today,
      assignedId,
      vendorId: "",
    });
  }
  async function chemical(balance?: number) {
    let item = await c.saveChemical(owner, {
      id: "",
      version: 0,
      name: "Fixture soap",
      unit: "ML",
      reorderPoint: 50,
      vendorId: "",
      active: true,
      reason: why,
    });
    if (balance !== undefined) {
      await c.moveChemical(owner, {
        id: item.id,
        version: 0,
        kind: "RECONCILE",
        quantity: balance,
        date: today,
        reference: "opening",
        reason: why,
      });
      item = await db.chemicalItem.findUniqueOrThrow({ where: { id: item.id } });
    }
    return item;
  }
  async function agreement() {
    const b = await bays();
    return r.createAgreement(owner, {
      bayId: b[3].id,
      tenant: "Fixture tenant",
      contact: "Verified tenant contact",
      reference: "agreement-1",
      startDate: "2026-01-01",
      endDate: "",
      monthlyCents: 10000,
      dueDay: 31,
      responsibilities: "Tenant cleans; owner handles pumps",
      reason: why,
    });
  }
  async function charge() {
    const a = await agreement();
    return r.createCharge(book, { agreementId: a.id, month: "2026-02", reason: why });
  }
  it("denies unauthorized reads, mutations and stale active/role claims", async () => {
    for (const actor of [employee, book]) {
      await expect(m.registry(actor)).rejects.toThrow("permission");
      await expect(c.chemicalOverview(actor)).rejects.toThrow("permission");
      await expect(m.saveEquipment(actor, {})).rejects.toThrow();
    }
    await expect(r.rentalOverview(employee)).rejects.toThrow("permission");
    await expect(m.maintenanceOverview(book)).rejects.toThrow("permission");
    await db.user.update({ where: { id: owner }, data: { active: false } });
    await expect(m.registry(owner)).rejects.toThrow("permission");
    await db.user.update({ where: { id: manager }, data: { role: "EMPLOYEE" } });
    await expect(m.registry(manager)).rejects.toThrow("permission");
  });
  it("requires owner-confirmed unique six-bay layout and starts with unknown condition", async () => {
    await expect(
      m.configureBays(manager, { identifiers: ["1", "2", "3", "4", "5", "6"], reason: why }),
    ).rejects.toThrow("permission");
    await expect(
      m.configureBays(owner, { identifiers: ["A", "a", "3", "4", "5", "6"], reason: why }),
    ).rejects.toThrow("distinct");
    const b = await bays();
    expect(b).toHaveLength(6);
    expect(b.filter((x) => x.type === "SELF_SERVICE")).toHaveLength(3);
    expect(b.every((x) => x.status === "UNKNOWN")).toBe(true);
    await expect(
      m.configureBays(owner, { identifiers: ["1", "2", "3", "4", "5", "6"], reason: why }),
    ).rejects.toThrow("already");
  });
  it("versions bay changes and records one continuous outage through repair", async () => {
    const b = (await bays())[0];
    const input = {
      id: b.id,
      version: 0,
      status: "OUT_OF_SERVICE",
      responsibleId: employeeId,
      notes: "Pump leak",
      reason: why,
    };
    await m.updateBay(manager, input);
    await expect(m.updateBay(manager, input)).rejects.toThrow("Refresh");
    await m.updateBay(manager, { ...input, version: 1, status: "UNDER_REPAIR" });
    expect(await db.downtimeEvent.count()).toBe(1);
    await expect(
      m.updateBay(manager, { ...input, version: 2, identifier: "Manager rename" }),
    ).rejects.toThrow("Only the owner");
    await m.updateBay(owner, {
      ...input,
      version: 2,
      status: "OPERATIONAL",
      identifier: "Verified S1",
    });
    expect((await db.carwashBay.findUniqueOrThrow({ where: { id: b.id } })).identifier).toBe(
      "Verified S1",
    );
    const d = await db.downtimeEvent.findFirstOrThrow();
    expect(d.endedAt).not.toBeNull();
    expect(d.closedBy).toBe(owner);
    expect(await db.auditLog.count({ where: { entityId: b.id } })).toBe(3);
  });
  it("keeps verified vendor details and checks active references", async () => {
    const v = await vendor();
    await expect(
      m.saveVendor(manager, { ...v, verifiedDate: addDays(today, 1), reason: why }),
    ).rejects.toThrow("future");
    await m.saveVendor(manager, { ...v, active: false, reason: why });
    await expect(
      m.saveEquipment(manager, {
        version: 0,
        code: "X",
        name: "X",
        category: "PUMP",
        vendorId: v.id,
        active: true,
        reason: why,
      }),
    ).rejects.toThrow("active verified");
    expect((await db.vendor.findUniqueOrThrow({ where: { id: v.id } })).notes).toBe(
      "Private vendor notes",
    );
  });
  it("retains equipment downtime and prevents archival with unresolved work", async () => {
    const t = await ticket(),
      e = await db.equipment.findUniqueOrThrow({ where: { id: t.equipmentId! } });
    await m.equipmentDowntime(manager, { id: e.id, version: 0, decision: "START", reason: why });
    await expect(
      m.equipmentDowntime(manager, { id: e.id, version: 1, decision: "START", reason: why }),
    ).rejects.toThrow("already");
    await expect(
      m.saveEquipment(manager, { ...e, version: 1, active: false, reason: why }),
    ).rejects.toThrow("Close open");
    await m.equipmentDowntime(owner, { id: e.id, version: 1, decision: "END", reason: why });
    expect((await db.downtimeEvent.findFirstOrThrow()).endedAt).not.toBeNull();
    await expect(
      m.saveEquipment(manager, { ...e, id: "", code: e.code, active: true, reason: why }),
    ).rejects.toThrow("already exists");
  });
  it("limits employee reports and detail reads without returning private fields", async () => {
    const e = await equipment();
    const t = await m.createTicket(employee, {
      equipmentId: e.id,
      title: "Employee issue",
      description: "Broken hose",
      priority: "NORMAL",
      assignedId: employeeId,
      vendorId: "fake",
      repairCostCents: 123,
      status: "COMPLETED",
    });
    expect(t.assignedId).toBeNull();
    expect(t.vendorId).toBeNull();
    expect(t.repairCostCents).toBeNull();
    expect(t.status).toBe("OPEN");
    const own = await m.ticketDetail(employee, t.id);
    expect(own.management).toBe(false);
    expect(own.ticket).not.toHaveProperty("repairCostCents");
    expect(own.ticket).not.toHaveProperty("events");
    expect((await m.ticketDetail(peer, t.id)).ticket).toBeNull();
    await expect(
      m.updateTicket(employee, { id: t.id, version: 0, status: "IN_PROGRESS", reason: why }),
    ).rejects.toThrow("Access denied");
  });
  it("persists employee work, manager cost review, history and terminal locks", async () => {
    const t = await ticket();
    await m.updateTicket(employee, {
      id: t.id,
      version: 0,
      status: "IN_PROGRESS",
      reason: "Started work",
      repairCostCents: 123,
    });
    await expect(
      m.updateTicket(employee, {
        id: t.id,
        version: 1,
        status: "COMPLETED",
        workPerformed: "Done",
        reason: why,
      }),
    ).rejects.toThrow("review");
    await m.updateTicket(employee, {
      id: t.id,
      version: 1,
      status: "AWAITING_REVIEW",
      workPerformed: "Replaced hose",
      reason: why,
      repairCostCents: 999,
    });
    expect(
      (await db.maintenanceTicket.findUniqueOrThrow({ where: { id: t.id } })).repairCostCents,
    ).toBeNull();
    await m.updateTicket(manager, {
      id: t.id,
      version: 2,
      status: "COMPLETED",
      assignedId: employeeId,
      vendorId: "",
      targetDate: today,
      repairCostCents: 2500,
      workPerformed: "Verified replacement",
      reason: why,
    });
    const fresh = await m.ticketDetail(owner, t.id);
    expect(fresh.management && fresh.ticket?.repairCostCents).toBe(2500);
    expect(fresh.management && fresh.ticket?.events).toHaveLength(4);
    await expect(
      m.assignTicket(manager, {
        id: t.id,
        version: 3,
        assignedId: employeeId,
        targetDate: today,
        reason: why,
      }),
    ).rejects.toThrow("Closed");
  });
  it("rejects simultaneous stale maintenance changes atomically", async () => {
    const t = await ticket(),
      input = { id: t.id, version: 0, status: "IN_PROGRESS", reason: why };
    const result = await Promise.allSettled([
      m.updateTicket(employee, input),
      m.updateTicket(employee, input),
    ]);
    expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.maintenanceEvent.count({ where: { ticketId: t.id } })).toBe(2);
  });
  it("generates duplicate-safe preventative tickets respecting closures and employee activity", async () => {
    const e = await equipment();
    await db.businessSetting.create({
      data: { configured: true, operatingDays: [1, 2, 3, 4, 5, 6, 7] },
    });
    await db.closure.create({ data: { date: addDays(today, 1), reason: "Closed" } });
    const p = await m.savePlan(owner, {
      version: 0,
      equipmentId: e.id,
      title: "Inspect pump",
      instructions: "Inspect and clean",
      employeeId,
      intervalDays: 1,
      nextDueDate: today,
      dueTime: "09:00",
      priority: "HIGH",
      active: true,
      reason: why,
    });
    await Promise.all([jobs(dueInstant(today, "22:00")), jobs(dueInstant(today, "22:00"))]);
    expect(await db.maintenanceTicket.count()).toBe(14);
    expect(await db.maintenanceTicket.count({ where: { targetDate: addDays(today, 1) } })).toBe(0);
    const t = await db.maintenanceTicket.findFirstOrThrow({ where: { targetDate: today } });
    expect(t.description).toBe("Inspect and clean");
    expect(await db.notification.count({ where: { maintenanceId: t.id, resolvedAt: null } })).toBe(
      3,
    );
    await m.assignTicket(manager, {
      id: t.id,
      version: 0,
      assignedId: "",
      vendorId: "",
      targetDate: today,
      reason: why,
    });
    expect(await db.notification.count({ where: { maintenanceId: t.id, resolvedAt: null } })).toBe(
      0,
    );
    expect((await db.maintenanceTicket.findUniqueOrThrow({ where: { id: t.id } })).dueAt).toEqual(
      dueInstant(today, "09:00"),
    );
    await db.user.update({ where: { id: employee }, data: { active: false } });
    await jobs(dueInstant(addDays(today, 1), "22:00"));
    expect(await db.maintenanceTicket.count()).toBe(14);
    expect((await db.maintenancePlan.findUniqueOrThrow({ where: { id: p.id } })).nextDueDate).toBe(
      addDays(today, 15),
    );
  });
  it("bounded preventative catch-up preserves older occurrences for subsequent runs", async () => {
    const e = await equipment();
    await db.businessSetting.create({
      data: { configured: true, operatingDays: [1, 2, 3, 4, 5, 6, 7] },
    });
    const p = await m.savePlan(manager, {
      version: 0,
      equipmentId: e.id,
      title: "Catch-up",
      instructions: "Inspect",
      employeeId,
      intervalDays: 1,
      nextDueDate: today,
      dueTime: "17:00",
      priority: "NORMAL",
      active: true,
      reason: why,
    });
    await db.maintenancePlan.update({
      where: { id: p.id },
      data: { nextDueDate: addDays(today, -100) },
    });
    await jobs(dueInstant(today, "22:00"));
    expect(await db.maintenanceTicket.count()).toBe(62);
    await jobs(dueInstant(today, "22:00"));
    expect(await db.maintenanceTicket.count()).toBe(115);
    expect(await db.maintenanceTicket.count({ where: { targetDate: addDays(today, -100) } })).toBe(
      1,
    );
  });
  it("chemical inventory requires an opening count and preserves units", async () => {
    const i = await chemical();
    await expect(
      c.moveChemical(manager, {
        id: i.id,
        version: 0,
        kind: "USAGE",
        quantity: 1,
        date: today,
        reference: "usage",
        reason: why,
      }),
    ).rejects.toThrow("opening");
    await c.moveChemical(manager, {
      id: i.id,
      version: 0,
      kind: "RECONCILE",
      quantity: 100,
      date: today,
      reference: "opening",
      reason: why,
    });
    await expect(
      c.saveChemical(owner, { ...i, version: 1, unit: "GRAM", reason: why }),
    ).rejects.toThrow("Units cannot");
    expect((await c.chemicalOverview(owner)).items[0].balance).toBe(100);
    expect(await db.chemicalMovement.count()).toBe(1);
  });
  it("serializes chemical consumption and rejects overspend and duplicate references", async () => {
    const i = await chemical(100),
      input = {
        id: i.id,
        version: 1,
        kind: "USAGE",
        quantity: 70,
        date: today,
        reference: "usage",
        reason: why,
      };
    const result = await Promise.allSettled([
      c.moveChemical(owner, input),
      c.moveChemical(manager, { ...input, reference: "parallel" }),
    ]);
    expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(
      c.moveChemical(owner, { ...input, version: 2, quantity: 31, reference: "too-much" }),
    ).rejects.toThrow("bounds");
    await expect(c.moveChemical(owner, { ...input, version: 2, quantity: 1 })).rejects.toThrow(
      "already exists",
    );
    expect((await db.chemicalItem.findUniqueOrThrow({ where: { id: i.id } })).balance).toBe(30);
    expect(await db.chemicalMovement.count()).toBe(2);
  });
  it("keeps chemical receipts/reconciliations chronological and rejects unbounded or archived stock", async () => {
    const i = await chemical(100);
    await expect(
      c.moveChemical(manager, {
        id: i.id,
        version: 1,
        kind: "RECEIPT",
        quantity: 5,
        date: addDays(today, -1),
        reference: "old",
        reason: why,
      }),
    ).rejects.toThrow("latest");
    await expect(c.saveChemical(manager, { ...i, active: false, reason: why })).rejects.toThrow(
      "zero",
    );
    await c.moveChemical(manager, {
      id: i.id,
      version: 1,
      kind: "RECEIPT",
      quantity: 50,
      date: today,
      reference: "receipt",
      reason: why,
    });
    await c.moveChemical(manager, {
      id: i.id,
      version: 2,
      kind: "RECONCILE",
      quantity: 0,
      date: today,
      reference: "physical-zero",
      reason: why,
    });
    await c.saveChemical(manager, { ...i, version: 3, active: false, reason: why });
    expect(await db.chemicalMovement.count()).toBe(3);
  });
  it("authorizes rentals only for detailing bays and prevents overlapping concurrent agreements", async () => {
    const b = await bays(),
      input = {
        bayId: b[3].id,
        tenant: "Tenant",
        contact: "Checked contact",
        reference: "ref-a",
        startDate: "2026-01-01",
        endDate: "",
        monthlyCents: 10000,
        dueDay: 1,
        responsibilities: "Verified terms",
        reason: why,
      };
    await expect(r.createAgreement(manager, input)).rejects.toThrow("permission");
    await expect(r.createAgreement(owner, { ...input, bayId: b[0].id })).rejects.toThrow(
      "detailing",
    );
    const results = await Promise.allSettled([
      r.createAgreement(owner, input),
      r.createAgreement(owner, { ...input, reference: "ref-b" }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.bayRentalAgreement.count()).toBe(1);
  });
  it("creates exact monthly charge snapshots, clamps due days and ignores duplicate months", async () => {
    const a = await agreement(),
      input = { agreementId: a.id, month: "2026-02", reason: why };
    const first = await r.createCharge(book, input),
      second = await r.createCharge(manager, input);
    expect(first.id).toBe(second.id);
    expect(first.dueDate).toBe("2026-02-28");
    expect(first.amountCents).toBe(10000);
    expect(first.snapshot).toHaveProperty("reference", "agreement-1");
    await expect(r.createCharge(book, { ...input, month: "2099-01" })).rejects.toThrow(
      "current or past",
    );
    await db.bayRentalAgreement.update({ where: { id: a.id }, data: { startDate: "2026-01-15" } });
    await expect(r.createCharge(book, { ...input, month: "2026-01" })).rejects.toThrow(
      "full calendar",
    );
  });
  it("serializes rental payments, prevents overpayment, and retains exact reversal history", async () => {
    const chargeRow = await charge(),
      input = {
        chargeId: chargeRow.id,
        amountCents: 6000,
        date: today,
        reference: "payment-a",
        reason: why,
      };
    const result = await Promise.allSettled([
      r.recordPayment(book, input),
      r.recordPayment(manager, { ...input, reference: "payment-b" }),
    ]);
    expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const p = await db.rentalPayment.findFirstOrThrow();
    await expect(
      r.recordPayment(book, { ...input, amountCents: 1, reference: p.reference }),
    ).rejects.toThrow("already exists");
    await expect(
      r.reversePayment(book, { id: p.id, date: today, reference: "rev", reason: why }),
    ).rejects.toThrow("permission");
    await r.reversePayment(owner, { id: p.id, date: today, reference: "rev", reason: why });
    await expect(
      r.reversePayment(manager, { id: p.id, date: today, reference: "rev-again", reason: why }),
    ).rejects.toThrow("eligible");
    await r.recordPayment(book, { ...input, amountCents: 10000, reference: "full" });
    expect(
      (await db.rentalPayment.aggregate({ _sum: { amountCents: true } }))._sum.amountCents,
    ).toBe(10000);
    expect(await db.rentalPayment.count()).toBe(3);
  });
  it("voids only unpaid charges and preserves agreement/charge history on closing", async () => {
    const chargeRow = await charge();
    await r.recordPayment(book, {
      chargeId: chargeRow.id,
      amountCents: 10000,
      date: today,
      reference: "full",
      reason: why,
    });
    await expect(r.voidCharge(owner, { id: chargeRow.id, reason: why })).rejects.toThrow("Reverse");
    const a = await db.bayRentalAgreement.findUniqueOrThrow({
      where: { id: chargeRow.agreementId },
    });
    await expect(
      r.endAgreement(owner, {
        id: a.id,
        version: 0,
        decision: "CANCELLED",
        endDate: today,
        reason: why,
      }),
    ).rejects.toThrow("charges");
    await expect(
      r.endAgreement(owner, {
        id: a.id,
        version: 0,
        decision: "ENDED",
        endDate: "2026-01-31",
        reason: why,
      }),
    ).rejects.toThrow("later charges");
    const p = await db.rentalPayment.findFirstOrThrow();
    await r.reversePayment(owner, { id: p.id, date: today, reference: "rev", reason: why });
    await r.voidCharge(owner, { id: chargeRow.id, reason: why });
    await r.endAgreement(owner, {
      id: a.id,
      version: 0,
      decision: "ENDED",
      endDate: "2026-01-31",
      reason: why,
    });
    expect(await db.rentalCharge.count()).toBe(1);
    expect((await db.bayRentalAgreement.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
      "ENDED",
    );
  });
  it("database constraints reject negative stock and overlapping contracts through direct writes", async () => {
    const i = await chemical(10);
    await expect(
      db.chemicalItem.update({ where: { id: i.id }, data: { balance: -1 } }),
    ).rejects.toThrow();
    const a = await agreement();
    await expect(
      db.bayRentalAgreement.create({
        data: {
          bayId: a.bayId,
          tenant: "Other",
          contact: "Contact",
          reference: "overlap-db",
          startDate: "2026-02-01",
          monthlyCents: 100,
          dueDay: 1,
          responsibilities: "Terms",
          authorizedBy: owner,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.carwashBay.create({ data: { slot: 7, identifier: "seventh", type: "DETAILING" } }),
    ).rejects.toThrow();
  });
});
