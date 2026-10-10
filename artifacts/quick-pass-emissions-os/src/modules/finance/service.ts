import { z } from "zod";
import { uniqueReceiptReference } from "./references";
import { id, dateString } from "@/lib/validation";
import { businessDate, addDays } from "@/lib/time";
import { label, reason, notes, optionalId, version } from "../maintenance/validation";
import { phase4, financeRoles, reviewers, requireRule, audit, type Tx } from "../phase4";
import {
  positiveCents,
  invoiceTotals,
  receivable,
  reportRange,
  sumCents,
  csv,
  requiredInteger,
} from "./rules";
export const categories = [
  "EMISSIONS",
  "TAG_KIOSK",
  "CARWASH",
  "DETAILING",
  "INVENTORY",
  "PAYROLL",
  "COMMISSIONS",
  "REPAIRS",
  "UTILITIES",
  "VENDOR",
  "OTHER",
] as const;
const currentPast = (date: string) =>
  requireRule(date <= businessDate(), "Use a current or past business date.");
export async function saveDealer(actorId: string, input: unknown) {
  const {
    id: key,
    version: v,
    reason: why,
    ...data
  } = z
    .object({
      id: optionalId,
      version,
      code: label,
      name: label,
      billingAddress: reason,
      notes,
      active: z.boolean(),
      reason,
    })
    .parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    const before = key ? await tx.dealership.findUnique({ where: { id: key } }) : null;
    requireRule(!key || before?.version === v, "Dealership changed. Refresh and review it.");
    requireRule(
      !(await tx.dealership.count({
        where: { code: data.code, ...(key ? { id: { not: key } } : {}) },
      })),
      "Dealership code already exists.",
    );
    const row = key
      ? await tx.dealership.update({
          where: { id: key },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.dealership.create({ data });
    await audit(tx, actorId, "DEALER_SAVED", row.id, { before, ...data, reason: why });
    return row;
  });
}
export async function saveContact(actorId: string, input: unknown) {
  const {
    id: key,
    version: v,
    reason: why,
    ...data
  } = z
    .object({
      id: optionalId,
      version,
      dealershipId: id,
      name: label,
      email: z.union([z.email().max(254), z.literal("")]),
      phone: z.string().trim().max(50),
      purpose: label,
      source: reason,
      active: z.boolean(),
      reason,
    })
    .refine((v) => !!v.email || !!v.phone, "Enter a contact phone or email.")
    .parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    requireRule(
      await tx.dealership.count({ where: { id: data.dealershipId } }),
      "Choose a dealership.",
    );
    const before = key ? await tx.dealerContact.findUnique({ where: { id: key } }) : null;
    requireRule(
      !key || (before?.version === v && before.dealershipId === data.dealershipId),
      "Contact changed. Refresh and review it.",
    );
    const row = key
      ? await tx.dealerContact.update({
          where: { id: key },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.dealerContact.create({ data });
    await audit(tx, actorId, "DEALER_CONTACT", row.id, { before, ...data, reason: why });
    return row;
  });
}
export async function authorizeTerms(actorId: string, input: unknown) {
  const data = z
    .object({
      id,
      version,
      termsDays: requiredInteger(0, 365),
      defaultRateCents: positiveCents,
      taxBps: requiredInteger(0, 10000),
      termsReference: reason,
      reason,
    })
    .parse(input);
  return phase4(actorId, ["OWNER"], async (tx) => {
    const before = await tx.dealership.findUnique({ where: { id: data.id } });
    requireRule(
      before?.version === data.version && before.active,
      "Dealership changed or is inactive. Refresh and review it.",
    );
    const row = await tx.dealership.update({
      where: { id: data.id },
      data: {
        termsDays: data.termsDays,
        defaultRateCents: data.defaultRateCents,
        taxBps: data.taxBps,
        termsReference: data.termsReference,
        termsAuthorizedBy: actorId,
        termsAuthorizedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await audit(tx, actorId, "DEALER_TERMS_AUTHORIZED", row.id, { before, ...data });
    return row;
  });
}
export async function recordService(actorId: string, input: unknown) {
  const data = z
    .object({
      dealershipId: id,
      date: dateString,
      description: label,
      quantity: z.coerce.number().int().min(1).max(100000),
      unitCents: positiveCents,
      reference: label,
      evidence: reason,
    })
    .parse(input);
  invoiceTotals([data], 0);
  return phase4(actorId, financeRoles, async (tx) => {
    currentPast(data.date);
    requireRule(
      await tx.dealership.count({ where: { id: data.dealershipId, active: true } }),
      "Choose an active dealership.",
    );
    requireRule(
      !(await tx.dealerService.count({ where: { reference: data.reference } })),
      "Service reference already exists.",
    );
    const row = await tx.dealerService.create({ data: { ...data, createdBy: actorId } });
    await audit(tx, actorId, "DEALER_SERVICE", row.id, data);
    return row;
  });
}
export async function voidService(actorId: string, input: unknown) {
  const data = z.object({ id, reason }).parse(input);
  return phase4(actorId, reviewers, async (tx) => {
    const row = await tx.dealerService.findUnique({ where: { id: data.id } });
    requireRule(
      row && !row.invoiceId && !row.voidDate,
      "Only an unbilled, active service can be voided.",
    );
    await tx.dealerService.update({
      where: { id: row.id },
      data: { voidDate: businessDate(), voidReason: data.reason },
    });
    await audit(tx, actorId, "DEALER_SERVICE_VOIDED", row.id, data);
  });
}
export async function createInvoice(actorId: string, input: unknown) {
  const data = z
    .object({
      dealershipId: id,
      number: label,
      issueDate: dateString,
      serviceIds: z.array(id).min(1).max(100),
      notes,
    })
    .parse(input);
  requireRule(
    new Set(data.serviceIds).size === data.serviceIds.length,
    "Select distinct services.",
  );
  return phase4(actorId, financeRoles, async (tx) => {
    currentPast(data.issueDate);
    const dealer = await tx.dealership.findUnique({
      where: { id: data.dealershipId },
      include: { contacts: { where: { active: true }, orderBy: { createdAt: "asc" } } },
    });
    requireRule(
      dealer?.active &&
        dealer.termsAuthorizedAt &&
        dealer.termsDays !== null &&
        dealer.taxBps !== null,
      "Owner-authorized terms and tax settings are required.",
    );
    requireRule(
      !(await tx.dealerInvoice.count({ where: { number: data.number } })),
      "Invoice number already exists.",
    );
    const services = await tx.dealerService.findMany({
      where: {
        id: { in: data.serviceIds },
        dealershipId: dealer.id,
        invoiceId: null,
        voidDate: null,
        date: { lte: data.issueDate },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    requireRule(
      services.length === data.serviceIds.length,
      "A service changed, is already billed, or is after the issue date. Refresh and review.",
    );
    const totals = invoiceTotals(services, dealer.taxBps);
    const row = await tx.dealerInvoice.create({
      data: {
        dealershipId: dealer.id,
        number: data.number,
        issueDate: data.issueDate,
        dueDate: addDays(data.issueDate, dealer.termsDays),
        subtotalCents: totals.subtotalCents,
        taxBps: dealer.taxBps,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        notes: data.notes,
        createdBy: actorId,
        snapshot: {
          code: dealer.code,
          name: dealer.name,
          billingAddress: dealer.billingAddress,
          contacts: dealer.contacts.map((c) => ({
            name: c.name,
            email: c.email,
            phone: c.phone,
            purpose: c.purpose,
          })),
          termsDays: dealer.termsDays,
          defaultRateCents: dealer.defaultRateCents,
          taxBps: dealer.taxBps,
          termsReference: dealer.termsReference,
          termsAuthorizedBy: dealer.termsAuthorizedBy,
          termsAuthorizedAt: dealer.termsAuthorizedAt.toISOString(),
        },
        lines: {
          create: services.map((s, i) => ({
            serviceId: s.id,
            date: s.date,
            description: s.description,
            quantity: s.quantity,
            unitCents: s.unitCents,
            amountCents: totals.amounts[i],
          })),
        },
      },
    });
    await tx.dealerService.updateMany({
      where: { id: { in: data.serviceIds } },
      data: { invoiceId: row.id },
    });
    await audit(tx, actorId, "DEALER_INVOICE_DRAFT", row.id, {
      number: row.number,
      serviceIds: data.serviceIds,
      totalCents: row.totalCents,
    });
    return row;
  });
}
export async function reviewInvoice(actorId: string, input: unknown) {
  const data = z
    .object({
      id,
      version,
      decision: z.enum(["APPROVE", "SENT", "VOID"]),
      date: dateString,
      reference: notes,
      reason,
    })
    .parse(input);
  return phase4(actorId, reviewers, async (tx) => {
    currentPast(data.date);
    const row = await tx.dealerInvoice.findUnique({
      where: { id: data.id },
      include: { payments: true },
    });
    requireRule(
      row?.version === data.version && row.state !== "VOIDED",
      "Invoice changed or is voided. Refresh and review it.",
    );
    requireRule(data.date >= row.issueDate, "Action date cannot precede issue date.");
    if (data.decision === "APPROVE") {
      requireRule(
        row.state === "DRAFT" && row.createdBy !== actorId,
        "A different owner or manager must approve the draft.",
      );
      await tx.dealerInvoice.update({
        where: { id: row.id },
        data: {
          state: "APPROVED",
          approvedBy: actorId,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
      });
    } else if (data.decision === "SENT") {
      requireRule(
        row.state === "APPROVED" && data.reference.length > 0,
        "Record a delivery reference for an approved invoice.",
      );
      requireRule(
        row.payments.every((p) => p.date >= data.date),
        "Delivery date cannot be after an already recorded payment. Review the source dates.",
      );
      await tx.dealerInvoice.update({
        where: { id: row.id },
        data: {
          state: "SENT",
          sentDate: data.date,
          deliveryReference: data.reference,
          version: { increment: 1 },
        },
      });
    } else {
      requireRule(
        sumCents(row.payments.map((p) => p.amountCents)) === 0,
        "Reverse all payments before voiding an invoice.",
      );
      // Void today; retain historical balances and all original snapshots/lines.
      requireRule(data.date === businessDate(), "Void using today's business date.");
      await tx.dealerInvoice.update({
        where: { id: row.id },
        data: {
          state: "VOIDED",
          voidDate: data.date,
          voidReason: data.reason,
          version: { increment: 1 },
        },
      });
      await tx.dealerService.updateMany({
        where: { invoiceId: row.id },
        data: { invoiceId: null },
      });
    }
    await audit(tx, actorId, `DEALER_INVOICE_${data.decision}`, row.id, data);
  });
}
export async function recordDealerPayment(actorId: string, input: unknown) {
  const data = z
    .object({
      invoiceId: id,
      amountCents: positiveCents,
      date: dateString,
      reference: label,
      evidence: reason,
    })
    .parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    currentPast(data.date);
    const row = await tx.dealerInvoice.findUnique({
      where: { id: data.invoiceId },
      include: { payments: true },
    });
    requireRule(
      row && row.approvedAt && row.state !== "VOIDED",
      "Choose an approved, active invoice.",
    );
    requireRule(
      data.date >= row.issueDate && (!row.sentDate || data.date >= row.sentDate),
      "Payment cannot precede issue/delivery date.",
    );
    const latest = row.payments.reduce((s, p) => (p.date > s ? p.date : s), row.issueDate);
    requireRule(data.date >= latest, "Use a date on or after the latest payment/reversal.");
    requireRule(
      data.amountCents <= row.totalCents - sumCents(row.payments.map((p) => p.amountCents)),
      "Payment exceeds the outstanding invoice.",
    );
    await uniqueReceiptReference(tx, data.reference);
    const payment = await tx.dealerPayment.create({ data: { ...data, createdBy: actorId } });
    await tx.dealerInvoice.update({ where: { id: row.id }, data: { version: { increment: 1 } } });
    await audit(tx, actorId, "DEALER_PAYMENT", payment.id, data);
    return payment;
  });
}
export async function reverseDealerPayment(actorId: string, input: unknown) {
  const data = z.object({ id, date: dateString, reference: label, evidence: reason }).parse(input);
  return phase4(actorId, reviewers, async (tx) => {
    currentPast(data.date);
    const payment = await tx.dealerPayment.findUnique({
      where: { id: data.id },
      include: { reversal: true, invoice: { include: { payments: true } } },
    });
    requireRule(
      payment && payment.amountCents > 0 && !payment.reversal && payment.invoice.state !== "VOIDED",
      "Choose an unreversed payment on an active invoice.",
    );
    requireRule(
      payment.invoice.payments.every((p) => p.date <= data.date),
      "Reverse on or after the latest payment date.",
    );
    await uniqueReceiptReference(tx, data.reference);
    const row = await tx.dealerPayment.create({
      data: {
        invoiceId: payment.invoiceId,
        amountCents: -payment.amountCents,
        date: data.date,
        reference: data.reference,
        evidence: data.evidence,
        createdBy: actorId,
        reversesId: payment.id,
      },
    });
    await tx.dealerInvoice.update({
      where: { id: payment.invoiceId },
      data: { version: { increment: 1 } },
    });
    await audit(tx, actorId, "DEALER_PAYMENT_REVERSED", row.id, data);
    return row;
  });
}
export async function recordEntry(actorId: string, input: unknown) {
  const data = z
    .object({
      direction: z.enum(["REVENUE", "EXPENSE"]),
      basis: z.enum(["MANUAL", "ESTIMATE"]),
      category: z.enum(categories),
      amountCents: positiveCents,
      date: dateString,
      reference: label,
      description: label,
      evidence: reason,
      separateRecord: z.literal(true),
    })
    .parse(input);
  return phase4(actorId, financeRoles, async (tx) => {
    currentPast(data.date);
    await uniqueReceiptReference(tx, data.reference);
    const entry = {
      direction: data.direction,
      basis: data.basis,
      category: data.category,
      amountCents: data.amountCents,
      date: data.date,
      reference: data.reference,
      description: data.description,
      evidence: data.evidence,
    };
    const row = await tx.financeEntry.create({ data: { ...entry, createdBy: actorId } });
    await audit(tx, actorId, "FINANCE_ENTRY", row.id, data);
    return row;
  });
}
export async function reviewEntry(actorId: string, input: unknown) {
  const data = z.object({ id, version, decision: z.enum(["VERIFY", "VOID"]), reason }).parse(input);
  return phase4(actorId, reviewers, async (tx) => {
    const row = await tx.financeEntry.findUnique({ where: { id: data.id } });
    requireRule(
      row?.version === data.version && !row.voidDate,
      "Entry changed or is voided. Refresh and review it.",
    );
    if (data.decision === "VERIFY") {
      requireRule(
        row.basis === "MANUAL" && !row.verifiedAt && row.createdBy !== actorId,
        "A different owner or manager may verify a manual entry against evidence. Estimates cannot be verified.",
      );
      await tx.financeEntry.update({
        where: { id: row.id },
        data: { verifiedAt: new Date(), verifiedBy: actorId, version: { increment: 1 } },
      });
    } else
      await tx.financeEntry.update({
        where: { id: row.id },
        data: { voidDate: businessDate(), voidReason: data.reason, version: { increment: 1 } },
      });
    await audit(tx, actorId, `FINANCE_ENTRY_${data.decision}`, row.id, data);
  });
}
export async function dealerOverview(actorId: string, query = "") {
  const search = z.string().max(160).parse(query);
  return phase4(actorId, financeRoles, async (tx) => ({
    dealers: await tx.dealership.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: { name: "asc" },
      take: 100,
      include: { contacts: { where: { active: true } } },
    }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export async function dealerDetail(actorId: string, key: string) {
  return phase4(actorId, financeRoles, async (tx) => ({
    unbilled: await tx.dealerService.findMany({
      where: { dealershipId: id.parse(key), invoiceId: null, voidDate: null },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      take: 100,
    }),
    dealer: await tx.dealership.findUnique({
      where: { id: id.parse(key) },
      include: {
        contacts: { orderBy: { createdAt: "asc" } },
        services: {
          orderBy: [{ date: "desc" }, { id: "asc" }],
          take: 100,
          include: { invoice: { select: { id: true, number: true } } },
        },
        invoices: { orderBy: { createdAt: "desc" }, take: 100, include: { payments: true } },
      },
    }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export async function invoiceOverview(actorId: string, query = "") {
  const search = z.string().max(160).parse(query);
  return phase4(actorId, financeRoles, async (tx) => ({
    invoices: await tx.dealerInvoice.findMany({
      where: search
        ? {
            OR: [
              { number: { contains: search, mode: "insensitive" } },
              { dealership: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { dealership: { select: { name: true } }, payments: true },
    }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export async function invoiceDetail(actorId: string, key: string) {
  return phase4(actorId, financeRoles, async (tx) => ({
    invoice: await tx.dealerInvoice.findUnique({
      where: { id: id.parse(key) },
      include: {
        lines: { orderBy: [{ date: "asc" }, { id: "asc" }] },
        payments: { orderBy: { createdAt: "asc" }, include: { reversal: true } },
      },
    }),
    history: await tx.auditLog.findMany({
      where: { entityId: key },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
    }),
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
async function report(tx: Tx, start: string, end: string) {
  const invoices = await tx.dealerInvoice.findMany({
    where: { issueDate: { lte: end } },
    include: { dealership: { select: { name: true, code: true } }, payments: true },
    orderBy: { number: "asc" },
  });
  // No pagination before totals: reports/exports include every matching record.
  const aging = invoices
    .map((i) => ({
      ...i,
      ...receivable({ ...i, state: i.approvedAt ? i.state : "DRAFT" }, i.payments, end),
    }))
    .filter((i) => i.recognized && i.remainingCents > 0);
  const dealerPayments = await tx.dealerPayment.findMany({
    where: { date: { gte: start, lte: end } },
    include: { invoice: { select: { number: true } } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  const rentalPayments = await tx.rentalPayment.findMany({
    where: { date: { gte: start, lte: end } },
    include: { charge: { include: { agreement: { select: { tenant: true, reference: true } } } } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  const entries = await tx.financeEntry.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: [{ date: "desc" }, { id: "asc" }],
  });
  const active = entries.filter((e) => !e.voidDate || e.voidDate > end);
  const total = (
    direction: "REVENUE" | "EXPENSE",
    basis: "MANUAL" | "ESTIMATE",
    verified: boolean,
  ) =>
    sumCents(
      active
        .filter(
          (e) =>
            e.direction === direction &&
            e.basis === basis &&
            (basis === "ESTIMATE" || !!e.verifiedAt === verified),
        )
        .map((e) => e.amountCents),
    );
  return {
    invoices: invoices.filter((i) => i.issueDate >= start),
    aging,
    dealerPayments,
    rentalPayments,
    entries,
    totals: {
      dealerReceipts: sumCents(dealerPayments.map((p) => p.amountCents)),
      rentalReceipts: sumCents(rentalPayments.map((p) => p.amountCents)),
      outstanding: sumCents(aging.map((i) => i.remainingCents)),
      billed: sumCents(
        invoices
          .filter((i) => i.issueDate >= start && i.approvedAt && (!i.voidDate || i.voidDate > end))
          .map((i) => i.totalCents),
      ),
      manualRevenue: total("REVENUE", "MANUAL", false),
      verifiedRevenue: total("REVENUE", "MANUAL", true),
      manualExpense: total("EXPENSE", "MANUAL", false),
      verifiedExpense: total("EXPENSE", "MANUAL", true),
      estimatedRevenue: total("REVENUE", "ESTIMATE", false),
      estimatedExpense: total("EXPENSE", "ESTIMATE", false),
    },
  };
}
export async function financeReport(actorId: string, input: unknown) {
  const range = reportRange.parse(input);
  currentPast(range.end);
  return phase4(actorId, financeRoles, async (tx) => ({
    ...(await report(tx, range.start, range.end)),
    ...range,
    demo: (await tx.employee.count({ where: { demo: true } })) > 0,
  }));
}
export const datasets = [
  "invoices",
  "invoice-lines",
  "dealer-payments",
  "rental-payments",
  "entries",
  "aging",
] as const;
export async function exportFinance(actorId: string, input: unknown) {
  const data = reportRange.and(z.object({ dataset: z.enum(datasets) })).parse(input);
  currentPast(data.end);
  return phase4(actorId, financeRoles, async (tx) => {
    const r = await report(tx, data.start, data.end);
    let rows: (string | number | null)[][];
    if (data.dataset === "invoices")
      rows = [
        [
          "id",
          "number",
          "dealer_code",
          "issue_date",
          "due_date",
          "status_as_of",
          "subtotal_cents",
          "tax_bps",
          "tax_cents",
          "total_cents",
          "paid_cents_as_of",
          "outstanding_cents_as_of",
          "currency",
          "approved_by",
          "delivery_reference",
          "void_date",
          "billing_name_snapshot",
          "billing_address_snapshot",
          "terms_reference_snapshot",
        ],
        ...r.invoices.map((i) => {
          const s = receivable(
            { ...i, state: i.approvedAt ? i.state : "DRAFT" },
            i.payments,
            data.end,
          );
          return [
            i.id,
            i.number,
            (i.snapshot as { code: string }).code,
            i.issueDate,
            i.dueDate,
            s.status,
            i.subtotalCents,
            i.taxBps,
            i.taxCents,
            i.totalCents,
            s.paidCents,
            s.remainingCents,
            "USD",
            i.approvedBy,
            i.deliveryReference,
            i.voidDate,
            (i.snapshot as { name: string }).name,
            (i.snapshot as { billingAddress: string }).billingAddress,
            (i.snapshot as { termsReference: string }).termsReference,
          ];
        }),
      ];
    else if (data.dataset === "invoice-lines") {
      const lines = await tx.dealerInvoiceLine.findMany({
        where: { invoice: { issueDate: { gte: data.start, lte: data.end } } },
        include: { invoice: { select: { number: true, state: true } } },
        orderBy: [{ invoiceId: "asc" }, { id: "asc" }],
      });
      rows = [
        [
          "line_id",
          "invoice_number",
          "invoice_state",
          "service_id",
          "service_date",
          "description",
          "quantity",
          "unit_cents",
          "amount_cents",
          "currency",
        ],
        ...lines.map((l) => [
          l.id,
          l.invoice.number,
          l.invoice.state,
          l.serviceId,
          l.date,
          l.description,
          l.quantity,
          l.unitCents,
          l.amountCents,
          "USD",
        ]),
      ];
    } else if (data.dataset === "dealer-payments")
      rows = [
        [
          "id",
          "invoice_number",
          "date",
          "signed_amount_cents",
          "currency",
          "reference",
          "evidence",
          "reverses_id",
          "entered_by",
          "provenance",
        ],
        ...r.dealerPayments.map((p) => [
          p.id,
          p.invoice.number,
          p.date,
          p.amountCents,
          "USD",
          p.reference,
          p.evidence,
          p.reversesId,
          p.createdBy,
          "MANUAL_RECEIPT_RECORD",
        ]),
      ];
    else if (data.dataset === "rental-payments")
      rows = [
        [
          "id",
          "agreement_reference",
          "tenant",
          "charge_month",
          "date",
          "signed_amount_cents",
          "currency",
          "reference",
          "reason",
          "reverses_id",
          "entered_by",
          "provenance",
        ],
        ...r.rentalPayments.map((p) => [
          p.id,
          p.charge.agreement.reference,
          p.charge.agreement.tenant,
          p.charge.month,
          p.date,
          p.amountCents,
          "USD",
          p.reference,
          p.reason,
          p.reversesId,
          p.createdBy,
          "MANUAL_RECEIPT_RECORD",
        ]),
      ];
    else if (data.dataset === "entries")
      rows = [
        [
          "id",
          "date",
          "direction",
          "category",
          "amount_cents",
          "currency",
          "basis",
          "verified_by",
          "verified_at",
          "reference",
          "description",
          "evidence",
          "void_date",
          "void_reason",
          "entered_by",
        ],
        ...r.entries.map((e) => [
          e.id,
          e.date,
          e.direction,
          e.category,
          e.amountCents,
          "USD",
          e.basis,
          e.verifiedBy,
          e.verifiedAt?.toISOString() ?? null,
          e.reference,
          e.description,
          e.evidence,
          e.voidDate,
          e.voidReason,
          e.createdBy,
        ]),
      ];
    else
      rows = [
        [
          "as_of",
          "invoice_id",
          "invoice_number",
          "dealer_code",
          "dealer_name",
          "due_date",
          "days_past_due",
          "bucket",
          "outstanding_cents",
          "currency",
        ],
        ...r.aging.map((i) => [
          data.end,
          i.id,
          i.number,
          i.dealership.code,
          i.dealership.name,
          i.dueDate,
          i.days,
          i.bucket,
          i.remainingCents,
          "USD",
        ]),
      ];
    await audit(tx, actorId, "FINANCE_EXPORT", data.dataset, { ...data, rows: rows.length - 1 });
    return csv(rows);
  });
}
