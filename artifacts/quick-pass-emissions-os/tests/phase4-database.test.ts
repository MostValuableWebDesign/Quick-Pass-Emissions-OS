import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { businessDate, addDays } from "../src/lib/time";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Test database name must end in _test");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)("Phase 4 PostgreSQL finance", () => {
  let db: PrismaClient,
    f: typeof import("../src/modules/finance/service"),
    rent: typeof import("../src/modules/rentals/service");
  let owner: string, manager: string, book: string, employee: string;
  const today = businessDate(),
    past = addDays(today, -100),
    why = "Fixture evidence checked";
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    f = await import("../src/modules/finance/service");
    rent = await import("../src/modules/rentals/service");
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "Dealership", "FinanceEntry", "CarwashBay", "User" CASCADE',
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
  });
  async function dealer(configure = true) {
    const d = await f.saveDealer(book, {
      id: "",
      version: 0,
      code: randomUUID(),
      name: "Fixture Dealership",
      billingAddress: "Fixture billing desk",
      notes: "Private dealer information",
      active: true,
      reason: why,
    });
    return configure
      ? f.authorizeTerms(owner, {
          id: d.id,
          version: 0,
          termsDays: 30,
          defaultRateCents: 1000,
          taxBps: 0,
          termsReference: why,
          reason: why,
        })
      : d;
  }
  async function service(dealershipId: string, reference: string = randomUUID()) {
    return f.recordService(book, {
      dealershipId,
      date: past,
      description: "Completed emissions",
      quantity: 10,
      unitCents: 1000,
      reference,
      evidence: why,
    });
  }
  async function draft() {
    const d = await dealer(),
      s = await service(d.id);
    return f.createInvoice(book, {
      dealershipId: d.id,
      number: "INV-1",
      issueDate: past,
      serviceIds: [s.id],
      notes: "Fixture",
    });
  }
  const decision = (id: string, version = 0, action = "APPROVE") => ({
    id,
    version,
    decision: action,
    date: today,
    reference: "Fixture delivery",
    reason: why,
  });
  async function approved() {
    const i = await draft();
    await f.reviewInvoice(owner, decision(i.id));
    return db.dealerInvoice.findUniqueOrThrow({ where: { id: i.id } });
  }
  const payment = (
    invoiceId: string,
    amountCents = 4000,
    reference: string = randomUUID(),
    date = today,
  ) => ({ invoiceId, amountCents, reference, date, evidence: why });
  const entry = (reference: string = randomUUID(), basis = "MANUAL") => ({
    direction: "EXPENSE",
    basis,
    category: "UTILITIES",
    amountCents: 2500,
    date: today,
    reference,
    description: "Fixture utility payment",
    evidence: why,
    separateRecord: true,
  });
  it("rejects employee reads, writes, exports, changed roles and deactivated users", async () => {
    const d = await dealer();
    await expect(f.dealerOverview(employee)).rejects.toThrow("permission");
    await expect(f.dealerDetail(employee, d.id)).rejects.toThrow("permission");
    await expect(f.invoiceOverview(employee)).rejects.toThrow("permission");
    await expect(f.invoiceDetail(employee, "unknown")).rejects.toThrow("permission");
    await expect(f.financeReport(employee, { start: past, end: today })).rejects.toThrow(
      "permission",
    );
    await expect(
      f.exportFinance(employee, { start: past, end: today, dataset: "entries" }),
    ).rejects.toThrow("permission");
    await expect(f.recordEntry(employee, entry())).rejects.toThrow("permission");
    await db.user.update({ where: { id: book }, data: { active: false } });
    await expect(f.dealerOverview(book)).rejects.toThrow("permission");
    await db.user.update({ where: { id: manager }, data: { role: "EMPLOYEE" } });
    await expect(f.financeReport(manager, { start: past, end: today })).rejects.toThrow(
      "permission",
    );
  });
  it("requires owner-authorized terms, versions edits and retains contact sources", async () => {
    const d = await dealer(false),
      s = await service(d.id);
    const input = {
      dealershipId: d.id,
      number: "INV-1",
      issueDate: past,
      serviceIds: [s.id],
      notes: "",
    };
    await expect(f.createInvoice(book, input)).rejects.toThrow("Owner-authorized");
    const terms = {
      id: d.id,
      version: 0,
      termsDays: 30,
      defaultRateCents: 1000,
      taxBps: 0,
      termsReference: why,
      reason: why,
    };
    await expect(f.authorizeTerms(manager, terms)).rejects.toThrow("permission");
    await expect(f.authorizeTerms(owner, { ...terms, taxBps: "" })).rejects.toThrow();
    await expect(f.authorizeTerms(owner, { ...terms, termsDays: "" })).rejects.toThrow();
    await f.authorizeTerms(owner, terms);
    await expect(f.authorizeTerms(owner, terms)).rejects.toThrow("Refresh");
    const c = await f.saveContact(book, {
      id: "",
      version: 0,
      dealershipId: d.id,
      name: "Billing contact",
      email: "billing@example.test",
      phone: "",
      purpose: "Accounts payable",
      source: why,
      active: true,
      reason: why,
    });
    await f.saveContact(book, { ...c, active: false, reason: why });
    expect((await f.dealerDetail(book, d.id)).dealer?.contacts[0].source).toBe(why);
  });
  it("snapshots lines, tax, due dates and billing details without duplicate allocation", async () => {
    const d = await dealer(),
      s = await service(d.id);
    await f.authorizeTerms(owner, {
      id: d.id,
      version: 1,
      termsDays: 30,
      defaultRateCents: 1000,
      taxBps: 725,
      termsReference: why,
      reason: why,
    });
    const input = {
      dealershipId: d.id,
      number: "INV-1",
      issueDate: past,
      serviceIds: [s.id],
      notes: "",
    };
    const results = await Promise.allSettled([
      f.createInvoice(book, input),
      f.createInvoice(book, { ...input, number: "INV-2" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const row = await db.dealerInvoice.findFirstOrThrow({ include: { lines: true } });
    expect(row.totalCents).toBe(10725);
    expect(row.dueDate).toBe(addDays(past, 30));
    expect(row.lines[0].amountCents).toBe(10000);
    await f.saveDealer(book, { ...d, version: 2, name: "Renamed account", reason: why });
    expect((await f.invoiceDetail(book, row.id)).invoice?.snapshot).toHaveProperty(
      "name",
      "Fixture Dealership",
    );
    const exported = await f.exportFinance(book, { start: past, end: today, dataset: "invoices" });
    expect(exported).toContain("Fixture Dealership");
    expect(exported).not.toContain("Renamed account");
    await expect(f.createInvoice(book, { ...input, serviceIds: [s.id, s.id] })).rejects.toThrow(
      "distinct",
    );
    expect(await db.dealerInvoiceLine.count()).toBe(1);
  });
  it("rejects duplicate references, invalid dates and invoice-time service mismatch atomically", async () => {
    const d = await dealer(),
      s = await service(d.id, "one");
    await expect(service(d.id, "one")).rejects.toThrow("already exists");
    const other = await dealer();
    await expect(
      f.createInvoice(book, {
        dealershipId: other.id,
        number: "WRONG",
        issueDate: past,
        serviceIds: [s.id],
        notes: "",
      }),
    ).rejects.toThrow("service changed");
    await expect(
      f.recordService(book, {
        dealershipId: d.id,
        date: addDays(today, 1),
        description: "Future",
        quantity: 1,
        unitCents: 1,
        reference: "future",
        evidence: why,
      }),
    ).rejects.toThrow("past");
    expect(await db.dealerInvoice.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "DEALER_INVOICE_DRAFT" } })).toBe(0);
  });
  it("separates invoice preparation/approval and versions review/delivery", async () => {
    const i = await draft();
    await expect(f.reviewInvoice(book, decision(i.id))).rejects.toThrow("permission");
    await db.dealerInvoice.update({ where: { id: i.id }, data: { createdBy: owner } });
    await expect(f.reviewInvoice(owner, decision(i.id))).rejects.toThrow("different");
    await f.reviewInvoice(manager, decision(i.id));
    await expect(f.reviewInvoice(owner, decision(i.id))).rejects.toThrow("Refresh");
    await expect(
      f.reviewInvoice(manager, { ...decision(i.id, 1, "SENT"), reference: "" }),
    ).rejects.toThrow("delivery");
    await f.reviewInvoice(manager, decision(i.id, 1, "SENT"));
    expect((await db.dealerInvoice.findUniqueOrThrow({ where: { id: i.id } })).state).toBe("SENT");
  });
  it("serializes payments, rejects overpayment and retains full reversals", async () => {
    const i = await approved();
    const results = await Promise.allSettled([
      f.recordDealerPayment(book, payment(i.id, 6000)),
      f.recordDealerPayment(manager, payment(i.id, 6000)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const p = await db.dealerPayment.findFirstOrThrow();
    await expect(
      f.reverseDealerPayment(book, { id: p.id, date: today, reference: "reverse", evidence: why }),
    ).rejects.toThrow("permission");
    await f.reverseDealerPayment(owner, {
      id: p.id,
      date: today,
      reference: "reverse",
      evidence: why,
    });
    await expect(
      f.reverseDealerPayment(owner, { id: p.id, date: today, reference: "again", evidence: why }),
    ).rejects.toThrow("unreversed");
    await f.recordDealerPayment(book, payment(i.id, 10000));
    expect((await f.financeReport(book, { start: past, end: today })).totals.dealerReceipts).toBe(
      10000,
    );
    expect(await db.dealerPayment.count()).toBe(3);
  });
  it("rejects draft, backdated, duplicate and future payments", async () => {
    const i = await draft();
    await expect(f.recordDealerPayment(book, payment(i.id))).rejects.toThrow("approved");
    await f.reviewInvoice(owner, decision(i.id));
    await f.recordDealerPayment(book, payment(i.id, 100, "receipt", addDays(today, -1)));
    await expect(
      f.recordDealerPayment(book, payment(i.id, 100, "older", addDays(today, -2))),
    ).rejects.toThrow("latest");
    await expect(f.recordDealerPayment(book, payment(i.id, 100, "receipt"))).rejects.toThrow(
      "already exists",
    );
    await expect(f.reviewInvoice(owner, decision(i.id, 2, "SENT"))).rejects.toThrow(
      "already recorded payment",
    );
    await expect(
      f.recordDealerPayment(book, payment(i.id, 100, "future", addDays(today, 1))),
    ).rejects.toThrow("past");
  });
  it("voids only after reversal and releases allocation while preserving old snapshots", async () => {
    const i = await approved(),
      p = await f.recordDealerPayment(book, payment(i.id));
    await expect(f.reviewInvoice(owner, decision(i.id, 2, "VOID"))).rejects.toThrow("Reverse");
    await f.reverseDealerPayment(manager, {
      id: p.id,
      date: today,
      reference: "rev",
      evidence: why,
    });
    await f.reviewInvoice(owner, decision(i.id, 3, "VOID"));
    const s = await db.dealerService.findFirstOrThrow();
    expect(s.invoiceId).toBeNull();
    const replacement = await f.createInvoice(book, {
      dealershipId: i.dealershipId,
      number: "INV-2",
      issueDate: today,
      serviceIds: [s.id],
      notes: "Replacement",
    });
    expect(replacement.id).not.toBe(i.id);
    expect(await db.dealerInvoiceLine.count()).toBe(2);
    expect((await f.financeReport(book, { start: past, end: today })).totals.outstanding).toBe(0);
  });
  it("prevents double entry across rental receipts, dealer receipts and manual finance in both directions", async () => {
    const i = await approved();
    await f.recordDealerPayment(book, payment(i.id, 100, "shared"));
    await expect(f.recordEntry(book, entry("shared"))).rejects.toThrow("already exists");
    const bay = await db.carwashBay.create({
        data: { slot: 4, identifier: "D1", type: "DETAILING" },
      }),
      a = await rent.createAgreement(owner, {
        bayId: bay.id,
        tenant: "Fixture",
        contact: why,
        reference: "agr",
        startDate: "2026-01-01",
        endDate: "",
        monthlyCents: 1000,
        dueDay: 1,
        responsibilities: why,
        reason: why,
      }),
      c = await rent.createCharge(book, { agreementId: a.id, month: "2026-02", reason: why });
    await expect(
      rent.recordPayment(book, {
        chargeId: c.id,
        amountCents: 100,
        date: today,
        reference: "shared",
        reason: why,
      }),
    ).rejects.toThrow("already exists");
    await rent.recordPayment(book, {
      chargeId: c.id,
      amountCents: 100,
      date: today,
      reference: "rent-only",
      reason: why,
    });
    await expect(f.recordEntry(book, entry("rent-only"))).rejects.toThrow("already exists");
    await f.recordEntry(book, entry("manual-only"));
    await expect(
      rent.recordPayment(book, {
        chargeId: c.id,
        amountCents: 100,
        date: today,
        reference: "manual-only",
        reason: why,
      }),
    ).rejects.toThrow("already exists");
    const race = await Promise.allSettled([
      rent.recordPayment(book, {
        chargeId: c.id,
        amountCents: 100,
        date: today,
        reference: "cross-domain-race",
        reason: why,
      }),
      f.recordEntry(book, entry("cross-domain-race")),
    ]);
    expect(race.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
  it("keeps estimates separate and requires independent evidence review of actual records", async () => {
    const e = await f.recordEntry(book, entry());
    await expect(
      f.reviewEntry(book, { id: e.id, version: 0, decision: "VERIFY", reason: why }),
    ).rejects.toThrow("permission");
    await f.reviewEntry(owner, { id: e.id, version: 0, decision: "VERIFY", reason: why });
    await expect(
      f.reviewEntry(manager, { id: e.id, version: 0, decision: "VOID", reason: why }),
    ).rejects.toThrow("Refresh");
    const estimate = await f.recordEntry(book, entry(randomUUID(), "ESTIMATE"));
    await expect(
      f.reviewEntry(owner, { id: estimate.id, version: 0, decision: "VERIFY", reason: why }),
    ).rejects.toThrow("Estimates");
    const r = await f.financeReport(book, { start: today, end: today });
    expect(r.totals.verifiedExpense).toBe(2500);
    expect(r.totals.manualExpense).toBe(0);
    expect(r.totals.estimatedExpense).toBe(2500);
    expect(r.totals).not.toHaveProperty("profit");
  });
  it("retains voided manual entries and rejects missing duplicate attestation", async () => {
    await expect(f.recordEntry(book, { ...entry(), separateRecord: false })).rejects.toThrow();
    const e = await f.recordEntry(owner, entry());
    await expect(
      f.reviewEntry(owner, { id: e.id, version: 0, decision: "VERIFY", reason: why }),
    ).rejects.toThrow("different");
    await f.reviewEntry(manager, { id: e.id, version: 0, decision: "VOID", reason: why });
    expect((await f.financeReport(book, { start: today, end: today })).totals.manualExpense).toBe(
      0,
    );
    expect(await db.financeEntry.count()).toBe(1);
  });
  it("reports aging across all issue dates with payments as of the chosen end date", async () => {
    const i = await approved();
    await f.recordDealerPayment(book, payment(i.id, 4000, "recent", today));
    const old = await f.financeReport(book, { start: addDays(today, -2), end: addDays(today, -1) });
    expect(old.aging[0].remainingCents).toBe(10000);
    expect(old.invoices).toHaveLength(0);
    const current = await f.financeReport(book, { start: today, end: today });
    expect(current.aging[0].remainingCents).toBe(6000);
    expect(current.aging[0].bucket).toBe("61–90 days");
  });
  it("exports complete source records with exact signed cents and formula escaping; audits exports", async () => {
    const i = await approved();
    const p = await f.recordDealerPayment(book, payment(i.id, 4000, "=receipt"));
    await f.reverseDealerPayment(owner, { id: p.id, date: today, reference: "rev", evidence: why });
    await f.recordEntry(book, { ...entry("=ledger"), description: "@SUM(A1)" });
    for (const dataset of f.datasets) {
      const text = await f.exportFinance(book, { start: past, end: today, dataset });
      expect(text).toContain("currency");
    }
    const text = await f.exportFinance(book, {
      start: past,
      end: today,
      dataset: "dealer-payments",
    });
    expect(text).toContain('"-4000"');
    expect(text).toContain('"\'=receipt"');
    expect(await db.auditLog.count({ where: { action: "FINANCE_EXPORT" } })).toBe(7);
  });
  it("retains voided service history and allows a separately referenced replacement", async () => {
    const d = await dealer(),
      s = await service(d.id);
    await expect(f.voidService(book, { id: s.id, reason: why })).rejects.toThrow("permission");
    await f.voidService(owner, { id: s.id, reason: why });
    await expect(
      f.createInvoice(book, {
        dealershipId: d.id,
        number: "VOID-SERVICE",
        issueDate: past,
        serviceIds: [s.id],
        notes: "",
      }),
    ).rejects.toThrow("service changed");
    await service(d.id);
    expect(await db.dealerService.count()).toBe(2);
    expect((await f.dealerDetail(book, d.id)).unbilled).toHaveLength(1);
  });
  it("does not truncate report totals or exports at the 100-record list limit", async () => {
    const d = await dealer();
    await db.dealerInvoice.createMany({
      data: Array.from({ length: 101 }, (_, n) => ({
        number: `CAP-${n}`,
        dealershipId: d.id,
        issueDate: past,
        dueDate: addDays(past, 30),
        state: "APPROVED" as const,
        subtotalCents: 100,
        taxBps: 0,
        taxCents: 0,
        totalCents: 100,
        snapshot: {
          code: d.code,
          name: d.name,
          billingAddress: d.billingAddress,
          termsReference: why,
        },
        notes: "Large report fixture",
        createdBy: book,
        approvedBy: owner,
        approvedAt: new Date(),
      })),
    });
    await db.financeEntry.createMany({
      data: Array.from({ length: 101 }, (_, n) => ({
        reference: `CAP-ENTRY-${n}`,
        date: today,
        direction: "EXPENSE" as const,
        basis: "MANUAL" as const,
        category: "OTHER",
        amountCents: 100,
        description: "Large report fixture",
        evidence: why,
        createdBy: book,
      })),
    });
    expect((await f.invoiceOverview(book)).invoices).toHaveLength(100);
    const r = await f.financeReport(book, { start: today, end: today });
    expect(r.aging).toHaveLength(101);
    expect(r.totals.outstanding).toBe(10100);
    expect(r.totals.manualExpense).toBe(10100);
    expect(
      (await f.exportFinance(book, { start: past, end: today, dataset: "invoices" }))
        .trim()
        .split("\r\n"),
    ).toHaveLength(102);
  });
  it("database bounds reject direct invalid quantities, tax totals and self-verification", async () => {
    const i = await approved(),
      e = await f.recordEntry(book, entry());
    await expect(
      db.dealerInvoice.update({ where: { id: i.id }, data: { totalCents: 10001 } }),
    ).rejects.toThrow();
    await expect(
      db.financeEntry.update({
        where: { id: e.id },
        data: { verifiedBy: book, verifiedAt: new Date() },
      }),
    ).rejects.toThrow();
    const s = await db.dealerService.findFirstOrThrow();
    await expect(
      db.dealerService.update({ where: { id: s.id }, data: { quantity: -1 } }),
    ).rejects.toThrow();
    await expect(
      db.dealership.update({ where: { id: i.dealershipId }, data: { taxBps: 10001 } }),
    ).rejects.toThrow();
  });
});
