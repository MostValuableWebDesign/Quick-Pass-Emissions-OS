import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Isolated database required.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(enabled ? describe : describe.skip)(
  "Marketing persistence, permissions and financial integration",
  () => {
    let db: PrismaClient,
      s: typeof import("../src/modules/marketing/service"),
      f: typeof import("../src/modules/finance/service");
    let owner: string,
      admin: string,
      staff: string,
      hash: string,
      campaignId: string,
      dealer: string;
    const date = "2026-10-01";
    const reportQuery = { start: "2026-10-01", end: "2026-10-12" };
    beforeAll(async () => {
      vi.stubEnv("GA_STATION_ID", "GA-MARKETING-TEST");
      db = (await import("../src/lib/db")).db;
      s = await import("../src/modules/marketing/service");
      f = await import("../src/modules/finance/service");
      hash = (await import("../src/modules/station/service")).stationConfig().hash;
    });
    beforeEach(async () => {
      await db.$executeRawUnsafe(
        'TRUNCATE "MarketingCampaign","StationRecord","StationImport","DealerInvoice","DealerService","Dealership","User" CASCADE',
      );
      owner = (
        await db.user.create({
          data: { name: "Fixture owner", email: `${randomUUID()}@example.test`, role: "OWNER" },
        })
      ).id;
      admin = (
        await db.user.create({
          data: { name: "Fixture admin", email: `${randomUUID()}@example.test`, role: "ADMIN" },
        })
      ).id;
      staff = (
        await db.user.create({
          data: { name: "Fixture staff", email: `${randomUUID()}@example.test`, role: "EMPLOYEE" },
        })
      ).id;
      dealer = (
        await db.dealership.create({
          data: {
            code: randomUUID(),
            name: "Fixture dealer",
            billingAddress: "Fixture address",
            termsDays: 30,
            defaultRateCents: 2000,
            taxBps: 0,
            termsReference: "Fixture authorization",
            termsAuthorizedBy: owner,
            termsAuthorizedAt: new Date(),
          },
        })
      ).id;
      campaignId = (
        await s.saveCampaign(owner, {
          name: "Fall campaign",
          channel: "FLYERS",
          stationHashes: [hash],
          startDate: date,
          endDate: "2026-10-31",
          budgetCents: 10000,
          status: "ACTIVE",
          offer: "$2 off a paid inspection",
        })
      ).id;
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      await db?.$disconnect();
    });
    const service = (extra: Record<string, unknown> = {}) =>
      f.recordService(owner, {
        dealershipId: dealer,
        date,
        description: "Emissions inspection",
        quantity: 1,
        unitCents: 2000,
        reference: randomUUID(),
        evidence: "Fixture completed paid inspection evidence",
        ...extra,
      });
    const promo = (extra: Record<string, unknown> = {}) =>
      s.savePromo(owner, {
        campaignId,
        code: "FALL2",
        kind: "FIXED",
        value: 200,
        startDate: date,
        endDate: "2026-10-31",
        stationHashes: [hash],
        usageLimit: 10,
        active: true,
        ...extra,
      });
    async function invoiceFor(serviceIds: string[], paid: number) {
      const invoice = await f.createInvoice(owner, {
        dealershipId: dealer,
        number: randomUUID(),
        issueDate: date,
        serviceIds,
        notes: "Fixture invoice",
      });
      await f.reviewInvoice(admin, {
        id: invoice.id,
        version: 0,
        decision: "APPROVE",
        date,
        reference: "",
        reason: "Independent fixture review",
      });
      if (paid)
        await f.recordDealerPayment(owner, {
          invoiceId: invoice.id,
          date: "2026-10-02",
          amountCents: paid,
          reference: randomUUID(),
          evidence: "Fixture receipt evidence",
        });
      return invoice;
    }
    it("denies direct calls from staff, inactive owners and finance-admin mutations", async () => {
      const input = {
        name: "Denied",
        channel: "OTHER",
        stationHashes: [hash],
        startDate: date,
        endDate: date,
        budgetCents: 0,
        status: "DRAFT",
      };
      await expect(s.saveCampaign(admin, input)).rejects.toThrow("permission");
      await expect(s.marketingOverview(staff, reportQuery)).rejects.toThrow("permission");
      await db.user.update({ where: { id: owner }, data: { active: false } });
      await expect(s.saveCampaign(owner, input)).rejects.toThrow("permission");
      expect(await db.marketingCampaign.count()).toBe(1);
    });
    it("validates stations/dates and prevents stale edits while preserving archive history", async () => {
      await expect(
        s.saveCampaign(owner, {
          name: "Invalid",
          channel: "OTHER",
          stationHashes: ["different"],
          startDate: date,
          endDate: date,
          budgetCents: 1,
          status: "DRAFT",
        }),
      ).rejects.toThrow("configured station");
      await expect(
        s.marketingOverview(owner, { ...reportQuery, stationHash: "different" }),
      ).rejects.toThrow();
      const original = await db.marketingCampaign.findUniqueOrThrow({ where: { id: campaignId } });
      await s.saveCampaign(owner, { ...original, version: 0, name: "Edited" });
      await expect(
        s.saveCampaign(owner, { ...original, version: 0, name: "Stale" }),
      ).rejects.toThrow("changed");
      await s.archiveCampaign(owner, { id: campaignId, version: 1 });
      expect(
        (await db.marketingCampaign.findUniqueOrThrow({ where: { id: campaignId } })).status,
      ).toBe("ARCHIVED");
      expect(await db.auditLog.count({ where: { entityId: campaignId } })).toBeGreaterThan(1);
    });
    it("records actual spend separately from budget and retains void audit history", async () => {
      const expense = await s.recordExpense(owner, {
        campaignId,
        stationHash: hash,
        date,
        amountCents: 1234,
        description: "Printed flyers",
        reference: "expense-ref",
      });
      await expect(
        s.recordExpense(owner, {
          campaignId,
          stationHash: hash,
          date,
          amountCents: 1234,
          description: "Duplicate",
          reference: "expense-ref",
        }),
      ).rejects.toThrow("already exists");
      expect((await s.marketingOverview(owner, reportQuery)).report.spendingCents).toBe(1234);
      await s.voidExpense(owner, { id: expense.id, reason: "Duplicate evidence corrected" });
      expect(await db.marketingExpense.count()).toBe(1);
    });
    it("applies promo atomically, freezes terms and does not double-count reported plus tracked attribution", async () => {
      const p = await promo();
      const svc = await service({
        promoCode: "fall2",
        inspectionKind: "PAID",
        customerSource: "FLYER",
        reportedCampaignId: campaignId,
      });
      expect(svc.unitCents).toBe(1800);
      expect(
        (await db.marketingRedemption.findUniqueOrThrow({ where: { serviceId: svc.id } })).terms,
      ).toMatchObject({ value: 200, kind: "FIXED", campaignId });
      await expect(s.savePromo(owner, { ...p, stationHashes: [hash], value: 300 })).rejects.toThrow(
        "frozen",
      );
      await s.savePromo(owner, { ...p, stationHashes: [hash], active: false });
      const invoice = await invoiceFor([svc.id], 1800);
      const result = (await s.marketingOverview(owner, { ...reportQuery, campaignId })).report;
      expect(result.attributedPaidInspections).toBe(1);
      expect(result.recordedRedemptions).toBe(1);
      expect(result.collectedCents).toBe(1800);
      expect(result.discountsCents).toBe(200);
      expect(invoice.totalCents).toBe(1800);
    });
    it("rolls back the whole service on invalid code, free test or unsupported zero-dollar offers", async () => {
      await promo();
      for (const extra of [
        { promoCode: "missing", inspectionKind: "PAID" },
        { promoCode: "FALL2", inspectionKind: "FREE" },
        { promoCode: "FALL2", inspectionKind: "PAID", quantity: 2 },
      ])
        await expect(service(extra)).rejects.toThrow();
      await promo({ code: "ALLFREE", kind: "PERCENT", value: 10000 });
      await expect(service({ promoCode: "ALLFREE", inspectionKind: "PAID" })).rejects.toThrow(
        "positive charge",
      );
      expect(await db.dealerService.count()).toBe(0);
      expect(await db.marketingRedemption.count()).toBe(0);
    });
    it("serializes concurrent lifetime-limit redemption and never frees usage on cancellation", async () => {
      await promo({ usageLimit: 1 });
      const attempts = await Promise.allSettled([
        service({ promoCode: "FALL2", inspectionKind: "PAID" }),
        service({ promoCode: "FALL2", inspectionKind: "PAID" }),
      ]);
      expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const svc = await db.dealerService.findFirstOrThrow();
      await f.voidService(owner, { id: svc.id, reason: "Canceled service" });
      await expect(service({ promoCode: "FALL2", inspectionKind: "PAID" })).rejects.toThrow(
        "usage limit",
      );
      const report = (await s.marketingOverview(owner, reportQuery)).report;
      expect(report.redemptions[0]?.status).toBe("CANCELLED");
      expect(report.discountsCents).toBe(0);
    });
    it("uses net real receipts and reversals proportionally for mixed invoices", async () => {
      await promo();
      const attributed = await service({ promoCode: "FALL2", inspectionKind: "PAID" });
      const unrelated = await service();
      const invoice = await invoiceFor([attributed.id, unrelated.id], 1900);
      expect((await s.marketingOverview(owner, reportQuery)).report.collectedCents).toBe(900);
      const payment = await db.dealerPayment.findFirstOrThrow({
        where: { invoiceId: invoice.id, amountCents: { gt: 0 } },
      });
      await f.reverseDealerPayment(owner, {
        id: payment.id,
        date: "2026-10-03",
        reference: "refund",
        evidence: "Refunded original receipt",
      });
      expect((await s.marketingOverview(owner, reportQuery)).report.collectedCents).toBe(0);
      expect(
        (await s.marketingOverview(owner, { start: "2026-10-03", end: "2026-10-03" })).report
          .collectedCents,
      ).toBe(-900);
      expect((await s.marketingOverview(owner, reportQuery)).report.redemptions[0]?.status).toBe(
        "REFUNDED",
      );
    });
    it("source updates do not create more observations and preserve missing versus explicit unknown", async () => {
      const svc = await service();
      await s.recordServiceSource(admin, {
        serviceId: svc.id,
        version: 0,
        source: "UNKNOWN",
        inspectionKind: "UNKNOWN",
        evidence: "Customer did not know",
      });
      await s.recordServiceSource(admin, {
        serviceId: svc.id,
        version: 0,
        source: "",
        inspectionKind: "UNKNOWN",
        evidence: "Response corrected",
      });
      const overview = await s.marketingOverview(admin, reportQuery);
      expect(await db.marketingObservation.count()).toBe(1);
      expect(overview.report.coverage.missing).toBe(1);
      expect(overview.report.coverage.unknown).toBe(0);
      await expect(
        s.recordServiceSource(admin, {
          serviceId: svc.id,
          version: 1,
          source: "UNKNOWN",
          campaignId,
          inspectionKind: "UNKNOWN",
        }),
      ).rejects.toThrow("cannot");
    });
    it("keeps imported free retests separate and deduplicates linked dealer evidence", async () => {
      const svc = await service({
        inspectionKind: "PAID",
        customerSource: "FLYER",
        reportedCampaignId: campaignId,
      });
      const run = await db.stationImport.create({
        data: {
          stationHash: hash,
          digest: randomUUID(),
          startDate: "2026-09-01",
          endDate: "2026-10-12",
          status: "IMPORTED",
          rows: 2,
          inserted: 2,
          duplicates: 0,
          coverage: "OWNER_ATTESTED",
          reviewedAt: new Date(Date.now() + 1000),
          createdBy: owner,
          reason: "Fixture reviewed complete imports",
        },
      });
      for (let i = 0; i < 2; i++) {
        const record = await db.stationRecord.create({
          data: {
            stationHash: hash,
            state: "CONFIRMED",
            eligible: true,
            disposition: i ? "RETAIL" : "DEALER",
            dealerServiceId: i ? null : svc.id,
          },
        });
        const revision = await db.stationRevision.create({
          data: {
            stationHash: hash,
            fingerprint: randomUUID(),
            recordId: record.id,
            importId: run.id,
            sourceDate: `2026-10-01T${i ? "11" : "10"}:00:00`,
            businessDate: date,
            inspector: "Fixture inspector",
            outcome: "PASS",
            certificate: `fixture-${i}`,
            vehicleSuffix: "1234",
            vehicleHash: "same-hashed-vin",
          },
        });
        await db.stationRecord.update({
          where: { id: record.id },
          data: { currentRevisionId: revision.id },
        });
        await s.recordSource(owner, {
          recordId: record.id,
          version: 0,
          source: "FLYER",
          campaignId,
          evidence: "Customer reply",
        });
      }
      await db.stationImport.update({ where: { id: run.id }, data: { reviewedAt: new Date() } });
      const report = (await s.marketingOverview(owner, { ...reportQuery, campaignId })).report;
      expect(report.attributedPaidInspections).toBe(1);
      expect(report.freeRetests).toBe(1);
      expect(report.coverage.recordedInspections).toBe(2);
    });
    it("does not pretend that real Google analytics or reviews are connected", async () => {
      const result = await s.marketingOverview(owner, reportQuery);
      expect(result.analytics.connected).toBe(false);
      expect(result.report.costPerAttributedPaidCents).toBeNull();
      expect(result.report.attributedPaidInspections).toBe(0);
      expect(result.report.coverage.partial).toBe(true);
    });
    it("uses individually linked verified retail receipts, never manual estimates or duplicate links", async () => {
      const receipt = await db.financeEntry.create({
        data: {
          direction: "REVENUE",
          basis: "MANUAL",
          category: "EMISSIONS",
          amountCents: 2000,
          date,
          reference: randomUUID(),
          description: "Fixture retail receipt",
          evidence: "Fixture receipt evidence",
          createdBy: owner,
          verifiedBy: admin,
          verifiedAt: new Date(),
        },
      });
      const run = await db.stationImport.create({
        data: {
          stationHash: hash,
          digest: randomUUID(),
          startDate: "2026-09-01",
          endDate: date,
          status: "IMPORTED",
          rows: 1,
          inserted: 1,
          duplicates: 0,
          coverage: "OWNER_ATTESTED",
          createdBy: owner,
          reason: "Fixture attestation",
        },
      });
      const record = await db.stationRecord.create({
        data: {
          stationHash: hash,
          state: "CONFIRMED",
          disposition: "FINANCE",
          eligible: true,
          financeEntryId: receipt.id,
        },
      });
      const revision = await db.stationRevision.create({
        data: {
          stationHash: hash,
          fingerprint: randomUUID(),
          recordId: record.id,
          importId: run.id,
          sourceDate: `${date}T10:00:00`,
          businessDate: date,
          inspector: "Fixture",
          outcome: "PASS",
          certificate: "receipt-test",
          vehicleSuffix: "1234",
          vehicleHash: "receipt-vin",
        },
      });
      await db.stationRecord.update({
        where: { id: record.id },
        data: { currentRevisionId: revision.id },
      });
      await db.stationImport.update({ where: { id: run.id }, data: { reviewedAt: new Date() } });
      await s.recordSource(owner, {
        recordId: record.id,
        version: 0,
        source: "FLYER",
        campaignId,
        evidence: "Customer reply",
      });
      expect(
        (await s.marketingOverview(owner, reportQuery)).report.verifiedRetailCollectedCents,
      ).toBe(2000);
      await db.financeEntry.update({
        where: { id: receipt.id },
        data: { verifiedBy: null, verifiedAt: null },
      });
      expect((await s.marketingOverview(owner, reportQuery)).report.collectedCents).toBe(0);
      await db.financeEntry.update({
        where: { id: receipt.id },
        data: { verifiedBy: admin, verifiedAt: new Date() },
      });
      await db.stationRecord.create({
        data: { stationHash: hash, state: "CONFIRMED", financeEntryId: receipt.id },
      });
      expect((await s.marketingOverview(owner, reportQuery)).report.collectedCents).toBe(0);
    });
    it("persists action baselines and limits material drafts/approvals to owners", async () => {
      const action = await s.saveAction(owner, {
        campaignId,
        title: "Review flyer distribution",
        rationale: "Limited attribution coverage",
        periodStart: date,
        periodEnd: "2026-10-02",
        reviewDate: "2026-10-20",
        status: "PLANNED",
      });
      await s.saveAction(owner, {
        ...action,
        version: 0,
        status: "REVIEWED",
        resultNotes: "Recorded observations reviewed",
      });
      const revised = await db.marketingAction.findUniqueOrThrow({ where: { id: action.id } });
      expect(revised.baseline).toEqual(action.baseline);
      const material = await s.saveMaterial(owner, {
        campaignId,
        title: "Flyer copy",
        copy: "Quick Pass emissions offer",
      });
      await expect(s.materialForActor(admin, material.id)).rejects.toThrow("not available");
      await expect(
        s.reviewMaterial(admin, { id: material.id, version: 0, status: "APPROVED" }),
      ).rejects.toThrow("permission");
      await s.reviewMaterial(owner, { id: material.id, version: 0, status: "APPROVED" });
      expect((await s.materialForActor(admin, material.id)).copy).toBe(
        "Quick Pass emissions offer",
      );
    });
  },
);
