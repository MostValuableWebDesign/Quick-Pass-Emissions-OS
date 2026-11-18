import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { addDays, businessDate } from "../src/lib/time";
import { parseVirPage, type StoredVirRow } from "../src/modules/finance/dealer-vir-parser";
import type {
  DealerVirCommitInput,
  DealerVirPreview,
} from "../src/modules/finance/dealer-vir-types";

const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("Use an isolated test database.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

(enabled ? describe : describe.skip)("reviewed dealership VIR billing", () => {
  let db: PrismaClient;
  let service: typeof import("../src/modules/finance/dealer-vir-service");
  let owner: string;
  let dealer: string;
  const today = businessDate();
  const past = addDays(today, -40);
  beforeAll(async () => {
    db = (await import("../src/lib/db")).db;
    service = await import("../src/modules/finance/dealer-vir-service");
    process.env.GA_STATION_ID = "VIR_FIXTURE";
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE "Dealership", "StationImport", "User" CASCADE');
    owner = (
      await db.user.create({
        data: { name: "VIR fixture owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
      })
    ).id;
    dealer = (
      await db.dealership.create({
        data: {
          code: randomUUID(),
          name: "VIR fixture dealership",
          billingAddress: "Fixture only",
          defaultRateCents: 2000,
          termsDays: 30,
          taxBps: 0,
          termsAuthorizedAt: new Date(),
          termsAuthorizedBy: owner,
          termsReference: "Fixture owner-authorized terms",
        },
      })
    ).id;
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  function row(
    cert = "ZZ123456",
    date = past,
    minute = 600,
    vin = "1M8GDM9AXKP042788",
  ): StoredVirRow {
    const [year, month, day] = date.split("-");
    const testNumber = String(91106000000 + Number(cert.replace(/\D/g, "") || 1));
    const parsed = parseVirPage(
      `GEORGIA VEHICLE EMISSIONS INSPECTION REPORT OVERALL TEST RESULT: PASS CERTIFICATE NUMBER: ${cert}
      Test Date/Time: ${month}/${day}/${year} @ ${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}
      Test Type: Initial Test Fee: $20.00 VIN: ${vin} Test ID: ${testNumber}`,
      "PDF 1 · Page 1",
      "TEXT",
    );
    return parsed;
  }
  async function preview(rows: StoredVirRow[]) {
    const key = await service.beginDealerVirUpload(owner, dealer, 1, rows.length);
    await service.recordDealerVirChunk(owner, key, randomUUID(), rows);
    return service.finishDealerVirUpload(owner, key);
  }
  function commit(
    p: DealerVirPreview,
    billing: "BILL" | "FREE" | "EXCLUDE" = "BILL",
    draft = true,
  ): DealerVirCommitInput {
    return {
      uploadId: p.uploadId,
      dealershipId: dealer,
      createDraft: draft,
      issueDate: today,
      invoiceNumber: "",
      rows: p.rows.map((r) => ({
        id: r.id,
        date: r.date,
        certificate: r.certificate,
        testNumber: r.testNumber,
        outcome: r.outcome,
        testType: r.testType,
        billing,
        confirmed: true,
      })),
    };
  }
  it("makes one grouped service and a draft with exact count, rate, due date and persistent report breakdown", async () => {
    const p = await preview([row(), row("ZZ123457", past, 620, "1M8GDM9AXKP042789")]);
    expect(JSON.stringify(p)).not.toContain("vinHash");
    expect(JSON.stringify(p)).not.toContain("sourceKey");
    const result = await service.commitDealerVirUpload(owner, commit(p));
    expect(result).toMatchObject({ saved: 2, billable: 2, free: 0, skipped: 0 });
    const invoice = await db.dealerInvoice.findUniqueOrThrow({
      where: { id: result.invoiceId! },
      include: { lines: true },
    });
    expect(invoice).toMatchObject({
      state: "DRAFT",
      subtotalCents: 4000,
      taxCents: 0,
      totalCents: 4000,
      dueDate: addDays(today, 30),
    });
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0]).toMatchObject({ quantity: 2, unitCents: 2000, amountCents: 4000 });
    expect(await db.dealerVirRecord.count()).toBe(2);
    const upload = await db.dealerVirUpload.findUniqueOrThrow({ where: { id: p.uploadId } });
    expect(upload.rows).toEqual([]);
  });
  it("rebuilds a deleted invoice draft from the same saved VIR service without duplicating reports", async () => {
    const finance = await import("../src/modules/finance/service");
    const upload = await preview([row("ZZ123489", past, 605)]);
    const original = await service.commitDealerVirUpload(owner, commit(upload));
    const originalInvoice = await db.dealerInvoice.findUniqueOrThrow({
      where: { id: original.invoiceId! },
      include: { lines: true },
    });
    const savedServiceId = originalInvoice.lines[0].serviceId;
    const reportsBefore = await db.dealerVirRecord.findMany({
      where: { serviceId: savedServiceId },
    });
    expect(reportsBefore).toHaveLength(1);

    await finance.deleteDraftInvoice(owner, {
      id: originalInvoice.id,
      version: originalInvoice.version,
    });
    const available = await finance.dealerDetail(owner, dealer);
    expect(available.unbilled).toContainEqual(
      expect.objectContaining({ id: savedServiceId, virReportCount: 1 }),
    );

    const recreated = await finance.createInvoice(owner, {
      dealershipId: dealer,
      number: "",
      issueDate: today,
      serviceIds: [savedServiceId],
      notes: "Recreated from the already saved VIR",
    });
    const reportsAfter = await db.dealerVirRecord.findMany({
      where: { serviceId: savedServiceId },
    });
    expect(reportsAfter.map((report) => report.id)).toEqual(
      reportsBefore.map((report) => report.id),
    );
    expect(
      await db.dealerInvoiceLine.findMany({
        where: { invoiceId: recreated.id },
        select: { serviceId: true, quantity: true, amountCents: true },
      }),
    ).toEqual([{ serviceId: savedServiceId, quantity: 1, amountCents: 2000 }]);
  });
  it("fills missing owner-authorized $15 terms and bills two reviewed VIRs at $30", async () => {
    const finance = await import("../src/modules/finance/service");
    await db.dealership.update({
      where: { id: dealer },
      data: {
        defaultRateCents: null,
        termsDays: null,
        taxBps: null,
        termsAuthorizedAt: null,
        termsAuthorizedBy: null,
        termsReference: null,
      },
    });
    expect(await finance.applyStandardDealershipRate(owner)).toEqual({ updated: 1, total: 1 });
    const p = await preview([row(), row("ZZ123457", past, 620, "1M8GDM9AXKP042789")]);
    expect(p).toMatchObject({ rateCents: 1500, termsReady: true });
    const result = await service.commitDealerVirUpload(owner, commit(p));
    expect(
      await db.dealerInvoice.findUniqueOrThrow({ where: { id: result.invoiceId! } }),
    ).toMatchObject({ totalCents: 3000, taxCents: 0, dueDate: addDays(today, 30) });
    expect(await finance.applyStandardDealershipRate(owner)).toEqual({ updated: 0, total: 1 });
  });
  it("keeps an existing invoice's saved prices when applying the current $15 rate", async () => {
    const result = await service.commitDealerVirUpload(owner, commit(await preview([row()])));
    const before = await db.dealerInvoice.findUniqueOrThrow({
      where: { id: result.invoiceId! },
      include: { lines: true },
    });
    const finance = await import("../src/modules/finance/service");
    await finance.applyStandardDealershipRate(owner);
    expect(
      await db.dealerInvoice.findUniqueOrThrow({
        where: { id: result.invoiceId! },
        include: { lines: true },
      }),
    ).toEqual(before);
    expect(
      (await db.dealership.findUniqueOrThrow({ where: { id: dealer } })).defaultRateCents,
    ).toBe(1500);
  });
  it("creates future dealership partners with the standing $15, Net 30, zero-tax terms", async () => {
    const finance = await import("../src/modules/finance/service");
    const created = await finance.saveDealer(owner, {
      name: "New fixture dealership",
      billingAddress: "Fixture address",
      version: 0,
    });
    expect(created).toMatchObject({
      defaultRateCents: 1500,
      termsDays: 30,
      taxBps: 0,
      termsAuthorizedBy: owner,
    });
    expect(created.termsAuthorizedAt).toBeInstanceOf(Date);
  });
  it("returns the prior result on a repeated save without another invoice", async () => {
    const p = await preview([row()]);
    const first = await service.commitDealerVirUpload(owner, commit(p));
    expect(await service.commitDealerVirUpload(owner, commit(p))).toEqual(first);
    expect(await db.dealerInvoice.count()).toBe(1);
  });
  it("prevents repeat PDF imports and matching certificate imports across dealership accounts", async () => {
    await service.commitDealerVirUpload(owner, commit(await preview([row()])));
    const otherDealer = await db.dealership.create({
      data: { code: randomUUID(), name: "Other fixture", billingAddress: "Fixture" },
    });
    const key = await service.beginDealerVirUpload(owner, otherDealer.id, 1, 1);
    await service.recordDealerVirChunk(owner, key, randomUUID(), [row()]);
    const p = await service.finishDealerVirUpload(owner, key);
    expect(p.rows[0].duplicate).toBe(true);
    await expect(
      service.commitDealerVirUpload(owner, { ...commit(p), dealershipId: otherDealer.id }),
    ).rejects.toThrow("Duplicates");
    expect(await db.dealerInvoice.count()).toBe(1);
  });
  it("skips a duplicate inside the batch without double-counting it", async () => {
    const p = await preview([row(), row()]);
    expect(p.rows[1].duplicate).toBe(true);
    expect(await service.commitDealerVirUpload(owner, commit(p))).toMatchObject({
      saved: 1,
      skipped: 1,
      billable: 1,
    });
  });
  it("protects source identity even if a reviewer changes the certificate on a repeat upload", async () => {
    await service.commitDealerVirUpload(owner, commit(await preview([row()])));
    const p = await preview([row()]);
    const input = commit(p);
    input.rows[0].certificate = "ZZ999999";
    await expect(service.commitDealerVirUpload(owner, input)).rejects.toThrow("Duplicates");
  });
  it("excludes a 30-day repeated VIN but allows a repeat after 30 days", async () => {
    const base = addDays(today, -70);
    await service.commitDealerVirUpload(owner, commit(await preview([row("ZZ123456", base)])));
    const free = await preview([row("ZZ123458", addDays(base, 30))]);
    expect(free.rows[0].freeRetest).toBe(true);
    await expect(service.commitDealerVirUpload(owner, commit(free))).rejects.toThrow("free retest");
    await service.commitDealerVirUpload(owner, commit(free, "FREE", false));
    // Most recent occurrence, including free inspections, is the comparison point.
    const paid = await preview([row("ZZ123459", addDays(base, 61))]);
    expect(paid.rows[0].freeRetest).toBe(false);
  });
  it("detects same-day free repeats from an earlier uploaded inspection", async () => {
    await service.commitDealerVirUpload(owner, commit(await preview([row()])));
    const p = await preview([row("ZZ123458", past, 650)]);
    expect(p.rows[0].freeRetest).toBe(true);
  });
  it("stores free inspections without creating services or an invoice", async () => {
    const p = await preview([{ ...row(), feeCents: 0, freeRetest: true }]);
    const result = await service.commitDealerVirUpload(owner, commit(p, "FREE", false));
    expect(result).toMatchObject({ free: 1, billable: 0, invoiceId: null });
    expect(await db.dealerService.count()).toBe(0);
  });
  it("requires every included row to be explicitly reviewed", async () => {
    const p = await preview([row()]);
    const input = commit(p);
    input.rows[0].confirmed = false;
    await expect(service.commitDealerVirUpload(owner, input)).rejects.toThrow("Confirm");
    expect(await db.dealerService.count()).toBe(0);
  });
  it("rolls back services and VIR records when invoice creation fails", async () => {
    const p1 = await preview([row()]);
    const invoiceNumber = `QP-${today.slice(0, 4)}-0001`;
    const input1 = { ...commit(p1), invoiceNumber };
    await service.commitDealerVirUpload(owner, input1);
    const p2 = await preview([row("ZZ123458", past, 650, "1M8GDM9AXKP042790")]);
    await expect(
      service.commitDealerVirUpload(owner, { ...commit(p2), invoiceNumber }),
    ).rejects.toThrow("already exists");
    expect(await db.dealerService.count()).toBe(1);
    expect(await db.dealerVirRecord.count()).toBe(1);
    expect(
      (await db.dealerVirUpload.findUniqueOrThrow({ where: { id: p2.uploadId } })).status,
    ).toBe("REVIEW");
  });
  it("rejects stale billing settings rather than silently charging a changed rate", async () => {
    const p = await preview([row()]);
    await db.dealership.update({
      where: { id: dealer },
      data: { defaultRateCents: 3000, version: { increment: 1 } },
    });
    await expect(service.commitDealerVirUpload(owner, commit(p))).rejects.toThrow(
      "billing settings changed",
    );
  });
  it("blocks expired uploads and access to another user's preview", async () => {
    const p = await preview([row()]);
    const second = await db.user.create({
      data: { name: "Other owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
    });
    await expect(service.commitDealerVirUpload(second.id, commit(p))).rejects.toThrow("not found");
    await db.dealerVirUpload.update({
      where: { id: p.uploadId },
      data: { expiresAt: new Date(0) },
    });
    await expect(service.commitDealerVirUpload(owner, commit(p))).rejects.toThrow("expired");
  });
  it("does not let staff without finance privileges upload or commit billing data", async () => {
    const employee = await db.user.create({
      data: { name: "No finance", email: `${randomUUID()}@example.test`, role: "EMPLOYEE" },
    });
    await expect(service.beginDealerVirUpload(employee.id, dealer, 1, 1)).rejects.toThrow(
      "permission",
    );
  });
  it("processes large uploads in sequential batches of at most 40 pages", async () => {
    const uploadId = await service.beginDealerVirUpload(owner, dealer, 2, 41);
    const first = Array.from({ length: 40 }, (_, index) =>
      row(
        `ZZ${String(200000 + index)}`,
        past,
        100 + index,
        `1M8GDM9AXKP0${String(index).padStart(6, "0")}`,
      ),
    );
    const firstChunkKey = randomUUID();
    expect(await service.recordDealerVirChunk(owner, uploadId, firstChunkKey, first)).toMatchObject(
      {
        processedPages: 40,
        expectedPages: 41,
        processedBatches: 1,
      },
    );
    expect(await service.recordDealerVirChunk(owner, uploadId, firstChunkKey, first)).toMatchObject(
      {
        processedPages: 40,
        expectedPages: 41,
        processedBatches: 1,
      },
    );
    await expect(service.finishDealerVirUpload(owner, uploadId)).rejects.toThrow("Only 40 of 41");
    expect(
      await service.recordDealerVirChunk(owner, uploadId, randomUUID(), [
        row("ZZ299999", past, 900, "1M8GDM9AXKP099999"),
      ]),
    ).toMatchObject({ processedPages: 41, expectedPages: 41, processedBatches: 2 });
    expect(await service.finishDealerVirUpload(owner, uploadId)).toMatchObject({
      fileCount: 2,
      uploadedPages: 41,
      processedPages: 41,
      processedBatches: 2,
    });
  });
  it("rejects more than 40 pages in a chunk and prevents exceeding the declared count", async () => {
    const uploadId = await service.beginDealerVirUpload(owner, dealer, 1, 41);
    const many = Array.from({ length: 41 }, (_, index) =>
      row(
        `ZZ${String(300000 + index)}`,
        past,
        100 + index,
        `1M8GDM9AXKP1${String(index).padStart(5, "0")}`,
      ),
    );
    await expect(service.recordDealerVirChunk(owner, uploadId, randomUUID(), many)).rejects.toThrow(
      "at most 40",
    );
    await service.recordDealerVirChunk(owner, uploadId, randomUUID(), many.slice(0, 40));
    await expect(
      service.recordDealerVirChunk(owner, uploadId, randomUUID(), many.slice(0, 2)),
    ).rejects.toThrow("match the expected total");
  });
});
